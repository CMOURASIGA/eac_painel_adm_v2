-- US-023 - Alterar status da inscrição

create table if not exists public.inscricoes_status_historico (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references public.inscricoes(id),
  status_anterior text,
  status_novo text not null,
  justificativa text,
  alterado_por text,
  alterado_por_nome text,
  origem_acao text not null default 'ADMIN',
  criado_em timestamptz not null default now(),
  constraint chk_inscricoes_status_historico_status_novo
    check (
      status_novo in (
        'INSCRITO',
        'EM_ANALISE',
        'PRIORIZADO',
        'FILA',
        'CONFIRMADO',
        'NAO_SELECIONADO',
        'DESISTENTE',
        'CANCELADO'
      )
    ),
  constraint chk_inscricoes_status_historico_status_anterior
    check (
      status_anterior is null
      or status_anterior in (
        'INSCRITO',
        'EM_ANALISE',
        'PRIORIZADO',
        'FILA',
        'CONFIRMADO',
        'NAO_SELECIONADO',
        'DESISTENTE',
        'CANCELADO'
      )
    )
);

alter table public.inscricoes
  add column if not exists status_alterado_em timestamptz,
  add column if not exists status_alterado_por text,
  add column if not exists status_alterado_por_nome text;

create or replace function public.fn_alterar_status_inscricao(
  p_inscricao_id uuid,
  p_status_novo text,
  p_justificativa text,
  p_alterado_por text,
  p_alterado_por_nome text
)
returns table (
  inscricao_id uuid,
  status_anterior text,
  status_novo text,
  historico_id uuid,
  status_alterado_em timestamptz
)
language plpgsql
security definer
as $$
declare
  v_status_anterior text;
  v_historico_id uuid;
  v_agora timestamptz := now();
begin
  select status
    into v_status_anterior
  from public.inscricoes
  where id = p_inscricao_id
  for update;

  if v_status_anterior is null then
    raise exception 'INSCRICAO_NAO_ENCONTRADA';
  end if;

  if p_status_novo not in (
    'INSCRITO',
    'EM_ANALISE',
    'PRIORIZADO',
    'FILA',
    'CONFIRMADO',
    'NAO_SELECIONADO',
    'DESISTENTE',
    'CANCELADO'
  ) then
    raise exception 'STATUS_INVALIDO';
  end if;

  if p_status_novo = v_status_anterior then
    raise exception 'STATUS_SEM_ALTERACAO';
  end if;

  if p_status_novo in ('NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO')
     and (p_justificativa is null or length(trim(p_justificativa)) = 0) then
    raise exception 'JUSTIFICATIVA_OBRIGATORIA';
  end if;

  update public.inscricoes
  set
    status = p_status_novo,
    motivo_status = nullif(trim(coalesce(p_justificativa, '')), ''),
    status_alterado_em = v_agora,
    status_alterado_por = p_alterado_por,
    status_alterado_por_nome = p_alterado_por_nome,
    atualizado_em = v_agora
  where id = p_inscricao_id;

  insert into public.inscricoes_status_historico (
    inscricao_id,
    status_anterior,
    status_novo,
    justificativa,
    alterado_por,
    alterado_por_nome,
    origem_acao,
    criado_em
  )
  values (
    p_inscricao_id,
    v_status_anterior,
    p_status_novo,
    nullif(trim(coalesce(p_justificativa, '')), ''),
    p_alterado_por,
    p_alterado_por_nome,
    'ADMIN',
    v_agora
  )
  returning id into v_historico_id;

  return query
  select p_inscricao_id, v_status_anterior, p_status_novo, v_historico_id, v_agora;
end;
$$;

grant execute on function public.fn_alterar_status_inscricao(uuid, text, text, text, text) to service_role;