import React, { useEffect, useMemo, useState } from 'react';
import type { EncontreiroRecord } from '../types.ts';
import { encontreirosService } from '../services/encontreirosService.ts';
import { postComunicadosAction } from '../services/eacApiClient.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type Props = { googleWebAppUrl: string; canEdit: boolean };
type HistoryItem = { encontroId:string; encontro:string; equipe:string; funcao:string };

const clean=(value:any)=>toCleanString(value);
const pct=(value:any)=>{
  const n=Number(value||0);
  return Number.isFinite(n)?`${n.toFixed(n%1===0?0:1)}%`:'0%';
};
const norm=(value:any)=>clean(value).trim().toLocaleLowerCase('pt-BR');

export default function EncontreiroMontagemPanel({googleWebAppUrl}:Props){
  const [records,setRecords]=useState<EncontreiroRecord[]>([]);
  const [analytics,setAnalytics]=useState<any>(null);
  const [encontros,setEncontros]=useState<any[]>([]);
  const [history,setHistory]=useState<Map<string,HistoryItem[]>>(new Map());
  const [currentAllocated,setCurrentAllocated]=useState<Set<string>>(new Set());
  const [selectedEncontro,setSelectedEncontro]=useState('');
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [showAdults,setShowAdults]=useState(false);
  const [search,setSearch]=useState('');
  const [edition,setEdition]=useState('TODOS');
  const [engagement,setEngagement]=useState('TODOS');
  const [experience,setExperience]=useState('TODOS');

  useEffect(()=>{ void (async()=>{
    setLoading(true); setMessage('');
    try{
      const [encRes,meetRes,analyticsRes]=await Promise.all([
        encontreirosService.listar({}, {googleWebAppUrl}),
        encontreirosService.listarEncontros({googleWebAppUrl}),
        postComunicadosAction<any>('PRESENCA_V2_GET_ANALYTICS',{}, {googleWebAppUrl}),
      ]);
      if(!encRes.success) throw new Error(encRes.error||'Não foi possível carregar encontreiros.');
      if(!meetRes.success) throw new Error(meetRes.error||'Não foi possível carregar encontros.');
      if(!analyticsRes.success) throw new Error(analyticsRes.error||'Não foi possível carregar engajamento.');
      const all=Array.isArray(encRes.data?.items)?encRes.data.items:[];
      const meets=Array.isArray(meetRes.data?.encontros)?meetRes.data.encontros:[];
      setRecords(all);
      setEncontros(meets);
      setAnalytics((analyticsRes.data as any)?.analytics||null);
      const target=clean(meets[0]?.id);
      setSelectedEncontro(target);

      const histories=new Map<string,HistoryItem[]>();
      const allocated=new Set<string>();
      const settled=await Promise.all(meets.map(async(meet:any)=>{
        const res=await encontreirosService.listarComposicaoEquipe({encontroId:clean(meet.id)},{googleWebAppUrl});
        return {meet,res};
      }));
      settled.forEach(({meet,res})=>{
        if(!res.success) return;
        const meetId=clean(meet.id);
        const meetName=clean(meet.nome||meet.titulo||meet.descricao)||'Encontro';
        for(const team of (res.data?.equipes||[])){
          for(const member of (team.membros||[])){
            const id=clean(member.encontreiroId||member.encontreiro_id);
            if(!id) continue;
            const list=histories.get(id)||[];
            list.push({encontroId:meetId,encontro:meetName,equipe:clean(team.nome)||'Equipe',funcao:clean(member.funcao)||'Membro'});
            histories.set(id,list);
            if(meetId===target) allocated.add(id);
          }
        }
      });
      setHistory(histories);
      setCurrentAllocated(allocated);
    }catch(error:any){setMessage(error?.message||'Não foi possível carregar a central de montagem.');}
    setLoading(false);
  })(); },[googleWebAppUrl]);

  useEffect(()=>{ void (async()=>{
    if(!selectedEncontro) {setCurrentAllocated(new Set());return;}
    const res=await encontreirosService.listarComposicaoEquipe({encontroId:selectedEncontro},{googleWebAppUrl});
    if(!res.success) return;
    const ids=new Set<string>();
    for(const team of (res.data?.equipes||[])) for(const member of (team.membros||[])){
      const id=clean(member.encontreiroId||member.encontreiro_id); if(id) ids.add(id);
    }
    setCurrentAllocated(ids);
  })();},[selectedEncontro,googleWebAppUrl]);

  const adults=useMemo(()=>records.filter(r=>norm(r.classificacao)==='adulto').sort((a,b)=>clean(a.nomeCompleto).localeCompare(clean(b.nomeCompleto),'pt-BR')),[records]);
  const adolescents=useMemo(()=>records.filter(r=>norm(r.classificacao)==='adolescente'),[records]);
  const recordByPerson=useMemo(()=>{
    const m=new Map<string,EncontreiroRecord>();
    records.forEach(r=>{if(clean(r.pessoaId))m.set(clean(r.pessoaId),r);});
    return m;
  },[records]);
  const people=(Array.isArray(analytics?.people)?analytics.people:[]).map((p:any)=>{
    const rec=recordByPerson.get(clean(p.id));
    return {...p,encontreiroId:clean(rec?.id),bairro:clean(rec?.bairro),history:history.get(clean(rec?.id))||[],allocated:currentAllocated.has(clean(rec?.id))};
  }).filter((p:any)=>p.encontreiroId);

  const editions=Array.from(new Set(people.map((p:any)=>Number(p.edition||0)).filter(Boolean))).sort((a,b)=>a-b);
  const filtered=people.filter((p:any)=>{
    const q=norm(search);
    if(q&&!norm(`${p.name} ${p.circle} ${p.bairro}`).includes(q))return false;
    if(edition!=='TODOS'&&String(p.edition)!==edition)return false;
    if(engagement==='ALTO'&&Number(p.engagementRate||0)<75)return false;
    if(engagement==='MEDIO'&&(Number(p.engagementRate||0)<40||Number(p.engagementRate||0)>=75))return false;
    if(engagement==='BAIXO'&&Number(p.engagementRate||0)>=40)return false;
    if(engagement==='POS_CIRCULO'&&p.participationProfile!=='POS_E_CIRCULO')return false;
    if(experience==='PRIMEIRA'&&p.history.length>0)return false;
    if(experience==='JA_TRABALHOU'&&p.history.length===0)return false;
    if(experience==='DISPONIVEL'&&p.allocated)return false;
    return true;
  }).sort((a:any,b:any)=>Number(b.engagementRate||0)-Number(a.engagementRate||0)||String(a.name).localeCompare(String(b.name),'pt-BR'));

  const eligibleCount=people.length;
  const allocatedCount=people.filter((p:any)=>p.allocated).length;
  const availableCount=Math.max(0,eligibleCount-allocatedCount);
  const firstOpportunity=people.filter((p:any)=>p.history.length===0).length;
  const selectedMeet=encontros.find(e=>clean(e.id)===selectedEncontro);

  if(loading)return <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">Carregando central de montagem...</div>;

  return <section className="space-y-5">
    <div className="rounded-[2.5rem] border border-blue-200 bg-blue-50 p-6 md:p-8">
      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Planejamento do próximo encontro</p>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h3 className="text-2xl font-black text-slate-900">Central de montagem</h3><p className="mt-2 max-w-3xl text-sm font-medium text-slate-600">Escolha adolescentes usando presença no Pós, reuniões de círculo e histórico real de equipes. Adultos permanecem disponíveis como base auxiliar.</p></div>
        <label className="grid min-w-[260px] gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Encontro em montagem
          <select value={selectedEncontro} onChange={e=>setSelectedEncontro(e.target.value)} className="rounded-2xl border-2 border-white bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-slate-800">
            <option value="">Selecione</option>{encontros.map(e=><option key={clean(e.id)} value={clean(e.id)}>{clean(e.nome||e.titulo||e.descricao)}</option>)}
          </select>
        </label>
      </div>
      {message&&<p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</p>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-500">Adolescentes analisados</p><p className="mt-1 text-3xl font-black text-slate-900">{eligibleCount}</p><p className="mt-1 text-xs text-slate-500">Base de engajamento disponível</p></div>
      <button type="button" onClick={()=>setExperience('DISPONIVEL')} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-300"><p className="text-[10px] font-black uppercase text-slate-500">Disponíveis</p><p className="mt-1 text-3xl font-black text-emerald-700">{availableCount}</p><p className="mt-1 text-xs text-slate-500">Ainda não alocados em {clean(selectedMeet?.nome)||'este encontro'}</p></button>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-500">Já alocados</p><p className="mt-1 text-3xl font-black text-blue-700">{allocatedCount}</p><p className="mt-1 text-xs text-slate-500">Em alguma equipe do encontro</p></div>
      <button type="button" onClick={()=>setExperience('PRIMEIRA')} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-violet-300"><p className="text-[10px] font-black uppercase text-slate-500">Primeira oportunidade</p><p className="mt-1 text-3xl font-black text-violet-700">{firstOpportunity}</p><p className="mt-1 text-xs text-slate-500">Sem histórico de equipe</p></button>
      <button type="button" onClick={()=>setShowAdults(true)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-amber-300"><p className="text-[10px] font-black uppercase text-slate-500">Adultos cadastrados</p><p className="mt-1 text-3xl font-black text-amber-700">{adults.length}</p><p className="mt-1 text-xs font-bold text-amber-700">Clique para ver os nomes</p></button>
    </div>

    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h4 className="font-black text-slate-900">Banco de adolescentes para montagem</h4><p className="text-sm text-slate-500">Ordenado pelo maior engajamento objetivo. A decisão final continua sendo da equipe de montagem.</p></div><p className="text-sm font-black text-blue-700">{filtered.length} candidato(s) no filtro</p></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, círculo ou bairro" className="rounded-xl border border-slate-300 px-3 py-3 text-sm xl:col-span-2"/>
        <select value={edition} onChange={e=>setEdition(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="TODOS">Todos os EACs</option>{editions.map(e=><option key={e} value={String(e)}>EAC {e}</option>)}</select>
        <select value={engagement} onChange={e=>setEngagement(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="TODOS">Todo engajamento</option><option value="POS_CIRCULO">Pós + círculo</option><option value="ALTO">Engajamento ≥ 75%</option><option value="MEDIO">Engajamento 40–74%</option><option value="BAIXO">Engajamento &lt; 40%</option></select>
        <select value={experience} onChange={e=>setExperience(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="TODOS">Toda experiência</option><option value="DISPONIVEL">Disponíveis no encontro</option><option value="PRIMEIRA">Primeira oportunidade</option><option value="JA_TRABALHOU">Já trabalhou</option></select>
      </div>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      {filtered.map((p:any)=>{
        const repeated=p.history.length>=2&&p.history.slice(-2).every((h:HistoryItem)=>h.equipe===p.history[p.history.length-1]?.equipe);
        return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-black text-slate-900">{p.name}</p><p className="mt-1 text-xs text-slate-500">EAC {p.edition||'?'} · {p.circle||'Sem círculo'}{p.bairro?` · ${p.bairro}`:''}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${p.allocated?'bg-blue-50 text-blue-700':'bg-emerald-50 text-emerald-700'}`}>{p.allocated?'Já alocado':pct(p.engagementRate)}</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-violet-50 p-3"><p className="text-[10px] font-black uppercase text-violet-700">Pós</p><p className="font-black text-violet-900">{pct(p.postRate)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Círculo</p><p className="font-black text-emerald-900">{pct(p.circleRate)}</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-[10px] font-black uppercase text-sky-700">Geral</p><p className="font-black text-sky-900">{pct(p.engagementRate)}</p></div></div>
          <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Histórico de equipes</p>{p.history.length===0?<p className="mt-2 text-sm font-bold text-violet-700">Primeira oportunidade: ainda não trabalhou em equipe registrada.</p>:<div className="mt-2 flex flex-wrap gap-2">{p.history.slice(-4).map((h:HistoryItem,i:number)=><span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{h.encontro} · {h.equipe}</span>)}</div>}{repeated&&<p className="mt-2 text-xs font-bold text-amber-700">Atenção: repetição recente da mesma equipe.</p>}</div>
        </article>;
      })}
      {filtered.length===0&&<p className="lg:col-span-2 rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">Nenhum adolescente encontrado com esses critérios.</p>}
    </div>

    {showAdults&&<div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5"><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Base auxiliar</p><h4 className="text-xl font-black text-slate-900">Adultos cadastrados ({adults.length})</h4></div><button type="button" onClick={()=>setShowAdults(false)} className="rounded-xl p-2 text-2xl font-black text-slate-500 hover:bg-slate-100">×</button></div>
        <div className="max-h-[70vh] overflow-y-auto p-5"><div className="grid gap-2 sm:grid-cols-2">{adults.map(a=><div key={a.id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold text-slate-900">{clean(a.nomeCompleto)}</p><p className="mt-1 text-xs text-slate-500">{clean(a.bairro)||'Bairro não informado'}{clean(a.celularWhatsapp)?` · ${clean(a.celularWhatsapp)}`:''}</p></div>)}</div>{adults.length===0&&<p className="py-8 text-center text-sm text-slate-500">Nenhum adulto classificado no cadastro.</p>}</div>
      </div>
    </div>}
  </section>;
}
