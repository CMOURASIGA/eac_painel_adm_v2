
import React, { useState } from 'react';
import { User, View } from '../types';
import { STANDALONE_ITEMS, NAVIGATION_GROUPS, canAccessView, visibleGroupItems } from '../utils/navigationRoadmap.ts';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onNavigate: (view: View) => void;
  currentView: View;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onNavigate, currentView }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const isAdmin = user.role === 'ADMIN';
  const allowed = user.permissions?.allowedModules || [];

  const visibleStandalone = STANDALONE_ITEMS.filter((item) => item.enabled && canAccessView(item.view, isAdmin, allowed));
  const visibleGroups = NAVIGATION_GROUPS
    .map((group) => ({ group, items: visibleGroupItems(group, isAdmin, allowed) }))
    .filter(({ items }) => items.length > 0);

  const handleNavigate = (view: View) => {
    onNavigate(view);
    setIsMobileMenuOpen(false);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleGroupHeaderClick = (groupId: string, hubView: View) => {
    setExpandedGroups((prev) => new Set(prev).add(groupId));
    handleNavigate(hubView);
  };

  const currentTitle = (() => {
    // Telas que não têm item de menu próprio (ex.: Distribuição de Círculos,
    // que só abre a partir de dentro de Inscrições Prioritárias) ainda
    // precisam de um título no cabeçalho.
    if (currentView === 'inscricoes_prioritarias_circulos') return 'Distribuição de Círculos';
    const standalone = visibleStandalone.find((item) => item.view === currentView);
    if (standalone) return standalone.label;
    for (const { group, items } of visibleGroups) {
      if (group.hubView === currentView) return group.label;
      const leaf = items.find((item) => item.view === currentView);
      if (leaf) return leaf.label;
    }
    return 'EAC';
  })();

  const LOGO_URL = "https://i.imgur.com/c5XQ7TW.png";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-[72px] bg-[#073b68] text-white flex items-center justify-between px-4 md:px-6 z-50 shadow-lg shadow-slate-950/15">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <button aria-label="Abrir menu" onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 hover:bg-white/10 rounded-xl transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </button>
          <button aria-label="Ir para o início" className="bg-white p-1.5 rounded-xl shadow-sm flex items-center justify-center overflow-hidden" onClick={() => onNavigate('dashboard')}>
            <img src={LOGO_URL} alt="Logo EAC" className="w-7 h-7 object-contain" />
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] font-semibold text-blue-200">Painel operacional</span>
            <h1 className="truncate text-sm md:text-base font-bold tracking-tight">{currentTitle}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs md:text-sm font-semibold leading-none mb-1 truncate max-w-[140px]">{user.name}</p>
            <p className={`text-[10px] font-semibold ${user.role === 'ADMIN' ? 'text-amber-300' : 'text-blue-200'}`}>{user.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</p>
          </div>
          <button onClick={onLogout} className="bg-white/10 hover:bg-rose-500 border border-white/20 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold transition-colors">Sair</button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="absolute top-0 left-0 bottom-0 w-[min(340px,88vw)] bg-white shadow-2xl flex flex-col">
            <div className="p-6 bg-[#073b68] text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white p-1.5 rounded-xl"><img src={LOGO_URL} alt="EAC" className="w-6 h-6 object-contain" /></div>
                <div><h2 className="font-bold text-lg">EAC</h2><p className="text-xs text-blue-200">Menu do sistema</p></div>
              </div>
              <button aria-label="Fechar menu" onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <nav aria-label="Menu principal" className="flex-grow p-4 space-y-1 overflow-y-auto">
              {visibleStandalone.map((item) => (
                <button key={item.view} onClick={() => handleNavigate(item.view)} className={`w-full flex items-center space-x-3 p-3.5 rounded-xl font-semibold text-sm transition-colors ${currentView === item.view ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <div className={`w-2 h-2 rounded-full ${currentView === item.view ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                  <span>{item.label}</span>
                </button>
              ))}

              <div className="h-px bg-slate-100 my-2" />

              {visibleGroups.map(({ group, items }) => {
                const isOpen = expandedGroups.has(group.id);
                const isActiveGroup = currentView === group.hubView || items.some((item) => item.view === currentView);
                return (
                  <div key={group.id} className="space-y-0.5">
                    <div className={`w-full flex items-center rounded-xl font-semibold text-sm transition-colors ${isActiveGroup ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <button onClick={() => handleGroupHeaderClick(group.id, group.hubView)} className="flex-1 flex items-center space-x-3 p-3.5 text-left min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isActiveGroup ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                        <span className="truncate">{group.label}</span>
                        <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                      </button>
                      <button
                        aria-label={isOpen ? `Recolher ${group.label}` : `Expandir ${group.label}`}
                        onClick={() => toggleGroup(group.id)}
                        className="p-3.5 pl-2"
                      >
                        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="pl-4 space-y-0.5">
                        {items.map((item) => (
                          <button key={item.view} onClick={() => handleNavigate(item.view)} className={`w-full flex items-center space-x-3 p-3 pl-4 rounded-xl font-semibold text-[13px] transition-colors ${currentView === item.view ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${currentView === item.view ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
