-- US-114 - Monitoramento agendado de novas inscricoes
--
-- Objetivo
-- 1. Verificar a cada 30 minutos se houve novas inscricoes na base
-- 2. Consolidar o resultado por idade e sexo
-- 3. Registrar cada varredura em tabela de auditoria
-- 4. Registrar notificacao somente quando houver novas entradas
--
-- Abordagem
-- - Nao usar trigger para agendamento. Trigger nao executa por tempo.
-- - Usar pg_cron para rodar uma function periodicamente.
-- - A function le a ultima execucao bem-sucedida, consulta novas inscricoes
--   desde esse marco e grava o resumo encontrado.
--
-- Pre-requisitos
-- - Extensao pg_cron habilitada
-- - Tabelas operacionais no modelo atual:
--   public.inscricoes -> public.adolescentes -> public.pessoas
--
-- Observacao
-- - A function tenta escolher automaticamente a melhor coluna de tempo
--   em public.inscricoes, na ordem:
--   1) criado_em
--   2) created_at
--   3) data_inscricao
-- - Para detectar "entrada nova", priorize colunas de criacao real.

begin;

create extension if not exists pg_cron;

create table if not exists public.inscricoes_monitor_execucoes (
  id bigserial primary key,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  ultimo_check timestamptz,
  referencia_ate timestamptz,
  coluna_tempo_usada text,
  total_novas_inscricoes integer not null default 0,
  houve_novas_inscricoes boolean not null default false,
  resumo_por_idade_sexo jsonb not null default '[]'::jsonb,
  status_execucao text not null default 'EM_ANDAMENTO',
  erro text
);

create table if not exists public.inscricoes_monitor_notificacoes (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  execucao_id bigint not null references public.inscricoes_monitor_execucoes(id) on delete cascade,
  total_novas_inscricoes integer not null,
  referencia_de timestamptz,
  referencia_ate timestamptz,
  resumo_por_idade_sexo jsonb not null default '[]'::jsonb,
  enviada boolean not null default false,
  enviada_em timestamptz,
  canal text,
  observacao text
);

create index if not exists ix_inscricoes_monitor_execucoes_status
  on public.inscricoes_monitor_execucoes(status_execucao, finalizado_em desc);

create index if not exists ix_inscricoes_monitor_notificacoes_enviada
  on public.inscricoes_monitor_notificacoes(enviada, criado_em desc);

create or replace function public.fn_inscricoes_monitor_detectar_coluna_tempo()
returns text
language plpgsql
as $$
declare
  v_coluna text;
begin
  select c.column_name
    into v_coluna
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'inscricoes'
     and c.column_name in ('criado_em', 'created_at', 'data_inscricao')
   order by case c.column_name
     when 'criado_em' then 1
     when 'created_at' then 2
     when 'data_inscricao' then 3
     else 99
   end
   limit 1;

  if v_coluna is null then
    raise exception 'Nenhuma coluna de tempo encontrada em public.inscricoes. Esperado: criado_em, created_at ou data_inscricao.';
  end if;

  return v_coluna;
end;
$$;

create or replace function public.fn_inscricoes_monitor_novas(
  p_ultimo_check timestamptz default null,
  p_referencia_ate timestamptz default now()
)
returns table (
  idade integer,
  sexo text,
  quantidade integer
)
language plpgsql
as $$
declare
  v_coluna_tempo text;
  v_sql text;
begin
  v_coluna_tempo := public.fn_inscricoes_monitor_detectar_coluna_tempo();

  v_sql := format($f$
    select
      p.idade_calculada::integer as idade,
      coalesce(nullif(trim(p.sexo), ''), 'Nao informado') as sexo,
      count(*)::integer as quantidade
    from public.inscricoes i
    join public.adolescentes a
      on a.id = i.adolescente_id
    join public.pessoas p
      on p.id = a.pessoa_id
    where (%1$s is null or i.%2$I > %1$s)
      and i.%2$I <= %3$L::timestamptz
    group by p.idade_calculada, coalesce(nullif(trim(p.sexo), ''), 'Nao informado')
    order by p.idade_calculada nulls last, sexo
  $f$,
    case
      when p_ultimo_check is null then 'null'
      else quote_literal(p_ultimo_check::text) || '::timestamptz'
    end,
    v_coluna_tempo,
    p_referencia_ate::text
  );

  return query execute v_sql;
