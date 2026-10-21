-- Presença V2 - read models para performance e consistência
-- Centraliza elegibilidade do Pós, elegibilidade dos Tios, resumos de sessão
-- e frequência histórica em views SQL.
-- Rodar no Supabase SQL Editor antes de publicar o código que consome estas views.

begin;

-- Índices de leitura usados pelas views e rotinas de presença.
create index if not exists idx_presencas_sessao_status_pessoa
  on public.presencas (sessao_id, status_presenca, pessoa_id);

create index if not exists idx_presenca_pendencias_sessao_status
  on public.presenca_pendencias (sessao_id, status);

create index if not exists idx_presenca_sessoes_responsavel_status_data
  on public.presenca_sessoes (responsavel_grupo_id, status, agendada_para desc);

create index if not exists idx_presenca_sessoes_tipo_status
  on public.presenca_sessoes (tipo, status);

create index if not exists idx_eac_membros_hist_circulo_pessoa
  on public.eac_circulo_membros_historicos (circulo_id, pessoa_id);

create index if not exists idx_eac_membros_hist_pessoa_circulo
  on public.eac_circulo_membros_historicos (pessoa_id, circulo_id);

create index if not exists idx_presenca_resp_circulos_grupo_hist
  on public.presenca_responsavel_circulos (grupo_id, circulo_historico_id);

create index if not exists idx_presenca_resp_circulos_grupo_atual
  on public.presenca_responsavel_circulos (grupo_id, circulo_id);

create index if not exists idx_circulo_participantes_circulo_pessoa
  on public.circulo_participantes (circulo_id, pessoa_id);

create index if not exists idx_encontreiros_pessoa_class_status
  on public.encontreiros (pessoa_id, classificacao, status);

create index if not exists idx_adolescentes_pessoa
  on public.adolescentes (pessoa_id);

create index if not exists idx_inscricoes_status_encontro_adolescente
  on public.inscricoes (status, encontro_id, adolescente_id);

create index if not exists idx_encontros_numero
  on public.encontros (numero);

-- ---------------------------------------------------------------------------
-- 1) Fonte canônica de elegibilidade do Pós
-- Regra única:
--   a) EAC 34 ou posterior;
--   b) encontreiro ADOLESCENTE/DISPONIVEL sem qualquer EAC conhecido,
--      tratado operacionalmente como EAC 34.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_pos_elegiveis as
with adolescentes_base as (
  select
    a.id as adolescente_id,
    a.pessoa_id,
    a.ja_fez_eac,
    a.encontro_anterior
  from public.adolescentes a
  where a.pessoa_id is not null
),
eac_por_cadastro as (
  select
    a.pessoa_id,
    substring(a.encontro_anterior::text from '([0-9]{1,3})')::int as edicao
  from adolescentes_base a
  where a.ja_fez_eac = true
    and a.encontro_anterior is not null
    and a.encontro_anterior::text ~ '[0-9]{1,3}'
),
eac_por_circulo as (
  select distinct
    m.pessoa_id,
    c.edicao::int as edicao
  from public.eac_circulo_membros_historicos m
  join public.eac_circulos_historicos c
    on c.id = m.circulo_id
  where m.pessoa_id is not null
    and c.edicao is not null
),
eac_por_inscricao as (
  select distinct
    a.pessoa_id,
    e.numero::int as edicao
  from public.inscricoes i
  join adolescentes_base a
    on a.adolescente_id = i.adolescente_id
  join public.encontros e
    on e.id = i.encontro_id
  where i.status = 'PRIORIZADO'
    and e.numero is not null
),
eacs_conhecidos as (
  select pessoa_id, edicao from eac_por_cadastro
  union
  select pessoa_id, edicao from eac_por_circulo
  union
  select pessoa_id, edicao from eac_por_inscricao
),
tem_algum_eac as (
  select distinct pessoa_id
  from eacs_conhecidos
),
eac_34_mais as (
  select
    pessoa_id,
    max(edicao)::int as edicao_operacional
  from eacs_conhecidos
  where edicao >= 34
  group by pessoa_id
),
sem_eac_como_34 as (
  select distinct
    e.pessoa_id,
    34::int as edicao_operacional
  from public.encontreiros e
  where e.classificacao = 'ADOLESCENTE'
    and e.status = 'DISPONIVEL'
    and e.pessoa_id is not null
    and not exists (
      select 1
      from tem_algum_eac t
      where t.pessoa_id = e.pessoa_id
    )
),
base_elegivel as (
  select
    pessoa_id,
    edicao_operacional,
    'EAC_REAL'::text as origem
  from eac_34_mais

  union all

  select
    pessoa_id,
    edicao_operacional,
    'SEM_EAC_COMO_34'::text as origem
  from sem_eac_como_34
),
labels_distintos as (
  select distinct
    m.pessoa_id,
    c.edicao::int as edicao,
    ('EAC ' || c.edicao::text || ' · ' || coalesce(c.cor,''))::text as label
  from public.eac_circulo_membros_historicos m
  join public.eac_circulos_historicos c
    on c.id = m.circulo_id
  where m.pessoa_id is not null
    and c.edicao is not null
),
labels_agrupados as (
  select
    pessoa_id,
    edicao,
    string_agg(label, ' | ' order by label) as circle_label
  from labels_distintos
  group by pessoa_id, edicao
)
select
  b.pessoa_id,
  p.nome_completo as nome,
  coalesce(nullif(p.telefone_normalizado,''), regexp_replace(coalesce(p.telefone,''), '\D', '', 'g')) as telefone_normalizado,
  ad.adolescente_id,
  enc.encontreiro_id,
  b.edicao_operacional,
  case
    when b.edicao_operacional = 34
      then coalesce(nullif(l.circle_label,''), 'EAC 34 · Sem círculo')
    else coalesce(nullif(l.circle_label,''), 'EAC ' || b.edicao_operacional::text)
  end as circle_label,
  b.origem
