import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';

type Session = {
  id: string;
  title: string;
  type: 'REUNIAO_DUPLA_TIOS' | 'POS_ENCONTRO_GERAL';
  doubleId?: string | null;
  status: 'AGENDADA' | 'ABERTA' | 'ENCERRADA' | 'CANCELADA';
  eligibleCount: number;
  confirmedCount: number;
  pendingCount: number;
  publicToken: string;
};

const statusStyle: Record<Session['status'], string> = {
  AGENDADA: 'bg-slate-100 text-slate-700',
  ABERTA: 'bg-emerald-100 text-emerald-800',
  ENCERRADA: 'bg-slate-200 text-slate-700',
  CANCELADA: 'bg-rose-100 text-rose-800',
};

const pendingReasonLabel: Record<string, string> = {
  NO_ELIGIBLE_MATCH: 'Pessoa não localizada para esta sessão',
  PHONE_MISMATCH: 'Telefone informado não confere',
  MISSING_PHONE: 'Telefone não informado',
  PHONE_SHARED: 'Telefone utilizado por mais de uma pessoa',
};

const formatPhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 'Não informado';
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
};

const call = async (action: string, data: any = {}) => {
  const result = await postComunicadosAction<any>(action, data);
  if (!result.success) throw new Error(result.error || 'Falha na Presença V2.');
  return result.data as any;
};

const MockPresenceAdminPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<Session['type']>('REUNIAO_DUPLA_TIOS');
  const [responsibleGroups, setResponsibleGroups] = useState<any[]>([]);
  const [responsibleId, setResponsibleId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [sessionResponsibleFilter, setSessionResponsibleFilter] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'TODOS' | Session['status']>('TODOS');

  const refresh = useCallback(async () => {
    const [sessionsResult, pendingResult, responsibleResult] = await Promise.all([
      call('PRESENCA_V2_LIST_SESSIONS'),
      call('PRESENCA_V2_LIST_PENDING'),
      call('PRESENCA_V2_LIST_RESPONSIBLE_GROUPS'),
    ]);
    setSessions(Array.isArray(sessionsResult.sessions) ? sessionsResult.sessions : []);
    setPending(Array.isArray(pendingResult.requests) ? pendingResult.requests : []);
    setRecords(Array.isArray(pendingResult.records) ? pendingResult.records : []);
    setResponsibleGroups(Array.isArray(responsibleResult.responsibleGroups) ? responsibleResult.responsibleGroups : []);
  }, []);

  useEffect(() => { void refresh().catch((error) => setNotice(error.message)); }, [refresh]);

  const execute = async (action: string, data: any, message: string) => {
    setBusy(true);
    try {
      await call(action, data);
      setNotice(message);
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  const qrLink = (session: Session) => `${window.location.origin}/presenca/form?session=${encodeURIComponent(session.publicToken)}`;
  const responsibleLink = (token: string) => `${window.location.origin}/presenca/responsavel?token=${encodeURIComponent(token)}`;
  const unresolved = useMemo(() => pending.filter((item) => item.status === 'PENDING'), [pending]);
  const resolved = useMemo(() => pending.filter((item) => item.status === 'APPROVED' || item.status === 'REJECTED').slice().reverse(), [pending]);

  const postSessions = useMemo(() => sessions
    .filter((session) => session.type === 'POS_ENCONTRO_GERAL')
    .slice()
    .sort((a: any, b: any) => {
      const rank: Record<string, number> = { ABERTA: 0, AGENDADA: 1, ENCERRADA: 2, CANCELADA: 3 };
      const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      return Date.parse(b.scheduledAt || b.openedAt || b.closedAt || b.createdAt || '1970-01-01') - Date.parse(a.scheduledAt || a.openedAt || a.closedAt || a.createdAt || '1970-01-01');
    }), [sessions]);

  const circleGroups = useMemo(() => responsibleGroups
    .filter((item) => item.kind === 'TIOS')
    .filter((item) => String(item.label || '').toLocaleLowerCase('pt-BR').includes(sessionResponsibleFilter.trim().toLocaleLowerCase('pt-BR')))
    .map((item) => ({
      ...item,
      sessions: sessions
        .filter((session: any) => session.type === 'REUNIAO_DUPLA_TIOS' && session.responsibleId === item.id)
        .filter((session: any) => sessionStatusFilter === 'TODOS' || session.status === sessionStatusFilter)
        .slice()
        .sort((a: any, b: any) => {
          const rank: Record<string, number> = { ABERTA: 0, AGENDADA: 1, ENCERRADA: 2, CANCELADA: 3 };
          const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
          if (byStatus !== 0) return byStatus;
          return Date.parse(b.scheduledAt || b.openedAt || b.closedAt || b.createdAt || '1970-01-01') - Date.parse(a.scheduledAt || a.openedAt || a.closedAt || a.createdAt || '1970-01-01');
        }),
    }))
    .filter((group) => sessionStatusFilter === 'TODOS' || group.sessions.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [responsibleGroups, sessions, sessionResponsibleFilter, sessionStatusFilter]);

  const toggleGroup = (key: string) => setExpandedGroups((current) => ({ ...current, [key]: !current[key] }));

  const renderSessionCard = (session: Session) => (
    <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">{session.title}</h3>
          <p className="mt-1 text-xs text-slate-500">{(session as any).scheduledAt ? `Reunião em ${new Date((session as any).scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Data não informada'}{(session as any).circlePairLabel ? ` · ${(session as any).circlePairLabel}` : ''}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle[session.status]}`}>{session.status}</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Elegíveis</dt><dd className="font-black">{session.eligibleCount}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Confirmados</dt><dd className="font-black">{session.confirmedCount}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Pendentes</dt><dd className="font-black">{session.pendingCount}</dd></div>
      </dl>
      <p className="mt-4 break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-600">QR público: {qrLink(session)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {session.status === 'AGENDADA' && <>
          <button disabled={busy} onClick={() => void execute('PRESENCA_V2_OPEN_SESSION', { sessionId: session.id }, 'Sessão aberta.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Abrir sessão</button>
          <button disabled={busy} onClick={() => void execute('PRESENCA_V2_CANCEL_SESSION', { sessionId: session.id }, 'Sessão cancelada.')} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700">Cancelar</button>
        </>}
        {session.status === 'ABERTA' && <button disabled={busy} onClick={() => void execute('PRESENCA_V2_CLOSE_SESSION', { sessionId: session.id }, 'Sessão encerrada pelo ADM.')} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white">Encerrar sessão</button>}
        {session.status === 'ENCERRADA' && <button disabled={busy} onClick={() => void execute('PRESENCA_V2_REOPEN_SESSION_ADMIN', { sessionId: session.id }, 'Sessão reaberta pelo ADM. O mesmo QR voltou a aceitar check-in.')} className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800">Reabrir pelo ADM</button>}
        <button type="button" onClick={() => navigator.clipboard?.writeText(qrLink(session)).then(() => setNotice('Link do QR público copiado.'))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Copiar link</button>
      </div>
    </article>
  );

  return (
    <section className="mx-auto max-w-6xl p-5 md:p-8">
      <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black tracking-wider text-sky-800">PRESENÇA V2 · HOMOLOGAÇÃO REAL</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Gestão de sessões, QR e conciliação</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-700">Esta é a tela administrativa. O QR operacional é exibido pelos tios de círculo ou pelo responsável do Pós em um acesso próprio. Aqui o ADM agenda, abre, encerra, cancela e concilia.</p>
          </div>
          <button type="button" onClick={() => { window.location.href = '/cadastro/presenca'; }} className="shrink-0 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm font-black text-sky-800">Ver indicadores</button>
        </div>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{notice}</div>}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Criar nova sessão</h2>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">Tipo
            <select value={type} onChange={(event) => {
              const nextType = event.target.value as Session['type'];
              setType(nextType);
              const candidate = responsibleGroups.find((item) => nextType === 'REUNIAO_DUPLA_TIOS' ? item.kind === 'TIOS' : item.kind === 'POS');
              setResponsibleId(candidate?.id || '');
            }} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="REUNIAO_DUPLA_TIOS">Reunião de tios (dupla de círculos)</option>
              <option value="POS_ENCONTRO_GERAL">Pós-encontro geral</option>
            </select>
          </label>
          <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">Responsável
            <select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              {responsibleGroups.filter((item) => type === 'REUNIAO_DUPLA_TIOS' ? item.kind === 'TIOS' : item.kind === 'POS').map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">Data e hora da reunião
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <button disabled={busy || !responsibleId || !scheduledAt} onClick={() => void execute('PRESENCA_V2_CREATE_SESSION', { type, responsibleId, scheduledAt }, 'Sessão agendada.')} className="rounded-lg bg-[#044372] px-4 py-2 font-bold text-white disabled:opacity-50">Agendar sessão</button>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Acessos operacionais</h2>
        <p className="mt-1 text-sm text-slate-600">O Pós aparece primeiro. Os casais de tios ficam agrupados abaixo para evitar crescimento excessivo da tela.</p>

        {responsibleGroups.filter((item) => item.kind === 'POS').map((item) => (
          <div key={item.id} className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-black uppercase tracking-wide text-sky-700">Pós-encontro</p><p className="font-bold text-slate-900">{item.label}</p></div>
              <button type="button" onClick={() => navigator.clipboard?.writeText(responsibleLink(item.accessToken || '')).then(() => setNotice(`Acesso ${item.label} copiado.`))} className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-bold text-sky-800">Copiar acesso</button>
            </div>
          </div>
        ))}

        <div className="mt-4 rounded-xl border border-slate-200">
          <button type="button" onClick={() => toggleGroup('access-circles')} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
            <div><p className="font-bold text-slate-900">Acessos dos tios de círculo</p><p className="text-xs text-slate-500">{responsibleGroups.filter((item) => item.kind === 'TIOS').length} casal(is) configurado(s)</p></div>
            <span className="text-lg font-black text-slate-500">{expandedGroups['access-circles'] ? '−' : '+'}</span>
          </button>
          {expandedGroups['access-circles'] && <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {responsibleGroups.filter((item) => item.kind === 'TIOS').map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-900">{item.label}</p>
                <button type="button" onClick={() => navigator.clipboard?.writeText(responsibleLink(item.accessToken || '')).then(() => setNotice(`Acesso ${item.label} copiado.`))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Copiar acesso</button>
              </div>
            ))}
          </div>}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-900">Acompanhamento das sessões</h2>
          <p className="text-sm text-slate-600">Pós-encontro em primeiro lugar; reuniões dos círculos agrupadas por casal de tios.</p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/50">
          <button type="button" onClick={() => toggleGroup('pos')} className="flex w-full items-center justify-between gap-3 p-4 text-left">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-sky-700">Pós-encontro</p>
              <p className="font-bold text-slate-900">Sessões do Pós</p>
              <p className="text-xs text-slate-500">{postSessions.length} sessão(ões) · {postSessions.filter((item) => item.status === 'ABERTA').length} aberta(s)</p>
            </div>
            <span className="text-xl font-black text-slate-500">{expandedGroups.pos ? '−' : '+'}</span>
          </button>
          {expandedGroups.pos && <div className="grid gap-4 border-t border-sky-200 p-4 lg:grid-cols-2">
            {postSessions.length ? postSessions.map(renderSessionCard) : <p className="text-sm text-slate-500">Nenhuma sessão de Pós registrada.</p>}
          </div>}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button type="button" onClick={() => toggleGroup('circle-sessions')} className="flex w-full items-center justify-between gap-3 p-4 text-left">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Círculos</p>
              <p className="font-bold text-slate-900">Sessões dos tios de círculo</p>
              <p className="text-xs text-slate-500">
                {circleGroups.length} casal(is) · {circleGroups.reduce((sum, group) => sum + group.sessions.length, 0)} sessão(ões) · {circleGroups.reduce((sum, group) => sum + group.sessions.filter((item: Session) => item.status === 'ABERTA').length, 0)} aberta(s)
              </p>
            </div>
            <span className="text-xl font-black text-slate-500">{expandedGroups['circle-sessions'] ? '−' : '+'}</span>
          </button>

          {expandedGroups['circle-sessions'] && (
            <div className="space-y-3 border-t border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Localizar casal de tios
                  <input value={sessionResponsibleFilter} onChange={(event) => setSessionResponsibleFilter(event.target.value)} placeholder="Digite parte do nome" className="rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Status da sessão
                  <select value={sessionStatusFilter} onChange={(event) => setSessionStatusFilter(event.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
                    <option value="TODOS">Todos</option>
                    <option value="ABERTA">Aberta</option>
                    <option value="AGENDADA">Agendada</option>
                    <option value="ENCERRADA">Encerrada</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                </label>
              </div>
              {circleGroups.map((group) => {
                const isOpen = Boolean(expandedGroups[group.id]);
                const openCount = group.sessions.filter((item: Session) => item.status === 'ABERTA').length;
                return (
                  <div key={group.id} className="rounded-2xl border border-slate-200 bg-white">
                    <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                      <div>
                        <p className="font-bold text-slate-900">{group.label}</p>
                        <p className="text-xs text-slate-500">{group.sessions.length} sessão(ões) · {openCount} aberta(s)</p>
                      </div>
                      <span className="text-xl font-black text-slate-500">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <div className="grid gap-4 border-t border-slate-200 p-4 lg:grid-cols-2">
                      {group.sessions.length ? group.sessions.map(renderSessionCard) : <p className="text-sm text-slate-500">Nenhuma sessão registrada para este casal.</p>}
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Fila de conciliação do ADM</h2>
        <p className="mt-1 text-sm text-slate-600">Solicitações ambíguas não alteram cadastro nem presença oficial automaticamente. Só podem ser resolvidas após o encerramento da sessão.</p>
        {unresolved.length === 0 ? <p className="mt-4 text-sm text-slate-500">Não há pendências abertas.</p> : <div className="mt-4 space-y-3">{unresolved.map((request) => {
          const session = sessions.find((item) => item.id === request.sessionId);
          const canResolve = session?.status === 'ENCERRADA';
          const reasonLabel = pendingReasonLabel[request.reason] || 'Solicitação precisa de análise';
          return (
            <div key={request.key} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{reasonLabel}</p>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome informado</dt><dd className="mt-0.5 font-semibold">{request.reportedName || 'Não informado'}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telefone informado</dt><dd className="mt-0.5 font-semibold">{formatPhone(request.reportedPhone)}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sessão</dt><dd className="mt-0.5 font-semibold">{session?.title || 'Sessão não localizada'}</dd></div>
                  </dl>
                  {!canResolve && <p className="mt-3 text-xs font-semibold text-amber-700">A decisão ficará disponível após o encerramento da sessão.</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
                  <button disabled={!canResolve || busy} onClick={() => void execute('PRESENCA_V2_RESOLVE_PENDING', { key: request.key, decision: 'APPROVED' }, 'Presença confirmada pelo ADM no ambiente MOCK.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Confirmar presença</button>
                  <button disabled={!canResolve || busy} onClick={() => void execute('PRESENCA_V2_RESOLVE_PENDING', { key: request.key, decision: 'REJECTED' }, 'Solicitação descartada pelo ADM no ambiente MOCK.')} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">Descartar solicitação</button>
                </div>
              </div>
            </div>
          );
        })}</div>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Conciliações concluídas</h2>
            <p className="mt-1 text-sm text-slate-600">Aqui ficam as decisões administrativas tomadas após o encerramento das sessões.</p>
          </div>
          <p className="text-xs font-semibold text-slate-500">{resolved.length} decisão(ões) registrada(s)</p>
        </div>

        {resolved.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Nenhuma conciliação concluída ainda.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {resolved.map((request) => {
              const session = sessions.find((item) => item.id === request.sessionId);
              const isApproved = request.status === 'APPROVED';
              const recorded = isApproved && records.some((record) =>
                record.sessionId === request.sessionId &&
                (request.personId ? record.personId === request.personId : record.requestKey === request.key)
              );
              return (
                <div key={request.key} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{request.reportedName || 'Nome não informado'}</p>
                      <p className="mt-1 text-sm text-slate-600">{session?.title || 'Sessão não localizada'}</p>
                      <p className="mt-1 text-sm text-slate-600">Telefone informado: <strong>{formatPhone(request.reportedPhone)}</strong></p>
                      <p className="mt-1 text-xs text-slate-500">Motivo original: {pendingReasonLabel[request.reason] || 'Solicitação para análise'}</p>
                    </div>
                    <div className="sm:text-right">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {isApproved ? 'PRESENÇA CONFIRMADA' : 'SOLICITAÇÃO DESCARTADA'}
                      </span>
                      {isApproved && <p className="mt-2 text-xs font-semibold text-emerald-700">{recorded ? 'Contabilizada nos confirmados da sessão.' : 'Aguardando contabilização.'}</p>}
                      {!request.personId && isApproved && <p className="mt-1 text-xs text-slate-500">Sem criação automática de cadastro.</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
};

export default MockPresenceAdminPage;
