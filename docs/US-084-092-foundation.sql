-- US-084 a US-092 - Fundacao operacional backend (idempotente)
begin;
create table if not exists public.migracao_regras_inventario (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  origem_atual text not null default 'GOOGLE_SCRIPT',
  origem_nova text not null default 'SUPABASE',
  descricao_regra text not null,
  endpoint_novo text null,
  status_migracao text not null default 'PENDENTE',
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_migracao_regras_action on public.migracao_regras_inventario (action);

create table if not exists public.backend_service_execucoes (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  action text not null,
  status text not null,
  duracao_ms integer null,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  executado_por text null,
  created_at timestamptz not null default now()
);
create index if not exists ix_backend_service_execucoes_action on public.backend_service_execucoes (action, created_at desc);

create table if not exists public.circulos_execucoes (
  id uuid primary key default gen_random_uuid(),
  encontro_id uuid null references public.encontros(id) on delete set null,
  criterios jsonb not null default '{}'::jsonb,
  total_entradas integer not null default 0,
  total_distribuidas integer not null default 0,
  total_excedente integer not null default 0,
  status text not null default 'SUCESSO',
  executado_por text null,
  created_at timestamptz not null default now()
);

create table if not exists public.circulos_execucao_itens (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.circulos_execucoes(id) on delete cascade,
  inscricao_id uuid null references public.inscricoes(id) on delete set null,
  pessoa_id uuid null references public.pessoas(id) on delete set null,
  circulo_nome text not null,
  prioridade integer null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_circulos_execucao_itens_execucao on public.circulos_execucao_itens (execucao_id);

alter table if exists public.presencas add column if not exists origem_regra text null;
alter table if exists public.presencas add column if not exists regra_versao text null;

create table if not exists public.disparo_execucoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  semana_id text null,
  status text not null default 'SUCESSO',
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  total_erros integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  executado_por text null,
  created_at timestamptz not null default now()
);

alter table if exists public.disparo_execucoes add column if not exists tipo text;
alter table if exists public.disparo_execucoes add column if not exists semana_id text;
alter table if exists public.disparo_execucoes add column if not exists status text not null default 'SUCESSO';
alter table if exists public.disparo_execucoes add column if not exists total_destinatarios integer not null default 0;
alter table if exists public.disparo_execucoes add column if not exists total_enviados integer not null default 0;
alter table if exists public.disparo_execucoes add column if not exists total_erros integer not null default 0;
alter table if exists public.disparo_execucoes add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.disparo_execucoes add column if not exists executado_por text;
alter table if exists public.disparo_execucoes add column if not exists created_at timestamptz not null default now();

update public.disparo_execucoes set tipo = coalesce(tipo, 'LEGADO') where tipo is null;

create index if not exists ix_disparo_execucoes_tipo_data on public.disparo_execucoes (tipo, created_at desc);
create unique index if not exists ux_disparo_execucao_eventos_semana on public.disparo_execucoes (tipo, semana_id) where tipo = 'EVENTOS_SEMANA' and semana_id is not null;
commit;