from base_elegivel b
join public.pessoas p
  on p.id = b.pessoa_id
left join labels_agrupados l
  on l.pessoa_id = b.pessoa_id
 and l.edicao = b.edicao_operacional
left join lateral (
  select a.id as adolescente_id
  from public.adolescentes a
  where a.pessoa_id = b.pessoa_id
  order by a.id
  limit 1
) ad on true
left join lateral (
  select e.id as encontreiro_id
  from public.encontreiros e
  where e.pessoa_id = b.pessoa_id
  order by
    case when e.classificacao = 'ADOLESCENTE' and e.status = 'DISPONIVEL' then 0 else 1 end,
    e.id
  limit 1
) enc on true;

-- ---------------------------------------------------------------------------
-- 2) Fonte canônica de elegibilidade por grupo de Tios
-- Une vínculo histórico, círculo atual e vínculo operacional.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_tios_elegiveis as
with fontes as (
  select
    rc.grupo_id,
    m.pessoa_id,
    c.id as circulo_historico_id,
    c.edicao::int as edicao,
    c.cor::text as cor,
    ('EAC ' || c.edicao::text || ' · ' || coalesce(c.cor,''))::text as circle_label,
    'HISTORICO'::text as origem
  from public.presenca_responsavel_circulos rc
  join public.eac_circulo_membros_historicos m
    on m.circulo_id = rc.circulo_historico_id
  join public.eac_circulos_historicos c
    on c.id = rc.circulo_historico_id
  where rc.circulo_historico_id is not null
    and m.pessoa_id is not null

  union all

  select
    rc.grupo_id,
    cp.pessoa_id,
    null::uuid as circulo_historico_id,
    null::int as edicao,
    null::text as cor,
    null::text as circle_label,
    'CIRCULO_ATUAL'::text as origem
  from public.presenca_responsavel_circulos rc
  join public.circulo_participantes cp
    on cp.circulo_id = rc.circulo_id
  where rc.circulo_id is not null
    and cp.pessoa_id is not null

  union all

  select
    rp.grupo_id,
    rp.pessoa_id,
    c.id as circulo_historico_id,
    c.edicao::int as edicao,
    c.cor::text as cor,
    ('EAC ' || c.edicao::text || ' · ' || coalesce(c.cor,''))::text as circle_label,
    'OPERACIONAL'::text as origem
  from public.presenca_responsavel_pessoas rp
  join public.eac_circulos_historicos c
    on c.id = rp.circulo_historico_id
  where rp.ativo = true
    and rp.pessoa_id is not null
),
labels as (
  select
    grupo_id,
    pessoa_id,
    string_agg(distinct circle_label, ' | ' order by circle_label)
      filter (where circle_label is not null and circle_label <> '') as circle_label,
    max(edicao) as edicao,
    string_agg(distinct origem, ',' order by origem) as origens
  from fontes
  group by grupo_id, pessoa_id
)
select
  l.grupo_id,
  l.pessoa_id,
  p.nome_completo as nome,
  coalesce(nullif(p.telefone_normalizado,''), regexp_replace(coalesce(p.telefone,''), '\D', '', 'g')) as telefone_normalizado,
  ad.adolescente_id,
  enc.encontreiro_id,
  l.edicao,
  coalesce(l.circle_label,'') as circle_label,
  l.origens
