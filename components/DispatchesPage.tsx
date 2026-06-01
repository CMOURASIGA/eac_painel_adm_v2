
import React, { useEffect, useState } from 'react';
import { Dispatch, Log, LogStatus } from '../types';
import Drawer from './Drawer';
import ExecutionModal from './ExecutionModal';
import MarkdownViewer from './MarkdownViewer';
import { showAppConfirm } from '../utils/appDialog.ts';

interface DispatchesPageProps {
  dispatches: Dispatch[];
  onExecute: (dispatch: Dispatch, payload?: Record<string, any>) => void;
  onClearStatus: (dispatch: Dispatch) => void | Promise<void>;
  operator: string;
  hasEventsThisWeek?: boolean;
}

const DISPATCH_MIGRATION_STATUS: Record<string, { implemented: string; pending: string; newRule?: string }> = {
  agradecimento_inscricao: {
    implemented: 'Fluxo legado ativo (Google Script).',
    pending: 'Migrar regra e envio para Supabase/API nativa.',
  },
  confirmacao_interesse_espera: {
    implemented: 'Fluxo legado ativo (Google Script).',
    pending: 'Migrar emissão de link e envio para rotina nativa com auditoria única.',
  },
  waitlist_non_enrolled: {
    implemented: 'Fluxo legado ativo (Google Script).',
    pending: 'Migrar seleção de público e disparo para Supabase.',
  },
  confirm_nao_inscritos: {
    implemented: 'Regra nova implementada no backend para montar público via Supabase (`vw_inscricoes_completas`).',
    pending: 'Configurar provedor de e-mail no backend para envio nativo (hoje retorna público elegível).',
    newRule: 'Status INSCRITO/CONFIRMADO + coalesce(email_responsavel, email) válido + deduplicação por e-mail + exclusão de SUCCESS já enviado.',
  },
  comunicacao_nao_participacao_eac: {
    implemented: 'Fluxo legado ativo (Google Script).',
    pending: 'Migrar para regras nativas com base relacional.',
  },
  comunicado_99_cadastro: {
    implemented: 'Regra nova implementada no backend para montar público via Supabase (`vw_cadastro_oficial`), carregar template dinâmico do ID 99 e enviar via SMTP.',
    pending: 'Opcional: criar trava temporal de reenvio por janela (hoje bloqueia por histórico SUCCESS).',
    newRule: 'Email válido em `vw_cadastro_oficial` + deduplicação por e-mail + exclusão de SUCCESS já enviado + conteúdo dinâmico da tabela de comunicados (ID 99).',
  },
  aniversariantes_dia: {
    implemented: 'Regra nova implementada no backend para montar público via Supabase (`vw_cadastro_oficial`) e enviar via SMTP.',
    pending: 'Opcional: persistir status anual por pessoa em coluna dedicada (hoje usa histórico de `disparo_destinatarios`).',
    newRule: 'Nascimento (dia/mês) igual a hoje + email válido + deduplicação por email + bloqueio de reenvio no mesmo ano para SUCCESS.',
  },
  emergencia_nov2025: {
    implemented: 'Fluxo legado ativo (Google Script) com parâmetros na UI.',
    pending: 'Migrar disparo paramétrico para rotina nativa com origem única Supabase.',
  },
  eventos: {
    implemented: 'Fluxo legado ativo (Google Script).',
    pending: 'Migrar montagem da agenda e envio semanal para backend nativo.',
  },
};

