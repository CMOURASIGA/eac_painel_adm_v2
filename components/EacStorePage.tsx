import React,{useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
type Product={id:string;name:string;description:string|null;price:number;image_url:string|null;active:boolean;sort_order:number};
const url=(import.meta as any).env?.VITE_SUPABASE_URL||'',anon=(import.meta as any).env?.VITE_SUPABASE_ANON_KEY||'';
const db=url&&anon?createClient(url,anon):null;
export default function EacStorePage(){
 const [products,setProducts]=useState<Product[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[price,setPrice]=useState('40'),[active,setActive]=useState(false),[image,setImage]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{if(!db){setError('Configure o Supabase público do EAC para o catálogo.');setLoading(false);return;}db.from('eac_store_products').select('id,name,description,price,image_url,active,sort_order').eq('active',true).order('sort_order').then(({data,error})=>{setProducts((data||[]) as Product[]);setError(error?.message||'');setLoading(false)});},[]);
 const reload=async()=>{const res=await fetch('/api/eac-store/products',{credentials:'same-origin'});const json=await res.json();if(res.ok&&json.success)setProducts(json.products||[]);else setError(json.error||'Falha ao consultar produtos');};
 const edit=(p?:Product)=>{setEditing(p?.id||null);setName(p?.name||'');setDescription(p?.description||'');setPrice(String(p?.price??'40'));setActive(p?.active??false);setImage('');};
 const chooseImage=async(file?:File)=>{if(!file)return;if(file.size>3145728){setError('Imagem deve ter no máximo 3 MB.');return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Selecione JPG, PNG ou WebP.');return;}const reader=new FileReader();reader.onload=()=>setImage(String(reader.result||''));reader.readAsDataURL(file);};
 const save=async()=>{setSaving(true);setError('');try{const res=await fetch('/api/eac-store/products',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing,name,description,price:Number(price),active,sort_order:0,image_base64:image||undefined})});const json=await res.json();if(!res.ok||!json.success)throw Error(json.error||'Falha ao salvar');await reload();edit();}catch(e:any){setError(e.message)}finally{setSaving(false)}};
 const openExisting=()=>window.open('https://webappcamisa.vercel.app/dashboard','_blank','noopener,noreferrer');
 return <section className="mx-auto max-w-6xl space-y-5 p-5">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black text-slate-900">EAC Store</h1><p className="text-sm text-slate-500">Integração progressiva, preservando integralmente a operação atual de camisas.</p></div><div className="flex gap-2"><a href="/publico/loja" target="_blank" rel="noreferrer" className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white">Abrir loja pública</a><button onClick={openExisting} className="rounded-xl border border-blue-300 px-4 py-2 text-sm font-bold text-blue-800">Dashboard operacional atual ↗</button></div></header>
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O cadastro e a operação de pedidos permanecem no sistema original até concluir a integração de autenticação e os testes de regressão. Nenhum pedido será migrado automaticamente.</div>
  <div className="rounded-2xl border bg-white p-5">
    <h2 className="mb-3 text-xl font-bold">Cadastro de produto com imagem</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold">Nome<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} className="mt-1 block w-full rounded-lg border p-2"/></label>
      <label className="text-xs font-bold">Preço (R$)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="mt-1 block w-full rounded-lg border p-2"/></label>
      <label className="text-xs font-bold sm:col-span-2">Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={1500} className="mt-1 block w-full rounded-lg border p-2"/></label>
      <label className="text-xs font-bold">Imagem JPG, PNG ou WebP (até 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void chooseImage(e.target.files?.[0])} className="mt-1 block w-full text-xs"/></label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Disponível no catálogo público</label>
    </div>
    {image&&<img src={image} alt="Prévia da imagem do produto" className="mt-3 h-40 rounded-xl border object-contain"/>}
    <button disabled={saving||name.trim().length<2} onClick={()=>void save()} className="mt-4 rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{saving?'Salvando…':editing?'Salvar alterações':'Cadastrar produto'}</button>
    {editing&&<button className="ml-3 text-sm underline" onClick={()=>edit()}>Cancelar edição</button>}
  </div>
  <h2 className="text-xl font-bold">Catálogo de produtos</h2>
  {loading?<p>Carregando catálogo…</p>:error?<p role="alert" className="text-red-700">{error}</p>:products.length===0?<p className="rounded-xl border border-dashed p-6 text-slate-500">O catálogo adicional ainda não possui produtos. As camisas continuam disponíveis na loja original.</p>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{products.map(p=><div key={p.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex h-56 items-center justify-center bg-slate-100">{p.image_url?<img src={p.image_url} alt={p.name} className="h-full w-full object-contain"/>:<span className="text-5xl">👕</span>}</div><div className="p-4"><h3 className="font-bold">{p.name}</h3><p className="text-sm text-slate-500">{p.description}</p><p className="mt-3 font-black text-blue-800">{Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p><button onClick={()=>edit(p)} className="mt-3 text-sm font-bold text-blue-700 underline">Editar</button></div></div>)}</div>}
 </section>;
}
