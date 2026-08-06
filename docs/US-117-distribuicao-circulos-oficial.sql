-- US-117 - Versões oficiais da distribuição de círculos
-- Execute uma vez no SQL Editor do Supabase antes de usar "Salvar como distribuição oficial".
begin;

create table if not exists public.circulos_execucoes (
  id uuid primary key default gen_random_uuid(),
  encontro_id uuid null references public.encontros(id) on delete set null,
  criterios jsonb not null default '{}'::jsonb,
  total_entradas integer not null default 0,
  total_distribuidas integer not null default 0,
  total_excedente integer not null default 0,
  status text not null default 'RASCUNHO',
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

create index if not exists ix_circulos_execucoes_oficial
  on public.circulos_execucoes (status, created_at desc);
create index if not exists ix_circulos_execucao_itens_execucao
  on public.circulos_execucao_itens (execucao_id, prioridade);

commit;
