# US-114 - Orientacoes para o node no n8n

## Objetivo

O monitoramento de novas inscricoes ja esta sendo executado no banco via `pg_cron`, com varredura a cada 30 minutos.

O `n8n` nao deve verificar diretamente a tabela `inscricoes`. O papel do fluxo no `n8n` e consumir as notificacoes geradas pela rotina SQL e enviar a comunicacao ao canal desejado.

## Arquitetura esperada

1. O `pg_cron` executa `public.fn_inscricoes_monitor_varrer()` a cada 30 minutos.
2. A function grava o resultado em `public.inscricoes_monitor_execucoes`.
3. Quando houver novas inscricoes, a function grava uma linha em `public.inscricoes_monitor_notificacoes`.
4. O `n8n` consulta `public.inscricoes_monitor_notificacoes` com `enviada = false`.
5. O `n8n` monta a mensagem.
6. O `n8n` envia a notificacao.
7. Se o envio for bem-sucedido, o `n8n` marca a notificacao como enviada.

## Tabela consumida pelo n8n

Tabela principal:

- `public.inscricoes_monitor_notificacoes`

Campos relevantes:

- `id`
- `criado_em`
- `execucao_id`
- `total_novas_inscricoes`
- `referencia_de`
- `referencia_ate`
- `resumo_por_idade_sexo`
- `enviada`
- `enviada_em`
- `canal`
- `observacao`

## Consulta para buscar notificacoes pendentes

```sql
select
  id,
  criado_em,
  execucao_id,
  total_novas_inscricoes,
  referencia_de,
  referencia_ate,
  resumo_por_idade_sexo
from public.inscricoes_monitor_notificacoes
where enviada = false
order by id asc;
```

## Atualizacao apos envio bem-sucedido

```sql
update public.inscricoes_monitor_notificacoes
set
  enviada = true,
  enviada_em = now(),
  canal = 'n8n',
  observacao = 'Notificacao enviada com sucesso'
where id = :id;
```

## Comportamento em caso de falha

Se o envio falhar:

- nao atualizar `enviada = true`
- opcionalmente registrar o erro em `observacao`

Exemplo:

```sql
update public.inscricoes_monitor_notificacoes
set
  canal = 'n8n',
  observacao = :mensagem_erro
where id = :id;
```

## Payload esperado

Exemplo de registro em `public.inscricoes_monitor_notificacoes`:

```json
{
  "id": 1,
  "criado_em": "2026-06-19 12:02:27.477512+00",
  "execucao_id": 1,
  "total_novas_inscricoes": 402,
  "referencia_de": null,
  "referencia_ate": "2026-06-19 12:02:27.477512+00",
  "resumo_por_idade_sexo": [
    { "sexo": "Feminino", "idade": 12, "quantidade": 11 },
    { "sexo": "Masculino", "idade": 12, "quantidade": 6 },
    { "sexo": "Nao informado", "idade": 12, "quantidade": 3 }
  ],
  "enviada": false,
  "enviada_em": null,
  "canal": null,
  "observacao": null
}
```

## Formato sugerido da mensagem

Exemplo:

```text
Novas inscricoes detectadas

Periodo:
de {referencia_de ou "inicio da monitoracao"}
ate {referencia_ate}

Total de novas inscricoes: {total_novas_inscricoes}

Resumo por idade e sexo:
- 12 / Feminino: 11
- 12 / Masculino: 6
- 12 / Nao informado: 3
```

## Fluxo sugerido no n8n

1. Node `Postgres` para consultar `public.inscricoes_monitor_notificacoes` com `enviada = false`
2. Node `IF` para verificar se houve retorno
3. Node `Function` ou equivalente para montar a mensagem
4. Node de envio para o canal escolhido
5. Node `Postgres` para atualizar `enviada = true`

## Importante sobre a primeira execucao

Na primeira execucao manual observada:

- `ultimo_check = null`
- `total_novas_inscricoes = 402`

Isso indica que a rotina interpretou toda a base historica como "nova", o que e esperado na primeira rodada.

Recomendacao:

- nao enviar a notificacao inicial para usuarios finais, ou
- marcar manualmente a primeira notificacao como enviada para estabelecer a baseline

Exemplo:

```sql
update public.inscricoes_monitor_notificacoes
set
  enviada = true,
  enviada_em = now(),
  canal = 'ajuste_manual',
  observacao = 'Primeira carga historica ignorada para baseline'
where id = 1;
```

## Observacao sobre qualidade dos dados

No teste manual apareceram idades fora do esperado para triagem, por exemplo:

- `0`
- `47`
- `48`
- `57`
- `71`
- `2014`

Isso sugere inconsistencias em `pessoas.idade_calculada`.

Se a notificacao operacional precisar refletir apenas adolescentes da faixa esperada, o fluxo do `n8n` deve filtrar o array `resumo_por_idade_sexo` para manter apenas idades entre `12` e `17`.

Regra sugerida:

- incluir somente itens com `idade >= 12 and idade <= 17`

## Observacao final

Nao ha necessidade de trigger para a verificacao temporal de 30 em 30 minutos.

O desenho correto para este caso e:

- `pg_cron` para agendamento da varredura
- SQL para registrar notificacoes pendentes
- `n8n` para consumir e enviar as notificacoes
