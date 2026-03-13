
import React from 'react';
import { Log, View, LogStatus, User, Comunicado, CalendarEvent } from '../types.ts';
import StatCard from './StatCard.tsx';
import Banner from './Banner.tsx';

const fixMojibake = (s: string) => {
  if (typeof TextDecoder === 'undefined') return s;
  const hasMarkers = s && (s.includes('Ã') || s.includes('Â') || s.includes('�') || s.includes('ï¿½'));
  if (!hasMarkers) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return s;
  }
};

const toCleanString = (v: any) => {
  const base = (v ?? '').toString().trim();
  return fixMojibake(base);
};

interface DashboardProps {
  user: User;
  logs: Log[];
  calendarEvents: CalendarEvent[];
  comunicados: Comunicado[];
  membersCount: number;
  nonEnrolledCount: number;
  nonEnrolledPreConfirmadasCount: number;
  nonEnrolledInteresseCount: number;
  nonEnrolledInteresseNoCount: number;
  onNavigate: (view: View) => void;
  lastSync?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  user, logs, calendarEvents, comunicados, membersCount, nonEnrolledCount, nonEnrolledPreConfirmadasCount, nonEnrolledInteresseCount, nonEnrolledInteresseNoCount, onNavigate, lastSync, onRefresh, isLoading 
}) => {
  const isAdmin = user.role === 'ADMIN';
  const canDispatch = isAdmin || user.permissions.allowedModules.includes('dispatches');
  const canSeeCalendar = isAdmin || user.permissions.allowedModules.includes('calendar');
  const canSeeComunicados = isAdmin || user.permissions.allowedModules.includes('comunicados');
  const canSeeLogs = isAdmin || user.permissions.allowedModules.includes('logs');

  const qtdEventos = calendarEvents.length;

  const bannerTitle = canDispatch ? "Painel de Operações EAC" : "Portal de Consulta EAC";
  const bannerSubtitle = canDispatch 
    ? "Central de execução massiva com auditoria e controle de disparos em tempo real."
    : "Bem-vindo ao portal de informações do EAC. Consulte a agenda oficial e a base de comunicados ativos.";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {isLoading ? 'Sincronizando...' : `Dados atualizados: ${lastSync || '--:--'}`}
          </span>
        </div>
        <button 
          onClick={onRefresh} 
          disabled={isLoading}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors active:rotate-180 duration-500"
          title="Recarregar Dados"
        >
          <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <Banner 
        title={bannerTitle} 
        subtitle={bannerSubtitle}
        onPrimaryAction={isAdmin ? (() => canDispatch ? onNavigate('dispatches') : (canSeeCalendar ? onNavigate('calendar') : onNavigate('help'))) : undefined}
        onSecondaryAction={isAdmin ? (() => canDispatch ? onNavigate('logs') : (canSeeComunicados ? onNavigate('comunicados') : undefined)) : undefined}
        primaryLabel={isAdmin ? (canDispatch ? "INICIAR DISPARO" : "VER AGENDA") : undefined}
        secondaryLabel={isAdmin ? (canDispatch ? "AUDITORIA COMPLETA" : "COMUNICADOS") : undefined}
      />

      {/* Grid de Indicadores Estratégicos */}
      <div className={`grid grid-cols-2 gap-4 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-6'}`}>
        <StatCard title="Cadastro Oficial" value={membersCount.toString()} color="blue" />
        <StatCard title="Não Inscritos" value={nonEnrolledCount.toString()} color="red" />
        <StatCard title="Agenda Ativa" value={qtdEventos.toString()} color="indigo" />
        {!isAdmin && (
          <>
            <StatCard title="Inscrições Novas Pré Confirmadas" value={nonEnrolledPreConfirmadasCount.toString()} color="indigo" />
            <StatCard title="Confirmaram Interesse" value={nonEnrolledInteresseCount.toString()} color="green" note='Inclui "Inscrições Pré Confirmadas".' />
            <StatCard title="Não Confirmaram Interesse" value={nonEnrolledInteresseNoCount.toString()} color="gray" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {canDispatch && canSeeLogs ? (
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Execuções Recentes</h3>
                <button onClick={() => onNavigate('logs')} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Ver tudo →</button>
              </div>
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 font-bold italic text-sm">Aguardando novos registros...</p>
                ) : (
                  logs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white transition-all">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className={`flex-shrink-0 w-2 h-2 rounded-full ${log.status === LogStatus.SUCCESS ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                        <div className="truncate">
                    <p className="font-bold text-slate-800 text-xs md:text-sm truncate">{toCleanString(log.dispatchName)}</p>
                    <p className="text-[9px] text-slate-400 font-black uppercase truncate">{toCleanString(log.operator)} • {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-slate-300 ml-2">{log.duration}ms</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Próximos Eventos</h3>
                <button onClick={() => onNavigate('calendar')} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Agenda Completa →</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {calendarEvents.slice(0, 4).map((ev, i) => (
                  <div key={i} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer" onClick={() => onNavigate('calendar')}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-widest">{toCleanString(ev.tipo)}</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase">{new Date(ev.inicio).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</span>
                    </div>
                    <p className="font-black text-slate-900 text-sm truncate">{toCleanString(ev.atividade)}</p>
                    <p className="text-[10px] text-slate-500 font-medium truncate mt-1">📍 {toCleanString(ev.local)}</p>
                  </div>
                ))}
                {calendarEvents.length === 0 && <p className="col-span-2 text-center py-10 text-slate-400 font-bold italic">Nenhum evento futuro listado.</p>}
              </div>
            </div>
          )}

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Comunicados</h3>
              <button onClick={() => onNavigate('comunicados')} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Gerenciar →</button>
            </div>
            <div className="space-y-3">
              {comunicados.slice(0, 3).map(com => (
                <div key={com.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white transition-all cursor-pointer" onClick={() => onNavigate('comunicados')}>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs">#{toCleanString(com.id)}</div>
                    <p className="font-bold text-slate-800 text-xs md:text-sm">{toCleanString(com.titulo)}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{toCleanString(com.assunto)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="blue-gradient rounded-[2.5rem] shadow-xl p-8 text-white relative overflow-hidden group min-h-[350px] flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-black mb-6 uppercase tracking-tight">Protocolo EAC</h3>
              <p className="text-blue-100 text-sm mb-8 leading-relaxed font-medium opacity-90">
                Lembre-se: Disparos são processados em tempo real na nuvem. A auditoria registra sua identidade e o IP da requisição para segurança da comunidade.
              </p>
            </div>
            <button onClick={() => onNavigate('help')} className="w-full bg-white text-blue-900 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-50 transition-all shadow-lg active:scale-95">Manual do Operador</button>
          </div>

          <div className="bg-slate-900 rounded-[2rem] p-6 text-white border border-slate-800">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Sincronização de Dados</h4>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400 font-bold text-[10px] uppercase">Proxy Vercel</span>
              <span className="flex items-center text-green-400 font-black uppercase text-[10px] tracking-widest">
                CONECTADO
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-bold text-[10px] uppercase">G-Sheets Sync</span>
              <span className="flex items-center text-blue-400 font-black uppercase text-[10px] tracking-widest">
                {isLoading ? 'SYNC...' : 'OK'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
