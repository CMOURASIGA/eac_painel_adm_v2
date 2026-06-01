import React, { useState, useEffect } from 'react';
import { Dispatch } from '../types';

interface ExecutionModalProps {
  dispatch: Dispatch;
  onClose: () => void;
  onConfirm: () => void;
  operator: string;
}

const ExecutionModal: React.FC<ExecutionModalProps> = ({ dispatch, onClose, onConfirm, operator }) => {
  const [confirmed, setConfirmed] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let interval: any;
    if (isExecuting) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      setSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isExecuting]);

  const handleConfirm = async () => {
    if (!confirmed) return;
    setIsExecuting(true);
    try {
      await onConfirm();
    } finally {
      setIsExecuting(false);
    }
  };

  const isMassive = dispatch.endpoint === 'google_script';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-200">
        <div className={`p-8 text-white text-center relative ${isExecuting ? 'bg-amber-600' : 'blue-gradient'}`}>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/30">
            {isExecuting ? (
              <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            )}
          </div>
          <h3 className="text-2xl font-bold">{isExecuting ? 'Processando Disparo...' : 'Confirmação de Disparo'}</h3>
          <p className="text-blue-100 text-xs mt-1 uppercase tracking-[0.2em] font-bold opacity-80">
            {isExecuting ? `Tempo decorrido: ${seconds}s` : 'Protocolo Operação Segura'}
          </p>
        </div>

        <div className="p-8 space-y-6">
          {isExecuting && isMassive && (
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl animate-pulse">
              <p className="text-blue-700 text-xs font-bold text-center">
                Aguardando resposta do Google Script.<br/>Isso pode levar até 2 minutos para grandes volumes.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">Ação</p>
              <p className="font-bold text-slate-800 truncate">{dispatch.name}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">Operador</p>
              <p className="font-bold text-slate-800 truncate">{operator}</p>
            </div>
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-400 p-5 rounded-r-2xl">
            <h4 className="text-sm font-bold text-amber-900 mb-2 uppercase tracking-tight flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Regras Importantes
            </h4>
            <div className="text-xs text-amber-800 leading-relaxed whitespace-pre-line font-medium opacity-90">
              {dispatch.rules}
            </div>
          </div>

          {!isExecuting && (
            <div className="pt-2">
              <label className="flex items-start space-x-4 p-4 rounded-2xl border-2 border-transparent hover:border-slate-100 bg-slate-50/50 transition-all cursor-pointer group">
                <div className="mt-0.5">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                </div>
                <span className="text-sm text-slate-600 font-medium leading-relaxed group-hover:text-slate-800">
                  Confirmo que revisei os parâmetros e os pré-requisitos do disparo e estou ciente da execução manual.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="px-8 py-6 bg-slate-50 flex space-x-4 border-t border-slate-100">
          {!isExecuting && (
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-2xl transition-all uppercase tracking-wider"
            >
              Cancelar
            </button>
          )}
          <button 
            onClick={handleConfirm}
            disabled={!confirmed || isExecuting}
            className={`flex-1 py-3 text-sm font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center uppercase tracking-wider ${
              confirmed && !isExecuting 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200' 
                : isExecuting 
                  ? 'bg-amber-500 text-white cursor-wait' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isExecuting ? 'Aguardando Resposta...' : 'Confirmar Disparo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutionModal;
