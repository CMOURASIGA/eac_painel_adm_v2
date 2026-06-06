import React, { useEffect, useMemo, useState } from 'react';
import Toast from './Toast';
import { postComunicadosAction } from '../services/eacApiClient.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;
type EventType = 'POS_ENCONTRO' | 'REUNIAO_CIRCULO';
type AudienceType = 'TODOS' | 'ENCONTRISTA' | 'ENCONTREIRO';

interface PresenceCandidate {
  key: string;
  nome: string;
  telefone: string;
  circulo: string;
  origem: 'ENCONTREIRO' | 'ENCONTRISTA' | 'AMBOS';
}

const PublicPresenceForm: React.FC = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBase, setIsLoadingBase] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventType, setEventType] = useState<EventType>('POS_ENCONTRO');
  const [audienceType, setAudienceType] = useState<AudienceType>('TODOS');
  const [selectedKey, setSelectedKey] = useState('');
  const [circulo, setCirculo] = useState('');
  const [candidates, setCandidates] = useState<PresenceCandidate[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    let active = true;
    async function loadBase() {
      setIsLoadingBase(true);
      try {
        const r = await postComunicadosAction<any>('GET_PUBLIC_PRESENCE_DATA', {});
        if (!r.success) throw new Error(r.error || 'Falha ao carregar lista de presença.');
        if (!active) return;
        const items = Array.isArray((r.data as any)?.candidates) ? (r.data as any).candidates : [];
        setCandidates(items);
        if (items.length === 0) {
          const debug = (r.data as any)?.debug;
          const msg = debug
            ? `Sem nomes para listar. Fontes: encontreiros=${debug.encontreirosCount}, encontristas=${debug.encontristasCount}, presença=${debug.presenceCount}.`
            : 'Sem nomes para listar no momento.';
          setError(msg);
          showToast(msg, 'info');
        }
      } catch (e: any) {
        if (!active) return;
        const msg = e?.message || 'Não foi possível carregar a base do formulário.';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        if (active) setIsLoadingBase(false);
      }
    }
    loadBase();
    return () => {
      active = false;
    };
  }, []);

  const filteredCandidates = useMemo(() => {
    if (audienceType === 'ENCONTRISTA') {
      return candidates.filter((c) => c.origem === 'ENCONTRISTA' || c.origem === 'AMBOS');
    }
    if (audienceType === 'ENCONTREIRO') {
      return candidates.filter((c) => c.origem === 'ENCONTREIRO' || c.origem === 'AMBOS');
    }
    return candidates;
  }, [audienceType, candidates]);

  const selectedCandidate = useMemo(
    () => filteredCandidates.find((c) => c.key === selectedKey) || null,
    [filteredCandidates, selectedKey]
  );

  const getOriginLabel = (origem: PresenceCandidate['origem']) => {
    if (origem === 'ENCONTRISTA') return 'Encontrista';
    if (origem === 'ENCONTREIRO') return 'Encontreiro';
    return 'Ambos';
  };

  const isLockedEncontreiroCircle = useMemo(
    () =>
      eventType === 'POS_ENCONTRO' &&
      !!selectedCandidate &&
      (selectedCandidate.origem === 'ENCONTREIRO' || selectedCandidate.origem === 'AMBOS'),
    [eventType, selectedCandidate]
  );

  useEffect(() => {
    if (!selectedCandidate) return;
    if (
      eventType === 'POS_ENCONTRO' &&
      (selectedCandidate.origem === 'ENCONTREIRO' || selectedCandidate.origem === 'AMBOS')
    ) {
      setCirculo('Encontreiro');
      return;
    }
    if (!toCleanString(circulo)) setCirculo(selectedCandidate.circulo || '');
  }, [selectedCandidate, circulo, eventType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    if (!selectedCandidate) {
      const msg = 'Selecione o nome para registrar a presença.';
      setError(msg);
      showToast(msg, 'info');
      return;
    }

    if (!toCleanString(selectedCandidate.telefone)) {
      const msg = 'Este cadastro não possui telefone válido para registro.';
      setError(msg);
      showToast(msg, 'info');
      return;
    }

    setIsLoading(true);
    try {
      const r = await postComunicadosAction<any>('MARK_PRESENCE', {
        tipoEvento: eventType,
        nome: selectedCandidate.nome,
        telefone: selectedCandidate.telefone,
        circulo: toCleanString(circulo) || toCleanString(selectedCandidate.circulo),
        origemPublico: selectedCandidate.origem,
      });
      if (!r.success) throw new Error((r.raw as any)?.error || r.error || 'Não foi possível registrar presença.');

      setIsSubmitted(true);
      setSelectedKey('');
      setCirculo('');
      showToast((r.data as any)?.message || 'Presença registrada com sucesso!', 'success');
    } catch (e: any) {
      const msg = e?.message || 'Falha ao registrar presença.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8fafc] to-[#eef2f7] py-10 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="bg-[#044372] px-8 py-7 text-center">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-16 mx-auto drop-shadow" />
          </div>

          <div className="p-7 md:p-8">
            <h1 className="text-3xl font-black text-slate-900 text-center mb-2">Registro de Presença</h1>
            <p className="text-center text-slate-600 mb-7">Selecione o evento e o nome para confirmar sua presença.</p>

            {isSubmitted && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 font-semibold">
                Presença registrada com sucesso.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-extrabold text-slate-800 mb-1">Tipo de evento *</label>
                <select
                  value={eventType}
                  onChange={(e) => {
                    setEventType(e.target.value as EventType);
                  }}
                  className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                >
                  <option value="POS_ENCONTRO">Pós-Encontro (encontreiro + encontrista)</option>
                  <option value="REUNIAO_CIRCULO">Reunião de Círculo (somente encontrista)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-extrabold text-slate-800 mb-1">Visualizar nomes de *</label>
                <select
                  value={audienceType}
                  onChange={(e) => {
                    setAudienceType(e.target.value as AudienceType);
                    setSelectedKey('');
                    setCirculo('');
                  }}
                  className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                >
                  <option value="TODOS">Encontrista + Encontreiro</option>
                  <option value="ENCONTRISTA">Somente Encontrista</option>
                  <option value="ENCONTREIRO">Somente Encontreiro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-extrabold text-slate-800 mb-1">Nome completo *</label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  disabled={isLoadingBase}
                  className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="">{isLoadingBase ? 'Carregando nomes...' : 'Selecione o nome'}</option>
                  {filteredCandidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {`${c.nome} (${getOriginLabel(c.origem)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-extrabold text-slate-800 mb-1">Círculo *</label>
                <input
                  value={circulo}
                  onChange={(e) => setCirculo(e.target.value)}
                  disabled={isLockedEncontreiroCircle}
                  placeholder="Ex.: Azul / Círculo 1"
                  className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
                {isLockedEncontreiroCircle ? (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Círculo definido automaticamente como Encontreiro para este tipo de evento.
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isLoading || isLoadingBase}
                className="w-full bg-gradient-to-r from-[#0a4a86] to-[#1f64bb] text-white font-black py-3.5 px-4 rounded-xl hover:brightness-105 disabled:bg-slate-400 transition-colors duration-300 uppercase tracking-wide"
              >
                {isLoading ? 'Registrando presença...' : 'Registrar presença'}
              </button>

              {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
            </form>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PublicPresenceForm;
