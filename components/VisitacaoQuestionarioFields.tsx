import React from 'react';
import type { VisitacaoQuestionarioResposta, VisitacaoRespostaOpcao } from '../types.ts';
import { VISITACAO_QUESTIONARIO, VISITACAO_QUESTIONARIO_OPCOES } from '../utils/visitacaoQuestionario.ts';

const optionLabel = (value: VisitacaoRespostaOpcao) =>
  VISITACAO_QUESTIONARIO_OPCOES.find((option) => option.value === value)?.label || 'Não informado';

const VisitacaoQuestionarioFields: React.FC<{
  value: VisitacaoQuestionarioResposta;
  onChange: (next: VisitacaoQuestionarioResposta) => void;
  disabled?: boolean;
  compact?: boolean;
}> = ({ value, onChange, disabled = false, compact = false }) => {
  return (
    <div className={`grid ${compact ? 'md:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
      {VISITACAO_QUESTIONARIO.map((question) => {
        const currentValue = value[question.key as keyof VisitacaoQuestionarioResposta];
        return (
          <label key={question.key} className="space-y-2 block rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{question.label}</span>
            <select
              value={currentValue}
              onChange={(event) => onChange({ ...value, [question.key]: event.target.value as VisitacaoRespostaOpcao })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100"
              disabled={disabled}
            >
              {VISITACAO_QUESTIONARIO_OPCOES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs font-semibold text-slate-500">Atual: {optionLabel(currentValue)}</p>
          </label>
        );
      })}
    </div>
  );
};

export default VisitacaoQuestionarioFields;