const DispatchesPage: React.FC<DispatchesPageProps> = ({ dispatches, onExecute, onClearStatus, operator, hasEventsThisWeek = false }) => {
  const EMERGENCY_MESSAGE_STORAGE_KEY = 'eac_dispatch_emergency_message';
  const toLocalInputDate = (date: Date) => {
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  };
  const getEmergencyDefaultMessage = (dispatch?: Dispatch | null) =>
    dispatch?.emailPreview
      ? dispatch.emailPreview.replace(/<[^>]+>/g, '').trim()
      : 'Olá, [NOME]!\n\nEste é um comunicado emergencial para o período selecionado. Por favor, leia com atenção e confirme seu recebimento.';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [executingDispatch, setExecutingDispatch] = useState<Dispatch | null>(null);
  const [executionPayload, setExecutionPayload] = useState<Record<string, any>>({});
  const [customMessage, setCustomMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(EMERGENCY_MESSAGE_STORAGE_KEY) || '';
    } catch (_err) {
      return '';
    }
  });
  const [customSource, setCustomSource] = useState<'encontreiros' | 'cadastro'>('encontreiros');
  const [customStartMonth, setCustomStartMonth] = useState('2025-11');
  const [customEndDate, setCustomEndDate] = useState(() => toLocalInputDate(new Date()));
  const isEmergencySelected = selectedDispatch?.type === 'emergencia_nov2025';
  const dynamicEmergencyPreviewHtml = (
    String(customMessage || '').trim() ||
    'Olá!\n\nEste é um comunicado emergencial para o período selecionado. Por favor, leia com atenção e responda se necessário.'
  ).replace(/\n/g, '<br>');
  const activePreviewHtml = isEmergencySelected
    ? dynamicEmergencyPreviewHtml
    : (selectedDispatch?.emailPreview || '');

  const filtered = dispatches.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (customMessage) localStorage.setItem(EMERGENCY_MESSAGE_STORAGE_KEY, customMessage);
      else localStorage.removeItem(EMERGENCY_MESSAGE_STORAGE_KEY);
    } catch (_err) {}
  }, [customMessage]);

  const handleOpenDetails = (d: Dispatch) => {
    setSelectedDispatch(d);
    if (d.type === 'emergencia_nov2025') {
      setCustomSource('encontreiros');
      setCustomStartMonth('2025-11');
      setCustomEndDate(toLocalInputDate(new Date()));
      if (!String(customMessage || '').trim()) {
        setCustomMessage(getEmergencyDefaultMessage(d));
      }
    }
    setIsDrawerOpen(true);
  };

  const handleStartExecution = (d: Dispatch) => {
    if (d.type === 'emergencia_nov2025') {
      const startMonth = customStartMonth || '2025-11';
      const startDate = `${startMonth}-01`;
      const endDate = (!customEndDate || customEndDate < startDate) ? startDate : customEndDate;
      const message = String(customMessage || '').trim() || getEmergencyDefaultMessage(d);
      if (!String(customMessage || '').trim()) setCustomMessage(message);
      if (!customStartMonth) setCustomStartMonth(startMonth);
      if (!customEndDate || customEndDate < startDate) setCustomEndDate(endDate);
      setExecutionPayload({ message, targetSheet: customSource, startMonth, endDate });
    } else if (d.type === 'confirmacao_interesse_espera') {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
      setExecutionPayload(appUrl ? { appUrl } : {});
    } else {
      setExecutionPayload({});
    }
    setExecutingDispatch(d);
  };

  const handleUseDefaultEmergencyMessage = () => {
    if (!isEmergencySelected) return;
    setCustomMessage(getEmergencyDefaultMessage(selectedDispatch));
  };

  const handleClearEmergencyMessage = () => {
    if (!isEmergencySelected) return;
    setCustomMessage('');
  };

  const handleConfirmExecution = async () => {
    if (!executingDispatch) return;
    const payload: Record<string, any> = { ...(executionPayload || {}) };

    if (executingDispatch.type === 'emergencia_nov2025') {
      let startMonth = String(payload.startMonth || customStartMonth || '2025-11');
      let endDate = String(payload.endDate || customEndDate || toLocalInputDate(new Date()));
      const startDate = `${startMonth}-01`;
      if (!endDate || endDate < startDate) {
        endDate = startDate;
        setCustomEndDate(startDate);
      }
      payload.startMonth = startMonth;
      payload.endDate = endDate;
      payload.targetSheet = payload.targetSheet || customSource;
      payload.message = payload.message !== undefined ? payload.message : customMessage;
    }

    if (executingDispatch.type === 'confirmacao_interesse_espera' && !payload.appUrl && typeof window !== 'undefined') {
      payload.appUrl = window.location.origin;
    }

    await onExecute(executingDispatch, payload);
    setExecutingDispatch(null);
    setExecutionPayload({});
  };

  const handleClear = async (d: Dispatch) => {
    const confirmed = await showAppConfirm({
      title: 'Limpar status de envio',
      message: `Deseja realmente LIMPAR o status de "${d.name}"? Isso permitirá que todos recebam o envio novamente.`,
      tone: 'warning',
      confirmLabel: 'Limpar status',
      cancelLabel: 'Cancelar'
    });
    if (!confirmed) return;
    await onClearStatus(d);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto animate-in fade-in duration-500 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 md:mb-12">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">Operações de Disparo</h2>
          <p className="text-slate-500 mt-1 font-medium italic text-sm md:text-base">Módulo manual de manutenção e execução em lote.</p>
        </div>
        <div className="relative group w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Filtrar por nome ou tag..." 
            className="pl-12 pr-6 py-4 border-2 border-slate-200 rounded-2xl w-full md:w-96 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all shadow-sm group-hover:border-slate-300 text-slate-900 font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <svg className="w-5 h-5 absolute left-4 top-4.5 text-slate-400 group-focus-within:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {filtered.map(d => {
          const isEventos = d.type === 'eventos';
          const isEmergency = d.tags?.includes('Emergência');
          const isPriority = isEventos && hasEventsThisWeek;
          
          return (
            <div key={d.id} className={`bg-white rounded-[2rem] border overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col group ${isEmergency ? 'border-red-400 shadow-lg shadow-red-50' : isPriority ? 'border-amber-400 shadow-lg shadow-amber-50' : 'border-slate-200'}`}>
              <div className={`h-2 ${isEmergency ? 'bg-red-500 animate-pulse' : isPriority ? 'bg-amber-400 animate-pulse' : (d.status === 'active' ? 'blue-gradient' : 'bg-slate-300')}`}></div>
              <div className="p-6 md:p-8 flex-grow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-2">
                    <span className="text-[9px] uppercase font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 tracking-widest">{d.type}</span>
                    {isPriority && (
                      <span className="text-[9px] uppercase font-black text-white bg-amber-500 px-3 py-1 rounded-full animate-bounce tracking-widest shadow-sm">PRIORITÁRIO</span>
                    )}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest flex items-center ${d.status === 'active' ? 'text-green-600' : 'text-slate-400'}`}>
                    <span className={`w-2 h-2 rounded-full mr-1.5 ${d.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
                    {d.status === 'active' ? 'Ativo' : 'Off'}
                  </span>
                </div>
                <h3 className="text-lg md:text-xl font-black text-slate-900 mb-3 group-hover:text-blue-700 transition-colors">{d.name}</h3>
                <p className="text-xs md:text-sm text-slate-500 mb-6 leading-relaxed line-clamp-3">{d.shortDescription}</p>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  {d.tags.map(tag => (
                    <span key={tag} className="text-[9px] font-black bg-slate-50 text-slate-400 px-2 py-1 rounded-lg border border-slate-100 uppercase tracking-tighter">#{tag}</span>
                  ))}
                </div>
              </div>
              
              <div className="px-6 md:px-8 py-5 bg-slate-50/50 flex flex-col gap-3 border-t border-slate-100">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenDetails(d)}
                    className="flex-1 py-3 text-[10px] font-black text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-all border border-slate-200 shadow-sm uppercase tracking-widest"
                  >
                    Detalhes
                  </button>
                  <button 
                    onClick={() => { void handleClear(d); }}
                    title="Limpar status de envio para permitir novo disparo"
                    className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200 shadow-sm"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <button 
                  disabled={d.status !== 'active'}
                  onClick={() => handleStartExecution(d)}
                  className={`w-full py-4 text-[10px] md:text-xs font-black rounded-xl transition-all shadow-lg ${
                    d.status === 'active' 
                      ? (isPriority ? 'bg-blue-700 text-white hover:bg-blue-800 ring-4 ring-amber-100' : 'bg-blue-600 text-white hover:bg-blue-700') 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  } uppercase tracking-widest hover:-translate-y-1 active:translate-y-0`}
                >
                  {isEventos ? 'ENVIAR AGENDA' : isEmergency ? 'EXECUTAR EMERGÊNCIA' : 'EXECUTAR DISPARO'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedDispatch && (
        <Drawer 
          isOpen={isDrawerOpen} 
          onClose={() => setIsDrawerOpen(false)} 
          title={selectedDispatch.name}
        >
          <div className="space-y-8 pb-10">
            <section>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Descrição Detalhada</h4>
              <MarkdownViewer content={selectedDispatch.detailedDescription} />
            </section>

            <section className="bg-amber-50/70 p-6 rounded-[2rem] border border-amber-200">
              <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-[0.2em] mb-4">Status de Migração</h4>
              {(() => {
                const info = DISPATCH_MIGRATION_STATUS[selectedDispatch.type] || {
                  implemented: 'Mapeamento de migração ainda não documentado.',
                  pending: 'Definir regra e implementação na arquitetura nova.',
                };
                return (
                  <div className="space-y-3 text-sm text-slate-700">
                    <p><strong>Implementado:</strong> {info.implemented}</p>
                    <p><strong>Pendente:</strong> {info.pending}</p>
                    {info.newRule && <p><strong>Regra (novo sistema):</strong> {info.newRule}</p>}
                  </div>
                );
              })()}
            </section>
            
            {/* NOVO: Prévia do E-mail (Simulador de Moldura EAC) */}
            {activePreviewHtml && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  {isEmergencySelected ? 'Visualização Dinâmica do E-mail' : 'Visualização do E-mail'}
                </h4>
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-slate-100">
                   {/* Cabeçalho do E-mail */}
                   <div className="bg-[#044372] p-6 text-center">
                      <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-10 mx-auto" />
                   </div>
                   {/* Corpo do E-mail */}
                   <div className="p-8 text-sm text-slate-700 leading-relaxed font-medium bg-white">
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: activePreviewHtml }}></div>
                   </div>
                   {/* Rodapé do E-mail */}
                   <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
                      <div className="inline-block bg-[#044372] text-white px-6 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">
                        SIGA NOSSO INSTAGRAM
                      </div>
                   </div>
                </div>
                <p className="text-[8px] text-center text-slate-400 font-bold uppercase mt-3 tracking-widest italic">
                  * A visualização acima é uma representação aproximada do layout final.
                </p>
              </section>
            )}

            {selectedDispatch?.type === 'emergencia_nov2025' && (
              <section className="bg-red-50/60 p-6 rounded-[2rem] border border-red-200 mb-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h4 className="text-[10px] font-black text-red-800 uppercase tracking-[0.2em] mb-2 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      Disparo Emergencial
                    </h4>
                    <p className="text-sm font-bold text-red-700">Este disparo está destacado para casos de emergência. Edite a mensagem e escolha a origem dos dados antes de executar.</p>
                  </div>
                </div>
                <div className="grid gap-4">
                  <label className="block text-sm font-black uppercase tracking-[0.2em] text-slate-500">Fonte de dados</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCustomSource('encontreiros')}
                      className={`py-3 rounded-2xl font-bold text-sm transition ${customSource === 'encontreiros' ? 'bg-red-600 text-white' : 'bg-white text-slate-700 border border-red-200 hover:bg-red-50'}`}
                    >
                      Encontreiros
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomSource('cadastro')}
                      className={`py-3 rounded-2xl font-bold text-sm transition ${customSource === 'cadastro' ? 'bg-red-600 text-white' : 'bg-white text-slate-700 border border-red-200 hover:bg-red-50'}`}
                    >
                      Cadastro de Encontrista
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Mês inicial</label>
                      <input
                        type="month"
                        value={customStartMonth}
                        onChange={(e) => setCustomStartMonth(e.target.value)}
                        className="w-full rounded-2xl border border-red-200 bg-white p-3 text-sm text-slate-700 shadow-sm focus:border-red-400 focus:ring-4 focus:ring-red-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Data final</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full rounded-2xl border border-red-200 bg-white p-3 text-sm text-slate-700 shadow-sm focus:border-red-400 focus:ring-4 focus:ring-red-100 outline-none"
                      />
                    </div>
                  </div>

                  <label className="block text-sm font-black uppercase tracking-[0.2em] text-slate-500">Mensagem de emergência</label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={8}
                    className="w-full rounded-[1.5rem] border border-red-200 bg-white p-4 text-sm text-slate-700 shadow-sm focus:border-red-400 focus:ring-4 focus:ring-red-100 outline-none"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleUseDefaultEmergencyMessage}
                      className="py-3 rounded-2xl font-bold text-sm bg-white text-red-700 border border-red-200 hover:bg-red-50 transition"
                    >
                      Usar mensagem padrão
                    </button>
                    <button
                      type="button"
                      onClick={handleClearEmergencyMessage}
                      className="py-3 rounded-2xl font-bold text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
                    >
                      Limpar mensagem
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">O texto acima será enviado em HTML simples com a moldura padrão do EAC.</p>
                </div>
              </section>
            )}
            <section className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100">
              <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-[0.2em] mb-4 flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                Protocolo Operacional
              </h4>
              <MarkdownViewer content={selectedDispatch.rules} />
            </section>

            <section>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Manutenção</h4>
              <button 
                onClick={() => { void handleClear(selectedDispatch); }}
                className="w-full py-4 bg-slate-50 border-2 border-slate-200 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-red-500 hover:text-red-600 transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Resetar Status de Envio
              </button>
            </section>

            <div className="pt-8 border-t border-slate-100">
              <button 
                disabled={selectedDispatch.status !== 'active'}
                onClick={() => {
                  setIsDrawerOpen(false);
                  handleStartExecution(selectedDispatch);
                }}
                className={`w-full py-5 text-center font-black text-white rounded-[1.5rem] shadow-xl transition-all transform hover:-translate-y-1 active:translate-y-0 ${
                  selectedDispatch.status === 'active' 
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' 
                    : 'bg-slate-300 cursor-not-allowed'
                } uppercase text-xs md:text-sm tracking-widest`}
              >
                {selectedDispatch.status === 'active' ? 'INICIAR PROTOCOLO DE DISPARO' : 'DISPARO DESATIVADO'}
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {executingDispatch && (
        <ExecutionModal 
          dispatch={executingDispatch}
          onClose={() => { setExecutingDispatch(null); setExecutionPayload({}); }}
          onConfirm={handleConfirmExecution}
          operator={operator}
        />
      )}
    </div>
  );
};

export default DispatchesPage;


