-- US-116 - questionario de visitação
-- Execute após a base da US-115

begin;

alter table public.visitacoes
  add column if not exists respostas_questionario jsonb not null default '{}'::jsonb;

alter table public.visitacoes_historico
  add column if not exists respostas_questionario jsonb not null default '{}'::jsonb;

create or replace view public.vw_visitacao_priorizados as
with responsavel_principal as (
  select distinct on (ar.adolescente_id)
    ar.adolescente_id,
    r.nome,
    r.telefone,
    r.email
  from public.adolescente_responsaveis ar
  join public.responsaveis r
    on r.id = ar.responsavel_id
  order by ar.adolescente_id, ar.principal desc, ar.id
)
select
  i.id as inscricao_id,
  i.encontro_id,
  e.nome as encontro_nome,
  e.numero as encontro_numero,
  a.id as adolescente_id,
  p.id as pessoa_adolescente_id,
  p.nome_completo as nome,
  p.email,
  p.telefone,
  p.telefone_normalizado,
  p.bairro,
  p.data_nascimento,
  p.idade_calculada as idade,
  p.sexo,
  rp.nome as responsavel_nome,
  rp.telefone as responsavel_telefone,
  rp.email as responsavel_email,
  coalesce(i.data_inscricao, i.criado_em) as data_cadastro,
  i.status as status_inscricao,
  i.origem_dado as origem_inscricao,
  v.id as visitacao_id,
  coalesce(v.status_visitacao, 'NENHUMA_ACAO') as status_visitacao,
  coalesce(v.contato_inicial_realizado, false) as contato_inicial_realizado,
  v.data_contato_inicial,
  coalesce(v.visitacao_realizada, false) as visitacao_realizada,
  v.data_visitacao,
  v.responsavel_acao,
  v.observacao,
  v.respostas_questionario,
  v.origem_registro,
  v.atualizado_em
from public.inscricoes i
join public.adolescentes a
  on a.id = i.adolescente_id
join public.pessoas p
  on p.id = a.pessoa_id
left join responsavel_principal rp
  on rp.adolescente_id = a.id
left join public.encontros e
  on e.id = i.encontro_id
left join public.visitacoes v
  on v.inscricao_id = i.id
where upper(coalesce(i.status, '')) = 'PRIORIZADO';

commit;
