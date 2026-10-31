-- EAC | Modalidade da etapa de termos do formulario publico de encontristas
-- Aplicar em homologacao antes de testar a funcionalidade em develop.
-- Default protege o fluxo anterior; nunca altera inscricoes existentes.
BEGIN;

ALTER TABLE public.configuracoes_formularios
  ADD COLUMN IF NOT EXISTS inscricao_exigir_termos boolean NOT NULL DEFAULT true;

UPDATE public.configuracoes_formularios
   SET inscricao_exigir_termos = true
 WHERE inscricao_exigir_termos IS NULL;

ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS inscricao_modalidade text NOT NULL DEFAULT 'COM_TERMOS';

ALTER TABLE public.inscricoes
  DROP CONSTRAINT IF EXISTS inscricoes_inscricao_modalidade_check;

ALTER TABLE public.inscricoes
  ADD CONSTRAINT inscricoes_inscricao_modalidade_check
  CHECK (inscricao_modalidade IN ('COM_TERMOS', 'SEM_ETAPA_TERMOS'));

COMMENT ON COLUMN public.configuracoes_formularios.inscricao_exigir_termos
  IS 'Controle administrativo da etapa posterior de termos no cadastro de encontristas.';
COMMENT ON COLUMN public.inscricoes.inscricao_modalidade
  IS 'Modalidade no momento da inscricao. Nao representa consentimento do responsavel.';

COMMIT;
