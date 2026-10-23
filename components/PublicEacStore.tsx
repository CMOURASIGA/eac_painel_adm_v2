import React,{useEffect,useState} from 'react';
import LegacyShirtForm from '../legacy-store/components/Form.tsx';
type Product={id:string;name:string;description:string|null;price:number;image_url:string|null};
export default function PublicEacStore(){
 const [products,setProducts]=useState<Product[]>([]);
 useEffect(()=>{fetch('/api/eac-store/products?public=true').then(r=>r.json()).then(x=>{if(x.success)setProducts(x.products||[])}).catch(()=>{})},[]);
 return <main className="min-h-screen bg-[#f4f7fc]">
  {products.length>0&&<section className="mx-auto max-w-4xl p-4"><h2 className="mb-3 text-lg font-black">Modelos de camisas</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{products.map(p=><div key={p.id} className="overflow-hidden rounded-xl bg-white shadow-sm">{p.image_url&&<img src={p.image_url} alt={p.name} className="h-44 w-full object-contain"/>}<div className="p-3"><strong>{p.name}</strong><p className="text-sm">{Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div></div>)}</div></section>}
  <LegacyShirtForm />
 </main>;
}