end;
$$;

create or replace function public.fn_inscricoes_monitor_varrer()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_execucao_id bigint;
  v_ultimo_check timestamptz;
  v_referencia_ate timestamptz := now();
  v_coluna_tempo text;
  v_total integer := 0;
  v_resumo jsonb := '[]'::jsonb;
begin
  insert into public.inscricoes_monitor_execucoes (
    iniciado_em,
    referencia_ate,
    status_execucao
  )
  values (
    now(),
    v_referencia_ate,
    'EM_ANDAMENTO'
  )
  returning id into v_execucao_id;

  select e.referencia_ate
    into v_ultimo_check
    from public.inscricoes_monitor_execucoes e
   where e.status_execucao = 'SUCESSO'
   order by e.finalizado_em desc nulls last, e.id desc
   limit 1;

  v_coluna_tempo := public.fn_inscricoes_monitor_detectar_coluna_tempo();

  with resumo as (
    select idade, sexo, quantidade
      from public.fn_inscricoes_monitor_novas(v_ultimo_check, v_referencia_ate)
  )
  select
    coalesce(sum(quantidade), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'idade', idade,
          'sexo', sexo,
          'quantidade', quantidade
        )
        order by idade nulls last, sexo
      ),
      '[]'::jsonb
    )
  into v_total, v_resumo
  from resumo;

  update public.inscricoes_monitor_execucoes
     set finalizado_em = now(),
         ultimo_check = v_ultimo_check,
         referencia_ate = v_referencia_ate,
         coluna_tempo_usada = v_coluna_tempo,
         total_novas_inscricoes = v_total,
         houve_novas_inscricoes = (v_total > 0),
         resumo_por_idade_sexo = v_resumo,
         status_execucao = 'SUCESSO'
   where id = v_execucao_id;

  if v_total > 0 then
    insert into public.inscricoes_monitor_notificacoes (
      execucao_id,
      total_novas_inscricoes,
      referencia_de,
      referencia_ate,
      resumo_por_idade_sexo
    )
    values (
      v_execucao_id,
      v_total,
      v_ultimo_check,
      v_referencia_ate,
      v_resumo
    );
  end if;

  return jsonb_build_object(
    'execucao_id', v_execucao_id,
    'ultimo_check', v_ultimo_check,
    'referencia_ate', v_referencia_ate,
    'coluna_tempo_usada', v_coluna_tempo,
    'houve_novas_inscricoes', v_total > 0,
    'total_novas_inscricoes', v_total,
    'resumo_por_idade_sexo', v_resumo
  );

exception
  when others then
    update public.inscricoes_monitor_execucoes
       set finalizado_em = now(),
           ultimo_check = v_ultimo_check,
           referencia_ate = v_referencia_ate,
           coluna_tempo_usada = v_coluna_tempo,
           status_execucao = 'ERRO',
           erro = sqlerrm
     where id = v_execucao_id;

    raise;
end;
$$;

select cron.unschedule('eac-monitor-inscricoes-30-min')
where exists (
  select 1
    from cron.job
   where jobname = 'eac-monitor-inscricoes-30-min'
);

select cron.schedule(
  'eac-monitor-inscricoes-30-min',
  '*/30 * * * *',
  $$select public.fn_inscricoes_monitor_varrer();$$
);

commit;

-- Testes manuais
-- 1) Rodar a function na mao:
--    select public.fn_inscricoes_monitor_varrer();
--
-- 2) Ver historico das varreduras:
--    select *
--      from public.inscricoes_monitor_execucoes
--     order by id desc;
--
-- 3) Ver notificacoes pendentes:
--    select *
--      from public.inscricoes_monitor_notificacoes
--     where enviada = false
--     order by id desc;
--
-- 4) Ver somente o resumo da ultima notificacao:
--    select
--      n.id,
--      n.criado_em,
--      n.total_novas_inscricoes,
--      n.referencia_de,
--      n.referencia_ate,
--      n.resumo_por_idade_sexo
--    from public.inscricoes_monitor_notificacoes n
--    order by n.id desc
--    limit 1;
