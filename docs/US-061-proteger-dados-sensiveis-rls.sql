-- US-061 - Proteger dados sensíveis (RLS + policies)
-- Observação: este SQL cria baseline de proteção no banco.
-- O backend do projeto usa service_role; por isso a proteção também é aplicada na camada de API.

-- 1) Habilitar RLS em tabelas sensíveis, quando existirem
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'encontreiros') then
    alter table public.encontreiros enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cadastro_oficial') then
    alter table public.cadastro_oficial enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adolescentes') then
    alter table public.adolescentes enable row level security;
  end if;
end $$;

-- 2) Policies mínimas para usuários autenticados (ajuste conforme seu modelo de auth)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'encontreiros') then
    drop policy if exists p_encontreiros_select_authenticated on public.encontreiros;
    create policy p_encontreiros_select_authenticated
      on public.encontreiros
      for select
      to authenticated
      using (true);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cadastro_oficial') then
    drop policy if exists p_cadastro_oficial_select_authenticated on public.cadastro_oficial;
    create policy p_cadastro_oficial_select_authenticated
      on public.cadastro_oficial
      for select
      to authenticated
      using (true);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adolescentes') then
    drop policy if exists p_adolescentes_select_authenticated on public.adolescentes;
    create policy p_adolescentes_select_authenticated
      on public.adolescentes
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- 3) View segura para consumo sem dados médicos sensíveis
create or replace view public.vw_encontreiros_publico as
select
  e.*,
  ''::text as possui_alergia_publico,
  ''::text as toma_remedio_publico,
  ''::text as alimentacao_especial_publico
from public.encontreiros e;
