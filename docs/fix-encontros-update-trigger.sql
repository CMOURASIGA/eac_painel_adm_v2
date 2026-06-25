create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at = now();
  end if;

  if to_jsonb(new) ? 'atualizado_em' then
    new.atualizado_em = now();
  end if;

  return new;
end;
$$;

drop trigger if exists t_set_updated_at_encontros on public.encontros;

create trigger t_set_updated_at_encontros
before update on public.encontros
for each row
execute procedure public.set_updated_at();
