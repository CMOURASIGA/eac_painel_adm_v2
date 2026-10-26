import React,{useCallback,useEffect,useState} from 'react';
type Member={id:string;email:string;status:string;storeGrants:string[]};
const choices=[
 {id:'eac_store',title:'Acessar EAC Store',description:'Permite abrir a rotina interna'},
 {id:'eac_store_financeiro',title:'Visualizar Financeiro',description:'Consultar pré-solicitações e situação dos pagamentos'},
 {id:'eac_store_financeiro_confirmar',title:'Conferir PIX',description:'Confirmar recebimento, rejeitar e tratar estornos'}
];
export default function StoreAccessPanel(){
 const [members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[error,setError]=useState('');
 const reload=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/eac-store/access',{credentials:'same-origin'});const j=await r.json();if(!r.ok)throw Error(j.error||'Erro');setMembers(j.users||[])}catch(e){setError(e instanceof Error?e.message:'Falha de conexão')}finally{setLoading(false)}},[]);
 useEffect(()=>{void reload()},[reload]);
 const change=async(user:Member,id:string,value:boolean)=>{
  const next=new Set(user.storeGrants);
  if(value)next.add(id);else next.delete(id);
  if(id==='eac_store'&&!value){next.delete('eac_store_financeiro');next.delete('eac_store_financeiro_confirmar');}
  if(id==='eac_store_financeiro'&&!value)next.delete('eac_store_financeiro_confirmar');
  if(next.has('eac_store_financeiro_confirmar')){next.add('eac_store_financeiro');next.add('eac_store');}
  if(next.has('eac_store_financeiro'))next.add('eac_store');
  setWorking(user.id);setError('');
  try{const r=await fetch('/api/eac-store/access',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,grants:[...next]})});const j=await r.json();if(!r.ok)throw Error(j.error||'Falha ao salvar');setMembers(rows=>rows.map(x=>x.id===user.id?{...x,storeGrants:j.grants}:x))}catch(e){setError(e instanceof Error?e.message:'Erro ao salvar permissões')}finally{setWorking('')}
 };
 return <section className="mt-8 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-slate-900">Permissões do EAC Store</h3><p className="mt-1 text-sm text-slate-500">Controles específicos dos usuários não administradores. Administradores preservam acesso integral. As alterações são aplicadas na sessão do banco e verificadas no backend.</p>
 {error&&<p className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
 {loading?<p className="my-4 text-sm text-slate-500">Carregando perfis...</p>:members.length===0?<p className="my-4 text-sm">Nenhum perfil operacional disponível no Supabase.</p>:<div className="mt-4 grid gap-3">{members.map(m=><article key={m.id} className="rounded-xl border p-4"><div className="font-bold text-slate-900">{m.email||m.id}</div><p className="text-xs text-slate-500">Status: {m.status}</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{choices.map(c=><label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" className="h-4 w-4" disabled={Boolean(working)} checked={m.storeGrants.includes(c.id)} onChange={e=>void change(m,c.id,e.target.checked)}/><span><strong className="block">{c.title}</strong><small className="text-slate-500">{c.description}</small></span></label>)}</div></article>)}</div>}
 </section>;
}
