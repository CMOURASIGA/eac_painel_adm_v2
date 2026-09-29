import React from 'react';
import type { VisitacaoCadastro, VisitacaoRespostaOpcao } from '../types.ts';
import { summarizeVisitacaoCadastro, TAMANHOS_CAMISA_VISITACAO, VISITACAO_SIM_NAO_OPCOES } from '../utils/visitacaoCadastro.ts';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100';
const labelClass = 'text-[11px] font-black uppercase tracking-widest text-slate-500';

const VisitacaoCadastroFields: React.FC<{
  value: VisitacaoCadastro;
  onChange: (next: VisitacaoCadastro) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const completeness = summarizeVisitacaoCadastro(value);
  const set = (key: keyof VisitacaoCadastro, next: any) => onChange({ ...value, [key]: next });

  const yesNo = (key: keyof VisitacaoCadastro, label: string) => (
    <label className="space-y-2">
      <span className={labelClass}>{label}</span>
      <select
        value={String(value[key] || 'NAO_INFORMADO')}
        onChange={(event) => set(key, event.target.value as VisitacaoRespostaOpcao)}
        className={fieldClass}
        disabled={disabled}
      >
        {VISITACAO_SIM_NAO_OPCOES.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );

  const section = (title: string, children: React.ReactNode) => (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 md:p-5 space-y-4">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">{title}</div>
      {children}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">Completude cadastral</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{completeness.percentual}% completo</p>
          </div>
          <div className="text-right text-xs font-bold text-slate-600">
            <div>{completeness.preenchidos} preenchidos</div>
            <div>{completeness.pendentes} pendentes</div>
          </div>
        </div>
      </div>

      {section('Identificação', (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-2 md:col-span-2">
            <span className={labelClass}>Nome completo</span>
            <input value={value.nome_completo || ''} onChange={(e) => set('nome_completo', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Como gostaria de ser chamado</span>
            <input value={value.nome_social || ''} onChange={(e) => set('nome_social', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Data de nascimento</span>
            <input type="date" value={String(value.data_nascimento || '').slice(0, 10)} onChange={(e) => set('data_nascimento', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Idade calculada</span>
            <input value={value.idade == null ? '' : String(value.idade)} className={fieldClass} disabled />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Sexo</span>
            <input value={value.sexo || ''} onChange={(e) => set('sexo', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Família e contato', (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className={labelClass}>Responsável principal</span>
            <input value={value.responsavel_nome || ''} onChange={(e) => set('responsavel_nome', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Telefone do responsável</span>
            <input value={value.responsavel_telefone || ''} onChange={(e) => set('responsavel_telefone', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Telefone do adolescente</span>
            <input value={value.telefone || ''} onChange={(e) => set('telefone', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>E-mail</span>
            <input type="email" value={value.email || ''} onChange={(e) => set('email', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Endereço', (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-2 md:col-span-2">
            <span className={labelClass}>Endereço</span>
            <input value={value.endereco || ''} onChange={(e) => set('endereco', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Bairro</span>
            <input value={value.bairro || ''} onChange={(e) => set('bairro', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Cidade</span>
            <input value={value.cidade || ''} onChange={(e) => set('cidade', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Estado</span>
            <input value={value.estado || ''} onChange={(e) => set('estado', e.target.value.toUpperCase().slice(0, 2))} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Escola e camisa', (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className={labelClass}>Escola atual</span>
            <input value={value.escola_nome || value.escola_nome_outro || ''} onChange={(e) => set('escola_nome_outro', e.target.value)} className={fieldClass} disabled={disabled || Boolean(value.escola_id)} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Tamanho da camisa</span>
            <select value={value.tamanho_camisa || ''} onChange={(e) => set('tamanho_camisa', e.target.value)} className={fieldClass} disabled={disabled}>
              <option value="">Não informado</option>
              {TAMANHOS_CAMISA_VISITACAO.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Turno</span>
            <input value={value.turno_escolar || ''} onChange={(e) => set('turno_escolar', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Série</span>
            <input value={value.serie_escolar || ''} onChange={(e) => set('serie_escolar', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Grau</span>
            <input value={value.grau_escolar || ''} onChange={(e) => set('grau_escolar', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Histórico e vida religiosa', (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className={labelClass}>Qual encontro já participou</span>
            <input value={value.encontro_anterior || ''} onChange={(e) => set('encontro_anterior', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          <label className="space-y-2">
            <span className={labelClass}>Quem convidou para o EAC</span>
            <input value={value.convidado_por || ''} onChange={(e) => set('convidado_por', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
          {yesNo('pais_fizeram_ecc', 'Pais fizeram ECC?')}
          {yesNo('primeira_comunhao', 'Fez Primeira Comunhão?')}
          <label className="space-y-2 md:col-span-2">
            <span className={labelClass}>Paróquia</span>
            <input value={value.paroquia || ''} onChange={(e) => set('paroquia', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Informações pessoais', (
        <div className="grid md:grid-cols-2 gap-3">
          {yesNo('toca_instrumento', 'Toca instrumento?')}
          <label className="space-y-2">
            <span className={labelClass}>Instrumento</span>
            <input value={value.instrumento || ''} onChange={(e) => set('instrumento', e.target.value)} className={fieldClass} disabled={disabled || value.toca_instrumento !== 'SIM'} />
          </label>
          {yesNo('gosta_cantar', 'Gosta de cantar?')}
          {yesNo('outra_doutrina_familia', 'Outra doutrina na família?')}
          <label className="space-y-2 md:col-span-2">
            <span className={labelClass}>Detalhe da outra doutrina</span>
            <input value={value.outra_doutrina_descricao || ''} onChange={(e) => set('outra_doutrina_descricao', e.target.value)} className={fieldClass} disabled={disabled || value.outra_doutrina_familia !== 'SIM'} />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className={labelClass}>Por que quer fazer o encontro?</span>
            <textarea rows={3} value={value.motivacao || ''} onChange={(e) => set('motivacao', e.target.value)} className={fieldClass} disabled={disabled} />
          </label>
        </div>
      ))}

      {section('Saúde e alimentação', (
        <div className="grid md:grid-cols-2 gap-3">
          {yesNo('restricao_alimentar', 'Possui restrição alimentar?')}
          <label className="space-y-2">
            <span className={labelClass}>Qual restrição?</span>
            <input value={value.restricao_alimentar_descricao || ''} onChange={(e) => set('restricao_alimentar_descricao', e.target.value)} className={fieldClass} disabled={disabled || value.restricao_alimentar !== 'SIM'} />
          </label>
        </div>
      ))}
    </div>
  );
};

export default VisitacaoCadastroFields;
