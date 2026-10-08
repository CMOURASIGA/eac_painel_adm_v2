-- US-122 - Confirmação do responsável e termos versionados da inscrição
-- Objetivo: a inscrição só passa a INSCRITO após confirmação do responsável por e-mail.

alter table public.inscricoes
  add column if not exists confirmacao_responsavel_token_hash text,
  add column if not exists confirmacao_responsavel_expira_em timestamptz,
  add column if not exists confirmacao_responsavel_enviada_em timestamptz,
  add column if not exists confirmacao_responsavel_confirmada_em timestamptz,
  add column if not exists termos_versao_snapshot text,
  add column if not exists termos_snapshot jsonb,
  add column if not exists termos_respostas jsonb;

create unique index if not exists ux_inscricoes_confirmacao_responsavel_token_hash
  on public.inscricoes(confirmacao_responsavel_token_hash)
  where confirmacao_responsavel_token_hash is not null;

-- Ajusta somente os CHECKs da tabela inscricoes que restringem a coluna status.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.inscricoes drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.inscricoes
  add constraint chk_inscricoes_status
  check (
    status in (
      'AGUARDANDO_RESPONSAVEL',
      'INSCRITO',
      'EM_ANALISE',
      'PRIORIZADO',
      'FILA',
      'CONFIRMADO',
      'NAO_SELECIONADO',
      'DESISTENTE',
      'CANCELADO'
    )
  );

comment on column public.inscricoes.confirmacao_responsavel_token_hash is
  'SHA-256 do token público enviado ao responsável. O token em claro nunca é persistido.';
comment on column public.inscricoes.termos_snapshot is
  'Snapshot integral dos termos exibidos ao responsável no momento da solicitação.';
comment on column public.inscricoes.termos_respostas is
  'Evidência da confirmação: respostas, responsável, versão e timestamp.';

-- Histórico administrativo: permite registrar AGUARDANDO_RESPONSAVEL caso uma futura rotina precise.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.inscricoes_status_historico'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.inscricoes_status_historico drop constraint if exists %I', r.conname);
  end loop;
exception
  when undefined_table then
    null;
end $$;

do $$
begin
  if to_regclass('public.inscricoes_status_historico') is not null then
    alter table public.inscricoes_status_historico
      add constraint chk_inscricoes_status_historico_status_novo
      check (
        status_novo in (
          'AGUARDANDO_RESPONSAVEL',
          'INSCRITO',
          'EM_ANALISE',
          'PRIORIZADO',
          'FILA',
          'CONFIRMADO',
          'NAO_SELECIONADO',
          'DESISTENTE',
          'CANCELADO'
        )
      );

    alter table public.inscricoes_status_historico
      add constraint chk_inscricoes_status_historico_status_anterior
      check (
        status_anterior is null
        or status_anterior in (
          'AGUARDANDO_RESPONSAVEL',
          'INSCRITO',
          'EM_ANALISE',
          'PRIORIZADO',
          'FILA',
          'CONFIRMADO',
          'NAO_SELECIONADO',
          'DESISTENTE',
          'CANCELADO'
        )
      );
  end if;
end $$;
