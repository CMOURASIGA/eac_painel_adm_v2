-- PRESENCA V2 | LIMPEZA DE DADOS DE HOMOLOGACAO
-- Remove apenas dados operacionais criados pelo fluxo Presence V2.
-- Preserva pessoas, adolescentes, encontreiros, circulos historicos e grupos responsaveis.
-- Execute somente após confirmar que os registros atuais de presenca_sessoes sao de homologacao.

BEGIN;

-- Pendencias podem referenciar presencas, por isso sao removidas primeiro.
DELETE FROM public.presenca_pendencias
WHERE sessao_id IS NOT NULL;

-- Eventos pertencem exclusivamente ao ciclo das reunioes Presence V2.
DELETE FROM public.presenca_sessao_eventos
WHERE sessao_id IS NOT NULL;

-- Remove apenas presencas vinculadas a reunioes Presence V2.
-- Presencas legadas com sessao_id NULL permanecem intactas.
DELETE FROM public.presencas
WHERE sessao_id IS NOT NULL;

-- Remove as reunioes criadas durante a homologacao.
DELETE FROM public.presenca_sessoes;

COMMIT;

-- Conferencia esperada apos a limpeza:
SELECT 'presenca_sessoes' AS tabela, count(*) AS registros FROM public.presenca_sessoes
UNION ALL
SELECT 'presenca_sessao_eventos', count(*) FROM public.presenca_sessao_eventos WHERE sessao_id IS NOT NULL
UNION ALL
SELECT 'presenca_pendencias', count(*) FROM public.presenca_pendencias WHERE sessao_id IS NOT NULL
UNION ALL
SELECT 'presencas_v2', count(*) FROM public.presencas WHERE sessao_id IS NOT NULL;
