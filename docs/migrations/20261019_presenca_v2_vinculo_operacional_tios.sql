-- Presença V2 - vínculo operacional de adolescentes aos grupos/círculos dos Tios
-- Não cria participação histórica em EAC. Serve para adolescentes/encontreiros que precisam
-- aparecer na chamada atual dos Tios sem adulterar eac_circulo_membros_historicos.

begin;

create table if not exists public.presenca_responsavel_pessoas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.presenca_responsaveis_grupos(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id),
  encontreiro_id uuid null references public.encontreiros(id),
  circulo_historico_id uuid not null references public.eac_circulos_historicos(id),
  ativo boolean not null default true,
  origem text not null default 'MANUTENCAO_RESPONSAVEL',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (grupo_id, pessoa_id)
);

create index if not exists idx_presenca_responsavel_pessoas_grupo
  on public.presenca_responsavel_pessoas (grupo_id, ativo);

create index if not exists idx_presenca_responsavel_pessoas_pessoa
  on public.presenca_responsavel_pessoas (pessoa_id, ativo);

create table if not exists public.presenca_manutencao_operacional_auditoria (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.presenca_responsaveis_grupos(id),
  pessoa_id uuid not null references public.pessoas(id),
  encontreiro_id uuid null references public.encontreiros(id),
  circulo_origem_id uuid null references public.eac_circulos_historicos(id),
  circulo_destino_id uuid not null references public.eac_circulos_historicos(id),
  nome_snapshot text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

grant select, insert, update, delete
on table public.presenca_responsavel_pessoas
to service_role;

grant select, insert
on table public.presenca_manutencao_operacional_auditoria
to service_role;

commit;
