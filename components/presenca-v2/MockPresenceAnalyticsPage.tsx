import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';

const call = async (action: string, data: any = {}) => {
  const result = await postComunicadosAction<any>(action, data);
  if (!result.success) throw new Error(result.error || 'Não foi possível carregar os indicadores.');
  return result.data as any;
};

const rate = (value: unknown) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0%';
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
};

const dateLabel = (value?: string | null) => {
  if (!value) return 'Sem presença registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem presença registrada';
  return date.toLocaleDateString('pt-BR');
};

const Stat: React.FC<{label:string;value:React.ReactNode;detail?:string;accent?:string}> = ({label,value,detail,accent='text-slate-900'}) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-3xl font-black ${accent}`}>{value}</p>
    {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
  </div>
);

const MockPresenceAnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [peopleFilter, setPeopleFilter] = useState('');
  const [editionFilter, setEditionFilter] = useState('TODOS');
  const [profileFilter, setProfileFilter] = useState('TODOS');
  const [open, setOpen] = useState<Record<string, boolean>>({
    generations:true,
    channels:true,
    tios:true,
    leaders:true,
    evolution:false,
    individual:true,
  });

  const refresh = useCallback(async () => {
    try {
      setNotice('');
      const data = await call('PRESENCA_V2_GET_ANALYTICS');
      setAnalytics(data.analytics);
    } catch (error:any) {
      setNotice(error?.message || 'Não foi possível carregar os indicadores.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = (key:string) => setOpen((current)=>({...current,[key]:!current[key]}));

  const people = Array.isArray(analytics?.people) ? analytics.people : [];
  const generations = Array.isArray(analytics?.generations) ? analytics.generations : [];
  const tios = Array.isArray(analytics?.tiosPerformance) ? analytics.tiosPerformance : [];
  const leaders = Array.isArray(analytics?.engagementLeaders) ? analytics.engagementLeaders : [];
  const profiles = analytics?.engagementProfiles || {};
  const summary = analytics?.summary || {};
  const evolution = Array.isArray(analytics?.sessionEvolution) ? analytics.sessionEvolution : [];

  const filteredPeople = useMemo(() => people
    .filter((person:any)=>{
      const text=peopleFilter.trim().toLocaleLowerCase('pt-BR');
      const textOk=!text
        || String(person.name||'').toLocaleLowerCase('pt-BR').includes(text)
        || String(person.circle||'').toLocaleLowerCase('pt-BR').includes(text);
      const editionOk=editionFilter==='TODOS'||String(person.edition||'')===editionFilter;
      const profileOk=profileFilter==='TODOS'||String(person.participationProfile||'')===profileFilter;
      return textOk&&editionOk&&profileOk;
    })
    .sort((a:any,b:any)=>
      Number(b.engagementRate||0)-Number(a.engagementRate||0)
      || Number(b.present||0)-Number(a.present||0)
      || String(a.name||'').localeCompare(String(b.name||''),'pt-BR')
    ),[people,peopleFilter,editionFilter,profileFilter]);

  if (!analytics) {
    return <section className="mx-auto max-w-7xl p-5 md:p-8"><p className="rounded-2xl bg-white p-5 shadow-sm">{notice || 'Carregando painel de engajamento…'}</p></section>;
  }

  const active=people.filter((p:any)=>Number(p.present||0)>0).length;
  const engagementAverage=people.length
    ? people.reduce((sum:number,p:any)=>sum+Number(p.engagementRate||0),0)/people.length
    : 0;
  const topTios=tios.slice().sort((a:any,b:any)=>Number(b.engagementRate||0)-Number(a.engagementRate||0));

  const sectionHeader=(key:string,title:string,subtitle:string)=>(
    <button type="button" onClick={()=>toggle(key)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <span className="text-2xl font-black text-slate-500">{open[key]?'−':'+'}</span>
    </button>
  );

  return (
    <section className="mx-auto max-w-7xl p-5 md:p-8">
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 md:flex md:items-center md:justify-between md:gap-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-800">Presença V2 · inteligência de participação</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Engajamento e participação no EAC</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-700">Leitura para montagem e acompanhamento do movimento: retenção por encontro, participação no Pós, presença em círculo, mobilização dos Tios e adolescentes com maior vínculo.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
          <button type="button" onClick={()=>{window.location.href='/cadastro/presenca/sessoes';}} className="rounded-xl bg-[#044372] px-4 py-3 text-sm font-black text-white">Gerenciar reuniões</button>
          <button type="button" onClick={()=>void refresh()} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">Atualizar painel</button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Adolescentes acompanhados" value={people.length} detail="População elegível analisada" />
        <Stat label="Com participação" value={active} detail="Ao menos uma presença" accent="text-sky-700" />
        <Stat label="Engajamento médio" value={rate(engagementAverage)} detail="Presenças ÷ oportunidades elegíveis" accent="text-emerald-700" />
        <Stat label="Pós + círculo" value={Number(profiles.both||0)} detail="Participaram dos dois canais" accent="text-violet-700" />
        <Stat label="Sem participação" value={Number(profiles.none||0)} detail="Ainda sem presença encerrada" accent="text-amber-700" />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <strong className="text-slate-900">Como ler:</strong> o painel não atribui mérito subjetivo. Engajamento é apenas presença confirmada dividida pelas reuniões encerradas em que o adolescente estava elegível. Com apenas um Pós e uma reunião de círculo encerrados, os percentuais ainda são uma fotografia inicial e ganharão valor histórico com novas reuniões.
      </div>

      <div className="mt-6 space-y-4">
        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('generations','Engajamento por encontro de origem','Compare como cada geração do EAC continua participando do movimento.')}
          {open.generations && (
            <div className="border-t border-slate-200 p-5">
              {generations.length===0 ? <p className="text-sm text-slate-500">Ainda não há dados por encontro.</p> : (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {generations.map((item:any)=>(
                    <article key={item.edition} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-xs font-black uppercase text-sky-700">Geração</p><h3 className="text-xl font-black text-slate-900">EAC {item.edition}</h3></div>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">{rate(item.engagementRate)}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Acompanhados</p><p className="font-black text-slate-900">{item.adolescents}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Com participação</p><p className="font-black text-sky-700">{item.active} · {rate(item.activeRate)}</p></div>
                        <div className="rounded-xl bg-violet-50 p-3"><p className="text-xs text-violet-700">Pós</p><p className="font-black text-violet-900">{item.postPresent}/{item.postEligible} · {rate(item.postRate)}</p></div>
                        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Círculo</p><p className="font-black text-emerald-900">{item.circlePresent}/{item.circleEligible} · {rate(item.circleRate)}</p></div>
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                        <span className="font-bold text-slate-800">{item.both}</span> nos dois · <span className="font-bold text-slate-800">{item.onlyPost}</span> só Pós · <span className="font-bold text-slate-800">{item.onlyCircle}</span> só círculo · <span className="font-bold text-slate-800">{item.none}</span> sem participação
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('channels','Como o adolescente mantém vínculo','Separe quem participa dos dois espaços, somente do Pós, somente do círculo ou ainda não retornou.')}
          {open.channels && (
            <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase text-emerald-700">Pós + círculo</p><p className="mt-1 text-3xl font-black text-emerald-900">{Number(profiles.both||0)}</p><p className="mt-2 text-sm text-emerald-800">Vínculo pelos dois canais.</p></div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="text-xs font-black uppercase text-violet-700">Somente Pós</p><p className="mt-1 text-3xl font-black text-violet-900">{Number(profiles.onlyPost||0)}</p><p className="mt-2 text-sm text-violet-800">Participação geral, sem presença de círculo.</p></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5"><p className="text-xs font-black uppercase text-sky-700">Somente círculo</p><p className="mt-1 text-3xl font-black text-sky-900">{Number(profiles.onlyCircle||0)}</p><p className="mt-2 text-sm text-sky-800">Vínculo local com os Tios.</p></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-black uppercase text-amber-700">Sem participação</p><p className="mt-1 text-3xl font-black text-amber-900">{Number(profiles.none||0)}</p><p className="mt-2 text-sm text-amber-800">Prioridade para acompanhamento.</p></div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('tios','Mobilização por Tios de Círculo','Compare a participação dos adolescentes acompanhados no Pós e nas reuniões de círculo.')}
          {open.tios && (
            <div className="border-t border-slate-200 p-5">
              {topTios.length===0 ? <p className="text-sm text-slate-500">Ainda não há reuniões encerradas suficientes para comparar os Tios.</p> : (
                <div className="space-y-3">
                  {topTios.map((group:any,index:number)=>(
                    <article key={group.key} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">#{index+1}</span><h3 className="font-black text-slate-900">{group.label}</h3></div>
                          <p className="mt-1 text-xs text-slate-500">{(group.circles||[]).join(' / ')||'Círculos não identificados'} · {group.adolescents||0} adolescente(s)</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-violet-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-violet-700">Pós</p><p className="font-black text-violet-900">{rate(group.postRate)}</p></div>
                          <div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-emerald-700">Círculo</p><p className="font-black text-emerald-900">{rate(group.circleRate)}</p></div>
                          <div className="rounded-xl bg-sky-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-sky-700">Combinado</p><p className="font-black text-sky-900">{rate(group.engagementRate)}</p></div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('leaders','Adolescentes com maior engajamento','Nomes com maior proporção de presença nas oportunidades em que estavam elegíveis.')}
          {open.leaders && (
            <div className="border-t border-slate-200 p-5">
              {leaders.length===0 ? <p className="text-sm text-slate-500">Ainda não há presenças suficientes para montar o ranking.</p> : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {leaders.slice(0,12).map((person:any,index:number)=>(
                    <article key={person.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">#{index+1}</span><p className="truncate font-black text-slate-900">{person.name}</p></div>
                        <p className="mt-1 text-xs text-slate-500">EAC {person.edition||'?'} · {person.circle||'Sem círculo'} · última presença {dateLabel(person.lastParticipationAt)}</p>
                      </div>
                      <div className="shrink-0 text-right"><p className="text-xl font-black text-emerald-700">{rate(person.engagementRate)}</p><p className="text-xs text-slate-500">{person.present}/{person.eligibleSessions}</p></div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('evolution','Evolução por reunião','Mantenha a leitura operacional de cada reunião encerrada.')}
          {open.evolution && (
            <div className="space-y-3 border-t border-slate-200 p-5">
              {evolution.map((item:any)=>(
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{item.title}</p><span className="font-black text-emerald-700">{rate(item.rate)}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{item.knownPresent}/{item.eligible} presenças vinculadas{item.unlinkedPresent? ` · ${item.unlinkedPresent} sem cadastro`:''}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white shadow-sm">
          {sectionHeader('individual','Base individual para montagem','Consulte cada adolescente por EAC, tipo de vínculo e frequência.')}
          {open.individual && (
            <div className="border-t border-slate-200 p-5">
              <div className="grid gap-3 lg:grid-cols-3">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Buscar adolescente ou círculo
                  <input value={peopleFilter} onChange={(e)=>setPeopleFilter(e.target.value)} placeholder="Nome ou círculo" className="rounded-xl border border-slate-300 px-3 py-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Encontro
                  <select value={editionFilter} onChange={(e)=>setEditionFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
                    <option value="TODOS">Todos</option>
                    {generations.map((item:any)=><option key={item.edition} value={String(item.edition)}>EAC {item.edition}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">Tipo de vínculo
                  <select value={profileFilter} onChange={(e)=>setProfileFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
                    <option value="TODOS">Todos</option>
                    <option value="POS_E_CIRCULO">Pós + círculo</option>
                    <option value="SOMENTE_POS">Somente Pós</option>
                    <option value="SOMENTE_CIRCULO">Somente círculo</option>
                    <option value="SEM_PARTICIPACAO">Sem participação</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="px-3 py-3">Adolescente</th><th className="px-3 py-3">EAC / círculo</th><th className="px-3 py-3 text-center">Pós</th><th className="px-3 py-3 text-center">Círculo</th><th className="px-3 py-3 text-center">Geral</th><th className="px-3 py-3">Última presença</th><th className="px-3 py-3">Leitura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map((person:any)=>(
                      <tr key={person.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-bold text-slate-900">{person.name}</td>
                        <td className="px-3 py-3 text-slate-600">EAC {person.edition||'?'} · {person.circle||'Sem círculo'}</td>
                        <td className="px-3 py-3 text-center">{person.postPresent}/{person.postEligible} · <strong className="text-violet-700">{rate(person.postRate)}</strong></td>
                        <td className="px-3 py-3 text-center">{person.circlePresent}/{person.circleEligible} · <strong className="text-emerald-700">{rate(person.circleRate)}</strong></td>
                        <td className="px-3 py-3 text-center font-black text-sky-700">{rate(person.engagementRate)}</td>
                        <td className="px-3 py-3 text-slate-600">{dateLabel(person.lastParticipationAt)}</td>
                        <td className="px-3 py-3 text-slate-600">{person.participationProfile==='POS_E_CIRCULO'?'Pós + círculo':person.participationProfile==='SOMENTE_POS'?'Somente Pós':person.participationProfile==='SOMENTE_CIRCULO'?'Somente círculo':'Sem participação'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPeople.length===0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum adolescente encontrado com os filtros informados.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      {(summary.unlinkedConfirmedCount||0)>0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{summary.unlinkedConfirmedCount} presença(s) sem vínculo cadastral não entram na análise individual.</div>}
    </section>
  );
};

export default MockPresenceAnalyticsPage;
