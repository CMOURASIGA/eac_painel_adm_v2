import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';
import {google} from 'googleapis';

const noStore={'Cache-Control':'no-store'};
export async function googlePublication(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const token=String(req.cookies?.eac_auth_token||'');
 if(!url||!anon||!service)return res.status(503).json({success:false,error:'SUPABASE_NOT_CONFIGURED'});
 if(!token)return res.status(401).json({success:false,error:'AUTH_REQUIRED'});
 const publicAuth=createClient(url,anon,{auth:{persistSession:false}});
 const {data:identity,error:identityError}=await publicAuth.auth.getUser(token);
 if(identityError||!identity.user)return res.status(401).json({success:false,error:'INVALID_SESSION'});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:profile,error:profileError}=await db.from('app_user_profiles').select('id,role,status').eq('auth_user_id',identity.user.id).maybeSingle();
 if(profileError||!profile||String(profile.status).toUpperCase()!=='ATIVO'||String(profile.role).toUpperCase()!=='ADMIN')return res.status(403).json({success:false,error:'ADMIN_REQUIRED'});
 const calendarId=process.env.EAC_GOOGLE_EAC_CALENDAR_ID||'primary';
 if(req.method==='GET'){
  const ids=String(req.query.ids||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,100);
  if(!ids.length)return res.status(200).json({success:true,events:[]});
  const {data,error}=await db.from('eac_public_google_events').select('google_event_id,publication_status,aprovado_em').in('google_event_id',ids).eq('source','GOOGLE_EAC');
  return error?res.status(503).json({success:false,error:'PUBLICATION_STORE_UNAVAILABLE'}):res.status(200).json({success:true,events:data||[]});
 }
 const eventId=String(req.body?.googleEventId||'');
 const action=String(req.body?.action||'');
 if(!eventId||eventId.length>512||!['approve','revoke'].includes(action))return res.status(400).json({success:false,error:'INVALID_INPUT'});
 if(action==='revoke'){
  const {data,error}=await db.from('eac_public_google_events').update({publication_status:'REVOGADO',atualizado_em:new Date().toISOString()}).eq('google_event_id',eventId).eq('source','GOOGLE_EAC').select('id');
  if(error)return res.status(503).json({success:false,error:'PUBLICATION_STORE_UNAVAILABLE'});
  return res.status(200).json({success:true,changed:data?.length||0,status:'REVOGADO'});
 }
 const {EAC_GOOGLE_CLIENT_ID:id,EAC_GOOGLE_CLIENT_SECRET:secret,EAC_GOOGLE_REFRESH_TOKEN:refresh}=process.env;
 if(!id||!secret||!refresh)return res.status(503).json({success:false,error:'GOOGLE_NOT_CONFIGURED'});
 try{
  const oauth=new google.auth.OAuth2(id,secret);oauth.setCredentials({refresh_token:refresh});
  const client=google.calendar({version:'v3',auth:oauth});
  const {data:ev}=await client.events.get({calendarId,eventId});
  if(ev.status==='cancelled'||!ev.start||!ev.summary)return res.status(409).json({success:false,error:'EVENT_NOT_PUBLISHABLE'});
  const start=ev.start.dateTime||(ev.start.date?ev.start.date+'T12:00:00-03:00':null);
  if(!start)return res.status(409).json({success:false,error:'EVENT_WITHOUT_START'});
  const now=new Date().toISOString();
  const payload={google_calendar_id:calendarId,google_event_id:eventId,google_etag:ev.etag||null,atividade:ev.summary,tipo:'Evento EAC',inicio:start,termino:ev.end?.dateTime||(ev.end?.date?ev.end.date+'T12:00:00-03:00':null),local:ev.location||null,status:'CONFIRMADO',source:'GOOGLE_EAC',publication_status:'PUBLICADO',aprovado_por:identity.user.id,aprovado_em:now,atualizado_em:now};
  const {error}=await db.from('eac_public_google_events').upsert(payload,{onConflict:'google_calendar_id,google_event_id'});
  return error?res.status(503).json({success:false,error:'PUBLICATION_STORE_UNAVAILABLE'}):res.status(200).json({success:true,status:'PUBLICADO'});
 }catch{return res.status(502).json({success:false,error:'GOOGLE_LOOKUP_FAILED'});}
}
