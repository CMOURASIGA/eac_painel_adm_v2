import React from 'react';
import type { View } from '../types';
import type { NavigationGroup, NavigationItem } from '../utils/navigationRoadmap.ts';

interface GroupHubPageProps {
  group: NavigationGroup;
  items: NavigationItem[];
  onNavigate: (view: View) => void;
}

// Tela de entrada de uma macro-rotina: mostra as rotinas que pertencem a
// esse grupo como cards clicáveis. Nenhuma tela nova de verdade é criada
// aqui — cada card só navega pra tela que já existe hoje.
const GroupHubPage: React.FC<GroupHubPageProps> = ({ group, items, onNavigate }) => {
  return (
    <section className="max-w-5xl mx-auto px-4 md:px-6 py-8 animate-in fade-in duration-500">
      <p className="text-red-600 text-[11px] font-black uppercase tracking-[0.12em] mb-1.5">Macro-rotina</p>
      <h2 className="text-slate-900 text-2xl md:text-3xl font-black tracking-tight mb-2">{group.label}</h2>
      <p className="text-slate-500 font-medium text-sm max-w-2xl mb-8">{group.description}</p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-bold text-slate-500">Nenhuma rotina deste grupo está liberada para o seu usuário.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition-all flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-black text-slate-900 text-sm">{item.label}</span>
                <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              {item.description && (
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">{item.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default GroupHubPage;
