import React,{useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
type Product={id:string;name:string;description:string|null;price:number;image_url:string|null;active:boolean;sort_order:number};
const url=import.meta.env.VITE_SUPABASE_URL||'',anon=import.meta.env.VITE_SUPABASE_ANON_KEY||'';
const db=url&&anon?createClient(url,anon):null;
export default function EacStorePage(){
 const [products,setProducts]=useState<Product[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{if(!db){setError('Configure o Supabase público do EAC para o catálogo.');setLoading(false);return;}db.from('eac_store_products').select('id,name,description,price,image_url,active,sort_order').eq('active',true).order('sort_order').then(({data,error})=>{setProducts((data||[]) as Product[]);setError(error?.message||'');setLoading(false)});},[]);
 const openExisting=()=>window.open('https://webappcamisa.vercel.app/dashboard','_blank','noopener,noreferrer');
 return <section className="mx-auto max-w-6xl space-y-5 p-5">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black text-slate-900">EAC Store</h1><p className="text-sm text-slate-500">Integração progressiva, preservando integralmente a operação atual de camisas.</p></div><div className="flex gap-2"><a href="/publico/loja" target="_blank" rel="noreferrer" className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white">Abrir loja pública</a><button onClick={openExisting} className="rounded-xl border border-blue-300 px-4 py-2 text-sm font-bold text-blue-800">Dashboard operacional atual ↗</button></div></header>
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O cadastro e a operação de pedidos permanecem no sistema original até concluir a integração de autenticação e os testes de regressão. Nenhum pedido será migrado automaticamente.</div>
  <h2 className="text-xl font-bold">Catálogo de produtos</h2>
  {loading?<p>Carregando catálogo…</p>:error?<p role="alert" className="text-red-700">{error}</p>:products.length===0?<p className="rounded-xl border border-dashed p-6 text-slate-500">O catálogo adicional ainda não possui produtos. As camisas continuam disponíveis na loja original.</p>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{products.map(p=><div key={p.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex h-56 items-center justify-center bg-slate-100">{p.image_url?<img src={p.image_url} alt={p.name} className="h-full w-full object-contain"/>:<span className="text-5xl">👕</span>}</div><div className="p-4"><h3 className="font-bold">{p.name}</h3><p className="text-sm text-slate-500">{p.description}</p><p className="mt-3 font-black text-blue-800">{Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div></div>)}</div>}
 </section>;
}
