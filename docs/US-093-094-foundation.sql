-- US-093/094 - Auth + tokens seguros para formulario publico
begin;

-- US-093: perfil de app ligado ao auth.users
create table if not exists public.app_user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  pessoa_id uuid null references public.pessoas(id) on delete set null,
  email text not null,
  nome text not null,
  role text not null default 'VIEWER',
  status text not null default 'ATIVO',
  allowed_modules text[] not null default array['dashboard']::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_app_user_profiles_status
  on public.app_user_profiles (status);

-- US-094: token seguro de interesse publico (uso unico)
create table if not exists public.public_interest_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  pessoa_id uuid null references public.pessoas(id) on delete set null,
  inscricao_id uuid null references public.inscricoes(id) on delete set null,
  origem text not null default 'SISTEMA',
  expires_at timestamptz not null,
  used_at timestamptz null,
  revoked_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists ix_public_interest_tokens_email
  on public.public_interest_tokens (email, created_at desc);

create index if not exists ix_public_interest_tokens_expires
  on public.public_interest_tokens (expires_at);

create unique index if not exists ux_public_interest_tokens_active_email
  on public.public_interest_tokens (email)
  where used_at is null and revoked_at is null;

-- auditoria de uso do token
create table if not exists public.public_interest_token_audit (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.public_interest_tokens(id) on delete cascade,
  event text not null,
  ip text null,
  user_agent text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_public_interest_token_audit_token
  on public.public_interest_token_audit (token_id, created_at desc);

commit;
