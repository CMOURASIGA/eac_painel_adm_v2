import React,{useState} from 'react';
import {COLORS,SIZES,TEAMS} from '../legacy-store/data/mockData';
import {supabase} from '../legacy-store/lib/supabase';
import {searchEncontreiros} from '../legacy-store/services/api';
import type {EncontreiroOption} from '../legacy-store/types/api';

type Line={id:string;cor:string;tamanho:string;quantidade:number};
type Result={id:string;protocol:string;token:string;amount:number;pix:string;expirationHours:number};
const ENCONTRO_ID=import.meta.env.VITE_EAC_ENCONTRO_ID || '57a08fa1-29e9-4c35-ab34-eb187f79b13a';
const api='/api/eac-store/finance';
async function call(action:string,params:Record<string,unknown>,method:'GET'|'POST'='POST'){
 const url=method==='GET'?api+'?'+new URLSearchParams(Object.entries({action,...params}).map(([k,v])=>[k,String(v)])):api;
 const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({action,...params})}:{})});
 const json=await r.json().catch(()=>({error:'INVALID_SERVER_RESPONSE'}));
 if(!r.ok)throw new Error(json.error||'Não foi possível processar a solicitação.');
 return json;
}
export default function StorePreRequest(){
 const [isEncontreiro,setIsEncontreiro]=useState(false);
 const [search,setSearch]=useState('');
 const [candidates,setCandidates]=useState<EncontreiroOption[]>([]);
 const [person,setPerson]=useState<EncontreiroOption|null>(null);
 const [name,setName]=useState(''),[beneficiary,setBeneficiary]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[team,setTeam]=useState('');
 const [items,setItems]=useState<Line[]>([{id:'1',cor:'',tamanho:'',quantidade:1}]);
 const [result,setResult]=useState<Result|null>(null),[status,setStatus]=useState<any>(null),[proof,setProof]=useState<File|null>(null),[paidAt,setPaidAt]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const update=(id:string,k:keyof Line,value:string|number)=>setItems(rows=>rows.map(row=>row.id===id?{...row,[k]:value}:row));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  try{
   const payload={encontroId:ENCONTRO_ID,ehEncontreiro:isEncontreiro,solicitantePessoaId:person?.pessoa_id||null,nomeSolicitante:isEncontreiro?person?.nome_completo||name:name,telefoneSolicitante:phone,emailSolicitante:email,equipe:team,nomeBeneficiario:beneficiary,items:items.map(x=>({cor:x.cor,tamanho:x.tamanho,quantidade:x.quantidade}))};
   const json=await call('create',payload);setResult(json);setStatus(null);
  }catch(err){setError(err instanceof Error?err.message:'Erro ao solicitar camisa.')}finally{setBusy(false)}
 };
 const searchPeople=async(term:string)=>{setSearch(term);setPerson(null);try{setCandidates(await searchEncontreiros(term))}catch{setCandidates([])}};
 const refresh=async()=>{if(!result)return;try{setStatus((await call('track',{id:result.id,token:result.token},'GET')).request)}catch(err){setError(String(err))}};
 const sendPayment=async()=>{if(!result||!proof||!paidAt)return;setBusy(true);setError('');
  try{
   const ext=proof.name.split('.').pop()?.toLowerCase();
   const ticket=await call('proof-ticket',{id:result.id,token:result.token,extension:ext,size:proof.size});
   const {error:uploadError}=await supabase.storage.from('camisas-comprovantes').uploadToSignedUrl(ticket.path,ticket.uploadToken,proof,{contentType:proof.type});
   if(uploadError)throw uploadError;
   await call('inform',{id:result.id,token:result.token,paymentDate:paidAt,proofPath:ticket.path});
   await refresh();
  }catch(err){setError(err instanceof Error?err.message:'Falha ao informar pagamento.')}finally{setBusy(false)}
 };
 return <div className="mx-auto max-w-2xl px-4 py-8 font-sans text-[#0b2a5b]">
  <header className="rounded-2xl bg-[#0f4c81] p-6 text-white"><h1 className="text-2xl font-black">Solicitação de Camisas — EAC Store</h1><p className="mt-2 text-sm">Pré-solicitação sem pagamento antecipado. O pedido só será confirmado após conferência do Financeiro.</p></header>
  {error&&<p role="alert" className="my-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
  {!result?<form className="mt-5 space-y-4" onSubmit={submit}>
   <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-black">Dados da solicitação</h2>
    <label className="mt-4 block text-sm font-bold">Você é encontreiro?</label><div className="mt-2 flex gap-3"><button type="button" onClick={()=>setIsEncontreiro(true)} className="rounded-lg border px-5 py-2" aria-pressed={isEncontreiro}>Sim</button><button type="button" onClick={()=>{setIsEncontreiro(false);setPerson(null)}} className="rounded-lg border px-5 py-2" aria-pressed={!isEncontreiro}>Não</button></div>
    {isEncontreiro&&<><label className="mt-4 block text-sm font-bold">Encontre seu nome<input className="mt-1 w-full rounded-lg border p-3" value={search} onChange={e=>void searchPeople(e.target.value)} /></label><div className="space-y-1">{candidates.map(x=><button type="button" key={x.pessoa_id} className="block w-full rounded-lg bg-slate-100 p-2 text-left text-sm" onClick={()=>{setPerson(x);setName(x.nome_completo);setSearch(x.nome_completo);setCandidates([]);setBeneficiary(x.nome_completo)}}>{x.nome_completo}</button>)}</div></>}
    {!isEncontreiro&&<label className="mt-3 block text-sm font-bold">Solicitante<input required minLength={3} maxLength={180} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>}
    <label className="mt-3 block text-sm font-bold">Beneficiário<input required minLength={3} maxLength={180} value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Telefone<input value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label><label className="text-sm font-bold">E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label></div>
    <label className="mt-3 block text-sm font-bold">Equipe<select value={team} onChange={e=>setTeam(e.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="">Selecione</option>{TEAMS.map(x=><option key={x}>{x}</option>)}</select></label>
   </section>
   <section className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">Camisas</h2><button type="button" className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold" onClick={()=>setItems(v=>[...v,{id:crypto.randomUUID(),cor:'',tamanho:'',quantidade:1}])}>+ Adicionar</button></div>
   {items.map(row=><div key={row.id} className="mt-3 grid grid-cols-[1fr_1fr_75px_35px] gap-2"><select required value={row.cor} onChange={e=>update(row.id,'cor',e.target.value)} className="min-w-0 rounded-lg border p-2"><option value="">Cor</option>{COLORS.map(x=><option key={x}>{x}</option>)}</select><select required value={row.tamanho} onChange={e=>update(row.id,'tamanho',e.target.value)} className="min-w-0 rounded-lg border p-2"><option value="">Tam.</option>{SIZES.map(x=><option key={x}>{x}</option>)}</select><input aria-label="Quantidade" type="number" min={1} max={20} value={row.quantidade} onChange={e=>update(row.id,'quantidade',Number(e.target.value))} className="min-w-0 rounded-lg border p-2"/><button aria-label="Remover item" type="button" disabled={items.length===1} onClick={()=>setItems(v=>v.filter(x=>x.id!==row.id))}>×</button></div>)}</section>
   <button disabled={busy} className="w-full rounded-xl bg-[#0f4c81] p-4 font-black text-white disabled:opacity-50">{busy?'Registrando...':'Criar pré-solicitação sem pagamento'}</button>
  </form>:<section className="mt-5 space-y-4 rounded-xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-green-700">Pré-solicitação registrada</p><h2 className="text-3xl font-black">{result.protocol}</h2><p>Valor total: <strong>{result.amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></p><p>O pedido ainda não está confirmado. Após pagar o PIX, informe o comprovante para validação humana.</p><div className="rounded-lg bg-blue-50 p-3"><p className="mb-2 text-sm font-bold">PIX Copia e Cola</p><code className="block break-all text-xs">{result.pix}</code><button type="button" onClick={()=>navigator.clipboard.writeText(result.pix)} className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-bold">Copiar PIX</button></div>
   <label className="block text-sm font-bold">Data do pagamento<input type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)} className="mt-1 block w-full rounded-lg border p-3"/></label>
   <label className="block text-sm font-bold">Comprovante (PDF/JPG/PNG, até 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setProof(e.target.files?.[0]||null)} className="mt-1 block w-full rounded-lg border p-3"/></label>
   <button type="button" disabled={busy||!proof||!paidAt} onClick={()=>void sendPayment()} className="w-full rounded-xl bg-[#0f4c81] p-3 font-black text-white disabled:opacity-50">Informar pagamento ao Financeiro</button>
   <button type="button" className="w-full rounded-lg border p-3" onClick={()=>void refresh()}>Consultar situação</button>
   <button type="button" disabled={busy} className="w-full rounded-lg border border-red-300 p-3 text-sm text-red-700" onClick={async()=>{if(!window.confirm('Deseja solicitar o cancelamento? Se o PIX entrou, o Financeiro avaliará o estorno.'))return;setBusy(true);try{await call('cancel',{id:result.id,token:result.token});await refresh()}catch(e){setError(e instanceof Error?e.message:'Cancelamento indisponível')}finally{setBusy(false)}}}>Solicitar cancelamento</button>
   {status&&<p>Status atual: <strong>{status.status}</strong></p>}
  </section>}
 </div>;
}
