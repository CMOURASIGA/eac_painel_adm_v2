import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';
import QrDisplay from './QrDisplay.tsx';

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
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [, setClock] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const data = await call('PRESENCA_V2_LIST_RESPONSIBLE_SESSIONS', { token });
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setResponsibleLabel(data.responsible?.label || '');
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível carregar as reuniões.');
      setSessions([]);
      setResponsibleLabel('');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => setClock((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

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

        {notice && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">{notice}</div>}
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
                      <p className="mt-4 text-xs font-semibold text-slate-500">O QR e o registro de presença ficam disponíveis quando o ADM abrir a reunião.</p>
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
                        <button type="button" onClick={() => setQrSession(session)} className="mt-5 w-full rounded-xl bg-[#044372] px-4 py-3 font-black text-white">Exibir QR Code</button>
                        {session.closeScheduledAt ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-black text-amber-900">Encerramento em {seconds}s</p>
                            <p className="mt-1 text-xs text-amber-800">Durante esse período o encerramento pode ser cancelado.</p>
                            <button disabled={busy===session.id} type="button" onClick={() => void execute('PRESENCA_V2_CANCEL_CLOSE', session.id, 'Encerramento cancelado. A sessão continua aberta.')} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-black text-amber-900">Cancelar encerramento</button>
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
                      {(session.responsibleReopens || 0) < 1 ? (
                        <button disabled={busy===session.id} type="button" onClick={() => void execute('PRESENCA_V2_REOPEN_SESSION', session.id, 'Sessão reaberta. O mesmo QR voltou a aceitar check-in.')} className="mt-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800 disabled:opacity-50">Reabrir sessão</button>
                      ) : <p className="mt-4 text-xs font-semibold text-slate-500">A reabertura do responsável já foi utilizada. Nova reabertura somente pelo ADM.</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {qrSession && <QrDisplay value={checkinUrl(qrSession)} title={qrSession.title} subtitle="Sessão aberta para check-in" onClose={() => setQrSession(null)} />}
    </main>
  );
};

export default PresenceResponsiblePage;
