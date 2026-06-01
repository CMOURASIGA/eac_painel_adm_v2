
import React from 'react';
import { Log, View, User, Comunicado, CalendarEvent } from '../types.ts';
import StatCard from './StatCard.tsx';
import Banner from './Banner.tsx';
import { toCleanString } from '../utils/textEncoding.ts';

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
  dashboardInsights: {
    encontreirosCount: number;
    triagemStatusCounts: { inscrito: number; priorizado: number; confirmado: number };
    ageDistributionByStatus: Record<string, Record<string, number>>;
    monthlyInscricoesCurrentYear: Array<{ mes: string; mesIndex: number; total: number }>;
  };
  onNavigate: (view: View) => void;
  lastSync?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  user, logs, calendarEvents, comunicados, membersCount, nonEnrolledCount, nonEnrolledPreConfirmadasCount, nonEnrolledInteresseCount, nonEnrolledInteresseNoCount, dashboardInsights, onNavigate, lastSync, onRefresh, isLoading 
}) => {
  const isAdmin = user.role === 'ADMIN';
  const canDispatch = isAdmin || user.permissions.allowedModules.includes('dispatches');
  const canSeeCalendar = isAdmin || user.permissions.allowedModules.includes('calendar');
  const canSeeComunicados = isAdmin || user.permissions.allowedModules.includes('comunicados');

  const qtdEventos = calendarEvents.length;
  const triagem = dashboardInsights?.triagemStatusCounts || { inscrito: 0, priorizado: 0, confirmado: 0 };
  const ageMapInscrito = dashboardInsights?.ageDistributionByStatus?.INSCRITO || {};
  const ageMapPriorizado = dashboardInsights?.ageDistributionByStatus?.PRIORIZADO || {};
  const ageMapConfirmado = dashboardInsights?.ageDistributionByStatus?.CONFIRMADO || {};
  const ageLabels = Array.from(
    new Set([
      ...Object.keys(ageMapInscrito || {}),
      ...Object.keys(ageMapPriorizado || {}),
      ...Object.keys(ageMapConfirmado || {}),
    ])
  )
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((n) => String(n));
  const ageRows = ageLabels.map((age) => ({
    age,
    inscrito: Number(ageMapInscrito?.[age] || 0),
    priorizado: Number(ageMapPriorizado?.[age] || 0),
    confirmado: Number(ageMapConfirmado?.[age] || 0),
  }));
  const maxAgeCount = Math.max(1, ...ageRows.map((r) => Math.max(r.inscrito, r.priorizado, r.confirmado)));
  const monthly = Array.isArray(dashboardInsights?.monthlyInscricoesCurrentYear) ? dashboardInsights.monthlyInscricoesCurrentYear : [];
  const maxMonthly = Math.max(1, ...monthly.map((m) => Number(m.total) || 0));

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
      <div className={`grid grid-cols-2 gap-4 ${isAdmin ? 'md:grid-cols-3 lg:grid-cols-6' : 'md:grid-cols-3 lg:grid-cols-6'}`}>
        <StatCard title="Inscritos (Triagem)" value={String(triagem.inscrito || 0)} color="blue" />
        <StatCard title="Priorizados" value={String(triagem.priorizado || 0)} color="indigo" />
        <StatCard title="Confirmados" value={String(triagem.confirmado || 0)} color="green" />
        <StatCard title="Encontreiros" value={String(dashboardInsights?.encontreirosCount || 0)} color="gray" />
        <StatCard title="Cadastro de Encontrista" value={membersCount.toString()} color="blue" />
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Idade por Status da Triagem</h3>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" />Inscrito</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />Priorizado</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />Confirmado</span>
            </div>
          </div>
          {ageRows.length === 0 ? (
            <p className="text-sm text-slate-500 font-semibold">Sem dados de idade para os status analisados.</p>
          ) : (
            <div className="space-y-3">
              {ageRows.map((row) => (
                <div key={row.age} className="grid grid-cols-[46px_1fr] gap-3 items-center">
                  <div className="text-xs font-black text-slate-600">{row.age} anos</div>
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-blue-100 overflow-hidden" title={`${row.age} anos - Inscrito: ${row.inscrito}`}>
                      <div className="h-full bg-blue-600" style={{ width: `${(row.inscrito / maxAgeCount) * 100}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-indigo-100 overflow-hidden" title={`${row.age} anos - Priorizado: ${row.priorizado}`}>
                      <div className="h-full bg-indigo-600" style={{ width: `${(row.priorizado / maxAgeCount) * 100}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-emerald-100 overflow-hidden" title={`${row.age} anos - Confirmado: ${row.confirmado}`}>
                      <div className="h-full bg-emerald-600" style={{ width: `${(row.confirmado / maxAgeCount) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Inscrições por Mês (Ano Atual)</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Até o mês atual</span>
          </div>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-500 font-semibold">Sem inscrições registradas no ano atual.</p>
          ) : (
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2 items-end min-h-[180px]">
              {monthly.map((item) => (
                <div key={item.mesIndex} className="flex flex-col items-center gap-2">
                  <div className="w-full h-28 bg-slate-100 rounded-xl flex items-end overflow-hidden" title={`${item.mes}: ${item.total} inscrições`}>
                    <div className="w-full bg-blue-600 rounded-xl" style={{ height: `${(Number(item.total || 0) / maxMonthly) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase">{item.mes}</span>
                  <span className="text-[10px] font-black text-slate-700">{item.total}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
              <span className="text-slate-400 font-bold text-[10px] uppercase">Supabase Sync</span>
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
