-- US-018.5 — Regra de conflito (Planilha vs Supabase)
-- Data: 2026-04-30
--
-- Objetivo:
-- - Sync de planilha atualiza APENAS campos cadastrais
-- - Campos operacionais não podem ser sobrescritos pela planilha
-- - Divergência operacional gera log
--
-- Observação:
-- Este SQL é um TEMPLATE. Ajuste nomes de tabelas/colunas e chaves naturais.

-- =========================
-- 1) Tabela de conflitos
-- =========================

create table if not exists public.sync_conflitos (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  entidade text not null,
  chave jsonb not null,
  campo text not null,
  valor_supabase text,
  valor_planilha text,
  motivo text,
  sync_run_id text
);

create index if not exists idx_sync_conflitos_entidade_created_at
  on public.sync_conflitos (entidade, created_at desc);

-- =========================
-- 2) Função utilitária de log
-- =========================

create or replace function public.fn_log_sync_conflito(
  p_entidade text,
  p_chave jsonb,
  p_campo text,
  p_valor_supabase text,
  p_valor_planilha text,
  p_motivo text default null,
  p_sync_run_id text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.sync_conflitos (entidade, chave, campo, valor_supabase, valor_planilha, motivo, sync_run_id)
  values (p_entidade, p_chave, p_campo, p_valor_supabase, p_valor_planilha, p_motivo, p_sync_run_id);
end $$;

-- =========================
-- 3) Padrão recomendado: Sync via função (não via upsert direto)
-- =========================
--
-- Por que:
-- - Em um UPSERT simples não é trivial logar divergências por campo
-- - A função permite:
--   - ler o registro atual
--   - comparar operacional vs planilha
--   - atualizar apenas whitelist cadastral
--   - registrar conflitos
--
-- Abaixo um EXEMPLO para "nao_inscritos" usando chave natural (telefone normalizado).
-- Ajuste conforme seu modelo (pessoas/inscricoes/etc.).

create or replace function public.fn_sync_nao_inscritos_from_sheet(
  p_sync_run_id text,
  p_telefone text,
  p_nome text,
  p_email text,
  p_bairro text,
  p_data_nascimento date,
  -- exemplos operacionais (NÃO atualizar por planilha):
  p_status_inscricao text,
  p_prioridade int,
  p_fila boolean,
  p_confirmado boolean,
  p_id_origem_planilha text default null
)
returns void
language plpgsql
as $$
declare
  v_row public.nao_inscritos%rowtype;
  v_exists boolean;
begin
  select * into v_row
  from public.nao_inscritos
  where regexp_replace(coalesce(telefone,''), '\D', '', 'g') = regexp_replace(coalesce(p_telefone,''), '\D', '', 'g')
  limit 1;

  v_exists := found;

  if not v_exists then
    insert into public.nao_inscritos (
      telefone, nome, email, bairro, data_nascimento,
      origem_dado, criado_via_sistema, data_importacao, ultima_sincronizacao, id_origem_planilha
    ) values (
      p_telefone, p_nome, p_email, p_bairro, p_data_nascimento,
      'PLANILHA', false, now(), now(), p_id_origem_planilha
    );
    return;
  end if;

  -- 1) Conflitos operacionais: registrar e NÃO atualizar
  if v_row.status_inscricao is distinct from p_status_inscricao and p_status_inscricao is not null then
    perform public.fn_log_sync_conflito(
      'nao_inscritos',
      jsonb_build_object('telefone', p_telefone),
      'status_inscricao',
      v_row.status_inscricao::text,
      p_status_inscricao::text,
      'Campo operacional protegido (Supabase tem prioridade)',
      p_sync_run_id
    );
  end if;

  if v_row.prioridade is distinct from p_prioridade and p_prioridade is not null then
    perform public.fn_log_sync_conflito(
      'nao_inscritos',
      jsonb_build_object('telefone', p_telefone),
      'prioridade',
      v_row.prioridade::text,
      p_prioridade::text,
      'Campo operacional protegido (Supabase tem prioridade)',
      p_sync_run_id
    );
  end if;

  if v_row.fila is distinct from p_fila and p_fila is not null then
    perform public.fn_log_sync_conflito(
      'nao_inscritos',
      jsonb_build_object('telefone', p_telefone),
      'fila',
      v_row.fila::text,
      p_fila::text,
      'Campo operacional protegido (Supabase tem prioridade)',
      p_sync_run_id
    );
  end if;

  if v_row.confirmado is distinct from p_confirmado and p_confirmado is not null then
    perform public.fn_log_sync_conflito(
      'nao_inscritos',
      jsonb_build_object('telefone', p_telefone),
      'confirmado',
      v_row.confirmado::text,
      p_confirmado::text,
      'Campo operacional protegido (Supabase tem prioridade)',
      p_sync_run_id
    );
  end if;

  -- 2) Atualização CADASTRAL:
  -- - Registros PLANILHA: pode atualizar livremente campos cadastrais
  -- - Registros SISTEMA: somente "fill only" (não sobrescreve valores já preenchidos)
  if upper(coalesce(v_row.origem_dado,'')) = 'SISTEMA' then
    update public.nao_inscritos
      set
        nome = coalesce(nullif(v_row.nome,''), p_nome, v_row.nome),
        email = coalesce(nullif(v_row.email,''), p_email, v_row.email),
        bairro = coalesce(nullif(v_row.bairro,''), p_bairro, v_row.bairro),
        data_nascimento = coalesce(v_row.data_nascimento, p_data_nascimento),
        ultima_sincronizacao = now(),
        id_origem_planilha = coalesce(v_row.id_origem_planilha, p_id_origem_planilha)
    where id = v_row.id;
  else
    update public.nao_inscritos
      set
        nome = coalesce(p_nome, v_row.nome),
        email = coalesce(p_email, v_row.email),
        bairro = coalesce(p_bairro, v_row.bairro),
        data_nascimento = coalesce(p_data_nascimento, v_row.data_nascimento),
        ultima_sincronizacao = now(),
        origem_dado = 'PLANILHA',
        criado_via_sistema = false,
        id_origem_planilha = coalesce(p_id_origem_planilha, v_row.id_origem_planilha)
    where id = v_row.id;
  end if;
end $$;

-- =========================
-- 4) Recomendação: view para auditoria rápida
-- =========================

create or replace view public.vw_sync_conflitos_ultimos_7_dias as
select *
from public.sync_conflitos
where created_at >= now() - interval '7 days'
order by created_at desc;

