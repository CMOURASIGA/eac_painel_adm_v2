
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarEvent, User, SystemSettings } from '../types.ts';
import Badge from './Badge.tsx';
import { showAppConfirm } from '../utils/appDialog.ts';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';
import DataOriginAudit from './DataOriginAudit.tsx';

interface CalendarPageProps {
  googleWebAppUrl: string;
  user: User;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const getEventTypeColor = (type: string) => {
  const t = toCleanString(type).toLowerCase();
  if (t.includes('missa')) return 'bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.3)]';        
  if (t.includes('preparação')) return 'bg-[#dc2626] shadow-[0_0_10px_rgba(220,38,38,0.3)]';   
  if (t.includes('cantina')) return 'bg-[#0ea5e9] shadow-[0_0_10px_rgba(14,165,233,0.3)]';      
  if (t.includes('encontro')) return 'bg-[#2563eb] shadow-[0_0_10px_rgba(37,99,235,0.3)]';     
  if (t.includes('pós')) return 'bg-[#f59e0b] shadow-[0_0_10px_rgba(245,158,11,0.3)]';          
  if (t.includes('círculo')) return 'bg-[#6366f1] shadow-[0_0_10px_rgba(99,102,241,0.3)]';      
  return 'bg-[#64748b]';                                 
};

const normalizeStatus = (value: any) => {
  const raw = toCleanString(value).toLowerCase().replace(/_/g, ' ').trim();
  if (!raw) return '';
  if (raw.includes('confirm')) return 'Confirmado';
  if (raw.includes('agend')) return 'Agendado';
  if (raw.includes('a confirmar') || raw === 'aconfirmar') return 'A confirmar';
  if (raw.includes('cancel')) return 'Cancelado';
  return toCleanString(value);
};

const isSheetManagedEvent = (ev: CalendarEvent | null | undefined) => {
  const origin = toCleanString((ev as any)?.origem_dado || (ev as any)?.origemDado).toUpperCase();
  return origin === 'PLANILHA';
};

export default function CalendarPage({ googleWebAppUrl, user }: CalendarPageProps) {
  const [internalEvents, setInternalEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [tipoFilter, setTipoFilter] = useState<string>('Todos');
  
  const canCreate = user.role === 'ADMIN' || user.permissions.canCreate;
  const canEdit = user.role === 'ADMIN' || user.permissions.canEdit;
  const canDelete = user.role === 'ADMIN' || user.permissions.canDelete;

  const [formData, setFormData] = useState<CalendarEvent>({
    atividade: '', tipo: 'Encontro', inicio: '', termino: '', local: '', proprietario: '', status: 'Confirmado', encontroId: ''
  });
  const bootstrapAttemptedRef = useRef(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const importCalendarFromSource = useCallback(async () => {
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'IMPORT_CALENDAR_2026_EXTERNOS', googleWebAppUrl })
      });
      const data = sanitizeTextDeep(await response.json());
      return data;
    } catch (e) {
      console.error('Erro ao importar calendário:', e);
      return { success: false };
    }
  }, [googleWebAppUrl]);

  const fetchInternalEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_EVENTS', googleWebAppUrl })
      });
      const data = sanitizeTextDeep(await response.json());
      const events = data.success && Array.isArray(data.events) ? data.events : [];
      setInternalEvents(events);

      if (events.length === 0 && !bootstrapAttemptedRef.current) {
        bootstrapAttemptedRef.current = true;
        const syncRes = await importCalendarFromSource();
        if (syncRes?.success) {
          const retry = await fetch('/api/comunicados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'GET_EVENTS', googleWebAppUrl })
          });
          const retryData = sanitizeTextDeep(await retry.json());
          if (retryData.success && Array.isArray(retryData.events)) {
            setInternalEvents(retryData.events);
          }
        }
      }
    } catch (e) { console.error('Erro:', e); }
    finally { setIsLoading(false); }
  }, [googleWebAppUrl, importCalendarFromSource]);

  useEffect(() => {
    fetchInternalEvents();
  }, [fetchInternalEvents, currentDate]);

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(year, month + offset, 1));
    setSelectedDay(1);
  };

  const getEventDateParts = (dateVal: any) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  };

  const activeEvents = useMemo(() => {
    return internalEvents.filter(ev => {
      const parts = getEventDateParts(ev.inicio);
      if (!parts || parts.y !== year || parts.m !== month) return false;
      const statusOk = statusFilter === 'Todos' || normalizeStatus(ev.status) === statusFilter;
      const tipoOk = tipoFilter === 'Todos' || toCleanString(ev.tipo) === tipoFilter;
      return statusOk && tipoOk;
    });
  }, [internalEvents, year, month, statusFilter, tipoFilter]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>(['Confirmado', 'Agendado', 'A confirmar']);
    internalEvents.forEach((ev) => {
      const v = normalizeStatus(ev.status);
      if (v) set.add(v);
    });
    return ['Todos', ...Array.from(set)];
  }, [internalEvents]);

  const availableTipos = useMemo(() => {
    const set = new Set<string>();
    internalEvents.forEach((ev) => {
      const v = toCleanString(ev.tipo);
      if (v) set.add(v);
    });
    return ['Todos', ...Array.from(set)];
  }, [internalEvents]);

  const selectedDayEvents = useMemo(() => {
    return activeEvents.filter(ev => getEventDateParts(ev.inicio)?.d === selectedDay);
  }, [activeEvents, selectedDay]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_EVENT', data: formData, googleWebAppUrl })
      });
      const result = sanitizeTextDeep(await response.json());
      if (result.success) { 
        setIsModalOpen(false); 
        fetchInternalEvents(); 
      }
    } catch (e) {} finally { setIsLoading(false); }
  };

  const handleDeleteEvent = async (ev: CalendarEvent) => {
    if (isSheetManagedEvent(ev)) {
      alert('Este evento veio da planilha. Exclua ou edite a linha na planilha; o sincronismo automático atualiza o painel.');
      return;
    }

    const confirmed = await showAppConfirm({
      title: 'Excluir evento',
      message: `Confirma a exclusão do evento "${toCleanString(ev.atividade) || 'Sem título'}"?`,
      tone: 'warning',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });

    if (!confirmed) return;

    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_EVENT', data: { id: ev.id }, googleWebAppUrl })
      });
      const data = sanitizeTextDeep(await response.json());
      if (!data?.success) {
        alert(data?.error || 'Não foi possível excluir o evento.');
        return;
      }
      fetchInternalEvents();
    } catch (err) {
      alert('Erro ao excluir evento.');
    }
  };

  const handleImportExternos2026 = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await importCalendarFromSource();
      if (!data?.success) {
        alert(data?.error || 'Não foi possível sincronizar o calendário.');
        return;
      }
      alert(data?.message || 'Importação concluída.');
      fetchInternalEvents();
    } catch (e) {
      alert('Erro ao sincronizar calendário.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchInternalEvents, importCalendarFromSource]);

  const renderCalendar = () => {
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(<div key={`empty-${i}`} className="h-16 md:h-32 border border-slate-50 bg-slate-50/20"></div>);
    for (let day = 1; day <= totalDays; day++) {
      const dayEvs = activeEvents.filter(ev => getEventDateParts(ev.inicio)?.d === day);
      const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
      days.push(
        <div key={day} onClick={() => setSelectedDay(day)} className={`h-16 md:h-32 border border-slate-100 p-2 transition-all cursor-pointer relative ${selectedDay === day ? 'bg-blue-50/50 ring-2 ring-blue-500 z-10' : 'hover:bg-slate-50'}`}>
          <span className={`text-[10px] md:text-xs font-black flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>{day}</span>
          <div className="hidden md:block mt-2 space-y-1">
                {dayEvs.slice(0, 3).map((ev, idx) => (
              <div key={idx} className={`text-[8px] p-1.5 rounded-lg font-black truncate text-white shadow-sm transition-transform hover:scale-105 ${getEventTypeColor(ev.tipo)}`}>
                {toCleanString(ev.atividade)}
              </div>
            ))}
            {dayEvs.length > 3 && (
              <div className="text-[7px] font-black text-slate-400 text-center uppercase tracking-widest">+{dayEvs.length - 3} itens</div>
            )}
          </div>
          {dayEvs.length > 0 && (
            <div className="md:hidden absolute bottom-1 right-1 flex space-x-0.5">
               {dayEvs.slice(0, 3).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-blue-600"></div>)}
            </div>
          )}
        </div>
      );
    }
    return days;
  };

  return (
    <div className="p-4 md:p-8 max-w-[100rem] mx-auto animate-in fade-in duration-500 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">Calendário EAC</h2>
          <p className="text-slate-500 font-medium italic text-xs md:text-sm mt-3">Gestão de Agenda Oficial e Eventos Confirmados.</p>
        </div>
        <div className="flex gap-3">
          <button 
             onClick={handleImportExternos2026}
             className="px-6 py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all text-[10px] uppercase tracking-widest"
          >
            Sincronizar
          </button>
          <button 
             onClick={handleImportExternos2026}
             className="px-6 py-4 bg-white border-2 border-amber-200 rounded-2xl font-black text-amber-700 hover:bg-amber-50 shadow-sm transition-all text-[10px] uppercase tracking-widest"
          >
            Importar Externos 2026
          </button>
          {canCreate && (
            <button 
              onClick={() => {
                setFormData({
                  atividade: '', tipo: 'Encontro', inicio: `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}T19:00`,
                  termino: `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}T21:00`,
                  local: 'Salão Paroquial', proprietario: user.name, status: 'Confirmado', encontroId: ''
                });
                setIsModalOpen(true);
              }}
              className="px-8 py-4 blue-gradient text-white rounded-2xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all text-[10px] uppercase tracking-widest"
            >
              + NOVO EVENTO
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white px-8 py-6 rounded-t-[2.5rem] border border-slate-200 border-b-0">
        <button onClick={() => changeMonth(-1)} className="p-3 bg-slate-50 rounded-xl hover:text-blue-600 transition-all border border-slate-100 text-slate-400 group">
          <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="text-center">
          <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">{MONTH_NAMES[month]} <span className="text-blue-600 ml-1">{year}</span></h3>
          <div className="flex items-center justify-center gap-1.5 mt-2">
             <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{isLoading ? 'Sincronizando Base...' : 'Protocolo Cloud Ativo'}</span>
          </div>
        </div>
        <button onClick={() => changeMonth(1)} className="p-3 bg-slate-50 rounded-xl hover:text-blue-600 transition-all border border-slate-100 text-slate-400 group">
          <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      <div className="bg-white px-8 pb-6 border border-slate-200 border-t-0 border-b-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtro por Status</label>
            <select
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {availableStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtro por Tipo</label>
            <select
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-xs"
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
            >
              {availableTipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-grow bg-white rounded-b-[2.5rem] border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/5">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-900">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="py-5 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">{renderCalendar()}</div>
        </div>

        <div className="w-full lg:w-[400px] space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm min-h-[500px] flex flex-col">
            <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
               <div className="bg-blue-100 text-blue-700 w-14 h-14 rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-inner shadow-blue-200/50">
                 {selectedDay}
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Atividades para o dia</p>
                 <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{MONTH_NAMES[month]} / {year}</p>
               </div>
            </div>
            
            <div className="space-y-4 flex-grow overflow-y-auto max-h-[600px] pr-2 scrollbar-hide">
             {selectedDayEvents.length === 0 ? (
                <div className="text-center py-24 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">
                   <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.3em] italic">Agenda Livre</p>
                </div>
              ) : selectedDayEvents.map((ev, i) => (
                  <div key={i} className={`p-6 rounded-[2rem] border transition-all hover:shadow-xl flex flex-col gap-4 bg-slate-50/30 group relative overflow-hidden`}>
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${getEventTypeColor(ev.tipo)}`}></div>
                    <div className="flex justify-between items-start">
                      <div className={`px-4 py-1.5 rounded-full text-[9px] font-black text-white uppercase tracking-widest shadow-sm ${getEventTypeColor(ev.tipo)}`}>
                        {toCleanString(ev.tipo)}
                      </div>
                      <div className="flex gap-2">
                         {canEdit && (
                           <button
                             onClick={() => {
                               if (isSheetManagedEvent(ev)) {
                                 alert('Este evento veio da planilha. Edite a linha na planilha para que a alteração permaneça após o sincronismo.');
                                 return;
                               }
                               setFormData({ ...ev });
                               setIsModalOpen(true);
                             }}
                             className={`p-2 rounded-xl transition-all shadow-sm ${isSheetManagedEvent(ev) ? 'text-slate-300 cursor-not-allowed' : 'text-blue-600 hover:bg-white'}`}
                             title={isSheetManagedEvent(ev) ? 'Editar na planilha de origem' : 'Editar evento'}
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="3"/></svg>
                           </button>
                         )}
                         {canDelete && (
                           <button 
                             onClick={() => { void handleDeleteEvent(ev); }}
                             className={`p-2 rounded-xl transition-all shadow-sm ${isSheetManagedEvent(ev) ? 'text-slate-300 cursor-not-allowed' : 'text-red-500 hover:bg-white'}`}
                             title={isSheetManagedEvent(ev) ? 'Excluir na planilha de origem' : 'Excluir evento'}
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="3"/></svg>
                           </button>
                         )}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-base leading-tight uppercase tracking-tight mb-2">{toCleanString(ev.atividade)}</h4>
                      <div className="flex items-center text-slate-400 gap-4">
                         <p className="text-[10px] font-bold flex items-center gap-1.5"><span className="opacity-50">📍</span> {toCleanString(ev.local) || 'Paróquia'}</p>
                         <p className="text-[10px] font-bold flex items-center gap-1.5"><span className="opacity-50">ðŸ•’</span> {new Date(ev.inicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                         {toCleanString(ev.encontroId) && (
                           <p className="text-[10px] font-bold flex items-center gap-1.5"><span className="opacity-50">#</span> {toCleanString(ev.encontroId)}</p>
                         )}
                      </div>
                      {isSheetManagedEvent(ev) && (
                        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-600">
                          Gerenciado pela planilha
                        </p>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Base de Dados EAC</span>
               <span className="text-[10px] font-black text-blue-600">{activeEvents.length} Atividades no Mês</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Simplificado para Cadastro */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <form onSubmit={handleSave}>
              <div className="blue-gradient p-8 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Registro de Evento</h3>
                  <p className="text-blue-100 text-[9px] uppercase tracking-widest font-bold opacity-70 mt-1">Sincronização Cloud EAC</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Atividade</label>
                  <input required className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" value={formData.atividade} onChange={e => setFormData({...formData, atividade: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                    <select className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                      {['Encontro', 'Missa', 'Preparação', 'Cantina', 'Pós-EAC', 'Círculo', 'Reunião', 'Outro'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                    <select className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                      {['Confirmado', 'Agendado', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                    <input type="datetime-local" required className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 text-sm" value={formData.inicio} onChange={e => setFormData({...formData, inicio: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Término</label>
                    <input type="datetime-local" required className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 text-sm" value={formData.termino} onChange={e => setFormData({...formData, termino: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Local</label>
                  <input className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 text-sm" value={formData.local} onChange={e => setFormData({...formData, local: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID do Encontro (opcional)</label>
                  <input
                    placeholder="Ex.: EAC-2026-01"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 text-sm"
                    value={formData.encontroId || ''}
                    onChange={e => setFormData({ ...formData, encontroId: e.target.value })}
                  />
                </div>

                <DataOriginAudit record={formData} />
              </div>
              <div className="px-8 py-8 bg-slate-50 border-t flex flex-col md:flex-row gap-3">
                <button type="submit" className="w-full blue-gradient text-white px-10 py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]">GRAVAR NA NUVEM</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

