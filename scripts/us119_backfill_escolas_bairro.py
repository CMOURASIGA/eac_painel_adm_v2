#!/usr/bin/env python3
"""Generate a reviewed SQL backfill from an INEP Catálogo de Escolas CSV export.

Usage: python3 scripts/us119_backfill_escolas_bairro.py catalogo.csv --sql-output backfill.sql
The export needs an INEP code and either a bairro column or the detailed Endereço.
No row is matched by name. Ambiguous addresses are left for manual review.
"""

import argparse
import csv
import io
import re
import unicodedata
from pathlib import Path

# Labels observed in the INEP detailed address export for Niterói. They are
# used only to locate the bairro suffix in an otherwise unstructured address.
# This is import-time parsing, never a frontend mapping or a school identifier.
BAIRROS_NO_ENDERECO = {
    "ATALAIA", "BADU", "BALDEADOR", "BARRETO", "CAFUBA", "CALABOCA",
    "CAMBOINHAS", "CANTAGALO", "CARAMUJO", "CENTRO", "CHARITAS",
    "CUBANGO", "ENGENHO DO MATO", "ENGENHOCA", "FATIMA", "FIGUEIRA",
    "FONSECA", "ICARAI", "ILHA DA CONCEICAO", "INGA", "ITACOATIARA",
    "ITAIPU", "ITITIOCA", "JACARE", "JARDIM IMBUI", "JURUJUBA",
    "LARGO DA BATALHA", "LARGO DO BARRADAS", "MACEIO", "MARALEGRE",
    "MARAVISTA", "MARIA PAULA", "MATA PACA", "MATAPACA", "MORRO DO CASTRO",
    "MORRO DO ESTADO", "PE PEQUENO", "PENDOTIBA", "PIRATININGA",
    "PONTA DA AREIA", "PONTA DAREIA", "RIO DO OURO", "SANTA BARBARA",
    "SANTA ROSA", "SAO DOMINGOS", "SAO FRANCISCO", "SAO LOURENCO",
    "SAPE", "SERRA GRANDE", "TENENTE JARDIM", "VARZEA DAS MOCAS",
    "VILA PROGRESSO", "VITAL BRAZIL",
}


