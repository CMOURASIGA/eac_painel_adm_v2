import React,{useEffect,useMemo,useRef,useState} from 'react';
import html2canvas from 'html2canvas';
import PublicAgendaArt,{ART_SIZE,waitForArtAssets,type PublicArtFormat,type PublicArtStyle,type PublicArtKind} from './PublicAgendaArt.tsx';
type E={id:string;atividade:string;inicio:string;termino?:string;local?:string;origem:'EAC'|'GOOGLE_EAC'};
const MONTH=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const EXPORT_SCALE=1; // 1 = tamanho exato do formato (1080×1350 etc.). Use 2 só se quiser o dobro de resolução.
const PREVIEW_WIDTH=320;
const parts=(v:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const clock=(v:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
export default function PublicEacCalendar(){
 const artRef=useRef<HTMLDivElement|null>(null);
 const [artFormat,setArtFormat]=useState<PublicArtFormat>('feed'),[artStyle,setArtStyle]=useState<PublicArtStyle>('colagem'),[artKind,setArtKind]=useState<PublicArtKind>('mes'),[exporting,setExporting]=useState(false);
 const [date,setDate]=useState(()=>new Date()),[events,setEvents]=useState<E[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(()=>new Date().getDate()),[view,setView]=useState<'mes'|'lista'>('mes');
 const year=date.getFullYear(),month=date.getMonth(),days=new Date(year,month+1,0).getDate(),offset=new Date(year,month,1).getDay();
 useEffect(()=>{const ctrl=new AbortController();setBusy(true);fetch('/api/publico/calendario?year='+year+'&month='+(month+1),{signal:ctrl.signal}).then(r=>r.json()).then(x=>{if(!x.success)throw Error(x.error||'Agenda indisponível');setEvents(x.events||[]);setError('')}).catch(e=>{if(!ctrl.signal.aborted)setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setBusy(false)});return()=>ctrl.abort()},[year,month]);
 const key=(d:number)=>year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 const byDay=(d:number)=>events.filter(e=>parts(e.inicio)===key(d)).sort((a,b)=>a.inicio.localeCompare(b.inicio));
 const move=(n:number)=>{setDate(d=>new Date(d.getFullYear(),d.getMonth()+n,1));setSelected(1)};
 const today=byDay(selected);

 /* Eventos que entram na arte, conforme o tipo escolhido (sempre em ordem cronológica). */
 const calendarUrl=window.location.origin+'/publico/calendario';
 const artEvents=useMemo(()=>{
  const sorted=[...events].sort((a,b)=>a.inicio.localeCompare(b.inicio));
  if(artKind==='evento')return sorted.filter(e=>parts(e.inicio)===key(selected));
  if(artKind==='semana'){
   const start=new Date(year,month,selected);
   const first=new Date(start.getFullYear(),start.getMonth(),start.getDate()-start.getDay());
   const last=new Date(first.getFullYear(),first.getMonth(),first.getDate()+7);
   return sorted.filter(e=>{const at=new Date(e.inicio);return at>=first&&at<last});
  }
  return sorted;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[events,artKind,selected,year,month]);
 const artProps={month:MONTH[month],year,events:artEvents,format:artFormat,style:artStyle,kind:artKind,calendarUrl};
 const size=ART_SIZE[artFormat];
 const previewScale=PREVIEW_WIDTH/size.w;

 const exportArt=async()=>{
  if(!artRef.current||exporting)return;
  setExporting(true);
  try{
   await waitForArtAssets(artRef.current); // fontes + imagens + QR prontos antes de capturar
   const canvas=await html2canvas(artRef.current,{backgroundColor:null,scale:EXPORT_SCALE,useCORS:true,width:size.w,height:size.h});
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('IMAGE_EXPORT_FAILED');
   const file=new File([blob],'agenda-eac-'+artKind+'-'+artFormat+'.png',{type:'image/png'});
   if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Agenda EAC'});
   else{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=file.name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
  }catch(err){if(!(err instanceof DOMException&&err.name==='AbortError'))window.alert('Não foi possível gerar a imagem.')}
  finally{setExporting(false)}
 };
 const text=`Confira a Agenda EAC de ${MONTH[month]} ${year}! ${calendarUrl}`;
 return <main className="min-h-screen bg-[#f5f7fc] text-slate-900">
  <header className="bg-[#0b376a] text-white px-4 py-3"><div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-2"><img src="https://i.imgur.com/c5XQ7TW.jpg" alt="EAC" className="h-12 w-12 object-contain"/><div className="font-black">EAC Porciúncula de Sant'Anna<small className="block font-normal">Agenda pública</small></div></div><a href="/" className="rounded-lg border border-white/30 px-3 py-2 text-xs">Área interna</a></div></header>
  <div className="mx-auto max-w-6xl p-4 md:p-7"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">AGENDA EAC</h1><p className="text-sm text-slate-500">Encontros, reuniões e atividades para a nossa comunidade.</p></div><div className="flex gap-2"><button onClick={()=>navigator.clipboard?.writeText(window.location.href)} className="rounded-xl bg-white px-4 py-2 text-sm font-bold">Copiar link</button><a className="rounded-xl bg-[#0b376a] px-4 py-2 text-sm font-bold text-white" href={'https://wa.me/?text='+encodeURIComponent(text)} target="_blank" rel="noreferrer">Compartilhar</a></div></div>
  <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><button onClick={()=>move(-1)} className="rounded-lg bg-slate-100 px-4 py-2" aria-label="Mês anterior">‹</button><h2 className="text-lg font-black">{MONTH[month]} {year}</h2><button onClick={()=>move(1)} className="rounded-lg bg-slate-100 px-4 py-2" aria-label="Próximo mês">›</button></div>
  <div className="mb-4 flex flex-wrap items-start gap-4 rounded-2xl bg-white p-3 shadow-sm" aria-label="Gerador de artes para divulgação">
     <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">Tipo de arte<select aria-label="Tipo de arte" value={artKind} onChange={e=>setArtKind(e.target.value as PublicArtKind)} className="mt-1 block rounded-lg border p-2"><option value="mes">Agenda mensal</option><option value="semana">Agenda da semana (semana do dia selecionado)</option><option value="evento">Destaque de evento (dia selecionado)</option></select></label>
      <label className="text-xs font-semibold">Formato<select aria-label="Formato de divulgação" value={artFormat} onChange={e=>setArtFormat(e.target.value as PublicArtFormat)} className="mt-1 block rounded-lg border p-2"><option value="feed">Post Feed · 1080×1350</option><option value="story">Story/Status · 1080×1920</option><option value="square">Quadrado · 1080×1080</option><option value="whatsapp">WhatsApp · 1200×675</option></select></label>
      <label className="text-xs font-semibold">Modelo<select aria-label="Modelo da arte" value={artStyle} onChange={e=>setArtStyle(e.target.value as PublicArtStyle)} className="mt-1 block rounded-lg border p-2"><option value="colagem">Colagem jovem</option><option value="clean">Clean</option><option value="destaque">Destaque forte</option></select></label>
      <button type="button" disabled={exporting||busy||Boolean(error)} onClick={()=>void exportArt()} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{exporting?'Gerando imagem…':'Gerar / compartilhar imagem'}</button>
     </div>
   </div>
  <div className="mb-4 flex items-center gap-2"><button onClick={()=>setView('mes')} className={`rounded-lg px-4 py-2 text-sm font-bold ${view==='mes'?'bg-blue-700 text-white':'bg-white'}`}>Mês</button><button onClick={()=>setView('lista')} className={`rounded-lg px-4 py-2 text-sm font-bold ${view==='lista'?'bg-blue-700 text-white':'bg-white'}`}>Lista</button><span className="ml-auto text-xs text-slate-500">{busy?'Atualizando…':events.length+' eventos'}</span></div>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">Não foi possível carregar a agenda: {error}</p>}
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="overflow-hidden rounded-2xl bg-white shadow-sm">{view==='mes'?<><div className="grid grid-cols-7 bg-[#0b376a] text-white">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=><div key={x} className="p-2 text-center text-[11px] font-bold">{x}</div>)}</div><div className="grid grid-cols-7">{Array.from({length:offset},(_,i)=><div key={'empty'+i} className="min-h-16 border border-slate-100 bg-slate-50"/>) }{Array.from({length:days},(_,i)=>{const d=i+1,evs=byDay(d);return <button key={d} onClick={()=>setSelected(d)} className={`min-h-16 border border-slate-100 p-1 text-left md:min-h-24 ${selected===d?'bg-blue-50 ring-1 ring-blue-500':''}`}><span className="font-black text-slate-800">{d}</span><div className="mt-1 hidden space-y-1 md:block">{evs.slice(0,2).map(e=><div key={e.id} className={`truncate rounded p-1 text-[10px] font-bold text-white ${e.origem==='GOOGLE_EAC'?'bg-emerald-600':'bg-blue-600'}`}>{e.atividade}</div>)}{evs.length>2&&<small>+{evs.length-2}</small>}</div>{evs.length>0&&<span className="block text-xs text-blue-600 md:hidden">● {evs.length}</span>}</button>})}</div></>:<div className="divide-y divide-slate-100">{events.map(e=><div key={e.id} className="flex gap-3 p-3"><span className="w-20 shrink-0 text-sm font-black">{clock(e.inicio)}</span><span className="min-w-0"><strong className="block">{e.atividade}</strong><small>{parts(e.inicio)} · {e.local||'Local a confirmar'}</small></span></div>)}</div>}</div><aside className="space-y-4"><section className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-black">Prévia da arte</h3><div aria-label="Pré-visualização da arte" className="mx-auto overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{width:PREVIEW_WIDTH,height:size.h*previewScale}}><div style={{width:size.w,height:size.h,transform:`scale(${previewScale})`,transformOrigin:'top left'}}><PublicAgendaArt {...artProps}/></div></div></section><section className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="mb-3 text-lg font-black">Dia {selected} de {MONTH[month]}</h3>{today.length===0?<p className="text-sm text-slate-500">Nenhum compromisso divulgado para o dia.</p>:<div className="space-y-2">{today.map(e=><div key={e.id} className={`rounded-xl border-l-4 bg-slate-50 p-3 ${e.origem==='GOOGLE_EAC'?'border-emerald-500':'border-blue-600'}`}><strong className="block text-sm">{e.atividade}</strong><small className="text-slate-500">{clock(e.inicio)} · {e.local||'Local a confirmar'}</small></div>)}</div>}</section></aside></div>
  <p className="py-6 text-center text-xs text-slate-500">Apenas eventos públicos do EAC. Agenda paroquial e eventos não aprovados não são divulgados.</p></div>
  {/* Cópia em tamanho real, fora da tela, usada só para gerar o PNG. */}
  <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true"><div ref={artRef} style={{width:size.w,height:size.h}}><PublicAgendaArt {...artProps}/></div></div>
 </main>;
}