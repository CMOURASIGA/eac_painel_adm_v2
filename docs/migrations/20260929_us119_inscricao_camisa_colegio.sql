-- US-119 | Formulário de inscrição: tamanho de camisa e colégio
-- Fonte esperada da carga: INEP / Censo Escolar, escolas ativas de Niterói/RJ.
-- Script idempotente para manter a modelagem versionada.

create extension if not exists pgcrypto;

create table if not exists public.escolas (
  id uuid primary key default gen_random_uuid(),
  codigo_inep text,
  nome text not null,
  rede text not null check (rede in ('MUNICIPAL', 'ESTADUAL', 'FEDERAL', 'PRIVADA')),
  bairro text,
  municipio text not null default 'Niterói',
  uf char(2) not null default 'RJ' check (uf = 'RJ'),
  ativo boolean not null default true,
  fonte text not null default 'INEP/Censo Escolar',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.inscricoes
  add column if not exists tamanho_camisa text,
  add column if not exists escola_id uuid,
  add column if not exists escola_nome_outro text;

create unique index if not exists ux_escolas_codigo_inep
  on public.escolas (codigo_inep)
  where codigo_inep is not null;

create index if not exists ix_escolas_busca_niteroi
  on public.escolas (nome)
  where ativo = true and municipio = 'Niterói' and uf = 'RJ';

create index if not exists ix_inscricoes_escola_id
  on public.inscricoes (escola_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_inscricoes_tamanho_camisa') then
    alter table public.inscricoes
      add constraint ck_inscricoes_tamanho_camisa
      check (tamanho_camisa is null or tamanho_camisa in ('PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_inscricoes_escola') then
    alter table public.inscricoes
      add constraint ck_inscricoes_escola
      check (
        (escola_id is null and escola_nome_outro is null)
        or (escola_id is not null and escola_nome_outro is null)
        or (escola_id is null and nullif(btrim(escola_nome_outro), '') is not null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_inscricoes_escola') then
    alter table public.inscricoes
      add constraint fk_inscricoes_escola
      foreign key (escola_id) references public.escolas(id) on delete restrict;
  end if;
end $$;

alter table public.escolas enable row level security;
grant select on public.escolas to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'escolas' and policyname = 'Leitura pública das escolas ativas de Niterói'
  ) then
    create policy "Leitura pública das escolas ativas de Niterói"
      on public.escolas for select
      to anon, authenticated
      using (ativo = true and municipio = 'Niterói' and uf = 'RJ');
  end if;
end $$;
