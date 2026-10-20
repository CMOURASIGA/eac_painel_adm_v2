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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [tiosOrder, setTiosOrder] = useState<'POS' | 'CIRCULO'>('POS');
  const [peopleFilter, setPeopleFilter] = useState('');
  const [peopleStatus, setPeopleStatus] = useState<'TODOS' | 'COM_PRESENCA' | 'COM_FALTAS' | 'SEM_PRESENCA' | 'FREQUENTES'>('TODOS');

  const formatRate = (value: unknown) => {
    const rate = Number(value || 0);
    if (!Number.isFinite(rate)) return '0%';
    if (rate > 0 && rate < 1) return `${rate.toFixed(1)}%`;
    if (!Number.isInteger(rate)) return `${rate.toFixed(1)}%`;
    return `${rate}%`;
  };

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
  const tiosPerformanceGroups = (Array.isArray(analytics.tiosPerformance) ? analytics.tiosPerformance : [])
    .filter((group: any) => String(group.label || '').toLocaleLowerCase('pt-BR').includes(responsibleFilter.trim().toLocaleLowerCase('pt-BR')))
    .slice()
    .sort((a: any, b: any) => {
      const primary = tiosOrder === 'POS'
        ? Number(b.postRate || 0) - Number(a.postRate || 0)
        : Number(b.circleRate || 0) - Number(a.circleRate || 0);
      if (primary !== 0) return primary;
      const secondary = tiosOrder === 'POS'
        ? Number(b.circleRate || 0) - Number(a.circleRate || 0)
        : Number(b.postRate || 0) - Number(a.postRate || 0);
      if (secondary !== 0) return secondary;
      return String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR');
    });

  const filteredPeople = people.filter((person: any) => {
    const matchesText = String(person.name || '').toLocaleLowerCase('pt-BR').includes(peopleFilter.trim().toLocaleLowerCase('pt-BR'))
      || String(person.circle || '').toLocaleLowerCase('pt-BR').includes(peopleFilter.trim().toLocaleLowerCase('pt-BR'));
    if (!matchesText) return false;
    if (peopleStatus === 'COM_PRESENCA') return Number(person.present || 0) > 0;
    if (peopleStatus === 'COM_FALTAS') return Number(person.absences || 0) > 0;
    if (peopleStatus === 'SEM_PRESENCA') return Number(person.eligibleSessions || 0) > 0 && Number(person.present || 0) === 0;
    if (peopleStatus === 'FREQUENTES') return Number(person.eligibleSessions || 0) > 0 && Number(person.rate || 0) >= 75;
    return true;
  }).sort((a: any, b: any) => {
    if (peopleStatus === 'COM_PRESENCA') {
      const byPresent = Number(b.present || 0) - Number(a.present || 0);
      if (byPresent !== 0) return byPresent;
      const byRate = Number(b.rate || 0) - Number(a.rate || 0);
      if (byRate !== 0) return byRate;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });

  const toggleSection = (key: string) => setOpenSections((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="mx-auto max-w-7xl p-5 md:p-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-sky-200 bg-sky-50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-800">Presença V2 · análise</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Indicadores de presença</h1>
          <p className="mt-2 text-sm text-slate-700">Visão histórica e gerencial das reuniões encerradas. A operação de criar, abrir, encerrar e conciliar fica em uma tela separada.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { window.location.href = '/cadastro/presenca/sessoes'; }} className="rounded-xl bg-[#044372] px-4 py-3 text-sm font-black text-white">Gerenciar reuniões</button>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">Atualizar indicadores</button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Reuniões encerradas</p><p className="mt-1 text-3xl font-black text-slate-900">{summary.closedSessions || 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Participantes únicos</p><p className="mt-1 text-3xl font-black text-sky-700">{summary.uniqueParticipants || 0}</p><p className="mt-1 text-xs text-slate-500">{summary.confirmedPresences || 0} presença(s) confirmada(s)</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Frequência média</p><p className="mt-1 text-3xl font-black text-emerald-700">{formatRate(summary.averageAttendance)}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Nunca participaram</p><p className="mt-1 text-3xl font-black text-amber-700">{summary.neverParticipated || 0}</p></div>
      </div>

      {(summary.unlinkedConfirmedCount || 0) > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{summary.unlinkedConfirmedCount}</strong> presença(s) confirmada(s) administrativamente sem vínculo cadastral. Elas entram no total operacional, mas não compõem a frequência individual de pessoas cadastradas.</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm"><strong className="text-slate-900">Leitura dos indicadores:</strong> frequência é calculada somente sobre reuniões encerradas nas quais a pessoa estava elegível. Reuniões abertas não entram no cálculo.</div>

      <div className="mt-6 space-y-4">
        <section className="rounded-3xl bg-white shadow-sm">
          <button type="button" onClick={() => toggleSection('responsaveis')} className="flex w-full items-center justify-between gap-4 p-5 text-left">
            <div>
              <h2 className="text-lg font-black text-slate-900">Desempenho por responsáveis</h2>
              <p className="mt-1 text-sm text-slate-600">Casais de tios e responsável do Pós, considerando reuniões encerradas.</p>
            </div>
            <span className="text-2xl font-black text-slate-500">{openSections.responsaveis ? '−' : '+'}</span>
          </button>
          {openSections.responsaveis && (
            <div className="space-y-4 border-t border-slate-200 p-5">
              {postGroups.map((group: any) => (
                <div key={group.key} className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-black uppercase tracking-wide text-sky-700">Pós-encontro</p><p className="font-bold text-slate-900">{group.label}</p></div>
                    <span className="text-lg font-black text-sky-700">{formatRate(group.rate)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600"><span>{group.sessions} reunião(ões)</span><span>{group.present}/{group.eligible} presenças elegíveis</span></div>
                </div>
              ))}

              <div className="rounded-2xl border border-slate-200">
                <button type="button" onClick={() => toggleSection('circulos')} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                  <div>
                    <p className="font-bold text-slate-900">Desempenho dos Tios de Círculo</p>
                    <p className="text-xs text-slate-500">Comparativo dos adolescentes no Pós e nas reuniões de círculo.</p>
                  </div>
                  <span className="text-xl font-black text-slate-500">{openSections.circulos ? '−' : '+'}</span>
                </button>
                {openSections.circulos && (
                  <div className="border-t border-slate-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                      <label className="grid gap-1 text-sm font-semibold text-slate-700">
                        Localizar casal de tios
                        <input value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} placeholder="Digite parte do nome" className="rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-slate-700">
                        Ordenar por melhor presença
                        <select value={tiosOrder} onChange={(event)=>setTiosOrder(event.target.value as 'POS'|'CIRCULO')} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800">
                          <option value="POS">Pós-encontro</option>
                          <option value="CIRCULO">Reunião de círculo</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 space-y-3">
                      {tiosPerformanceGroups.length === 0 ? <p className="text-sm text-slate-500">Ainda não há dados encerrados suficientes para comparar os Tios.</p> : tiosPerformanceGroups.map((group: any, index: number) => {
                        const groupKey = `tios:${group.key}`;
                        return (
                          <div key={group.key} className="rounded-2xl border border-slate-200">
                            <button type="button" onClick={() => toggleSection(groupKey)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">#{index+1}</span>
                                  <p className="font-bold text-slate-900">{group.label}</p>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{(group.circles||[]).join(' / ') || 'Círculos não identificados'} · {group.adolescents||0} adolescente(s)</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <div className="grid grid-cols-2 gap-2 text-right">
                                  <div className="rounded-lg bg-violet-50 px-3 py-2">
                                    <p className="text-[10px] font-black uppercase text-violet-700">Pós</p>
                                    <p className="font-black text-violet-800">{formatRate(group.postRate)}</p>
                                  </div>
                                  <div className="rounded-lg bg-emerald-50 px-3 py-2">
                                    <p className="text-[10px] font-black uppercase text-emerald-700">Círculo</p>
                                    <p className="font-black text-emerald-800">{formatRate(group.circleRate)}</p>
                                  </div>
                                </div>
                                <span className="text-xl font-black text-slate-500">{openSections[groupKey] ? '−' : '+'}</span>
                              </div>
                            </button>

                            {openSections[groupKey] && (
                              <div className="border-t border-slate-200 bg-white p-4">
                                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                                  <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><strong>Pós:</strong> {group.postPresent}/{group.postEligible} presenças elegíveis · {formatRate(group.postRate)}</div>
                                  <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Reunião de círculo:</strong> {group.circlePresent}/{group.circleEligible} presenças elegíveis · {formatRate(group.circleRate)}</div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[760px] text-left text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                                        <th className="px-3 py-3">Adolescente</th>
                                        <th className="px-3 py-3">Círculo</th>
                                        <th className="px-3 py-3 text-center">Pós</th>
                                        <th className="px-3 py-3 text-right">Freq. Pós</th>
                                        <th className="px-3 py-3 text-center">Reunião de círculo</th>
                                        <th className="px-3 py-3 text-right">Freq. círculo</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(group.people||[]).map((person:any)=>(
                                        <tr key={person.id} className="border-b border-slate-100 last:border-0">
                                          <td className="px-3 py-3 font-semibold text-slate-900">{person.name}</td>
                                          <td className="px-3 py-3 text-slate-600">{person.circle || 'Sem círculo'}</td>
                                          <td className="px-3 py-3 text-center">{person.postPresent}/{person.postEligible}</td>
                                          <td className="px-3 py-3 text-right font-black text-violet-700">{formatRate(person.postRate)}</td>
                                          <td className="px-3 py-3 text-center">{person.circlePresent}/{person.circleEligible}</td>
                                          <td className="px-3 py-3 text-right font-black text-emerald-700">{formatRate(person.circleRate)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          <button type="button" onClick={() => toggleSection('evolucao')} className="flex w-full items-center justify-between gap-4 p-5 text-left">
            <div><h2 className="text-lg font-black text-slate-900">Evolução por reunião</h2><p className="mt-1 text-sm text-slate-600">Taxa de presença conhecida em cada reunião encerrada.</p></div>
            <span className="text-2xl font-black text-slate-500">{openSections.evolucao ? '−' : '+'}</span>
          </button>
          {openSections.evolucao && (
            <div className="border-t border-slate-200 p-5">
              {evolution.length === 0 ? <p className="text-sm text-slate-500">Ainda não há reuniões encerradas suficientes para análise.</p> : (
                <div className="space-y-3">
                  {evolution.map((item: any) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{item.title}</p><span className="font-black text-emerald-700">{formatRate(item.rate)}</span></div>
                      <p className="mt-1 text-sm text-slate-600">{item.knownPresent}/{item.eligible} presenças vinculadas{item.unlinkedPresent ? ` · ${item.unlinkedPresent} sem cadastro` : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          <button type="button" onClick={() => toggleSection('individual')} className="flex w-full items-center justify-between gap-4 p-5 text-left">
            <div><h2 className="text-lg font-black text-slate-900">Frequência individual</h2><p className="mt-1 text-sm text-slate-600">Presenças, faltas e sequência atual de ausências por pessoa.</p></div>
            <span className="text-2xl font-black text-slate-500">{openSections.individual ? '−' : '+'}</span>
          </button>
          {openSections.individual && (
            <div className="border-t border-slate-200 p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Buscar pessoa ou círculo
                  <input value={peopleFilter} onChange={(event) => setPeopleFilter(event.target.value)} placeholder="Nome ou círculo" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Situação
                  <select value={peopleStatus} onChange={(event) => setPeopleStatus(event.target.value as any)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800">
                    <option value="TODOS">Todos</option>
                    <option value="COM_PRESENCA">Com presença · mais presentes primeiro</option>
                    <option value="COM_FALTAS">Com faltas</option>
                    <option value="SEM_PRESENCA">Sem nenhuma presença</option>
                    <option value="FREQUENTES">Frequência ≥ 75%</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-3 py-3">Pessoa</th><th className="px-3 py-3">Círculo</th><th className="px-3 py-3 text-center">Elegível</th><th className="px-3 py-3 text-center">Presenças</th><th className="px-3 py-3 text-center">Faltas</th><th className="px-3 py-3 text-center">Faltas seguidas</th><th className="px-3 py-3 text-right">Frequência</th></tr></thead>
                  <tbody>
                    {filteredPeople.map((person: any) => (
                      <tr key={person.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-semibold text-slate-900">{person.name}</td>
                        <td className="px-3 py-3 text-slate-600">{person.circle || 'Sem círculo'}</td>
                        <td className="px-3 py-3 text-center">{person.eligibleSessions}</td>
                        <td className="px-3 py-3 text-center">{person.present}</td>
                        <td className="px-3 py-3 text-center">{person.absences}</td>
                        <td className="px-3 py-3 text-center">{person.consecutiveAbsences}</td>
                        <td className="px-3 py-3 text-right font-black">{formatRate(person.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPeople.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Nenhuma pessoa encontrada para os filtros aplicados.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default MockPresenceAnalyticsPage;
