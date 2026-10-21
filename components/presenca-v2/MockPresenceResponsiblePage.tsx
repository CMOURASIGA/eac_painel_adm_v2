import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';
import QrDisplay from './QrDisplay.tsx';
import Toast from '../Toast.tsx';

type Session = {
  id: string;
  title: string;
  status: 'AGENDADA' | 'ABERTA' | 'ENCERRADA';
  eligibleCount: number;
  confirmedCount: number;
  pendingCount: number;
  publicToken: string;
  openedAt?: string | null;
  closedAt?: string | null;
  scheduledAt?: string | null;
  closeScheduledAt?: string | null;
  responsibleReopens?: number;
};

const call = async (action: string, data: any = {}) => {
  const result = await postComunicadosAction<any>(action, data);
  if (!result.success) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result.data as any;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Horário não registrado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário não registrado';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const PresenceResponsiblePage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [responsibleLabel, setResponsibleLabel] = useState('');
  const [responsibleKind, setResponsibleKind] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [editingSessionId, setEditingSessionId] = useState('');
  const [editingScheduledAt, setEditingScheduledAt] = useState('');
  const [, setClock] = useState(0);
  const [attendanceSessionId, setAttendanceSessionId] = useState('');
  const [attendancePeople, setAttendancePeople] = useState<any[]>([]);
  const [attendanceSelected, setAttendanceSelected] = useState<string[]>([]);
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'TODOS'|'PRESENTES'|'AUSENTES'>('TODOS');
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenancePeople, setMaintenancePeople] = useState<any[]>([]);
  const [maintenanceCircles, setMaintenanceCircles] = useState<any[]>([]);
  const [maintenanceSearch, setMaintenanceSearch] = useState('');
  const [maintenanceSelected, setMaintenanceSelected] = useState<any | null>(null);
  const [maintenanceTargetCircleId, setMaintenanceTargetCircleId] = useState('');
  const [maintenancePreview, setMaintenancePreview] = useState<any | null>(null);
  const [operationalPeople, setOperationalPeople] = useState<any[]>([]);
  const [operationalSearch, setOperationalSearch] = useState('');
  const [operationalSelected, setOperationalSelected] = useState<any | null>(null);
  const [operationalTargetCircleId, setOperationalTargetCircleId] = useState('');
  const [operationalPreview, setOperationalPreview] = useState<any | null>(null);
  const [postTiosGroups, setPostTiosGroups] = useState<any[]>([]);
  const [postTiosLoaded, setPostTiosLoaded] = useState(false);
  const [postTiosOpen, setPostTiosOpen] = useState<Record<string, boolean>>({});
  const [tiosAttendanceSummary, setTiosAttendanceSummary] = useState<any>({ people: [], sessions: [], closedSessions: 0 });
  const [closedDrilldownOpen, setClosedDrilldownOpen] = useState<Record<string, boolean>>({});
  const [closedPresenceLists, setClosedPresenceLists] = useState<Record<string, any[]>>({});
  const [tiosSummaryOpen, setTiosSummaryOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const data = await call('PRESENCA_V2_LIST_RESPONSIBLE_SESSIONS', { token });
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setResponsibleLabel(data.responsible?.label || '');
      setResponsibleKind(data.responsible?.kind || '');
      if (data.responsible?.kind === 'POS') {
        setPostTiosGroups([]);
        setPostTiosLoaded(false);
        setTiosAttendanceSummary({ people: [], sessions: [], closedSessions: 0 });
      } else if (data.responsible?.kind === 'TIOS') {
        const summaryData = await call('PRESENCA_V2_RESPONSIBLE_TIOS_ATTENDANCE_SUMMARY', { token });
        setTiosAttendanceSummary(summaryData.summary || { people: [], sessions: [], closedSessions: 0 });
        setPostTiosGroups([]);
      } else {
        setPostTiosGroups([]);
        setTiosAttendanceSummary({ people: [], sessions: [], closedSessions: 0 });
      }
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível carregar as reuniões.');
      setSessions([]);
      setResponsibleLabel('');
      setResponsibleKind('');
      setPostTiosGroups([]);
      setTiosAttendanceSummary({ people: [], sessions: [], closedSessions: 0 });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => setClock((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const toApiDateTime = (value: string) => value ? new Date(value).toISOString() : '';
  const toLocalInputValue = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const createSession = async () => {
    if (!newScheduledAt) return;
    setBusy('create');
    try {
      await call('PRESENCA_V2_RESPONSIBLE_CREATE_SESSION', { token, scheduledAt: toApiDateTime(newScheduledAt) });
      setNewScheduledAt('');
      setNotice('Reunião agendada.');
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível agendar a reunião.');
    } finally {
      setBusy('');
    }
  };

  const saveSession = async (sessionId: string) => {
    if (!editingScheduledAt) return;
    setBusy(sessionId);
    try {
      await call('PRESENCA_V2_RESPONSIBLE_UPDATE_SESSION', { token, sessionId, scheduledAt: toApiDateTime(editingScheduledAt) });
      setEditingSessionId('');
      setEditingScheduledAt('');
      setNotice('Reunião atualizada.');
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível atualizar a reunião.');
    } finally {
      setBusy('');
    }
  };

  const loadPostTiosDrilldown = async () => {
    setBusy('post-tios-drilldown');
    try {
      const analyticsData = await call('PRESENCA_V2_GET_ANALYTICS');
      setPostTiosGroups(Array.isArray(analyticsData.analytics?.postTios) ? analyticsData.analytics.postTios : []);
      setPostTiosLoaded(true);
      setNotice('');
    } catch (error:any) {
      setNotice(error?.message || 'Não foi possível carregar o acompanhamento por Tios.');
    } finally {
      setBusy('');
    }
  };

  const exportAdolescents = async () => {
    setBusy('export-adolescents');
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_EXPORT_ADOLESCENTS',{token});
      const rows=Array.isArray(data.rows)?data.rows:[];
      const escapeCsv=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`;
      const csv=[
        ['nome','telefone_normalizado'].map(escapeCsv).join(';'),
        ...rows.map((row:any)=>[row.nome,row.telefone_normalizado].map(escapeCsv).join(';'))
      ].join('\r\n');
      const blob=new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`adolescentes-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(`Exportação concluída: ${rows.length} adolescente(s).`);
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível exportar a lista de adolescentes.');
    } finally {
      setBusy('');
    }
  };

  const loadMaintenance = async () => {
    setBusy('maintenance-load');
    try {
      const [data,operational]=await Promise.all([
        call('PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_LIST',{token}),
        call('PRESENCA_V2_RESPONSIBLE_OPERATIONAL_CANDIDATES',{token}),
      ]);
      setMaintenancePeople(Array.isArray(data.people)?data.people:[]);
      setMaintenanceCircles(Array.isArray(data.authorizedCircles)?data.authorizedCircles:[]);
      setOperationalPeople(Array.isArray(operational.people)?operational.people:[]);
      setMaintenanceOpen(true);
      setMaintenanceSelected(null);
      setMaintenancePreview(null);
      setMaintenanceTargetCircleId('');
      setOperationalSelected(null);
      setOperationalPreview(null);
      setOperationalTargetCircleId('');
      setNotice('');
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível carregar a manutenção de adolescentes.');
    } finally {
      setBusy('');
    }
  };

  const chooseMaintenancePerson = (person:any) => {
    setMaintenanceSelected(person);
    const targets=maintenanceCircles.filter((circle:any)=>Number(circle.edition)===Number(person.edition) && circle.id!==person.currentCircleId);
    setMaintenanceTargetCircleId(targets[0]?.id||'');
    setMaintenancePreview(null);
  };

  const previewMaintenance = async () => {
    if(!maintenanceSelected||!maintenanceTargetCircleId) return;
    setBusy('maintenance-preview');
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_PREVIEW',{
        token,
        memberId:maintenanceSelected.memberId,
        targetCircleId:maintenanceTargetCircleId,
      });
      setMaintenancePreview(data.preview||null);
      setNotice('');
    } catch (error:any) {
      setMaintenancePreview(null);
      setNotice(error?.message||'Não foi possível validar a correção.');
    } finally {
      setBusy('');
    }
  };

  const applyMaintenance = async () => {
    if(!maintenancePreview) return;
    const warning=maintenancePreview?.checks?.sourceHasOtherResponsible
      ? ' O círculo atual possui outro casal responsável.'
      : '';
    if(!window.confirm(`Confirmar a correção de ${maintenancePreview.name} de ${maintenancePreview.sourceCircle?.color} para ${maintenancePreview.targetCircle?.color}?${warning} O histórico de presenças anteriores será preservado.`)) return;
    setBusy('maintenance-apply');
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_APPLY',{
        token,
        memberId:maintenancePreview.memberId,
        targetCircleId:maintenancePreview.targetCircle?.id,
      });
      setNotice(`${data.result?.name||maintenancePreview.name} atualizado para o círculo ${data.result?.to?.color||maintenancePreview.targetCircle?.color}. Presenças anteriores foram preservadas.`);
      setMaintenanceSelected(null);
      setMaintenancePreview(null);
      setMaintenanceTargetCircleId('');
      await loadMaintenance();
      await refresh();
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível aplicar a correção.');
    } finally {
      setBusy('');
    }
  };

  const maintenanceFilteredPeople = maintenancePeople.filter((person:any)=>{
    const text=maintenanceSearch.trim().toLocaleLowerCase('pt-BR');
    if(!text) return true;
    return String(person.name||'').toLocaleLowerCase('pt-BR').includes(text)
      || String(person.currentCircle||'').toLocaleLowerCase('pt-BR').includes(text)
      || String(person.edition||'').includes(text);
  });

  const loadAttendance = async (sessionId: string) => {
    setBusy(`attendance:${sessionId}`);
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_ATTENDANCE_LIST',{token,sessionId});
      const people=Array.isArray(data.people)?data.people:[];
      setAttendanceSessionId(sessionId);
      setAttendancePeople(people);
      setAttendanceSelected(people.filter((person:any)=>person.present).map((person:any)=>person.id));
      setAttendanceSearch('');
      setAttendanceFilter('TODOS');
      setNotice('');
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível carregar a chamada.');
    } finally {
      setBusy('');
    }
  };

  const toggleClosedPresenceList = async (sessionId: string) => {
    const currentlyOpen=Boolean(closedDrilldownOpen[sessionId]);
    if(currentlyOpen){
      setClosedDrilldownOpen((current)=>({...current,[sessionId]:false}));
      return;
    }
    setClosedDrilldownOpen((current)=>({...current,[sessionId]:true}));
    if(closedPresenceLists[sessionId]) return;
    setBusy(`closed-presence:${sessionId}`);
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_SESSION_PRESENT_LIST',{token,sessionId});
      setClosedPresenceLists((current)=>({...current,[sessionId]:Array.isArray(data.people)?data.people:[]}));
      setNotice('');
    } catch (error:any) {
      setClosedDrilldownOpen((current)=>({...current,[sessionId]:false}));
      setNotice(error?.message||'Não foi possível carregar os adolescentes presentes.');
    } finally {
      setBusy('');
    }
  };

  const toggleAttendancePerson = (personId: string) => {
    setAttendanceSelected((current)=>current.includes(personId)
      ? current.filter((id)=>id!==personId)
      : [...current,personId]);
  };

  const confirmAttendance = async (sessionId: string) => {
    const absent=Math.max(0,attendancePeople.length-attendanceSelected.length);
    if(!window.confirm(`Confirmar ${attendanceSelected.length} presença(s)? ${absent} adolescente(s) ficarão como ausentes.`)) return;
    setBusy(`attendance:${sessionId}`);
    try {
      await call('PRESENCA_V2_RESPONSIBLE_CONFIRM_ATTENDANCE',{token,sessionId,personIds:attendanceSelected});
      setNotice(`Chamada confirmada: ${attendanceSelected.length} presente(s) e ${absent} ausente(s).`);
      const data=await call('PRESENCA_V2_RESPONSIBLE_ATTENDANCE_LIST',{token,sessionId});
      const people=Array.isArray(data.people)?data.people:[];
      setAttendancePeople(people);
      setAttendanceSelected(people.filter((person:any)=>person.present).map((person:any)=>person.id));
      await refresh();
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível confirmar a chamada.');
    } finally {
      setBusy('');
    }
  };

  const filteredAttendancePeople = attendancePeople.filter((person:any)=>{
    const text=attendanceSearch.trim().toLocaleLowerCase('pt-BR');
    const matches=!text
      || String(person.name||'').toLocaleLowerCase('pt-BR').includes(text)
      || String(person.circle||'').toLocaleLowerCase('pt-BR').includes(text);
    if(!matches) return false;
    const selected=attendanceSelected.includes(person.id);
    if(attendanceFilter==='PRESENTES') return selected;
    if(attendanceFilter==='AUSENTES') return !selected;
    return true;
  });
  const chooseOperationalPerson = (person:any) => {
    setOperationalSelected(person);
    const targets=maintenanceCircles.filter((circle:any)=>circle.id!==person.currentOperationalCircleId);
    setOperationalTargetCircleId(targets[0]?.id||'');
    setOperationalPreview(null);
  };

  const previewOperationalAssignment = async () => {
    if(!operationalSelected||!operationalTargetCircleId) return;
    setBusy('operational-preview');
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_OPERATIONAL_ASSIGNMENT_PREVIEW',{
        token,
        personId:operationalSelected.personId,
        targetCircleId:operationalTargetCircleId,
      });
      setOperationalPreview(data.preview||null);
      setNotice('');
    } catch (error:any) {
      setOperationalPreview(null);
      setNotice(error?.message||'Não foi possível validar o vínculo operacional.');
    } finally {
      setBusy('');
    }
  };

  const applyOperationalAssignment = async () => {
    if(!operationalPreview) return;
    if(!window.confirm(`Confirmar ${operationalPreview.name} no círculo ${operationalPreview.targetCircle?.color}? Esta ação não cria histórico de participação no EAC.`)) return;
    setBusy('operational-apply');
    try {
      const data=await call('PRESENCA_V2_RESPONSIBLE_OPERATIONAL_ASSIGNMENT_APPLY',{
        token,
        personId:operationalPreview.personId,
        targetCircleId:operationalPreview.targetCircle?.id,
      });
      setNotice(`${data.result?.name||operationalPreview.name} vinculado operacionalmente ao círculo ${data.result?.to?.color||operationalPreview.targetCircle?.color}. O histórico de EAC foi preservado.`);
      setOperationalSelected(null);
      setOperationalPreview(null);
      setOperationalTargetCircleId('');
      await loadMaintenance();
      await refresh();
    } catch (error:any) {
      setNotice(error?.message||'Não foi possível aplicar o vínculo operacional.');
    } finally {
      setBusy('');
    }
  };

  const operationalFilteredPeople = operationalPeople.filter((person:any)=>{
    const text=operationalSearch.trim().toLocaleLowerCase('pt-BR');
    if(!text) return true;
    return String(person.name||'').toLocaleLowerCase('pt-BR').includes(text)
      || String(person.currentOperationalCircle||'').toLocaleLowerCase('pt-BR').includes(text)
      || (Array.isArray(person.histories) ? person.histories.some((item:any)=>String(item.edition||'').includes(text)||String(item.color||'').toLocaleLowerCase('pt-BR').includes(text)) : false);
  });


  const execute = async (action: string, sessionId: string, successMessage: string) => {
    setBusy(sessionId);
    try {
      await call(action, { token, sessionId });
      setNotice(successMessage);
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível concluir a operação.');
    } finally {
      setBusy('');
    }
  };

  const scheduledSessions = useMemo(() => sessions.filter((item) => item.status === 'AGENDADA'), [sessions]);
  const openSessions = useMemo(() => sessions.filter((item) => item.status === 'ABERTA'), [sessions]);
  const closedSessions = useMemo(() => sessions.filter((item) => item.status === 'ENCERRADA'), [sessions]);
  const checkinUrl = (session: Session) => `${window.location.origin}/presenca/form?session=${encodeURIComponent(session.publicToken)}`;

  const remainingSeconds = (session: Session) => {
    if (!session.closeScheduledAt) return 0;
    return Math.max(0, Math.ceil((Date.parse(session.closeScheduledAt) - Date.now()) / 1000));
  };

  if (!loading && !responsibleLabel) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow">
          <h1 className="text-xl font-black text-slate-900">Acesso de responsável inválido</h1>
          <p className="mt-2 text-sm text-slate-600">O acesso informado é inválido, expirou ou foi revogado. Solicite um novo link ao ADM.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <section className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-[#044372] p-6 text-white shadow-lg sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-200">Presença · acesso operacional</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{responsibleLabel || 'Carregando responsável…'}</h1>
          <p className="mt-2 max-w-3xl text-sm text-sky-100">Aqui aparecem as reuniões agendadas, abertas e encerradas do seu escopo. O mesmo QR é preservado em caso de reabertura.</p>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Agendadas</p><p className="mt-1 text-2xl font-black text-sky-700">{scheduledSessions.length}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Abertas</p><p className="mt-1 text-2xl font-black text-emerald-700">{openSessions.length}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Encerradas</p><p className="mt-1 text-2xl font-black text-slate-900">{closedSessions.length}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Confirmados</p><p className="mt-1 text-2xl font-black text-sky-700">{sessions.reduce((sum, item) => sum + item.confirmedCount, 0)}</p></div>
        </div>


        {responsibleKind === 'POS' && (
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-slate-900">Lista geral de adolescentes</h2>
                <p className="mt-1 text-sm text-slate-600">Exporte exatamente os adolescentes elegíveis do Pós, seguindo a mesma regra da presença.</p>
              </div>
              <button type="button" disabled={busy==='export-adolescents'} onClick={()=>void exportAdolescents()} className="shrink-0 rounded-xl bg-violet-700 px-4 py-3 font-black text-white disabled:opacity-50">
                {busy==='export-adolescents'?'Gerando...':'Exportar CSV'}
              </button>
            </div>
          </div>
        )}

        {responsibleKind === 'POS' && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Acompanhamento por Tios de Círculo</h2>
                <p className="mt-1 text-sm text-slate-600">Drill-down das reuniões do Pós: casal de tios → círculo → adolescentes. O processamento é feito somente quando solicitado.</p>
              </div>
              <button type="button" disabled={busy==='post-tios-drilldown'} onClick={()=>void loadPostTiosDrilldown()} className="shrink-0 rounded-xl bg-[#044372] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {busy==='post-tios-drilldown'?'Processando...':postTiosLoaded?'Atualizar acompanhamento':'Abrir acompanhamento'}
              </button>
            </div>

            {!postTiosLoaded ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Clique em <strong>Abrir acompanhamento</strong> para processar os Tios, círculos, presentes e ausentes do Pós.</p>
            ) : postTiosGroups.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Ainda não há reuniões encerradas do Pós com dados suficientes para montar o acompanhamento.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {postTiosGroups.map((group:any)=>{
                  const groupKey=`group:${group.key}`;
                  return (
                    <div key={group.key} className="rounded-xl border border-slate-200">
                      <button type="button" onClick={()=>setPostTiosOpen((current)=>({...current,[groupKey]:!current[groupKey]}))} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                        <div>
                          <p className="font-black text-slate-900">{group.label}</p>
                          <p className="mt-1 text-xs text-slate-600">{group.sessions} reunião(ões) · {group.present} presentes · {group.absences} ausentes · {group.eligible} elegibilidades</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-sky-700">{Number(group.rate||0).toFixed(1)}%</span>
                          <span className="text-lg font-black text-slate-500">{postTiosOpen[groupKey]?'−':'+'}</span>
                        </div>
                      </button>

                      {postTiosOpen[groupKey] && (
                        <div className="space-y-2 border-t border-slate-200 p-3">
                          {(group.circles||[]).map((circle:any)=>{
                            const circleKey=`circle:${group.key}:${circle.id}`;
                            return (
                              <div key={circle.id} className="rounded-xl border border-sky-100 bg-sky-50/40">
                                <button type="button" onClick={()=>setPostTiosOpen((current)=>({...current,[circleKey]:!current[circleKey]}))} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                                  <div>
                                    <p className="font-bold text-slate-900">{circle.label}</p>
                                    <p className="mt-1 text-xs text-slate-600">{circle.present} presentes · {circle.absences} ausentes · {circle.eligible} elegibilidades</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-black text-emerald-700">{Number(circle.rate||0).toFixed(1)}%</span>
                                    <span className="text-lg font-black text-slate-500">{postTiosOpen[circleKey]?'−':'+'}</span>
                                  </div>
                                </button>

                                {postTiosOpen[circleKey] && (
                                  <div className="border-t border-sky-100 bg-white p-3">
                                    <div className="space-y-2">
                                      {(circle.people||[]).map((person:any)=>(
                                        <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                          <div>
                                            <p className="font-bold text-slate-900">{person.name}</p>
                                            <p className="text-xs text-slate-500">{person.present} presença(s) · {person.absences} ausência(s) · {person.eligibleSessions} elegibilidade(s)</p>
                                          </div>
                                          <span className="font-black text-slate-700">{Number(person.rate||0).toFixed(1)}%</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <h2 className="font-black text-slate-900">Agendar nova reunião</h2>
          <p className="mt-1 text-sm text-slate-600">A reunião será criada diretamente no seu escopo.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">
              Data e hora da reunião
              <input type="datetime-local" value={newScheduledAt} onChange={(event) => setNewScheduledAt(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal" />
            </label>
            <button type="button" disabled={!newScheduledAt || busy==='create'} onClick={() => void createSession()} className="rounded-xl bg-[#044372] px-4 py-3 font-black text-white disabled:opacity-50">{busy==='create' ? 'Agendando...' : 'Agendar reunião'}</button>
          </div>
        </div>

{notice && <Toast message={notice} type={/não|erro|inválid|falha|bloquead/i.test(notice) ? 'error' : 'success'} onClose={() => setNotice('')} />}
        {loading && <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">Carregando reuniões…</p>}

        {!loading && (
          <div className="mt-6 space-y-6">
            <section>
              <div>
                <h2 className="text-xl font-black text-slate-900">Reuniões agendadas</h2>
                <p className="text-sm text-slate-600">Próximas reuniões previstas para este responsável.</p>
              </div>
              {scheduledSessions.length === 0 ? <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">Nenhuma reunião agendada neste escopo.</p> : (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {scheduledSessions.map((session) => (
                    <article key={session.id} className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-slate-900">{session.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">Prevista para {formatDateTime(session.scheduledAt)}</p>
                        </div>
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800">AGENDADA</span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Elegíveis</p><p className="font-black">{session.eligibleCount}</p></div>
                        <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Confirmados</p><p className="font-black">{session.confirmedCount}</p></div>
                        <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Pendentes</p><p className="font-black">{session.pendingCount}</p></div>
                      </div>
                      {editingSessionId === session.id ? (
                        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                          <label className="grid gap-1 text-xs font-bold text-slate-700">Data e hora
                            <input type="datetime-local" value={editingScheduledAt} onChange={(event) => setEditingScheduledAt(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
                          </label>
                          <div className="mt-3 flex gap-2">
                            <button type="button" disabled={!editingScheduledAt || busy===session.id} onClick={() => void saveSession(session.id)} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50">Salvar</button>
                            <button type="button" onClick={() => { setEditingSessionId(''); setEditingScheduledAt(''); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Cancelar edição</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" disabled={busy===session.id} onClick={() => void execute('PRESENCA_V2_RESPONSIBLE_OPEN_SESSION', session.id, 'Reunião aberta. O QR já está disponível.')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Abrir reunião</button>
                          <button type="button" disabled={busy===session.id} onClick={() => { setEditingSessionId(session.id); setEditingScheduledAt(toLocalInputValue(session.scheduledAt)); }} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800">Editar horário</button>
                          <button type="button" disabled={busy===session.id} onClick={() => void execute('PRESENCA_V2_RESPONSIBLE_CANCEL_SESSION', session.id, 'Reunião cancelada.')} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 disabled:opacity-50">Cancelar reunião</button>
                        </div>
                      )}
                      <p className="mt-3 text-xs font-semibold text-slate-500">Quando a reunião for aberta, o QR passa a aceitar check-in imediatamente.</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-xl font-black text-slate-900">Reuniões abertas</h2><p className="text-sm text-slate-600">Exiba o QR e encerre quando a reunião terminar.</p></div>
                <button type="button" onClick={() => void refresh()} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Atualizar</button>
              </div>
              {openSessions.length === 0 ? <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">Nenhuma reunião aberta neste momento.</p> : (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {openSessions.map((session) => {
                    const seconds = remainingSeconds(session);
                    return (
                      <article key={session.id} className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div><h3 className="font-black text-slate-900">{session.title}</h3><p className="mt-1 text-xs text-slate-500">Reunião: {formatDateTime(session.scheduledAt)} · aberta em {formatDateTime(session.openedAt)}</p></div>
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">ABERTA</span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Elegíveis</p><p className="font-black">{session.eligibleCount}</p></div>
                          <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Confirmados</p><p className="font-black">{session.confirmedCount}</p></div>
                          <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-500">Pendentes</p><p className="font-black">{session.pendingCount}</p></div>
                        </div>
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
                          <button type="button" onClick={()=>void toggleClosedPresenceList(session.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                            <div>
                              <p className="font-black text-slate-900">Adolescentes presentes</p>
                              <p className="mt-0.5 text-xs text-slate-500">{session.confirmedCount} confirmado(s) até agora · use para conferir antes de encerrar</p>
                            </div>
                            <span className="text-lg font-black text-slate-500">{closedDrilldownOpen[session.id]?'−':'+'}</span>
                          </button>
                          {closedDrilldownOpen[session.id] && (
                            <div className="border-t border-slate-200 bg-white p-3">
                              {busy===`closed-presence:${session.id}` ? (
                                <p className="py-4 text-center text-sm font-semibold text-slate-500">Carregando presentes...</p>
                              ) : (closedPresenceLists[session.id]||[]).length ? (
                                <>
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Conferência da presença</p>
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">{(closedPresenceLists[session.id]||[]).length} presentes</span>
                                  </div>
                                  <div className="max-h-[420px] overflow-y-auto pr-1">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {(closedPresenceLists[session.id]||[]).map((person:any)=>(
                                        <div key={person.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                          <p className="text-sm font-bold text-slate-900">{person.name}</p>
                                          <p className="text-xs text-slate-500">{person.circle || 'Sem círculo identificado'}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-slate-500">Nenhuma presença confirmada nesta reunião até o momento.</p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          <button type="button" onClick={() => setQrSession(session)} className="w-full rounded-xl bg-[#044372] px-4 py-3 font-black text-white">Exibir QR Code</button>
                          {responsibleKind === 'TIOS' && <button type="button" onClick={() => void loadAttendance(session.id)} className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 font-black text-emerald-800">Fazer chamada</button>}
                        </div>
                        {responsibleKind === 'TIOS' && attendanceSessionId === session.id && (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h4 className="font-black text-slate-900">Chamada do círculo</h4>
                                <p className="mt-1 text-sm text-slate-600">Marque quem está presente e confirme a lista ao final.</p>
                              </div>
                              <div className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm">{attendanceSelected.length} de {attendancePeople.length} marcados</div>
                            </div>
                            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                              <input value={attendanceSearch} onChange={(event)=>setAttendanceSearch(event.target.value)} placeholder="Buscar adolescente ou círculo" className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm" />
                              <div className="flex flex-wrap gap-1">
                                {(['TODOS','PRESENTES','AUSENTES'] as const).map((filter)=>(
                                  <button key={filter} type="button" onClick={()=>setAttendanceFilter(filter)} className={`rounded-lg px-3 py-2 text-xs font-black ${attendanceFilter===filter?'bg-[#044372] text-white':'border border-slate-300 bg-white text-slate-700'}`}>
                                    {filter==='TODOS'?'Todos':filter==='PRESENTES'?'Presentes':'Ausentes'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={()=>setAttendanceSelected(attendancePeople.map((person:any)=>person.id))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Marcar todos</button>
                              <button type="button" onClick={()=>setAttendanceSelected([])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Limpar marcações</button>
                            </div>
                            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                              {filteredAttendancePeople.map((person:any)=>{
                                const selected=attendanceSelected.includes(person.id);
                                return (
                                  <button type="button" key={person.id} onClick={()=>toggleAttendancePerson(person.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected?'border-emerald-300 bg-emerald-100':'border-slate-200 bg-white'}`}>
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${selected?'border-emerald-600 bg-emerald-600 text-white':'border-slate-300 bg-white text-transparent'}`}>✓</span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-bold text-slate-900">{person.name}</span>
                                      <span className="mt-0.5 block text-xs text-slate-500">{person.circle || 'Sem círculo'}{person.phoneMissing ? ' · ⚠ telefone não cadastrado' : ''}</span>
                                    </span>
                                  </button>
                                );
                              })}
                              {filteredAttendancePeople.length===0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Nenhum adolescente encontrado neste filtro.</p>}
                            </div>
                            <div className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-700">
                              <strong>{attendanceSelected.length}</strong> presentes · <strong>{Math.max(0,attendancePeople.length-attendanceSelected.length)}</strong> ausentes · <strong>{attendancePeople.length}</strong> elegíveis
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button type="button" disabled={busy===`attendance:${session.id}`} onClick={()=>void confirmAttendance(session.id)} className="rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">{busy===`attendance:${session.id}`?'Confirmando...':'Confirmar presenças'}</button>
                              <button type="button" onClick={()=>{setAttendanceSessionId('');setAttendancePeople([]);setAttendanceSelected([]);}} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700">Fechar chamada</button>
                            </div>
                          </div>
                        )}
                        {session.closeScheduledAt ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-black text-amber-900">Encerramento em {seconds}s</p>
                            <p className="mt-1 text-xs text-amber-800">Durante esse período o encerramento pode ser cancelado.</p>
                            <button disabled={busy===session.id} type="button" onClick={() => void execute('PRESENCA_V2_CANCEL_CLOSE', session.id, 'Encerramento cancelado. A reunião continua aberta.')} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-black text-amber-900">Cancelar encerramento</button>
                          </div>
                        ) : (
                          <button disabled={busy===session.id} type="button" onClick={() => void execute('PRESENCA_V2_REQUEST_CLOSE', session.id, 'Encerramento solicitado. Você tem 60 segundos para cancelar.')} className="mt-3 w-full rounded-xl bg-slate-800 px-4 py-3 font-black text-white disabled:opacity-50">Encerrar reunião</button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <div><h2 className="text-xl font-black text-slate-900">Reuniões encerradas</h2><p className="text-sm text-slate-600">O responsável pode reabrir a mesma sessão uma única vez.</p></div>
              {closedSessions.length === 0 ? <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">Nenhuma reunião encerrada neste escopo.</p> : (
                <div className="mt-3 space-y-3">
                  {closedSessions.map((session) => (
                    <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><h3 className="font-bold text-slate-900">{session.title}</h3><p className="mt-1 text-xs text-slate-500">Reunião: {formatDateTime(session.scheduledAt)} · encerrada em {formatDateTime(session.closedAt)}</p></div>
                        <span className="w-fit rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">ENCERRADA</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-700">
                        <span><strong>{session.confirmedCount}</strong> confirmados</span>
                        <span><strong>{session.pendingCount}</strong> pendentes</span>
                        <span><strong>{session.eligibleCount}</strong> elegíveis</span>
                      </div>
                      {(() => {
                        const open=Boolean(closedDrilldownOpen[session.id]);
                        const presentPeople=closedPresenceLists[session.id]||[];
                        const loadingPeople=busy===`closed-presence:${session.id}`;
                        return (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
                            <button type="button" onClick={()=>void toggleClosedPresenceList(session.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                              <div>
                                <p className="font-black text-slate-900">Adolescentes presentes</p>
                                <p className="mt-0.5 text-xs text-slate-500">{session.confirmedCount} presente(s) nesta reunião · toque para {open?'recolher':'ver a lista'}</p>
                              </div>
                              <span className="text-lg font-black text-slate-500">{open?'−':'+'}</span>
                            </button>
                            {open && (
                              <div className="border-t border-slate-200 bg-white p-3">
                                {loadingPeople ? (
                                  <p className="py-4 text-center text-sm font-semibold text-slate-500">Carregando presentes...</p>
                                ) : presentPeople.length ? (
                                  <>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Lista de presença</p>
                                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">{presentPeople.length} presentes</span>
                                    </div>
                                    <div className="max-h-[420px] overflow-y-auto pr-1">
                                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {presentPeople.map((person:any)=>(
                                          <div key={person.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                            <p className="text-sm font-bold text-slate-900">{person.name}</p>
                                            <p className="text-xs text-slate-500">{person.circle || 'Sem círculo identificado'}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-sm text-slate-500">Nenhuma presença vinculada foi encontrada nesta reunião.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {(session.responsibleReopens || 0) < 1 ? (
                        <button disabled={busy===session.id} type="button" onClick={() => void execute('PRESENCA_V2_REOPEN_SESSION', session.id, 'Reunião reaberta. O mesmo QR voltou a aceitar check-in.')} className="mt-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800 disabled:opacity-50">Reabrir reunião</button>
                      ) : <p className="mt-4 text-xs font-semibold text-slate-500">A reabertura do responsável já foi utilizada. Nova reabertura somente pelo ADM.</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {responsibleKind === 'TIOS' && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={()=>setTiosSummaryOpen((open)=>!open)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <div>
                <h2 className="text-lg font-black text-slate-900">Frequência dos adolescentes</h2>
                <p className="mt-1 text-sm text-slate-600">{Array.isArray(tiosAttendanceSummary.people)?tiosAttendanceSummary.people.length:0} adolescente(s) · {Number(tiosAttendanceSummary.closedSessions||0)} reunião(ões) encerrada(s)</p>
              </div>
              <span className="text-xl font-black text-slate-500">{tiosSummaryOpen?'−':'+'}</span>
            </button>
            {tiosSummaryOpen && <div className="border-t border-slate-200 p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-3 py-3">Adolescente</th>
                    <th className="px-3 py-3">Círculo</th>
                    <th className="px-3 py-3 text-center">Presenças</th>
                    <th className="px-3 py-3 text-center">Reuniões</th>
                    <th className="px-3 py-3 text-right">Frequência</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(tiosAttendanceSummary.people) ? tiosAttendanceSummary.people : []).map((person:any)=>(
                    <tr key={person.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 font-bold text-slate-900">{person.name}</td>
                      <td className="px-3 py-3 text-slate-600">{person.circle || 'Sem círculo'}</td>
                      <td className="px-3 py-3 text-center font-black text-sky-700">{person.present}</td>
                      <td className="px-3 py-3 text-center">{person.eligibleSessions}</td>
                      <td className="px-3 py-3 text-right font-black text-emerald-700">{Number(person.rate||0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!Array.isArray(tiosAttendanceSummary.people) || tiosAttendanceSummary.people.length===0) && (
                <p className="py-5 text-center text-sm text-slate-500">Ainda não há reuniões encerradas suficientes para calcular a frequência.</p>
              )}
            </div>
            </div>}
          </section>
        )}


        {responsibleKind === 'TIOS' && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-slate-900">Gerenciar adolescentes</h2>
                <p className="mt-1 text-sm text-slate-600">Consulte adolescentes da mesma edição do seu EAC e corrija o círculo quando houver erro de vínculo. O sistema verifica cadastro, histórico, responsáveis e presenças antes de alterar.</p>
              </div>
              <button type="button" disabled={busy==='maintenance-load'} onClick={()=>void loadMaintenance()} className="shrink-0 rounded-xl bg-amber-700 px-4 py-3 font-black text-white disabled:opacity-50">
                {busy==='maintenance-load'?'Carregando...':maintenanceOpen?'Atualizar lista':'Gerenciar adolescentes'}
              </button>
            </div>

            {maintenanceOpen && (
              <div className="mt-4 rounded-2xl bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="grid flex-1 gap-1 text-sm font-bold text-slate-700">
                    Buscar adolescente
                    <input value={maintenanceSearch} onChange={(event)=>setMaintenanceSearch(event.target.value)} placeholder="Digite nome, círculo ou EAC" className="rounded-xl border border-slate-300 px-3 py-3 font-normal" />
                  </label>
                  <button type="button" onClick={()=>{setMaintenanceOpen(false);setMaintenanceSelected(null);setMaintenancePreview(null);}} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">Fechar manutenção</button>
                </div>

                <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
                  {maintenanceFilteredPeople.length===0 ? (
                    <p className="p-4 text-sm text-slate-500">Nenhum adolescente encontrado.</p>
                  ) : maintenanceFilteredPeople.map((person:any)=>(
                    <div key={person.memberId} className="flex flex-col gap-3 border-b border-slate-100 p-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{person.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          EAC {person.edition} · círculo atual {person.currentCircle||'não identificado'}
                          {person.currentResponsibleLabels?.length ? ` · ${person.currentResponsibleLabels.join(' / ')}` : ' · sem Tios vinculados'}
                        </p>
                      </div>
                      <button type="button" onClick={()=>chooseMaintenancePerson(person)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">Corrigir círculo</button>
                    </div>
                  ))}
                </div>


                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div>
                    <h3 className="font-black text-slate-900">Vínculo operacional</h3>
                    <p className="mt-1 text-sm text-slate-600">Use para adolescentes/encontreiros que precisam participar das reuniões dos Tios, mas não possuem histórico como encontrista naquele EAC. O histórico do encontro não é alterado.</p>
                  </div>
                  <label className="mt-3 grid gap-1 text-sm font-bold text-slate-700">
                    Buscar adolescente/encontreiro
                    <input value={operationalSearch} onChange={(event)=>setOperationalSearch(event.target.value)} placeholder="Ex.: Cauã de Freitas Caldas" className="rounded-xl border border-slate-300 px-3 py-3 font-normal" />
                  </label>
                  <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-slate-200">
                    {operationalFilteredPeople.length===0 ? (
                      <p className="p-4 text-sm text-slate-500">Nenhum adolescente/encontreiro disponível encontrado.</p>
                    ) : operationalFilteredPeople.map((person:any)=>(
                      <div key={person.personId} className="flex flex-col gap-3 border-b border-slate-100 p-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{person.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Adolescente / Encontreiro · {person.assigned ? `círculo operacional ${person.currentOperationalCircle}` : 'sem círculo operacional'}
                            {person.histories?.length ? ` · histórico: ${person.histories.map((item:any)=>`EAC ${item.edition} ${item.color}`).join(', ')}` : ' · sem histórico como encontrista'}
                          </p>
                        </div>
                        <button type="button" onClick={()=>chooseOperationalPerson(person)} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-800">
                          {person.assigned?'Alterar vínculo':'Vincular ao círculo'}
                        </button>
                      </div>
                    ))}
                  </div>

                  {operationalSelected && (
                    <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                      <h4 className="font-black text-slate-900">Vínculo operacional</h4>
                      <p className="mt-1 text-sm text-slate-600"><strong>{operationalSelected.name}</strong> · {operationalSelected.assigned ? `atual: ${operationalSelected.currentOperationalCircle}` : 'sem círculo operacional'}</p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="grid flex-1 gap-1 text-sm font-bold text-slate-700">
                          Círculo dos Tios
                          <select value={operationalTargetCircleId} onChange={(event)=>{setOperationalTargetCircleId(event.target.value);setOperationalPreview(null);}} className="rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
                            <option value="">Selecione...</option>
                            {maintenanceCircles.filter((circle:any)=>circle.id!==operationalSelected.currentOperationalCircleId).map((circle:any)=>(
                              <option key={circle.id} value={circle.id}>{circle.color}</option>
                            ))}
                          </select>
                        </label>
                        <button type="button" disabled={!operationalTargetCircleId||busy==='operational-preview'} onClick={()=>void previewOperationalAssignment()} className="rounded-xl bg-indigo-700 px-4 py-3 font-black text-white disabled:opacity-50">
                          {busy==='operational-preview'?'Verificando...':'Verificar impacto'}
                        </button>
                      </div>
                    </div>
                  )}

                  {operationalPreview && (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <h4 className="font-black text-slate-900">Validação do vínculo operacional</h4>
                      <p className="mt-1 text-sm text-slate-700"><strong>{operationalPreview.name}</strong> → círculo <strong>{operationalPreview.targetCircle?.color}</strong></p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-white p-3 text-sm"><strong>Cadastro:</strong> localizado</div>
                        <div className="rounded-xl bg-white p-3 text-sm"><strong>Encontreiro:</strong> {operationalPreview.checks?.classification} / {operationalPreview.checks?.status}</div>
                        <div className="rounded-xl bg-white p-3 text-sm"><strong>Histórico EAC:</strong> {operationalPreview.checks?.historicalMemberships||0} vínculo(s), nenhum será alterado</div>
                        <div className="rounded-xl bg-white p-3 text-sm"><strong>Presenças:</strong> {operationalPreview.checks?.presenceRecords||0} registro(s) preservado(s)</div>
                      </div>
                      <p className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-emerald-900">Este vínculo serve somente para a operação das reuniões dos Tios. Não transforma a pessoa em encontrista de um EAC anterior.</p>
                      <button type="button" disabled={busy==='operational-apply'} onClick={()=>void applyOperationalAssignment()} className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">
                        {busy==='operational-apply'?'Aplicando...':'Confirmar vínculo operacional'}
                      </button>
                    </div>
                  )}
                </div>

                {maintenanceSelected && (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <h3 className="font-black text-slate-900">Correção de círculo</h3>
                    <p className="mt-1 text-sm text-slate-600"><strong>{maintenanceSelected.name}</strong> · EAC {maintenanceSelected.edition} · atual: {maintenanceSelected.currentCircle}</p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="grid flex-1 gap-1 text-sm font-bold text-slate-700">
                        Novo círculo
                        <select value={maintenanceTargetCircleId} onChange={(event)=>{setMaintenanceTargetCircleId(event.target.value);setMaintenancePreview(null);}} className="rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
                          <option value="">Selecione...</option>
                          {maintenanceCircles.filter((circle:any)=>Number(circle.edition)===Number(maintenanceSelected.edition) && circle.id!==maintenanceSelected.currentCircleId).map((circle:any)=>(
                            <option key={circle.id} value={circle.id}>{circle.color}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" disabled={!maintenanceTargetCircleId||busy==='maintenance-preview'} onClick={()=>void previewMaintenance()} className="rounded-xl bg-sky-700 px-4 py-3 font-black text-white disabled:opacity-50">
                        {busy==='maintenance-preview'?'Verificando...':'Verificar impacto'}
                      </button>
                    </div>
                  </div>
                )}

                {maintenancePreview && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <h3 className="font-black text-slate-900">Validação antes da alteração</h3>
                    <p className="mt-1 text-sm text-slate-700">{maintenancePreview.name}: <strong>{maintenancePreview.sourceCircle?.color}</strong> → <strong>{maintenancePreview.targetCircle?.color}</strong></p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-3 text-sm"><strong>Cadastro:</strong> {maintenancePreview.checks?.person?'localizado':'sem pessoa vinculada'}</div>
                      <div className="rounded-xl bg-white p-3 text-sm"><strong>Adolescente:</strong> {maintenancePreview.checks?.adolescentLinks||0} vínculo(s)</div>
                      <div className="rounded-xl bg-white p-3 text-sm"><strong>Presenças:</strong> {maintenancePreview.checks?.presenceRecords||0} registro(s) preservado(s)</div>
                      <div className="rounded-xl bg-white p-3 text-sm"><strong>Histórico:</strong> {maintenancePreview.checks?.historicalMemberships||0} vínculo(s) localizado(s)</div>
                    </div>
                    {maintenancePreview.checks?.sourceHasOtherResponsible && (
                      <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900">Atenção: o círculo atual possui outro casal de Tios responsável. A correção será auditada e moverá o adolescente para um círculo do seu escopo.</p>
                    )}
                    {maintenancePreview.checks?.duplicateMembershipWarning && (
                      <p className="mt-3 rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-800">Existe outro vínculo histórico para esta pessoa. A alteração ficará bloqueada até essa duplicidade ser revisada.</p>
                    )}
                    <p className="mt-3 text-xs text-slate-600">Presenças já registradas não serão reescritas. A mudança afeta o vínculo histórico usado nas próximas chamadas.</p>
                    <button type="button" disabled={busy==='maintenance-apply'||maintenancePreview.checks?.duplicateMembershipWarning} onClick={()=>void applyMaintenance()} className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">
                      {busy==='maintenance-apply'?'Aplicando...':'Confirmar correção'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


      </section>

      {qrSession && <QrDisplay value={checkinUrl(qrSession)} title={qrSession.title} subtitle="Sessão aberta para check-in" onClose={() => setQrSession(null)} />}
    </main>
  );
};

export default PresenceResponsiblePage;
