-- Presença V2 - auditoria de manutenção de círculo pelos Tios
-- Registra correções de vínculo histórico sem reescrever presenças antigas.

begin;

create table if not exists public.presenca_manutencao_circulo_auditoria (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.presenca_responsaveis_grupos(id),
  membro_historico_id uuid not null references public.eac_circulo_membros_historicos(id),
  pessoa_id uuid null references public.pessoas(id),
  edicao integer not null,
  circulo_origem_id uuid not null references public.eac_circulos_historicos(id),
  circulo_destino_id uuid not null references public.eac_circulos_historicos(id),
  nome_snapshot text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_presenca_manutencao_circulo_pessoa
  on public.presenca_manutencao_circulo_auditoria (pessoa_id, criado_em desc);

create index if not exists idx_presenca_manutencao_circulo_grupo
  on public.presenca_manutencao_circulo_auditoria (grupo_id, criado_em desc);

grant select, insert
on table public.presenca_manutencao_circulo_auditoria
to service_role;

commit;
