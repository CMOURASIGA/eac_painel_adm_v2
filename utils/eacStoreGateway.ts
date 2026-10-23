import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';

const readActions=new Set(['summary','orders','stock','replenishments','proof']);
const writeActions=new Set(['createReplenishment','receiveReplenishment','deliverItem','updateOrderStatus','registerStockReceipt','setStockBalance','deleteStockBalance','resendEmail']);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const qty=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<=100000;
const env=(k:string)=>String(process.env[k]||'').trim();

export async function eacStoreGateway(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const action=String(req.method==='GET'?req.query.action:req.body?.action||'');
 if(!readActions.has(action)&&!writeActions.has(action))return res.status(400).json({success:false,error:'INVALID_ACTION'});
 const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 const storeUrl=env('STORE_SUPABASE_URL'),storeService=env('STORE_SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service||!storeUrl||!storeService)return res.status(503).json({success:false,error:'STORE_BRIDGE_NOT_CONFIGURED'});
 const token=String(req.cookies?.eac_auth_token||'');
 if(!token)return res.status(401).json({success:false,error:'EAC_SESSION_REQUIRED'});
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const identity=await auth.auth.getUser(token);
 if(identity.error||!identity.data.user)return res.status(401).json({success:false,error:'EAC_SESSION_INVALID'});
 const eac=createClient(url,service,{auth:{persistSession:false}});
 const {data:profile,error:profileError}=await eac.from('app_user_profiles').select('role,status,allowed_modules').eq('auth_user_id',identity.data.user.id).maybeSingle();
 if(profileError||!profile||String(profile.status).toUpperCase()!=='ATIVO')return res.status(403).json({success:false,error:'EAC_ACCESS_DENIED'});
 const admin=String(profile.role).toUpperCase()==='ADMIN';
 const modules=Array.isArray(profile.allowed_modules)?profile.allowed_modules.map(String):[];
 const granted=admin||modules.includes('eac_store');
 if(!granted)return res.status(403).json({success:false,error:'STORE_ACCESS_DENIED'});
 // Until module-specific grants are persisted, operational mutations require ADMIN.
 if(writeActions.has(action)&&!admin)return res.status(403).json({success:false,error:'STORE_OPERATION_ADMIN_REQUIRED'});
 const store=createClient(storeUrl,storeService,{auth:{persistSession:false}});
 const p=req.method==='GET'?req.query:req.body||{};
 const encontro=String(p.encontroId||'');
 const id=String(p.id||'');
 let result:{data:any,error:any};
 try{
  if(action==='summary'||action==='orders'||action==='replenishments'){
   if(!uuid(encontro))return res.status(400).json({success:false,error:'INVALID_ENCONTRO'});
   const table=action==='summary'?'vw_camisa_dashboard':action==='orders'?'vw_camisa_solicitacoes_detalhes':'vw_camisa_reposicoes_detalhes';
   let q=store.from(table).select('*').eq('encontro_id',encontro).limit(2000);
   if(action==='summary')q=q.order('cor').order('tamanho');
   else q=q.order('criado_em',{ascending:false});
   result=await q;
  }else if(action==='stock'){
   result=await store.from('camisa_estoque').select('*').eq('ativo',true).order('cor').order('tamanho').limit(2000);
  }else if(action==='proof'){
   const path=String(p.path||'');
   if(!/^public\/[a-zA-Z0-9._/-]{5,240}$/.test(path)||path.includes('..'))return res.status(400).json({success:false,error:'INVALID_PATH'});
   result=await store.storage.from('camisas-comprovantes').createSignedUrl(path,300);
  }else if(action==='createReplenishment'){
   if(!uuid(encontro)||!Array.isArray(p.items)||p.items.length<1||p.items.length>50||!p.items.every((x:any)=>text(x.cor,40)&&text(x.tamanho,20)&&qty(x.quantidade)))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_criar_reposicao',{p_encontro_id:encontro,p_itens:p.items,p_observacoes:'Criada pelo dashboard EAC'});
  }else if(action==='receiveReplenishment'||action==='deliverItem'){
   if(!uuid(id)||!qty(p.quantity))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc(action==='receiveReplenishment'?'camisa_receber_reposicao':'camisa_entregar_item',{[action==='receiveReplenishment'?'p_reposicao_item_id':'p_solicitacao_item_id']:id,p_quantidade:p.quantity});
  }else if(action==='updateOrderStatus'){
   if(!uuid(id)||!['ABERTA','CONCLUIDA','CANCELADA'].includes(p.status))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_alterar_status_solicitacao',{p_solicitacao_id:id,p_status:p.status});
  }else if(action==='registerStockReceipt'){
   if(!text(p.cor,40)||!text(p.tamanho,20)||!qty(p.quantity)||!text(p.note,500))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_ajustar_estoque',{p_cor:p.cor,p_tamanho:p.tamanho,p_quantidade:p.quantity,p_tipo:'ENTRADA',p_observacoes:p.note});
  }else if(action==='setStockBalance'){
   if(!uuid(id)||!Number.isInteger(p.quantity)||p.quantity<0||p.quantity>100000||!text(p.note,500))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_definir_estoque',{p_estoque_id:id,p_quantidade:p.quantity,p_observacoes:p.note});
  }else if(action==='deleteStockBalance'){
   if(!uuid(id)||!text(p.note,500))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_excluir_estoque',{p_estoque_id:id,p_observacoes:p.note});
  }else if(action==='resendEmail'){
   if(!uuid(id))return res.status(400).json({success:false,error:'INVALID_INPUT'});
   result=await store.rpc('camisa_gerar_token_reenvio_email',{p_solicitacao_id:id});
   if(!result.error&&result.data?.dispatch_token){
    const dispatch=await store.functions.invoke('camisa-email',{body:{request_id:id,dispatch_token:result.data.dispatch_token}});
    result={data:dispatch.data,error:dispatch.error};
   }
  }else{return res.status(400).json({success:false,error:'INVALID_ACTION'});}
  if(result.error)return res.status(502).json({success:false,error:'STORE_OPERATION_FAILED'});
  return res.status(200).json({success:true,data:result.data});
 }catch{return res.status(502).json({success:false,error:'STORE_UNAVAILABLE'});}
}
