import React from 'react';
import { AppDialogRequest } from '../utils/appDialog.ts';

interface AppDialogProps {
  request: AppDialogRequest | null;
  onResolve: (confirmed: boolean) => void;
}

const toneMap: Record<string, { iconBg: string; iconText: string; border: string; button: string }> = {
  info: {
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
    border: 'border-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700',
  },
  success: {
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    border: 'border-emerald-200',
    button: 'bg-emerald-600 hover:bg-emerald-700',
  },
  error: {
    iconBg: 'bg-red-100',
    iconText: 'text-red-700',
    border: 'border-red-200',
    button: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    border: 'border-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
};

const titleByKind = {
  alert: 'Aviso',
  confirm: 'Confirmação',
};

const AppDialog: React.FC<AppDialogProps> = ({ request, onResolve }) => {
  if (!request) return null;

  const tone = request.tone || (request.kind === 'confirm' ? 'warning' : 'info');
  const styles = toneMap[tone] || toneMap.info;
  const title = request.title || titleByKind[request.kind];
  const confirmLabel = request.confirmLabel || 'OK';
  const cancelLabel = request.kind === 'confirm' ? request.cancelLabel || 'Cancelar' : '';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className={`w-full max-w-lg bg-white rounded-[2rem] shadow-2xl border ${styles.border} overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${styles.iconBg}`}>
              <svg className={`w-6 h-6 ${styles.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {tone === 'success' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" d="M5 13l4 4L19 7" />}
                {tone === 'error' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" d="M6 18L18 6M6 6l12 12" />}
                {tone === 'warning' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" d="M12 8v4m0 4h.01M10.29 3.86l-8 14A2 2 0 004 21h16a2 2 0 001.71-3.14l-8-14a2 2 0 00-3.42 0z" />}
                {tone === 'info' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">{title}</h3>
              <p className="mt-2 text-slate-600 whitespace-pre-line leading-relaxed">{request.message}</p>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          {request.kind === 'confirm' && (
            <button
              onClick={() => onResolve(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-black text-[11px] uppercase tracking-widest hover:bg-slate-100 transition-all"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={() => onResolve(true)}
            className={`px-5 py-2.5 rounded-xl text-white font-black text-[11px] uppercase tracking-widest transition-all ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppDialog;

