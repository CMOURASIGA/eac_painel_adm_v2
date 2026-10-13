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
  if (!result.success) throw new Error(result.error || 'Falha no ambiente MOCK.');
  return result.data as any;
};

const MockPresenceAdminPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<Session['type']>('REUNIAO_DUPLA_TIOS');
  const [doubleId, setDoubleId] = useState('dupla-a');

  const refresh = useCallback(async () => {
    const [sessionsResult, pendingResult] = await Promise.all([
      call('PRESENCA_V2_LIST_SESSIONS'),
      call('PRESENCA_V2_LIST_PENDING'),
    ]);
    setSessions(Array.isArray(sessionsResult.sessions) ? sessionsResult.sessions : []);
    setPending(Array.isArray(pendingResult.requests) ? pendingResult.requests : []);
    setRecords(Array.isArray(pendingResult.records) ? pendingResult.records : []);
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
  const unresolved = useMemo(() => pending.filter((item) => item.status === 'PENDING'), [pending]);
  const resolved = useMemo(() => pending.filter((item) => item.status === 'APPROVED' || item.status === 'REJECTED').slice().reverse(), [pending]);

  return (
    <section className="mx-auto max-w-6xl p-5 md:p-8">
      <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-xs font-black tracking-wider text-sky-800">PRESENÇA V2 · HOMOLOGAÇÃO</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Sessões, QR e conciliação</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">Dados inteiramente fictícios. Uma dupla de tios abrange dois círculos; o QR pertence à sessão, nunca ao círculo isolado. O acesso passwordless dos tios será integrado somente após decisão e autorização próprias.</p>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{notice}</div>}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Criar nova sessão</h2>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">Tipo
            <select value={type} onChange={(event) => setType(event.target.value as Session['type'])} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="REUNIAO_DUPLA_TIOS">Reunião de tios (dupla de círculos)</option>
              <option value="POS_ENCONTRO_GERAL">Pós-encontro geral</option>
            </select>
          </label>
          {type === 'REUNIAO_DUPLA_TIOS' && <label className="grid flex-1 gap-1 text-sm font-semibold text-slate-700">Dupla
            <select value={doubleId} onChange={(event) => setDoubleId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="dupla-a">AZUL + LARANJA</option><option value="dupla-b">VERDE + VERMELHO</option><option value="dupla-c">AMARELO + ROXO</option>
            </select>
          </label>}
          <button disabled={busy} onClick={() => void execute('PRESENCA_V2_CREATE_SESSION', { type, doubleId }, 'Sessão agendada no MOCK.')} className="rounded-lg bg-[#044372] px-4 py-2 font-bold text-white disabled:opacity-50">Agendar sessão</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sessions.map((session) => (
          <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{session.title}</h2><p className="mt-1 text-xs text-slate-500">ID sintético: {session.id}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle[session.status]}`}>{session.status}</span></div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Elegíveis</dt><dd className="font-black">{session.eligibleCount}</dd></div><div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Confirmados</dt><dd className="font-black">{session.confirmedCount}</dd></div><div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Pendentes</dt><dd className="font-black">{session.pendingCount}</dd></div></dl>
            <p className="mt-4 break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-600">QR público simulado: {qrLink(session)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {session.status === 'AGENDADA' && <><button disabled={busy} onClick={() => void execute('PRESENCA_V2_OPEN_SESSION', { sessionId: session.id }, 'Sessão aberta.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Abrir sessão</button><button disabled={busy} onClick={() => void execute('PRESENCA_V2_CANCEL_SESSION', { sessionId: session.id }, 'Sessão cancelada no MOCK.')} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700">Cancelar</button></>}
              {session.status === 'ABERTA' && <button disabled={busy} onClick={() => void execute('PRESENCA_V2_CLOSE_SESSION', { sessionId: session.id }, 'Sessão encerrada. Ela não pode ser reaberta.')} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white">Encerrar sessão</button>}
              <button type="button" onClick={() => navigator.clipboard?.writeText(qrLink(session)).then(() => setNotice('Link do QR público copiado.'))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Copiar link</button>
            </div>
          </article>
        ))}
      </div>

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
