# US 119: bairro das unidades escolares

## Diagnóstico em 29/09/2026

Na base de Preview, `public.escolas` tinha 361 escolas ativas de Niterói, todas com `bairro` nulo. A origem registrada era `INEP/Censo Escolar 2025`. O arquivo `Tabela_Escola_2025_V2.csv` da carga contém `CO_ENTIDADE` (código INEP), `NO_ENTIDADE`, `TP_DEPENDENCIA`, `CO_MUNICIPIO` e `TP_SITUACAO_FUNCIONAMENTO`, mas não contém bairro. Os três Pensi `33150931`, `33161429` e `33165920` estavam sem bairro, assim como o quarto `33057451` no Censo.

## Fonte complementar e atualização

O [Catálogo de Escolas do INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/) disponibiliza endereço por unidade e exportação CSV. Filtre Niterói/RJ, escolas em funcionamento, e exporte com **código INEP** e **bairro**. O microdado escolar 2025 continua sendo a fonte da lista de 361 unidades; o Catálogo complementa o endereço.

Execute localmente:

```bash
python3 scripts/us119_backfill_escolas_bairro.py catalogo-escolas-niteroi.csv --sql-output /tmp/us119-bairros.sql
```

Confira a contagem e os códigos retornados. Revise o SQL antes de executar no SQL Editor do projeto EAC. A atualização encontra a unidade **somente pelo `codigo_inep`**, modifica apenas `bairro` e `atualizado_em`, e conserva `escolas.id` e todos os vínculos de inscrições por `escola_id`. Duplicatas de nome são unidades independentes. Códigos INEP repetidos com bairros conflitantes impedem a geração. Bairro ausente no catálogo permanece sem preenchimento e o formulário usa `Bairro não informado`.

Após executar, valide as contagens e os quatro Pensi retornados pelo SQL. Consulte o formulário no Preview pesquisando `Pensi`; cada unidade deve manter seu código INEP e mostrar seu bairro quando ele vier do catálogo.
