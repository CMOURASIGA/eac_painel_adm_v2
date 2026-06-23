-- US-115 - modulo de visitacao

create table if not exists public.visitacoes (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  status_visitacao text not null default 'NENHUMA_ACAO',
  contato_inicial_realizado boolean not null default false,
  data_contato_inicial timestamptz null,
  visitacao_realizada boolean not null default false,
  data_visitacao timestamptz null,
  responsavel_acao text null,
  observacao text null,
  origem_registro text not null default 'PAINEL',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint visitacoes_inscricao_unique unique (inscricao_id),
  constraint visitacoes_status_check check (
    status_visitacao in (
      'NENHUMA_ACAO',
      'CONTATO_INICIAL_FEITO',
      'VISITACAO_REALIZADA',
      'NAO_CONSEGUIU_CONTATO',
      'AGUARDANDO_RETORNO',
      'NAO_DESEJA_VISITA'
    )
  )
);

create table if not exists public.visitacoes_historico (
  id uuid primary key default gen_random_uuid(),
  visitacao_id uuid null references public.visitacoes(id) on delete set null,
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  tipo_acao text not null,
  status_anterior text null,
  status_novo text null,
  descricao text null,
  responsavel_acao text null,
  origem_registro text not null default 'PAINEL',
  criado_em timestamptz not null default now(),
  constraint visitacoes_historico_tipo_check check (
    tipo_acao in (
      'CONTATO_INICIAL',
      'VISITA_REALIZADA',
      'TENTATIVA_CONTATO',
      'OBSERVACAO',
      'STATUS_ALTERADO'
    )
  )
);

create index if not exists idx_visitacoes_inscricao_id
  on public.visitacoes(inscricao_id);

create index if not exists idx_visitacoes_status
  on public.visitacoes(status_visitacao);

create index if not exists idx_visitacoes_historico_inscricao_id
  on public.visitacoes_historico(inscricao_id);

create index if not exists idx_visitacoes_historico_criado_em
  on public.visitacoes_historico(criado_em desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_visitacoes_updated_at on public.visitacoes;
create trigger trg_visitacoes_updated_at
before update on public.visitacoes
for each row
execute function public.set_updated_at();

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
