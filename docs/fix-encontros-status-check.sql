alter table public.encontros
  drop constraint if exists encontros_status_check;

alter table public.encontros
  add constraint encontros_status_check
  check (status in ('PLANEJADO', 'ATIVO', 'ENCERRADO', 'CANCELADO'));
