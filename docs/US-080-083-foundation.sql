-- US-080 a US-083 - Fundacao de modelo e deduplicacao
-- Execute no SQL Editor do Supabase (projeto de homolog/producao conforme estrategia).
-- Se alguma execucao anterior falhou no meio da transacao, rode `rollback;` antes.

begin;

-- US-080: cadastro_oficial como base mestre
create table if not exists public.cadastro_oficial (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete restrict,
  encontro_id uuid null references public.encontros(id) on delete set null,
  origem text not null default 'SISTEMA',
  status text not null default 'ATIVO',
  elegivel_encontreiro boolean not null default false,
  observacoes text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.cadastro_oficial
  add column if not exists ativo boolean not null default true;

alter table if exists public.cadastro_oficial
  add column if not exists elegivel_encontreiro boolean not null default false;

alter table if exists public.cadastro_oficial
  add column if not exists origem text not null default 'SISTEMA';

alter table if exists public.cadastro_oficial
  add column if not exists status text not null default 'ATIVO';

alter table if exists public.cadastro_oficial
  add column if not exists observacoes text null;

alter table if exists public.cadastro_oficial
  add column if not exists encontro_id uuid null references public.encontros(id) on delete set null;

alter table if exists public.cadastro_oficial
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.cadastro_oficial
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ux_cadastro_oficial_pessoa_ativo
  on public.cadastro_oficial (pessoa_id)
  where ativo = true;

create index if not exists ix_cadastro_oficial_encontro
  on public.cadastro_oficial (encontro_id);

-- US-081: evolucao de papeis da pessoa
create table if not exists public.pessoa_papeis (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  papel text not null,
  ativo boolean not null default true,
  origem text not null default 'SISTEMA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_pessoa_papel_ativo
  on public.pessoa_papeis (pessoa_id, papel)
  where ativo = true;

-- US-082: suporte a deduplicacao de inscricoes
alter table if exists public.inscricoes
  add column if not exists status_deduplicacao text not null default 'UNICA';

alter table if exists public.inscricoes
  add column if not exists inscricao_canonica_id uuid null references public.inscricoes(id) on delete set null;

alter table if exists public.inscricoes
  add column if not exists deduplicada_em timestamptz null;

alter table if exists public.inscricoes
  add column if not exists deduplicada_por text null;

create table if not exists public.inscricoes_duplicidade_historico (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  inscricao_canonica_id uuid null references public.inscricoes(id) on delete set null,
  motivo text not null,
  regra text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_inscricoes_dup_hist_inscricao
  on public.inscricoes_duplicidade_historico (inscricao_id);

-- US-083: view de inscricoes sem duplicidade
drop view if exists public.vw_inscricoes_sem_duplicidade;

create view public.vw_inscricoes_sem_duplicidade as
select i.*
from public.inscricoes i
where coalesce(i.status_deduplicacao, 'UNICA') <> 'DUPLICADA';

commit;
