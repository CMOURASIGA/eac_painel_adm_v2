
import React, { useState } from 'react';
import { User, View } from '../types';
import { NAVIGATION_ROADMAP } from '../utils/navigationRoadmap.ts';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onNavigate: (view: View) => void;
  currentView: View;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onNavigate, currentView }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems: { label: string, view: View }[] = NAVIGATION_ROADMAP
    .filter((item) => item.enabled)
    .map((item) => ({ label: item.label, view: item.view }));

  const filteredNav = navItems.filter(item => {
    if (user.role === 'ADMIN') return true;
    const allowed = user.permissions?.allowedModules || [];
    if (item.view === 'dashboard') return true;
    if (item.view === 'members') return allowed.includes('members');
    if (item.view === 'inscricoes_prioritarias') return allowed.includes('inscricoes_prioritarias');
    if (item.view === 'visitacao') return allowed.includes('visitacao');
    if (item.view === 'inscricoes_review') return allowed.includes('inscricoes_review');
    if (item.view === 'encontreiros') return allowed.includes('encontreiros');
    if (item.view === 'presence') return allowed.includes('presence');
    if (item.view === 'dispatches') return allowed.includes('dispatches');
    if (item.view === 'calendar') return allowed.includes('calendar');
    if (item.view === 'comunicados') return allowed.includes('comunicados');
    if (item.view === 'logs') return allowed.includes('logs');
    if (item.view === 'users') return allowed.includes('users');
    if (item.view === 'settings') return allowed.includes('settings');
    if (item.view === 'help') return allowed.includes('help');
    return false;
  });

  const handleNavigate = (view: View) => {
    onNavigate(view);
    setIsMobileMenuOpen(false);
  };

  const currentItem = filteredNav.find((item) => item.view === currentView);

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
            <h1 className="truncate text-sm md:text-base font-bold tracking-tight">{currentItem?.label || 'EAC'}</h1>
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
              {filteredNav.map((item) => (
                <button key={item.view} onClick={() => handleNavigate(item.view)} className={`w-full flex items-center space-x-3 p-3.5 rounded-xl font-semibold text-sm transition-colors ${currentView === item.view ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <div className={`w-2 h-2 rounded-full ${currentView === item.view ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                  <span>{item.label.trimStart()}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
