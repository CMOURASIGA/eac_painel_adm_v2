-- Cria (se ainda nao existirem) as tabelas que passam a registrar, de forma
-- permanente, em qual circulo cada pessoa foi colocada a cada execucao da
-- distribuicao de circulos. Sem essas tabelas o app continua funcionando
-- normalmente, so que a distribuicao permanece "somente nesta execucao"
-- (como e hoje).
--
-- Essas mesmas tabelas ja estavam definidas em docs/US-084-092-foundation.sql;
-- este script isola so essa parte, para o caso de aquele arquivo completo
-- ainda nao ter sido rodado. E seguro rodar mesmo se as tabelas ja existirem
-- (create table if not exists / create index if not exists).

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
create index if not exists ix_circulos_execucao_itens_pessoa on public.circulos_execucao_itens (pessoa_id, created_at desc);
create index if not exists ix_circulos_execucao_itens_inscricao on public.circulos_execucao_itens (inscricao_id, created_at desc);
