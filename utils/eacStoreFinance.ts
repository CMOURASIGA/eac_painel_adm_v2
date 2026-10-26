import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {generatePixCopyPaste} from './eacStorePix';

const env=(k:string)=>String(process.env[k]||'').trim();
const uuid=(v:unknown)=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const bad=(res:NextApiResponse,status:number,error:string)=>res.status(status).json({success:false,error});
const validString=(v:unknown,max=180)=>typeof v==='string'&&v.trim().length>=3&&v.length<=max;
const allowedSizes=new Set(['PP','P','M','G','GG','XG','XXG']);
const email=(v:unknown)=>typeof v==='string'&&v.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const allowedColors=new Set(['Branca','Azul','Marrom']);
const publicFields='id,protocolo,status,valor_total,criado_em,expira_em,confirmado_em,solicitacao_oficial_id,pix_snapshot,pagamento_informado_em';
export async function eacStoreFinance(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['POST','GET'].includes(req.method||''))return bad(res,405,'METHOD_NOT_ALLOWED');
 if(env('STORE_FINANCE_ENABLED')!=='true')return bad(res,503,'FINANCE_NOT_ENABLED');
 const url=env('STORE_SUPABASE_URL'),secret=env('STORE_SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return bad(res,503,'STORE_BRIDGE_NOT_CONFIGURED');
 const store=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const action=String(req.method==='GET'?req.query.action:req.body?.action||'');
 const p=req.method==='GET'?req.query:req.body||{};
 if(!['create','track','proof-ticket','inform','cancel','list','proof','confirm','reject','refundPending','refundComplete','cancelNoRefund'].includes(action))return bad(res,400,'INVALID_ACTION');
 if(action==='create'&&req.method==='POST'){
  const items=p.items, name=p.nomeSolicitante,beneficiary=p.nomeBeneficiario;
  if(!uuid(p.encontroId)||!validString(name)||!validString(beneficiary)||(!email(p.emailSolicitante)&&!validString(p.telefoneSolicitante,30)))return bad(res,400,'INVALID_CUSTOMER');
  if(!Array.isArray(items)||!items.length||items.length>12||!items.every((i:any)=>typeof i.cor==='string'&&i.cor.length<=40&&allowedColors.has(i.cor)&&allowedSizes.has(i.tamanho)&&Number.isInteger(i.quantidade)&&i.quantidade>=1&&i.quantidade<=20))return bad(res,400,'INVALID_ITEMS');
  const price=Number(env('STORE_SHIRT_UNIT_PRICE'));
  const hours=Number(env('STORE_PAYMENT_EXPIRATION_HOURS')||'72');
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(hours)||hours<1||hours>720)return bad(res,503,'FINANCE_SETTINGS_MISSING');
  const pixKey=env('STORE_PIX_KEY'),receiver=env('STORE_PIX_RECEIVER_NAME'),city=env('STORE_PIX_RECEIVER_CITY');
  if(!pixKey||!receiver||!city)return bad(res,503,'PIX_SETTINGS_MISSING');
  if(Boolean(p.ehEncontreiro)&&!uuid(p.solicitantePessoaId))return bad(res,400,'ENCONTREIRO_NOT_SELECTED');
  const {data:meeting,error:meetingError}=await store.from('encontros').select('id').eq('id',p.encontroId).maybeSingle();
  if(meetingError||!meeting)return bad(res,400,'ENCONTRO_NOT_FOUND');
  const amount=items.reduce((a:number,i:any)=>a+i.quantidade,0)*price;
  const id=randomUUID(),protocol='REC-'+new Date().getFullYear()+'-'+id.slice(0,8).toUpperCase(),token=randomBytes(32).toString('hex');
  const pix=generatePixCopyPaste({key:pixKey,receiverName:receiver,receiverCity:city,amount,txid:protocol.replace(/[^A-Z0-9]/g,'').slice(0,25)});
  const payload={encontroId:p.encontroId,ehEncontreiro:Boolean(p.ehEncontreiro),solicitantePessoaId:p.solicitantePessoaId||null,nomeSolicitante:name.trim(),telefoneSolicitante:p.telefoneSolicitante||null,emailSolicitante:email(p.emailSolicitante)?p.emailSolicitante:null,equipe:p.equipe||null,beneficiarioPessoaId:p.beneficiarioPessoaId||null,nomeBeneficiario:beneficiary.trim(),observacoes:p.observacoes||null,items,valorTotal:amount,comprovanteTipo:null,comprovanteTamanho:null};
  const {error}=await store.from('eac_camisa_pre_solicitacoes').insert({id,protocolo:protocol,access_token_hash:hash(token),encontro_id:p.encontroId,payload,pix_snapshot:{pixPayload:pix,keyType:env('STORE_PIX_KEY_TYPE')||'TELEFONE',receiverName:receiver,receiverCity:city},valor_total:amount,expira_em:new Date(Date.now()+hours*3600000).toISOString()});
  if(error)return bad(res,503,'PRE_REQUEST_PERSIST_FAILED');
  await store.from('eac_camisa_financeiro_auditoria').insert({pre_solicitacao_id:id,evento:'PRE_SOLICITACAO_CRIADA',estado_novo:'AGUARDANDO_PAGAMENTO',ator:'CLIENTE'}).then(()=>{});
  return res.status(201).json({success:true,id,protocol,token,amount,pix,expirationHours:hours});
 }
 if((action==='track'||action==='inform'||action==='proof-ticket'||action==='cancel')&&uuid(p.id)&&typeof p.token==='string'&&p.token.length===64){
  const {data:row,error}=await store.from('eac_camisa_pre_solicitacoes').select('id,protocolo,status,valor_total,criado_em,expira_em,confirmado_em,solicitacao_oficial_id,pix_snapshot,pagamento_informado_em,access_token_hash,payload').eq('id',p.id).eq('access_token_hash',hash(p.token)).maybeSingle();
  if(error)return bad(res,503,'TRACKING_UNAVAILABLE');
  if(!row)return bad(res,404,'NOT_FOUND');
  if(action==='track'&&req.method==='GET')return res.status(200).json({success:true,request:{id:row.id,protocolo:row.protocolo,status:row.status,valor_total:row.valor_total,criado_em:row.criado_em,expira_em:row.expira_em,confirmado_em:row.confirmado_em,solicitacao_oficial_id:row.solicitacao_oficial_id,pix_snapshot:row.pix_snapshot,pagamento_informado_em:row.pagamento_informado_em}});
  if(action==='cancel'&&req.method==='POST'){
   const {data,error}=await store.rpc('eac_camisa_transicao_financeira',{p_id:p.id,p_acao:'CANCELAR_CLIENTE',p_ator:'CLIENTE'});
   return error?bad(res,409,'CANCEL_NOT_ALLOWED'):res.status(200).json({success:true,result:data});
  }
  if(action==='proof-ticket'&&req.method==='POST'){
   if(row.status!=='AGUARDANDO_PAGAMENTO'&&row.status!=='PAGAMENTO_NAO_LOCALIZADO')return bad(res,409,'INVALID_STATUS');
   const ext=String(p.extension||'').toLowerCase();
   if(!['pdf','png','jpg','jpeg'].includes(ext))return bad(res,400,'INVALID_FILE_TYPE');
   if(!Number.isInteger(p.size)||p.size<1||p.size>10485760)return bad(res,400,'INVALID_FILE_SIZE');
   const path='finance/'+p.id+'/'+randomUUID()+'.'+ext;
   const {data,error}=await store.storage.from('camisas-comprovantes').createSignedUploadUrl(path);
   if(error||!data)return bad(res,503,'PROOF_UPLOAD_UNAVAILABLE');
   return res.status(200).json({success:true,path,uploadToken:data.token});
  }
  if(action==='inform'&&req.method==='POST'){
   if(row.status!=='AGUARDANDO_PAGAMENTO'&&row.status!=='PAGAMENTO_NAO_LOCALIZADO')return bad(res,409,'INVALID_STATUS');
   if(new Date(row.expira_em).getTime()<Date.now())return bad(res,409,'EXPIRED');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(String(p.paymentDate||'')))return bad(res,400,'INVALID_PAYMENT_DATE');
   const path=String(p.proofPath||'');
    if(!path.startsWith('finance/'+p.id+'/')||!/^[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$/i.test(path.split('/').pop()||''))return bad(res,400,'INVALID_PROOF_PATH');
   const folder='finance/'+p.id;
   const fileName=path.split('/').pop()||'';
   const {data:files,error:fileError}=await store.storage.from('camisas-comprovantes').list(folder,{search:fileName,limit:10});
   const uploaded=files?.find(x=>x.name===fileName);
   if(fileError||!uploaded)return bad(res,409,'PROOF_NOT_UPLOADED');
   const metadata={...((row as any).payload||{}),comprovanteTipo:fileName.endsWith('.pdf')?'application/pdf':fileName.endsWith('.png')?'image/png':'image/jpeg',comprovanteTamanho:uploaded.metadata?.size||null};
   const {data:updated,error:updateError}=await store.from('eac_camisa_pre_solicitacoes').update({status:'AGUARDANDO_VALIDACAO_FINANCEIRA',pagamento_informado_em:new Date().toISOString(),pagamento_data:p.paymentDate,comprovante_path:path,comprovante_nome:fileName,payload:metadata,atualizado_em:new Date().toISOString()}).eq('id',p.id).in('status',['AGUARDANDO_PAGAMENTO','PAGAMENTO_NAO_LOCALIZADO']).select('id').maybeSingle();
   if(updateError)return bad(res,503,'PAYMENT_UPDATE_FAILED');
   if(!updated)return bad(res,409,'STATUS_CHANGED');
   await store.from('eac_camisa_financeiro_auditoria').insert({pre_solicitacao_id:p.id,evento:'PAGAMENTO_INFORMADO',estado_anterior:row.status,estado_novo:'AGUARDANDO_VALIDACAO_FINANCEIRA',ator:'CLIENTE'});
   return res.status(200).json({success:true});
   }
  }
 if(!['list','proof','confirm','reject','refundPending','refundComplete','cancelNoRefund'].includes(action))return bad(res,400,'INVALID_REQUEST');
 const eacUrl=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY'),session=String(req.cookies?.eac_auth_token||'');
 if(!eacUrl||!anon||!service)return bad(res,503,'EAC_AUTH_NOT_CONFIGURED');
 if(!session)return bad(res,401,'EAC_SESSION_REQUIRED');
 const auth=createClient(eacUrl,anon,{auth:{persistSession:false}});
 const identity=await auth.auth.getUser(session);
 if(identity.error||!identity.data.user)return bad(res,401,'EAC_SESSION_INVALID');
 const eac=createClient(eacUrl,service,{auth:{persistSession:false}});
 const {data:profile}=await eac.from('app_user_profiles').select('role,status,allowed_modules').eq('auth_user_id',identity.data.user.id).maybeSingle();
 if(!profile||String(profile.status).toUpperCase()!=='ATIVO')return bad(res,403,'USER_INACTIVE');
 const mods=Array.isArray(profile.allowed_modules)?profile.allowed_modules.map(String):[];
 const admin=String(profile.role).toUpperCase()==='ADMIN';
 if(!admin&&!mods.includes('eac_store_financeiro'))return bad(res,403,'FINANCE_ACCESS_DENIED');
 if(action==='list'&&req.method==='GET'){
  const {data,error}=await store.from('eac_camisa_pre_solicitacoes').select('id,protocolo,valor_total,status,pagamento_informado_em,criado_em,expira_em,payload,confirmado_em,solicitacao_oficial_id,comprovante_path').order('criado_em',{ascending:false}).limit(200);
  return error?bad(res,503,'FINANCE_LIST_FAILED'):res.status(200).json({success:true,requests:data});
 }
 if(action==='proof'&&req.method==='GET'){
  if(!uuid(p.id))return bad(res,400,'INVALID_REQUEST');
  const {data:row,error:proofError}=await store.from('eac_camisa_pre_solicitacoes').select('comprovante_path').eq('id',p.id).maybeSingle();
  if(proofError||!row?.comprovante_path)return bad(res,404,'PROOF_NOT_FOUND');
  if(!row.comprovante_path.startsWith('finance/'+p.id+'/'))return bad(res,403,'INVALID_PROOF_PATH');
  const {data:signed,error:storageError}=await store.storage.from('camisas-comprovantes').createSignedUrl(row.comprovante_path,180);
  return storageError||!signed?bad(res,503,'PROOF_UNAVAILABLE'):res.status(200).json({success:true,url:signed.signedUrl});
 }
 if(!admin&&!mods.includes('eac_store_financeiro_confirmar'))return bad(res,403,'FINANCE_WRITE_DENIED');
 if(req.method!=='POST'||!uuid(p.id))return bad(res,400,'INVALID_REQUEST');
 if(action==='confirm'){
  const {data,error}=await store.rpc('eac_camisa_confirmar_pagamento',{p_id:p.id,p_ator:identity.data.user.id});
  return error?bad(res,409,'FINANCE_CONFIRM_FAILED'):res.status(200).json({success:true,result:data});
 }
 if(['reject','refundPending','refundComplete','cancelNoRefund'].includes(action)){
  const op=action==='reject'?'NAO_LOCALIZADO':action==='refundPending'?'ESTORNO_PENDENTE':action==='refundComplete'?'ESTORNADO':'CANCELAR_SEM_ESTORNO';
  const {data,error}=await store.rpc('eac_camisa_transicao_financeira',{p_id:p.id,p_acao:op,p_ator:identity.data.user.id});
  return error?bad(res,409,'FINANCE_TRANSITION_FAILED'):res.status(200).json({success:true,result:data});
 }
 return bad(res,400,'INVALID_REQUEST');
}