def canonical(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    return re.sub(r"[^a-z0-9]", "", value.encode("ascii", "ignore").decode().lower())


def find_column(headers: list[str], options: set[str]) -> str | None:
    return next((name for name in headers if canonical(name) in options), None)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def bairro_do_endereco(endereco: str) -> str | None:
    # The INEP export ends addresses in "BAIRRO. 24000-000 Niterói - RJ.".
    # Complements may themselves contain periods. Only a recognized final
    # suffix is accepted, so street names and complements cannot become bairro.
    match = re.search(r"\b\d{5}-\d{3}\s+Niterói\s*-\s*RJ\.?\s*$", endereco, re.I)
    if not match:
        return None
    prefix = endereco[:match.start()].strip(" .")
    if not prefix:
        return None
    tail = prefix.rsplit(". ", 1)[-1].strip(" .")
    tail = re.sub(r"\s+NITEROI$", "", tail, flags=re.I)
    # More than one locality in the final field cannot be resolved safely.
    locality = tail.rsplit(",", 1)[-1]
    if re.search(r"\s[-/]\s|(?<=[A-Z])/\s+(?=[A-Z])", locality):
        return None
    for bairro in sorted(BAIRROS_NO_ENDERECO, key=len, reverse=True):
        if re.search(r"(?<![A-Z])" + re.escape(bairro) + r"$", tail, re.I):
            return bairro
    return None


def read_catalog(path: Path) -> tuple[dict[str, str], dict[str, int]]:
    raw = path.read_bytes()
    decoded = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            decoded = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        raise ValueError("Codificação do CSV não reconhecida.")

    sample = decoded[:8192]
    delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    reader = csv.DictReader(io.StringIO(decoded), delimiter=delimiter)
    headers = reader.fieldnames or []
    code_column = find_column(headers, {
        "codigoinep", "codigoescola", "codigoinepescola", "coentidade", "inescola", "inep",
    })
    bairro_column = find_column(headers, {"bairro", "nobairro", "bairrodaescola"})
    endereco_column = find_column(headers, {"endereco", "enderecoescola", "enderecoescolar"})
    if not code_column or not (bairro_column or endereco_column):
        raise ValueError(f"CSV precisa de código INEP e bairro ou Endereço. Colunas encontradas: {headers}")
    municipio_column = find_column(headers, {"municipio", "nomunicipio", "nomedomunicipio"})
    uf_column = find_column(headers, {"uf", "siglauf", "unidadefederacao"})
    status_column = find_column(headers, {"restricaodeatendimento"})

    neighborhoods: dict[str, str] = {}
    summary = {"lidas": 0, "fora_niteroi": 0, "paralisadas": 0, "sem_bairro": 0, "com_bairro": 0}
    unresolved: list[tuple[str, str]] = []
    for row in reader:
        summary["lidas"] += 1
        if municipio_column and canonical(row.get(municipio_column, "")) != "niteroi":
            summary["fora_niteroi"] += 1
            continue
        if uf_column and canonical(row.get(uf_column, "")) not in {"rj", "riodejaneiro"}:
            summary["fora_niteroi"] += 1
            continue
        if status_column and canonical(row.get(status_column, "")) == "escolaparalisada":
            summary["paralisadas"] += 1
            continue
        code = (row.get(code_column) or "").strip()
        if not re.fullmatch(r"\d{8}", code):
            raise ValueError(f"Código INEP inválido na linha {summary['lidas'] + 1}: {code!r}")
        bairro = re.sub(r"\s+", " ", (row.get(bairro_column) or "").strip()) if bairro_column else ""
        if not bairro and endereco_column:
            bairro = bairro_do_endereco(row.get(endereco_column) or "") or ""
        if not bairro:
            summary["sem_bairro"] += 1
            unresolved.append((code, row.get(endereco_column, "") if endereco_column else ""))
            continue
        previous = neighborhoods.get(code)
        if previous and canonical(previous) != canonical(bairro):
            raise ValueError(f"Bairros conflitantes para o INEP {code}: {previous!r} e {bairro!r}")
        neighborhoods[code] = bairro
        summary["com_bairro"] += 1
    if not neighborhoods:
        raise ValueError("Nenhum bairro encontrado no catálogo; a carga não foi gerada.")
    if unresolved:
        print("Endereços sem bairro identificável (não entram no SQL):")
        for code, address in unresolved:
            print(f"  {code}: {address}")
    return neighborhoods, summary


def make_sql(neighborhoods: dict[str, str], expected_total: int | None = None,
             expected_matches: int | None = None) -> str:
    values = ",\n".join(f"  ({sql_literal(code)}, {sql_literal(bairro)})" for code, bairro in sorted(neighborhoods.items()))
    assertions = ""
    if expected_total is not None or expected_matches is not None:
        total_check = f"if total <> {expected_total} then raise exception 'Total de escolas diferente do esperado: %', total; end if;" if expected_total is not None else ""
        match_check = f"if matched <> {expected_matches} then raise exception 'Códigos INEP correspondentes diferentes do esperado: %', matched; end if;" if expected_matches is not None else ""
        assertions = f"""do $$
declare total integer; matched integer;
begin
  select count(*) into total from public.escolas
  where municipio = 'Niterói' and uf = 'RJ' and ativo = true;
  select count(*) into matched from public.escolas e
  join us119_bairros_catalogo c on c.codigo_inep = e.codigo_inep
  where e.municipio = 'Niterói' and e.uf = 'RJ' and e.ativo = true;
  {total_check}
  {match_check}
end $$;
"""
    return f"""-- US 119: complementar o Censo Escolar 2025 com o bairro do Catálogo de Escolas.
-- Revisar este arquivo antes de executar. Match exclusivamente pelo código INEP.
begin;
create temporary table us119_bairros_catalogo (codigo_inep text primary key, bairro text not null) on commit drop;
insert into us119_bairros_catalogo (codigo_inep, bairro) values
{values};

{assertions}
-- Não altera escola.id, codigo_inep, nome, rede nem vínculos de inscrições.
update public.escolas as e
set bairro = c.bairro, atualizado_em = now()
from us119_bairros_catalogo as c
where e.codigo_inep = c.codigo_inep
  and e.municipio = 'Niterói' and e.uf = 'RJ' and e.ativo = true
  and e.bairro is distinct from c.bairro;

select count(*) as total,
       count(*) filter (where nullif(btrim(bairro), '') is not null) as com_bairro,
       count(*) filter (where nullif(btrim(bairro), '') is null) as sem_bairro
from public.escolas where municipio = 'Niterói' and uf = 'RJ' and ativo = true;

select codigo_inep, nome, bairro from public.escolas
where codigo_inep in ('33057451','33150931','33161429','33165920')
order by codigo_inep;
commit;

-- Resultado único para copiar do SQL Editor após a transação.
select jsonb_build_object(
  'total', count(*),
  'com_bairro', count(*) filter (where nullif(btrim(bairro), '') is not null),
  'sem_bairro', count(*) filter (where nullif(btrim(bairro), '') is null),
  'pensi', (select jsonb_agg(jsonb_build_object('inep', codigo_inep, 'nome', nome, 'bairro', bairro)
                        order by codigo_inep)
            from public.escolas
            where codigo_inep in ('33057451','33150931','33161429','33165920'))
) as resultado
from public.escolas where municipio = 'Niterói' and uf = 'RJ' and ativo = true;
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog_csv", type=Path, help="Exportação CSV do Catálogo de Escolas do INEP")
    parser.add_argument("--sql-output", type=Path, required=True)
    parser.add_argument("--expect-total", type=int, help="Abortar SQL se a base não tiver este total de escolas ativas")
    parser.add_argument("--expect-matches", type=int, help="Abortar SQL se este número de códigos não corresponder")
    args = parser.parse_args()
    neighborhoods, summary = read_catalog(args.catalog_csv)
    args.sql_output.write_text(make_sql(neighborhoods, args.expect_total, args.expect_matches), encoding="utf-8")
    print({**summary, "codigos_inep_distintos_com_bairro": len(neighborhoods), "sql": str(args.sql_output)})


if __name__ == "__main__":
    main()
