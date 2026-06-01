-- US-018.4 — Controle de origem dos dados (PLANILHA vs SISTEMA)
-- Data: 2026-04-30
--
-- Aplique este SQL no Supabase/Postgres (ajuste nomes se necessário).
-- Objetivo: garantir rastreabilidade de origem e proteger registros criados pelo sistema.

-- =========================
-- 1) Tipo/check constraint
-- =========================

-- Sem criar TYPE dedicado (para reduzir impacto), usamos CHECK constraint.
-- Domínio: PLANILHA | SISTEMA.

-- =========================
-- 2) Colunas padrão
-- =========================

-- Lista recomendada de tabelas "operacionais" (ajuste conforme seu modelo):
-- - cadastro_oficial / pessoas / adolescentes
-- - nao_inscritos
-- - inscricoes_prioritarias / inscricoes
-- - encontreiros
-- - presencas
-- - comunicados
-- - eventos_agenda
-- - usuarios

do $$
declare
  t text;
  targets text[] := array[
    'cadastro_oficial',
    'pessoas',
    'adolescentes',
    'nao_inscritos',
    'inscricoes',
    'inscricoes_prioritarias',
    'encontreiros',
    'presencas',
    'comunicados',
    'eventos_agenda',
    'usuarios'
  ];
begin
  foreach t in array targets loop
    execute format('alter table if exists public.%I add column if not exists origem_dado text;', t);
    execute format('alter table if exists public.%I add column if not exists data_importacao timestamptz;', t);
    execute format('alter table if exists public.%I add column if not exists id_origem_planilha text;', t);
    execute format('alter table if exists public.%I add column if not exists ultima_sincronizacao timestamptz;', t);
    execute format('alter table if exists public.%I add column if not exists criado_via_sistema boolean;', t);

    -- Defaults sugeridos:
    -- - inserts da aplicaÃ§Ã£o: origem_dado='SISTEMA'
    -- - imports: devem setar explicitamente 'PLANILHA'
    execute format('alter table if exists public.%I alter column origem_dado set default ''SISTEMA'';', t);
    execute format('alter table if exists public.%I alter column criado_via_sistema set default true;', t);

    -- CHECK constraint (idempotente via nome fixo)
    execute format($sql$
      do $inner$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = %L
        ) then
          alter table public.%I
            add constraint %I
            check (origem_dado in ('PLANILHA','SISTEMA'));
        end if;
      end
      $inner$;
    $sql$, 'ck_' || t || '_origem_dado', t, 'ck_' || t || '_origem_dado');
  end loop;
end $$;

-- =========================
-- 3) Trigger para consistÃªncia
-- =========================

create or replace function public.fn_set_origem_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.origem_dado is null or btrim(new.origem_dado) = '' then
    new.origem_dado := 'SISTEMA';
  end if;

  if new.criado_via_sistema is null then
    new.criado_via_sistema := (upper(new.origem_dado) = 'SISTEMA');
  end if;

  -- Se veio de planilha e data_importacao nÃ£o foi informada, define agora
  if upper(new.origem_dado) = 'PLANILHA' and new.data_importacao is null then
    new.data_importacao := now();
  end if;

  -- Toda alteraÃ§Ã£o via sync/import deve atualizar ultima_sincronizacao explicitamente,
  -- mas se estiver vazio e origem = PLANILHA, preenche.
  if upper(new.origem_dado) = 'PLANILHA' and new.ultima_sincronizacao is null then
    new.ultima_sincronizacao := now();
  end if;

  return new;
end $$;

-- Aplica trigger em todas as tabelas alvo (se existirem)
do $$
declare
  t text;
  targets text[] := array[
    'cadastro_oficial',
    'pessoas',
    'adolescentes',
    'nao_inscritos',
    'inscricoes',
    'inscricoes_prioritarias',
    'encontreiros',
    'presencas',
    'comunicados',
    'eventos_agenda',
    'usuarios'
  ];
  trig text;
begin
  foreach t in array targets loop
    trig := 'tr_' || t || '_set_origem_defaults';
    execute format('drop trigger if exists %I on public.%I;', trig, t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fn_set_origem_defaults();', trig, t);
  end loop;
end $$;

-- =========================
-- 4) Regra anti-sobrescrita
-- =========================

-- PARA IMPORTAÃ‡ÃƒO (exemplo de padrÃ£o):
-- Ao fazer UPSERT, atualize somente se o registro destino for PLANILHA.
--
-- Exemplo (ajuste chave natural):
-- insert into public.cadastro_oficial (email, nome, origem_dado, data_importacao, ultima_sincronizacao, ...)
-- values (...)
-- on conflict (email) do update
--   set nome = excluded.nome,
--       origem_dado = 'PLANILHA',
--       ultima_sincronizacao = now()
-- where public.cadastro_oficial.origem_dado = 'PLANILHA';
--
-- Assim, registros criados pelo sistema (origem_dado='SISTEMA') nÃ£o serÃ£o sobrescritos pelo import.

