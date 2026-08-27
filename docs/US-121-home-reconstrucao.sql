-- US-121 - Reconstrução da Home do Painel Administrativo EAC
-- Execute no SQL Editor do Supabase (projeto de homolog/producao conforme estrategia).
--
-- Objetivo: permitir que o Painel Geral do EAC (nova Home) apresente indicadores de
-- presença separados por tipo de evento (Pós-Encontro x Reunião de Círculo), com
-- ranking de participação e assiduidade por tipo.
--
-- A tela de Controle de Presença já coleta o tipo de evento no check-in
-- (components/PresencePage.tsx -> eventType/tipoEvento), mas essa informação não era
-- persistida em public.presencas. Esta migração adiciona a coluna faltante.

begin;

alter table if exists public.presencas
  add column if not exists tipo_evento text not null default 'POS_ENCONTRO';

alter table if exists public.presencas
  add constraint if not exists presencas_tipo_evento_check
  check (tipo_evento in ('POS_ENCONTRO', 'REUNIAO_CIRCULO'));

create index if not exists ix_presencas_tipo_evento
  on public.presencas (tipo_evento, data_presenca desc);

commit;

-- Observação: registros de presença anteriores a esta migração ficam classificados
-- como 'POS_ENCONTRO' (valor default), por ser o fluxo histórico predominante de
-- check-in no painel. Não há como reclassificar retroativamente sem essa informação
-- na origem dos dados.
