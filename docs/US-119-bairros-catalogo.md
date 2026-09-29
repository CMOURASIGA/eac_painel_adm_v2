# US 119: bairro das unidades escolares

## Diagnóstico em 29/09/2026

Na base de Preview, `public.escolas` tinha 361 escolas ativas de Niterói, todas com `bairro` nulo. A origem registrada era `INEP/Censo Escolar 2025`. O arquivo `Tabela_Escola_2025_V2.csv` da carga contém `CO_ENTIDADE` (código INEP), `NO_ENTIDADE`, `TP_DEPENDENCIA`, `CO_MUNICIPIO` e `TP_SITUACAO_FUNCIONAMENTO`, mas não contém bairro. Os três Pensi `33150931`, `33161429` e `33165920` estavam sem bairro, assim como o quarto `33057451` no Censo.

## Fonte complementar e atualização

O [Catálogo de Escolas do INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/) disponibiliza endereço por unidade e exportação CSV. O arquivo recebido `Análise - Tabela da lista das escolas - Detalhado.csv` tem código INEP e `Endereço` em formato composto, com bairro antes do CEP, mas não tem coluna `Bairro`. O microdado escolar 2025 continua sendo a fonte da lista de 361 unidades. O Catálogo complementa o endereço; o parser só aceita nomes de bairro reconhecíveis no final do endereço e deixa casos ambíguos para revisão.

O CSV tem 377 linhas, sendo 11 escolas paralisadas. Entre as 366 restantes, 362 têm bairro identificável no endereço; quatro têm duas localidades e foram deixadas de fora. Do cruzamento por código INEP com as 361 unidades ativas carregadas do Censo 2025, **342 têm bairro identificável** e **19 permanecem sem bairro**. Existem diferenças de composição entre o catálogo atual e o Censo 2025; não inserir escolas novas nesta manutenção.

Pensi no arquivo: `33057451` Icaraí, `33150931` Icaraí, `33161429` Itaipu, `33165920` Icaraí. O bairro distingue Itaipu das demais; o INEP na lista distingue as três unidades de Icaraí.

Execute localmente:

```bash
python3 scripts/us119_backfill_escolas_bairro.py catalogo-escolas-niteroi.csv \
  --sql-output /tmp/us119-bairros.sql --expect-total 361 --expect-matches 342
```

O SQL gerado para o arquivo recebido está em `docs/migrations/20260929_us119_bairros_catalogo_inep.sql`. Confira a contagem e os códigos retornados. Execute o SQL **inteiro** no SQL Editor do projeto EAC. Ele aborta se o total de escolas ativas não for 361 ou se a correspondência de códigos não for 342. A atualização encontra a unidade **somente pelo `codigo_inep`**, modifica apenas `bairro` e `atualizado_em`, e conserva `escolas.id` e todos os vínculos de inscrições por `escola_id`. Duplicatas de nome são unidades independentes. Códigos INEP repetidos com bairros conflitantes impedem a geração. Bairro ausente ou ambíguo no catálogo permanece sem preenchimento e o formulário usa `Bairro não informado`.

Após executar, valide as contagens e os quatro Pensi retornados pelo SQL. Consulte o formulário no Preview pesquisando `Pensi`; cada unidade deve manter seu código INEP e mostrar seu bairro quando ele vier do catálogo.
