import type { VisitacaoQuestionarioResposta, VisitacaoRespostaOpcao } from '../types.ts';

export const VISITACAO_QUESTIONARIO = [
  {
    key: 'ja_participou_encontro',
    label: 'Já participou de algum encontro?',
  },
  {
    key: 'batizado',
    label: 'É batizado?',
  },
  {
    key: 'crismado',
    label: 'É crismado?',
  },
] as const;

export const VISITACAO_QUESTIONARIO_OPCOES: Array<{ value: VisitacaoRespostaOpcao; label: string }> = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
  { value: 'NAO_INFORMADO', label: 'Não informado' },
];

const DEFAULT_VALUE: VisitacaoRespostaOpcao = 'NAO_INFORMADO';

function normalizeResposta(value: any): VisitacaoRespostaOpcao {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'SIM' || raw === 'NAO' || raw === 'NAO_INFORMADO') return raw;
  return DEFAULT_VALUE;
}

export function createEmptyVisitacaoQuestionario(): VisitacaoQuestionarioResposta {
  return {
    ja_participou_encontro: DEFAULT_VALUE,
    batizado: DEFAULT_VALUE,
    crismado: DEFAULT_VALUE,
  };
}

export function normalizeVisitacaoQuestionario(value: any): VisitacaoQuestionarioResposta {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ja_participou_encontro: normalizeResposta(raw.ja_participou_encontro),
    batizado: normalizeResposta(raw.batizado),
    crismado: normalizeResposta(raw.crismado),
  };
}

export function summarizeVisitacaoQuestionario(value: VisitacaoQuestionarioResposta | null | undefined) {
  const questionario = normalizeVisitacaoQuestionario(value);
  return VISITACAO_QUESTIONARIO.map((item) => {
    const resposta = questionario[item.key as keyof VisitacaoQuestionarioResposta];
    const label = VISITACAO_QUESTIONARIO_OPCOES.find((option) => option.value === resposta)?.label || 'Não informado';
    return `${item.label} ${label}`;
  }).join(' | ');
}
