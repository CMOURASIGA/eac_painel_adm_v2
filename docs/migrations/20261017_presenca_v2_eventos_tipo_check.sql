-- Presença V2
-- Amplia a constraint legada da auditoria para aceitar edição de reunião.

begin;

alter table public.presenca_sessao_eventos
  drop constraint if exists presenca_sessao_eventos_tipo_check;

alter table public.presenca_sessao_eventos
  add constraint presenca_sessao_eventos_tipo_check
  check (
    tipo = any (
      array[
        'SESSION_CREATED'::text,
        'SESSION_OPENED'::text,
        'SESSION_UPDATED'::text,
        'CLOSE_REQUESTED'::text,
        'CLOSE_CANCELLED'::text,
        'CLOSED_MANUAL'::text,
        'CLOSED_AUTO'::text,
        'CLOSED_ADMIN'::text,
        'REOPENED_RESPONSIBLE'::text,
        'REOPENED_ADMIN'::text,
        'SESSION_CANCELLED'::text
      ]
    )
  );

commit;
