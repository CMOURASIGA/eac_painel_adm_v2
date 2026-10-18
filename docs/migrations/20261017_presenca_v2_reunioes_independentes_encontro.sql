-- Presença V2
-- Reuniões de círculo e Pós-encontro não dependem do status/edição de um encontro.

begin;

alter table public.presenca_sessoes
  alter column encontro_id drop not null;

commit;
