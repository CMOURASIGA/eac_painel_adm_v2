-- US-095 - Seed inicial de perfis/permissoes para app_user_profiles
-- Idempotente para validacao local:
-- 1) tenta mapear pelos e-mails configurados abaixo;
-- 2) se nao encontrar, usa automaticamente os primeiros usuarios de auth.users.

begin;

do $$
declare
  v_total_auth_users int;
begin
  select count(*) into v_total_auth_users from auth.users;
  if v_total_auth_users = 0 then
    raise exception 'US-095: auth.users vazio. Crie usuarios no Supabase Auth antes do seed.';
  end if;
end $$;

with desired_roles as (
  select *
  from (
    values
      (1, 'ADMIN'::text, 'admin@eac.local'::text),
      (2, 'COORD'::text, 'coord@eac.local'::text),
      (3, 'OPERADOR'::text, 'operador@eac.local'::text)
  ) as t(priority, role, target_email)
),
preferred_users as (
  select
    d.priority,
    d.role,
    u.id as auth_user_id,
    lower(u.email) as email,
    coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as nome
  from desired_roles d
  join auth.users u
    on lower(u.email) = lower(d.target_email)
),
fallback_users as (
  select
    d.priority,
    d.role,
    u.id as auth_user_id,
    lower(u.email) as email,
    coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as nome
  from desired_roles d
  join lateral (
    select u1.*
    from auth.users u1
    where not exists (
      select 1 from preferred_users pu where pu.auth_user_id = u1.id
    )
    order by u1.created_at asc
    offset (d.priority - 1)
    limit 1
  ) u on true
  where not exists (
    select 1 from preferred_users pu where pu.priority = d.priority
  )
),
target_users as (
  select * from preferred_users
  union all
  select * from fallback_users
)
insert into public.app_user_profiles (
  auth_user_id,
  pessoa_id,
  email,
  nome,
  role,
  status,
  allowed_modules,
  metadata
)
select
  t.auth_user_id,
  null,
  t.email,
  t.nome,
  t.role,
  'ATIVO',
  case t.role
    when 'ADMIN' then array[
      'dashboard','dispatches','calendar','comunicados','logs','users','settings','help',
      'members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','encontreiros',
      'presence','inscricoes_review'
    ]::text[]
    when 'COORD' then array[
      'dashboard','calendar','comunicados','help','members','inscricoes_prioritarias',
      'inscricoes_prioritarias_circulos','encontreiros','presence','inscricoes_review',
      'dispatches','logs'
    ]::text[]
    else array[
      'dashboard','calendar','comunicados','help','members','inscricoes_prioritarias',
      'inscricoes_prioritarias_circulos','encontreiros','presence','inscricoes_review'
    ]::text[]
  end as allowed_modules,
  case t.role
    when 'ADMIN' then jsonb_build_object(
      'canCreate', true, 'canEdit', true, 'canDelete', true,
      'encontreiros', jsonb_build_object(
        'canCreate', true, 'canEdit', true, 'canDelete', true, 'canViewSensitive', true
      )
    )
    when 'COORD' then jsonb_build_object(
      'canCreate', true, 'canEdit', true, 'canDelete', true,
      'encontreiros', jsonb_build_object(
        'canCreate', true, 'canEdit', true, 'canDelete', false, 'canViewSensitive', true
      )
    )
    else jsonb_build_object(
      'canCreate', true, 'canEdit', true, 'canDelete', false,
      'encontreiros', jsonb_build_object(
        'canCreate', true, 'canEdit', true, 'canDelete', false, 'canViewSensitive', false
      )
    )
  end as metadata
from target_users t
where not exists (
  select 1
  from public.app_user_profiles p
  where p.auth_user_id = t.auth_user_id
);

commit;
