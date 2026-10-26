import StorePreRequest from './StorePreRequest.tsx';
import '../legacy-store/store-brand.css';
import React,{useEffect,useState} from 'react';
import LegacyShirtForm from '../legacy-store/components/Form.tsx';
type Product={id:string;name:string;description:string|null;price:number;image_url:string|null};
export default function PublicEacStore(){
 if(import.meta.env.VITE_STORE_FINANCE_ENABLED==='true')return <main className="eac-store-original min-h-screen bg-[#f4f7fc]"><StorePreRequest /></main>;
 return <LegacyPublicShirtStore />;
}
function LegacyPublicShirtStore(){
 const [products,setProducts]=useState<Product[]>([]);
 useEffect(()=>{fetch('/api/eac-store/products?public=true').then(r=>r.json()).then(x=>{if(x.success)setProducts(x.products||[])}).catch(()=>{})},[]);
 return <main className="eac-store-original min-h-screen bg-[#f4f7fc]">
  {products.length>0&&<section className="mx-auto max-w-4xl p-4"><h2 className="mb-3 text-lg font-black">Modelos de camisas</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{products.map(p=><div key={p.id} className="overflow-hidden rounded-xl bg-white shadow-sm">{p.image_url&&<img src={p.image_url} alt={p.name} className="h-44 w-full object-contain"/>}<div className="p-3"><strong>{p.name}</strong><p className="text-sm">{Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div></div>)}</div></section>}
  <div className="mx-auto max-w-xl px-3 pt-5"><h1 className="text-2xl font-black text-primary">Solicitação de Camisas — EAC Store</h1><p className="mt-1 text-sm text-text-muted">Selecione o modelo e preencha seus dados para solicitar a camisa.</p></div>
  <LegacyShirtForm />
 </main>;
}
