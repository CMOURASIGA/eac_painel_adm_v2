-- Diagnóstico somente leitura: pessoas elegíveis ao Pós sem ID de encontreiro.
-- Execute no SQL Editor do Supabase que hospeda o EAC.
-- Base: vw_presenca_pos_elegiveis (migration 20261021).
-- Este resultado pode incluir mais de uma pessoa; confirme os universos de 374 e 373.
select distinct on (v.pessoa_id)
  v.pessoa_id,
  v.nome,
  v.adolescente_id,
  v.encontreiro_id,
  v.edicao_operacional,
  v.circle_label,
  v.origem,
  case
    when e.id is null then 'SEM_CADASTRO_ENCONTREIRO'
    else 'VERIFICAR_CLASSIFICACAO_OU_RELACAO'
  end as motivo
from public.vw_presenca_pos_elegiveis v
left join public.encontreiros e on e.pessoa_id = v.pessoa_id
where v.encontreiro_id is null
order by v.pessoa_id, v.edicao_operacional desc;

-- Resumo para confrontar quantidades distintas.
select
 count(distinct pessoa_id) as pessoas_elegiveis_pos,
 count(distinct pessoa_id) filter (where encontreiro_id is not null) as com_encontreiro_id,
 count(distinct pessoa_id) filter (where encontreiro_id is null) as sem_encontreiro_id
from public.vw_presenca_pos_elegiveis;

-- Se a diferença persistir sem linhas no diagnóstico, confrontar
-- os IDs efetivos do payload PRESENCA_V2_GET_ANALYTICS.people
-- com os IDs de pessoa retornados pelo GET_ENCONTREIROS.
