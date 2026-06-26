import React, { useEffect, useMemo, useState } from 'react';
import { visitacaoService } from '../services/visitacaoService.ts';
import type { VisitacaoPriorizado, VisitacaoQuestionarioResposta, VisitacaoStatus } from '../types.ts';
import { createEmptyVisitacaoQuestionario, summarizeVisitacaoQuestionario } from '../utils/visitacaoQuestionario.ts';
import VisitacaoQuestionarioFields from './VisitacaoQuestionarioFields.tsx';

const STATUS_OPTIONS: Array<{ value: VisitacaoStatus; label: string }> = [
  { value: 'CONTATO_INICIAL_FEITO', label: 'Deseja fazer' },
  { value: 'VISITACAO_REALIZADA', label: 'Visitação realizada' },
  { value: 'NAO_CONSEGUIU_CONTATO', label: 'Não conseguiu contato' },
  { value: 'AGUARDANDO_RETORNO', label: 'Aguardando retorno' },
  { value: 'NAO_DESEJA_VISITA', label: 'Não deseja fazer' },
];

const normalize = (value: any) => String(value ?? '').trim().toLowerCase();
const digitsOnly = (value: any) => String(value ?? '').replace(/\D/g, '');

const VisitacaoForm: React.FC<{ token?: string }> = ({ token }) => {
  const [items, setItems] = useState<VisitacaoPriorizado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    status_visitacao: 'VISITACAO_REALIZADA' as VisitacaoStatus,
    data_acao: new Date().toISOString().slice(0, 16),
    responsavel_acao: '',
    observacao: '',
  });
  const [questionario, setQuestionario] = useState<VisitacaoQuestionarioResposta>(createEmptyVisitacaoQuestionario());

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError('Token de acesso ausente.');
        setLoading(false);
        return;
      }
      const result = await visitacaoService.listar({ publicToken: token });
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setItems(result.data.items || []);
      setLoading(false);
    };
    load();
  }, [token]);

  const filteredItems = useMemo(() => {
    const term = normalize(search);
    if (!term) return items.slice(0, 40);
    const digits = digitsOnly(term);
    return items.filter((item) => {
      const byName = normalize(item.nome).includes(term);
      const byPhone = digits ? digitsOnly(item.telefone_normalizado || item.telefone).includes(digits) : false;
      return byName || byPhone;
    }).slice(0, 40);
  }, [items, search]);

  const selectedItem = useMemo(() => items.find((item) => item.inscricao_id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    setQuestionario(selectedItem?.respostas_questionario ? selectedItem.respostas_questionario : createEmptyVisitacaoQuestionario());
  }, [selectedItem?.inscricao_id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!token) {
      setError('Token de acesso ausente.');
      return;
    }
    if (!selectedId) {
      setError('Selecione um adolescente priorizado.');
      return;
    }
    if (!form.responsavel_acao.trim()) {
      setError('Informe o responsável pela ação.');
      return;
    }

    const result = await visitacaoService.registrar(selectedId, {
      ...form,
      respostas_questionario: questionario,
      origem_registro: 'FORMULARIO_VISITACAO',
      token,
      data_acao: new Date(form.data_acao).toISOString(),
    });

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSuccess('Registro de visitação salvo com sucesso.');
    setForm({
      status_visitacao: 'VISITACAO_REALIZADA',
      data_acao: new Date().toISOString().slice(0, 16),
      responsavel_acao: '',
      observacao: '',
    });
    setQuestionario(createEmptyVisitacaoQuestionario());
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600 font-bold">Carregando formulário de visitação...</div>;
  }

  if (error && items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-rose-200 rounded-[2rem] p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-rose-700">Acesso negado</h1>
          <p className="mt-3 text-slate-600 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_55%)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-6 md:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600">Equipe de visitação</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Registro rápido em campo</h1>
          <p className="mt-3 text-slate-500 font-semibold">Selecione um priorizado e registre a ação no mesmo fluxo do painel.</p>
        </div>

        {(error || success) ? (
          <div className={`rounded-[2rem] border px-5 py-4 font-bold ${error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {error || success}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
          <label className="space-y-2 block">
            <span className="text-sm font-black text-slate-700">Buscar adolescente priorizado</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500" placeholder="Digite nome ou telefone" />
          </label>

          <div className="space-y-3 rounded-[2rem] border border-blue-100 bg-blue-50/60 p-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600">Perguntas da visitação</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Preencha as respostas quando houver contato com a família. Se não houver informação, mantenha como "Não informado".</p>
            </div>
            <VisitacaoQuestionarioFields value={questionario} onChange={setQuestionario} compact />
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-black text-slate-700">Adolescente selecionado</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500" required>
              <option value="">Selecione...</option>
              {filteredItems.map((item) => (
                <option key={item.inscricao_id} value={item.inscricao_id}>
                  {item.nome} {item.bairro ? `• ${item.bairro}` : ''} {item.telefone ? `• ${item.telefone}` : ''}
                </option>
              ))}
            </select>
          </label>

          {selectedItem ? (
            <div className="rounded-[2rem] bg-slate-50 border border-slate-200 p-5 grid md:grid-cols-2 gap-3 text-sm font-semibold text-slate-600">
              <div>Atual: <span className="text-slate-900 font-black">{selectedItem.status_visitacao}</span></div>
              <div>Responsável cadastrado: <span className="text-slate-900 font-black">{selectedItem.responsavel_nome || '-'}</span></div>
              <div>Telefone: <span className="text-slate-900 font-black">{selectedItem.telefone || '-'}</span></div>
              <div>Bairro: <span className="text-slate-900 font-black">{selectedItem.bairro || '-'}</span></div>
              {selectedItem.respostas_questionario ? (
                <div className="md:col-span-2 rounded-2xl bg-white border border-slate-200 p-4 text-slate-600">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Últimas respostas</div>
                  <div className="mt-2 font-semibold text-slate-700">{summarizeVisitacaoQuestionario(selectedItem.respostas_questionario)}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-black text-slate-700">Tipo de ação</span>
              <select value={form.status_visitacao} onChange={(event) => setForm((current) => ({ ...current, status_visitacao: event.target.value as VisitacaoStatus }))} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500">
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-slate-700">Data da ação</span>
              <input type="datetime-local" value={form.data_acao} onChange={(event) => setForm((current) => ({ ...current, data_acao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500" required />
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-black text-slate-700">Responsável</span>
            <input value={form.responsavel_acao} onChange={(event) => setForm((current) => ({ ...current, responsavel_acao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500" placeholder="Ex.: Ana / Equipe azul" required />
          </label>

          <label className="space-y-2 block">
            <span className="text-sm font-black text-slate-700">Observação</span>
            <textarea value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-4 font-semibold outline-none focus:border-blue-500" placeholder="Detalhes da visita, recado da família, melhor horário de retorno..." />
          </label>

          <button type="submit" className="w-full rounded-2xl bg-blue-600 text-white py-4 font-black uppercase tracking-widest hover:bg-blue-700 transition-all">
            Registrar visitação
          </button>
        </form>
      </div>
    </div>
  );
};

export default VisitacaoForm;
