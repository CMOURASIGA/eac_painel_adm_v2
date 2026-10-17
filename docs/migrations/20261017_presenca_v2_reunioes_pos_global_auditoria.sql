-- Presença V2 - reuniões, Pós global e auditoria
-- Idempotente para homologação. Não ativa grupos históricos.

begin;

alter table public.presenca_responsaveis_grupos
  alter column encontro_id drop not null;

update public.presenca_responsaveis_grupos
set
  codigo = 'POS-GERAL',
  nome_exibicao = 'Responsável do Pós',
  encontro_id = null,
  ativo = true
where codigo in ('EAC37-POS', 'POS-GERAL')
  and tipo = 'POS';

alter table public.presenca_sessao_eventos
  add column if not exists tipo_evento text;

alter table public.presenca_sessao_eventos
  add column if not exists ator_tipo text;

alter table public.presenca_sessao_eventos
  add column if not exists responsavel_grupo_id uuid;

alter table public.presenca_sessao_eventos
  add column if not exists detalhes jsonb not null default '{}'::jsonb;

alter table public.presenca_sessao_eventos
  add column if not exists criado_em timestamptz not null default now();

grant select, insert, update, delete
on table public.presenca_sessao_eventos
to service_role;

commit;
