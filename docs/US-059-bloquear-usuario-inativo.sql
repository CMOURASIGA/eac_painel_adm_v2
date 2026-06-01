-- US-059 - Bloquear usuário inativo
-- Objetivo: garantir status operacional na base para bloquear autenticação de usuários inativos.

do $$
begin
  -- Tenta normalizar tabelas de usuários comuns no projeto.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuarios') then
    alter table public.usuarios
      add column if not exists status text not null default 'Ativo';

    alter table public.usuarios
      drop constraint if exists chk_usuarios_status;

    alter table public.usuarios
      add constraint chk_usuarios_status
      check (status in ('Ativo', 'Inativo'));

    create index if not exists idx_usuarios_status on public.usuarios(status);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuario') then
    alter table public.usuario
      add column if not exists status text not null default 'Ativo';

    alter table public.usuario
      drop constraint if exists chk_usuario_status;

    alter table public.usuario
      add constraint chk_usuario_status
      check (status in ('Ativo', 'Inativo'));

    create index if not exists idx_usuario_status on public.usuario(status);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    alter table public.users
      add column if not exists status text not null default 'Ativo';

    alter table public.users
      drop constraint if exists chk_users_status;

    alter table public.users
      add constraint chk_users_status
      check (status in ('Ativo', 'Inativo'));

    create index if not exists idx_users_status on public.users(status);
  end if;
  -- Marca usuários sem status como ativos por compatibilidade.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuarios') then
    update public.usuarios set status = 'Ativo' where status is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuario') then
    update public.usuario set status = 'Ativo' where status is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    update public.users set status = 'Ativo' where status is null;
  end if;
end $$;
