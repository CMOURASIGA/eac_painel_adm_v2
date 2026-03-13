
import React, { useState } from 'react';
import { Dispatch, Log, LogStatus } from '../types';
import Drawer from './Drawer';
import ExecutionModal from './ExecutionModal';
import MarkdownViewer from './MarkdownViewer';
import { showAppConfirm } from '../utils/appDialog.ts';

interface DispatchesPageProps {
  dispatches: Dispatch[];
  onExecute: (dispatch: Dispatch) => void;
  onClearStatus: (dispatch: Dispatch) => void | Promise<void>;
  operator: string;
  hasEventsThisWeek?: boolean;
}

const DispatchesPage: React.FC<DispatchesPageProps> = ({ dispatches, onExecute, onClearStatus, operator, hasEventsThisWeek = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [executingDispatch, setExecutingDispatch] = useState<Dispatch | null>(null);

  const filtered = dispatches.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenDetails = (d: Dispatch) => {
    setSelectedDispatch(d);
    setIsDrawerOpen(true);
  };

  const handleStartExecution = (d: Dispatch) => {
    setExecutingDispatch(d);
  };

  const handleConfirmExecution = async () => {
    if (!executingDispatch) return;
    await onExecute(executingDispatch);
    setExecutingDispatch(null);
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
          const isPriority = isEventos && hasEventsThisWeek;
          
          return (
            <div key={d.id} className={`bg-white rounded-[2rem] border overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col group ${isPriority ? 'border-amber-400 shadow-lg shadow-amber-50' : 'border-slate-200'}`}>
              <div className={`h-2 ${isPriority ? 'bg-amber-400 animate-pulse' : (d.status === 'active' ? 'blue-gradient' : 'bg-slate-300')}`}></div>
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
                  {isEventos ? 'ENVIAR AGENDA' : 'EXECUTAR DISPARO'}
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
            
            {/* NOVO: Prévia do E-mail (Simulador de Moldura EAC) */}
            {selectedDispatch.emailPreview && (
              <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  Visualização do E-mail
                </h4>
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-slate-100">
                   {/* Cabeçalho do E-mail */}
                   <div className="bg-[#044372] p-6 text-center">
                      <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-10 mx-auto" />
                   </div>
                   {/* Corpo do E-mail */}
                   <div className="p-8 text-sm text-slate-700 leading-relaxed font-medium bg-white">
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedDispatch.emailPreview }}></div>
                   </div>
                   {/* Rodapé do E-mail */}
                   <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
                      <div className="inline-block bg-[#044372] text-white px-6 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">
                        SIGA NOSSO INSTAGRAM
                      </div>
                   </div>
                </div>
                <p className="text-[8px] text-center text-slate-400 font-bold uppercase mt-3 tracking-widest italic">* A visualização acima é uma representação aproximada do layout final.</p>
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
          onClose={() => setExecutingDispatch(null)}
          onConfirm={handleConfirmExecution}
          operator={operator}
        />
      )}
    </div>
  );
};

export default DispatchesPage;
