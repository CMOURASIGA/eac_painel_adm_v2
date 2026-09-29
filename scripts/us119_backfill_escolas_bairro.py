#!/usr/bin/env python3
"""Generate a reviewed SQL backfill from an INEP Catálogo de Escolas CSV export.

Usage: python3 scripts/us119_backfill_escolas_bairro.py catalogo.csv --sql-output backfill.sql
The export must include the school's INEP code and neighborhood. No row is matched by name.
"""

import argparse
import csv
import io
import re
import unicodedata
from pathlib import Path


def canonical(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    return re.sub(r"[^a-z0-9]", "", value.encode("ascii", "ignore").decode().lower())


def find_column(headers: list[str], options: set[str]) -> str | None:
    return next((name for name in headers if canonical(name) in options), None)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


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
    bairro_column = find_column(headers, {"bairro", "nobairro", "bairrodasescola", "bairrodaescola"})
    if not code_column or not bairro_column:
        raise ValueError(f"CSV precisa das colunas código INEP e bairro. Colunas encontradas: {headers}")
    municipio_column = find_column(headers, {"municipio", "nomunicipio", "nomedomunicipio"})
    uf_column = find_column(headers, {"uf", "siglauf", "unidadefederacao"})

    neighborhoods: dict[str, str] = {}
    summary = {"lidas": 0, "fora_niteroi": 0, "sem_bairro": 0, "com_bairro": 0}
    for row in reader:
        summary["lidas"] += 1
        if municipio_column and canonical(row.get(municipio_column, "")) != "niteroi":
            summary["fora_niteroi"] += 1
            continue
        if uf_column and canonical(row.get(uf_column, "")) not in {"rj", "riodejaneiro"}:
            summary["fora_niteroi"] += 1
            continue
        code = (row.get(code_column) or "").strip()
        if not re.fullmatch(r"\d{8}", code):
            raise ValueError(f"Código INEP inválido na linha {summary['lidas'] + 1}: {code!r}")
        bairro = re.sub(r"\s+", " ", row.get(bairro_column, "").strip())
        if not bairro:
            summary["sem_bairro"] += 1
            continue
        previous = neighborhoods.get(code)
        if previous and canonical(previous) != canonical(bairro):
            raise ValueError(f"Bairros conflitantes para o INEP {code}: {previous!r} e {bairro!r}")
        neighborhoods[code] = bairro
        summary["com_bairro"] += 1
    if not neighborhoods:
        raise ValueError("Nenhum bairro encontrado no catálogo; a carga não foi gerada.")
    return neighborhoods, summary


def make_sql(neighborhoods: dict[str, str]) -> str:
    values = ",\n".join(f"  ({sql_literal(code)}, {sql_literal(bairro)})" for code, bairro in sorted(neighborhoods.items()))
    return f"""-- US 119: complementar o Censo Escolar 2025 com o bairro do Catálogo de Escolas.
-- Revisar este arquivo antes de executar. Match exclusivamente pelo código INEP.
begin;
create temporary table us119_bairros_catalogo (codigo_inep text primary key, bairro text not null) on commit drop;
insert into us119_bairros_catalogo (codigo_inep, bairro) values
{values};

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
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog_csv", type=Path, help="Exportação CSV do Catálogo de Escolas do INEP")
    parser.add_argument("--sql-output", type=Path, required=True)
    args = parser.parse_args()
    neighborhoods, summary = read_catalog(args.catalog_csv)
    args.sql_output.write_text(make_sql(neighborhoods), encoding="utf-8")
    print({**summary, "codigos_inep_distintos_com_bairro": len(neighborhoods), "sql": str(args.sql_output)})


if __name__ == "__main__":
    main()
