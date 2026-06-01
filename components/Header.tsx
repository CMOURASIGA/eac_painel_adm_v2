
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

  const LOGO_URL = "https://i.imgur.com/c5XQ7TW.png";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#1e3a8a] text-white flex items-center justify-between px-4 md:px-6 z-50 shadow-md">
        <div className="flex items-center space-x-3 md:space-x-4">
          <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </button>
          <div className="bg-white p-1 rounded shadow-sm flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => onNavigate('dashboard')}>
            <img src={LOGO_URL} alt="EAC Logo" className="w-6 h-6 md:w-8 md:h-8 object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm md:text-lg font-black leading-none tracking-tight">EAC</h1>
            <p className="text-[8px] md:text-[10px] uppercase tracking-wider text-blue-200 font-bold">Painel Operacional</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center space-x-2 lg:space-x-4 text-sm font-medium h-full overflow-hidden">
          {filteredNav.map((item) => (
            <button key={item.view} onClick={() => handleNavigate(item.view)} className={`hover:text-blue-200 transition-colors py-5 border-b-2 h-full uppercase tracking-widest text-[8px] lg:text-[10px] font-black whitespace-nowrap ${currentView === item.view ? 'text-white border-white' : 'text-blue-100 border-transparent'}`}>
              {item.label.trimStart()}
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs md:text-sm font-black leading-none mb-1 truncate max-w-[100px]">{user.name}</p>
            <p className={`text-[8px] md:text-[9px] uppercase tracking-widest font-black ${user.role === 'ADMIN' ? 'text-amber-400' : 'text-blue-200'}`}>{user.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</p>
          </div>
          <button onClick={onLogout} className="bg-red-500/20 hover:bg-red-600 border border-red-500/30 md:px-4 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all">Sair</button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="absolute top-0 left-0 bottom-0 w-[280px] bg-white shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
            <div className="p-6 bg-[#1e3a8a] text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white p-1.5 rounded-xl"><img src={LOGO_URL} alt="EAC" className="w-6 h-6 object-contain" /></div>
                <h2 className="font-black text-lg">EAC PANEL</h2>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
              {filteredNav.map((item) => (
                <button key={item.view} onClick={() => handleNavigate(item.view)} className={`w-full flex items-center space-x-4 p-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${currentView === item.view ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
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


