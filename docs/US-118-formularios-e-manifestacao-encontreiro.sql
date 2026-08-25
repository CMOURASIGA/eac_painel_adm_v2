-- US-118 - disponibilidade dos formulários e manifestação para o próximo EAC
-- Execute no SQL Editor do Supabase antes de publicar a tela.
-- Não cria cadastro duplicado: a manifestação fica no único registro de cada encontreiro.

alter table public.encontreiros
  add column if not exists deseja_trabalhar_proximo_eac text,
  add column if not exists manifestacao_encontro_id uuid,
  add column if not exists manifestacao_atualizada_em timestamptz;

alter table public.encontreiros
  drop constraint if exists encontreiros_deseja_trabalhar_proximo_eac_check;

alter table public.encontreiros
  add constraint encontreiros_deseja_trabalhar_proximo_eac_check
  check (deseja_trabalhar_proximo_eac is null or deseja_trabalhar_proximo_eac in ('SIM', 'NÃO'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'encontreiros_manifestacao_encontro_id_fkey'
  ) then
    alter table public.encontreiros
      add constraint encontreiros_manifestacao_encontro_id_fkey
      foreign key (manifestacao_encontro_id) references public.encontros(id) on delete set null;
  end if;
end $$;

create table if not exists public.configuracoes_formularios (
  id text primary key default 'geral' check (id = 'geral'),
  encontrista_ativo boolean not null default true,
  encontreiro_ativo boolean not null default true,
  presenca_ativo boolean not null default true,
  encontro_confirmacao_id uuid references public.encontros(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

insert into public.configuracoes_formularios (id)
values ('geral')
on conflict (id) do nothing;

-- Quando a coordenação troca o EAC de confirmação, a resposta anterior perde a validade.
-- A pessoa continua com um único registro em encontreiros.
create or replace function public.limpar_manifestacoes_ao_trocar_encontro_confirmacao()
returns trigger
language plpgsql
as $$
begin
  if new.encontro_confirmacao_id is distinct from old.encontro_confirmacao_id then
    update public.encontreiros
       set deseja_trabalhar_proximo_eac = null,
           manifestacao_encontro_id = null,
           manifestacao_atualizada_em = null;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_limpar_manifestacoes_encontro_confirmacao on public.configuracoes_formularios;
create trigger trg_limpar_manifestacoes_encontro_confirmacao
before update of encontro_confirmacao_id on public.configuracoes_formularios
for each row execute function public.limpar_manifestacoes_ao_trocar_encontro_confirmacao();

alter table public.configuracoes_formularios enable row level security;
revoke all on public.configuracoes_formularios from anon, authenticated;

-- Conferência final
select id, encontrista_ativo, encontreiro_ativo, presenca_ativo, encontro_confirmacao_id
from public.configuracoes_formularios;
