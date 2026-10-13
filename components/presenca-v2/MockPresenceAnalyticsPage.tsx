import React, { useCallback, useEffect, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';

const call = async (action: string, data: any = {}) => {
  const result = await postComunicadosAction<any>(action, data);
  if (!result.success) throw new Error(result.error || 'Não foi possível carregar os indicadores.');
  return result.data as any;
};

const MockPresenceAnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [circlesOpen, setCirclesOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setNotice('');
      const data = await call('PRESENCA_V2_GET_ANALYTICS');
      setAnalytics(data.analytics);
    } catch (error: any) {
      setNotice(error?.message || 'Não foi possível carregar os indicadores.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!analytics) return <section className="mx-auto max-w-7xl p-5 md:p-8"><p className="rounded-2xl bg-white p-5 shadow-sm">{notice || 'Carregando indicadores…'}</p></section>;

  const summary = analytics.summary || {};
  const people = Array.isArray(analytics.people) ? analytics.people : [];
  const groups = Array.isArray(analytics.groups) ? analytics.groups : [];
  const evolution = Array.isArray(analytics.sessionEvolution) ? analytics.sessionEvolution : [];
  const postGroups = groups.filter((group: any) => group.kind === 'POS');
  const circleGroups = groups
    .filter((group: any) => group.kind === 'TIOS')
    .slice()
    .sort((a: any, b: any) => String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR'));

  return (
    <section className="mx-auto max-w-7xl p-5 md:p-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-sky-200 bg-sky-50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-800">Presença V2 · análise</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Indicadores de presença</h1>
          <p className="mt-2 text-sm text-slate-700">Visão histórica e gerencial. A operação de abrir, encerrar e conciliar sessões fica em uma tela separada.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { window.location.href = '/cadastro/presenca/sessoes'; }} className="rounded-xl bg-[#044372] px-4 py-3 text-sm font-black text-white">Gerenciar sessões</button>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">Atualizar indicadores</button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Sessões encerradas</p><p className="mt-1 text-3xl font-black text-slate-900">{summary.closedSessions || 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Participantes únicos</p><p className="mt-1 text-3xl font-black text-sky-700">{summary.uniqueParticipants || 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Frequência média</p><p className="mt-1 text-3xl font-black text-emerald-700">{summary.averageAttendance || 0}%</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Nunca participaram</p><p className="mt-1 text-3xl font-black text-amber-700">{summary.neverParticipated || 0}</p></div>
      </div>

      {(summary.unlinkedConfirmedCount || 0) > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{summary.unlinkedConfirmedCount}</strong> presença(s) confirmada(s) administrativamente sem vínculo cadastral. Elas entram no total operacional, mas não compõem a frequência individual de pessoas cadastradas.</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Desempenho por responsáveis</h2>
          <p className="mt-1 text-sm text-slate-600">Casais de tios e responsável do Pós, considerando as sessões encerradas atribuídas a cada um.</p>
          <div className="mt-4 space-y-3">
            {postGroups.map((group: any) => (
              <div key={group.key} className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-sky-700">Pós-encontro</p>
                    <p className="font-bold text-slate-900">{group.label}</p>
                  </div>
                  <span className="text-lg font-black text-sky-700">{group.rate}%</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>{group.sessions} sessão(ões)</span>
                  <span>{group.present}/{group.eligible} presenças elegíveis</span>
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-slate-200">
              <button type="button" onClick={() => setCirclesOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <div>
                  <p className="font-bold text-slate-900">Círculos</p>
                  <p className="text-xs text-slate-500">{circleGroups.length} casal(is) de tios</p>
                </div>
                <span className="text-xl font-black text-slate-500">{circlesOpen ? '−' : '+'}</span>
              </button>

              {circlesOpen && (
                <div className="space-y-3 border-t border-slate-200 p-4">
                  {circleGroups.map((group: any) => (
                    <div key={group.key} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-slate-900">{group.label}</p>
                        <span className="text-lg font-black text-sky-700">{group.rate}%</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                        <span>{group.sessions} sessão(ões)</span>
                        <span>{group.present}/{group.eligible} presenças elegíveis</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Evolução por sessão</h2>
          <p className="mt-1 text-sm text-slate-600">Taxa de presença conhecida em cada sessão encerrada.</p>
          {evolution.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ainda não há sessões encerradas suficientes para análise.</p> : (
            <div className="mt-4 space-y-3">
              {evolution.map((item: any) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{item.title}</p><span className="font-black text-emerald-700">{item.rate}%</span></div>
                  <p className="mt-1 text-sm text-slate-600">{item.knownPresent}/{item.eligible} presenças vinculadas{item.unlinkedPresent ? ` · ${item.unlinkedPresent} sem cadastro` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Frequência individual</h2>
          <p className="mt-1 text-sm text-slate-600">Presenças, faltas e sequência atual de ausências nas sessões em que cada pessoa era elegível.</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-3 py-3">Pessoa</th><th className="px-3 py-3">Círculo</th><th className="px-3 py-3 text-center">Elegível</th><th className="px-3 py-3 text-center">Presenças</th><th className="px-3 py-3 text-center">Faltas</th><th className="px-3 py-3 text-center">Faltas seguidas</th><th className="px-3 py-3 text-right">Frequência</th></tr></thead>
            <tbody>
              {people.map((person: any) => (
                <tr key={person.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 font-semibold text-slate-900">{person.name}</td>
                  <td className="px-3 py-3 text-slate-600">{person.circle || 'Sem círculo'}</td>
                  <td className="px-3 py-3 text-center">{person.eligibleSessions}</td>
                  <td className="px-3 py-3 text-center">{person.present}</td>
                  <td className="px-3 py-3 text-center">{person.absences}</td>
                  <td className="px-3 py-3 text-center">{person.consecutiveAbsences}</td>
                  <td className="px-3 py-3 text-right font-black">{person.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default MockPresenceAnalyticsPage;
