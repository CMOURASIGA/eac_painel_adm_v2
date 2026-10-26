import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';

const STORE_GRANTS=['eac_store','eac_store_financeiro','eac_store_financeiro_confirmar'] as const;
const env=(k:string)=>String(process.env[k]||'').trim();
const fail=(res:NextApiResponse,status:number,error:string)=>res.status(status).json({success:false,error});
export async function eacStoreAccess(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method||''))return fail(res,405,'METHOD_NOT_ALLOWED');
 const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return fail(res,503,'AUTH_NOT_CONFIGURED');
 const token=String(req.cookies?.eac_auth_token||'');
 if(!token)return fail(res,401,'EAC_SESSION_REQUIRED');
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const identity=await auth.auth.getUser(token);
 if(identity.error||!identity.data.user)return fail(res,401,'EAC_SESSION_INVALID');
 const eac=createClient(url,service,{auth:{persistSession:false}});
 const {data:me,error:myError}=await eac.from('app_user_profiles').select('role,status').eq('auth_user_id',identity.data.user.id).maybeSingle();
 if(myError||!me||String(me.role).toUpperCase()!=='ADMIN'||String(me.status).toUpperCase()!=='ATIVO')return fail(res,403,'ADMIN_REQUIRED');
 if(req.method==='GET'){
  const {data:profiles,error}=await eac.from('app_user_profiles').select('auth_user_id,role,status,allowed_modules').order('role');
  if(error)return fail(res,503,'ACCESS_LIST_FAILED');
  const {data:accounts,error:usersError}=await eac.auth.admin.listUsers({page:1,perPage:1000});
  if(usersError)return fail(res,503,'ACCESS_IDENTITIES_FAILED');
  const emailById=new Map<string,string>(accounts.users.map(u=>[u.id,u.email||''] as [string,string]));
  return res.status(200).json({success:true,users:(profiles||[]).filter(p=>String(p.role).toUpperCase()!=='ADMIN').map(p=>({id:p.auth_user_id,email:emailById.get(p.auth_user_id)||'',status:p.status,storeGrants:STORE_GRANTS.filter(g=>Array.isArray(p.allowed_modules)&&p.allowed_modules.includes(g))}))});
 }
 const origin=String(req.headers.origin||'');
 const host=String(req.headers.host||'');
 if(!origin||!host){return fail(res,403,'ORIGIN_REQUIRED');}
 try{if(new URL(origin).host!==host)return fail(res,403,'ORIGIN_DENIED');}catch{return fail(res,403,'ORIGIN_INVALID');}
 const id=String(req.body?.userId||''),grants=req.body?.grants;
 if(!/^[a-f0-9-]{36}$/i.test(id)||!Array.isArray(grants)||grants.some((g:unknown)=>!STORE_GRANTS.includes(g as any)))return fail(res,400,'INVALID_PERMISSIONS');
 if(id===identity.data.user.id)return fail(res,403,'SELF_ROLE_CHANGE_DENIED');
 const {data:target,error:targetError}=await eac.from('app_user_profiles').select('role,status,allowed_modules').eq('auth_user_id',id).maybeSingle();
 if(targetError||!target||String(target.role).toUpperCase()==='ADMIN')return fail(res,403,'TARGET_NOT_ALLOWED');
 const requested=new Set(grants as string[]);
 // Cascading grants: finance confirmation requires finance view, and any store grant requires module entry.
 if(requested.has('eac_store_financeiro_confirmar'))requested.add('eac_store_financeiro');
 if(requested.has('eac_store_financeiro'))requested.add('eac_store');
 const existing=Array.isArray(target.allowed_modules)?target.allowed_modules.map(String):[];
 const rest=existing.filter(g=>!STORE_GRANTS.includes(g as any));
 const allowed_modules=[...new Set([...rest,...requested])];
 const {data:updated,error:updateError}=await eac.from('app_user_profiles').update({allowed_modules}).eq('auth_user_id',id).neq('role','ADMIN').select('auth_user_id').maybeSingle();
 if(updateError||!updated)return fail(res,503,'PERMISSION_UPDATE_FAILED');
 // Security-relevant modification must not claim audit persistence that is not implemented.
 return res.status(200).json({success:true,userId:id,grants:STORE_GRANTS.filter(g=>requested.has(g))});
}