from labels l
join public.pessoas p
  on p.id = l.pessoa_id
left join lateral (
  select a.id as adolescente_id
  from public.adolescentes a
  where a.pessoa_id = l.pessoa_id
  order by a.id
  limit 1
) ad on true
left join lateral (
  select e.id as encontreiro_id
  from public.encontreiros e
  where e.pessoa_id = l.pessoa_id
  order by e.id
  limit 1
) enc on true;

-- ---------------------------------------------------------------------------
-- 3) Contexto do Pós por Tios.
-- EAC 34 usa um agrupamento operacional genérico.
-- EAC 35+ usa os vínculos históricos reais entre círculo e grupo de Tios.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_pos_contexto_tios as
select distinct
  ('TIOS:' || g.id::text) as group_key,
  g.id as grupo_id,
  coalesce(g.nome_exibicao,'Tios de Círculo') as group_label,
  c.id::text as circle_key,
  c.id as circulo_historico_id,
  ('EAC ' || c.edicao::text || ' · ' || coalesce(c.cor,'')) as circle_label,
  c.edicao::int as edicao,
  e.pessoa_id,
  e.nome,
  e.telefone_normalizado
from public.vw_presenca_pos_elegiveis e
join public.eac_circulo_membros_historicos m
  on m.pessoa_id = e.pessoa_id
join public.eac_circulos_historicos c
  on c.id = m.circulo_id
 and c.edicao >= 35
join public.presenca_responsavel_circulos rc
  on rc.circulo_historico_id = c.id
join public.presenca_responsaveis_grupos g
  on g.id = rc.grupo_id
 and g.tipo = 'TIOS'
where e.edicao_operacional >= 35

union all

select
  'EAC34-TIOS-GENERICOS'::text as group_key,
  null::uuid as grupo_id,
  'Tios do EAC 34'::text as group_label,
  'EAC34-SEM-CIRCULO'::text as circle_key,
  null::uuid as circulo_historico_id,
  'EAC 34 · Sem círculo'::text as circle_label,
  34::int as edicao,
  e.pessoa_id,
  e.nome,
  e.telefone_normalizado
from public.vw_presenca_pos_elegiveis e
where e.edicao_operacional = 34;

-- ---------------------------------------------------------------------------
-- 4) Frequência dos Tios já agregada no banco.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_tios_frequencia as
with fechadas as (
  select id, responsavel_grupo_id
  from public.presenca_sessoes
  where tipo = 'REUNIAO_DUPLA_TIOS'
    and status = 'ENCERRADA'
),
base as (
  select
    s.id as sessao_id,
    s.responsavel_grupo_id as grupo_id,
    e.pessoa_id,
    e.nome,
    e.circle_label,
    case when p.pessoa_id is null then 0 else 1 end as presente
  from fechadas s
  join public.vw_presenca_tios_elegiveis e
    on e.grupo_id = s.responsavel_grupo_id
  left join (
    select distinct sessao_id, pessoa_id
    from public.presencas
    where status_presenca = 'REGISTRADA'
      and pessoa_id is not null
  ) p
    on p.sessao_id = s.id
   and p.pessoa_id = e.pessoa_id
)
select
  grupo_id,
  pessoa_id,
  max(nome) as nome,
  max(circle_label) as circle_label,
  count(distinct sessao_id)::int as eligible_sessions,
  count(distinct sessao_id) filter (where presente = 1)::int as present,
  (count(distinct sessao_id) - count(distinct sessao_id) filter (where presente = 1))::int as absences,
  case
    when count(distinct sessao_id) = 0 then 0::numeric
    else round(
      (count(distinct sessao_id) filter (where presente = 1))::numeric
      * 100
      / count(distinct sessao_id)::numeric,
      2
    )
  end as rate
from base
group by grupo_id, pessoa_id;

