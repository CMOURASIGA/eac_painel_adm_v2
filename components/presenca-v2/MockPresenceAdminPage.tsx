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

const call = async (action: string, data: any = {}) => {
  const result = await postComunicadosAction<any>(action, data);
  if (!result.success) throw new Error(result.error || 'Falha no ambiente MOCK.');
  return result.data as any;
};

const MockPresenceAdminPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState<any[]>([]);
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
          return <div key={request.key} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-slate-800">{request.reason}</p><p className="text-xs text-slate-500">Sessão: {request.sessionId} · chave idempotente: {request.key}</p></div><div className="flex gap-2"><button disabled={!canResolve || busy} onClick={() => void execute('PRESENCA_V2_RESOLVE_PENDING', { key: request.key, decision: 'APPROVED' }, 'Pendência aprovada pelo ADM no MOCK.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Aprovar</button><button disabled={!canResolve || busy} onClick={() => void execute('PRESENCA_V2_RESOLVE_PENDING', { key: request.key, decision: 'REJECTED' }, 'Pendência rejeitada pelo ADM no MOCK.')} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">Rejeitar</button></div></div>;
        })}</div>}
      </section>
    </section>
  );
};

export default MockPresenceAdminPage;
