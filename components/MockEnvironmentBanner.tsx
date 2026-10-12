import React from 'react';
import { isMockRuntime, resetMockRuntime } from '../services/mock/mockRuntime.ts';

const MockEnvironmentBanner: React.FC = () => {
  if (!isMockRuntime()) return null;
  return (
    <div className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      <span>AMBIENTE MOCK: dados fictícios, sem conexão com Supabase, planilhas, e-mail ou WhatsApp.</span>
      <button type="button" className="ml-3 rounded-md border border-amber-500 bg-white px-2 py-0.5 text-xs font-bold text-amber-900 hover:bg-amber-50" onClick={() => { void resetMockRuntime().then(() => window.location.reload()); }}>
        Reiniciar dados fictícios
      </button>
    </div>
  );
};

export default MockEnvironmentBanner;