-- ---------------------------------------------------------------------------
-- 5) Drill-down do Pós por Tios já agregado no banco.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_pos_tios_frequencia as
with fechadas as (
  select id
  from public.presenca_sessoes
  where tipo = 'POS_ENCONTRO_GERAL'
    and status = 'ENCERRADA'
),
base as (
  select
    s.id as sessao_id,
    c.group_key,
    c.grupo_id,
    c.group_label,
    c.circle_key,
    c.circulo_historico_id,
    c.circle_label,
    c.edicao,
    c.pessoa_id,
    c.nome,
    case when p.pessoa_id is null then 0 else 1 end as presente
  from fechadas s
  cross join public.vw_presenca_pos_contexto_tios c
  left join (
    select distinct sessao_id, pessoa_id
    from public.presencas
    where status_presenca = 'REGISTRADA'
      and pessoa_id is not null
  ) p
    on p.sessao_id = s.id
   and p.pessoa_id = c.pessoa_id
)
select
  group_key,
  grupo_id,
  group_label,
  circle_key,
  circulo_historico_id,
  circle_label,
  edicao,
  pessoa_id,
  max(nome) as nome,
  count(distinct sessao_id)::int as eligible_sessions,
  count(distinct sessao_id) filter (where presente = 1)::int as present,
  (count(distinct sessao_id) - count(distinct sessao_id) filter (where presente = 1))::int as absences,
  case
    when count(distinct sessao_id) = 0 then 0::numeric
    else round(
      (count(distinct sessao_id) filter (where presente = 1))::numeric
      * 100
      / count(distinct sessao_id)::numeric,
      2
    )
  end as rate
from base
group by
  group_key,
  grupo_id,
  group_label,
  circle_key,
  circulo_historico_id,
  circle_label,
  edicao,
  pessoa_id;

-- ---------------------------------------------------------------------------
-- 6) Resumo de cada sessão.
-- Elimina a necessidade de recalcular elegibilidade/confirmados/pendentes
-- separadamente em cada card.
-- ---------------------------------------------------------------------------
create or replace view public.vw_presenca_sessoes_resumo as
with pos_total as (
  select count(*)::int as total
  from public.vw_presenca_pos_elegiveis
),
confirmados as (
  select
    sessao_id,
    count(*)::int as total
  from public.presencas
  where status_presenca = 'REGISTRADA'
  group by sessao_id
),
pendentes as (
  select
    sessao_id,
    count(*)::int as total
  from public.presenca_pendencias
  where status = 'PENDENTE'
  group by sessao_id
),
tios_totais as (
  select
    grupo_id,
    count(*)::int as total
  from public.vw_presenca_tios_elegiveis
  group by grupo_id
)
select
  s.id as sessao_id,
  s.responsavel_grupo_id,
  s.tipo,
  s.status,
  case
    when s.tipo = 'POS_ENCONTRO_GERAL' then pt.total
    when s.tipo = 'REUNIAO_DUPLA_TIOS' then coalesce(tt.total,0)
    else 0
  end::int as eligible_count,
  coalesce(c.total,0)::int as confirmed_count,
  coalesce(p.total,0)::int as pending_count
from public.presenca_sessoes s
cross join pos_total pt
left join confirmados c
  on c.sessao_id = s.id
left join pendentes p
  on p.sessao_id = s.id
left join tios_totais tt
  on tt.grupo_id = s.responsavel_grupo_id;

revoke all on public.vw_presenca_pos_elegiveis from anon, authenticated;
revoke all on public.vw_presenca_tios_elegiveis from anon, authenticated;
revoke all on public.vw_presenca_pos_contexto_tios from anon, authenticated;
revoke all on public.vw_presenca_tios_frequencia from anon, authenticated;
revoke all on public.vw_presenca_pos_tios_frequencia from anon, authenticated;
revoke all on public.vw_presenca_sessoes_resumo from anon, authenticated;

grant select on public.vw_presenca_pos_elegiveis to service_role;
grant select on public.vw_presenca_tios_elegiveis to service_role;
grant select on public.vw_presenca_pos_contexto_tios to service_role;
grant select on public.vw_presenca_tios_frequencia to service_role;
grant select on public.vw_presenca_pos_tios_frequencia to service_role;
grant select on public.vw_presenca_sessoes_resumo to service_role;

commit;

-- Validação recomendada após executar:
--
-- select count(*) from public.vw_presenca_pos_elegiveis;
-- Esperado hoje: 374.
--
-- select edicao_operacional, origem, count(*)
-- from public.vw_presenca_pos_elegiveis
-- group by edicao_operacional, origem
-- order by edicao_operacional, origem;
--
-- select * from public.vw_presenca_sessoes_resumo
-- order by sessao_id;
