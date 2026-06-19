-- US-113 - Sincronismo do calendario via Supabase Cron
-- Variante sem Vault.
--
-- Objetivo:
-- 1. Chamar o endpoint seguro do painel a cada 30 minutos
-- 2. Ler a planilha Google Sheets e refletir inclusoes, edicoes e exclusoes em public.eventos_agenda
--
-- Pre-requisitos no projeto/app:
-- - Endpoint publicado: POST /api/sync/calendar
-- - Variavel EAC_CRON_SYNC_TOKEN configurada no deploy do painel
-- - O endpoint faz a importacao via handleSupabaseAction('IMPORT_CALENDAR_2026_EXTERNOS')
--
-- Pre-requisitos no Supabase:
-- - Extensoes pg_cron e pg_net habilitadas
--
-- Referencias oficiais:
-- - https://supabase.com/docs/guides/functions/schedule-functions
-- - https://supabase.com/docs/guides/database/extensions/pg_cron
-- - https://supabase.com/docs/guides/database/extensions/pg_net
--
-- IMPORTANTE:
-- - Troque os placeholders abaixo antes de executar.
-- - Sem Vault, a URL e o token ficam no corpo da function.
-- - Isso e aceitavel para admins do banco, mas menos seguro do que Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.fn_eac_sync_calendario_cron()
returns void
language plpgsql
security definer
as $$
declare
  v_base_url text := 'https://SEU-PAINEL.vercel.app';
  v_token text := 'TROQUE-PELO-MESMO-TOKEN-DO-APP';
begin
  if coalesce(trim(v_base_url), '') = '' then
    raise exception 'Base URL do painel nao configurada.';
  end if;

  if coalesce(trim(v_token), '') = '' then
    raise exception 'Token do sincronismo nao configurado.';
  end if;

  perform net.http_post(
    url := rtrim(v_base_url, '/') || '/api/sync/calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'trigger', 'supabase-cron',
      'timestamp', now()
    )
  );
end;
$$;

select cron.unschedule('eac-calendar-sync-every-30-min')
where exists (
  select 1
  from cron.job
  where jobname = 'eac-calendar-sync-every-30-min'
);

select cron.schedule(
  'eac-calendar-sync-every-30-min',
  '*/30 * * * *',
  $$select public.fn_eac_sync_calendario_cron();$$
);

-- Validacao:
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname = 'eac-calendar-sync-every-30-min';
