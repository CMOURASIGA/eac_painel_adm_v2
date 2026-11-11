import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type CalendarSource = 'GOOGLE_PAROQUIA' | 'GOOGLE_EAC';
type CalendarIssue = {
 source: CalendarSource;
 code: 'TOKEN_INVALID' | 'PERMISSION_DENIED' | 'CALENDAR_NOT_FOUND' |
       'RATE_LIMITED' | 'GOOGLE_UNAVAILABLE' | 'GOOGLE_API_ERROR';
 httpStatus: number | null;
};
function classifyCalendarIssue(error: unknown, source: CalendarSource): CalendarIssue {
 const e = error as { code?: string | number; response?: { status?: number; data?: { error?: any } } };
 const status = Number(e?.response?.status || e?.code) || null;
 const data = e?.response?.data?.error;
 const codeText = typeof data === 'string' ? data : '';
 const reason = typeof data === 'object' ? String(data?.errors?.[0]?.reason || data?.status || '') : '';
 let code: CalendarIssue['code'] = 'GOOGLE_API_ERROR';
 if (codeText === 'invalid_grant' || codeText === 'invalid_client' || status === 401) code = 'TOKEN_INVALID';
 else if (status === 404) code = 'CALENDAR_NOT_FOUND';
 else if (status === 429 || (status === 403 && /rateLimit/i.test(reason))) code = 'RATE_LIMITED';
 else if (status === 403) code = 'PERMISSION_DENIED';
 else if (status !== null && status >= 500) code = 'GOOGLE_UNAVAILABLE';
 return { source, code, httpStatus: status };
}
export async function googleRead(req: NextApiRequest, res: NextApiResponse) {
 res.setHeader('Cache-Control', 'no-store');
 if (req.method !== 'GET') return res.status(405).json({ success:false, error:'METHOD_NOT_ALLOWED' });
 if (process.env.EAC_GOOGLE_CALENDAR_ENABLED !== 'true') return res.status(200).json({ success:true, enabled:false, events:[] });
 const token = String(req.cookies?.eac_auth_token || '');
 const url = process.env.SUPABASE_URL || '', anon = process.env.SUPABASE_ANON_KEY || '', service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
 if (!token || !url || !anon || !service) return res.status(401).json({ success:false, error:'AUTH_REQUIRED' });
 const authClient = createClient(url,anon,{auth:{persistSession:false}});
 const identity = await authClient.auth.getUser(token);
 if (identity.error || !identity.data.user?.email) return res.status(401).json({ success:false, error:'AUTH_INVALID' });
 const db = createClient(url,service,{auth:{persistSession:false}});
 const {data:profile,error:profileError} = await db.from('app_user_profiles').select('role,status,allowed_modules').eq('email',identity.data.user.email).maybeSingle();
 if (profileError || !profile || profile.status !== 'ATIVO' ||
     (profile.role !== 'ADMIN' && (!Array.isArray(profile.allowed_modules) || !profile.allowed_modules.includes('calendar'))))
   return res.status(403).json({ success:false, error:'ACCESS_DENIED' });
 const year = Number(req.query.year), month = Number(req.query.month);
 if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12)
   return res.status(400).json({ success:false, error:'INVALID_PERIOD' });
 const {EAC_GOOGLE_CLIENT_ID:id,EAC_GOOGLE_CLIENT_SECRET:secret,EAC_GOOGLE_REFRESH_TOKEN:refresh,EAC_PAROQUIA_CALENDAR_ID:calendarId} = process.env;
 const accountCalendarId = process.env.EAC_GOOGLE_EAC_CALENDAR_ID || 'primary';
 if (!id || !secret || !refresh || !calendarId) return res.status(503).json({success:false,error:'NOT_CONFIGURED'});
 const oauth = new google.auth.OAuth2(id,secret);
 oauth.setCredentials({refresh_token:refresh});
 const client = google.calendar({version:'v3',auth:oauth});
 const timeMin = new Date(Date.UTC(year,month-1,1)).toISOString(), timeMax = new Date(Date.UTC(year,month,1)).toISOString();
 const events: any[] = [];
 const issues: CalendarIssue[] = [], successfulSources: CalendarSource[] = [];
 for (const source of [{id:calendarId,origin:'GOOGLE_PAROQUIA' as const,label:'Paróquia'},{id:accountCalendarId,origin:'GOOGLE_EAC' as const,label:'Google EAC'}]) {
   const sourceEvents: any[] = [];
   try {
     let pageToken: string | undefined, received = 0;
     do {
       const result = await client.events.list({calendarId:source.id,timeMin,timeMax,maxResults:2500,singleEvents:true,showDeleted:false,pageToken});
       for (const e of result.data.items || []) {
         if (e.status === 'cancelled' || !e.start) continue;
         const start = e.start.dateTime || (e.start.date ? e.start.date+'T12:00:00' : null);
         if (!start) continue;
         sourceEvents.push({id:'google:'+source.origin+':'+e.id,atividade:e.summary||'Evento sem título',tipo:source.label,inicio:start,termino:e.end?.dateTime||(e.end?.date?e.end.date+'T12:00:00':start),local:e.location||'',status:'Confirmado',origemDado:source.origin,googleReadOnly:true});
         received++;
       }
       pageToken = result.data.nextPageToken || undefined;
     } while (pageToken && received < 10000);
     successfulSources.push(source.origin);
     events.push(...sourceEvents);
   } catch (error: unknown) {
     const issue = classifyCalendarIssue(error,source.origin);
     issues.push(issue);
     // Never log OAuth credentials, URLs, raw Google responses or private calendar IDs.
     console.error('[calendar/google] source_failed',issue);
   }
 }
 if (successfulSources.length === 0) return res.status(502).json({success:false,error:'Falha na consulta Google Calendar',sourceErrors:issues,events:[]});
 // Only reconcile publication when Google's EAC source was fully read.
 // Otherwise an API failure could be mistaken for a deleted calendar event.
 if (successfulSources.includes('GOOGLE_EAC')) {
   try {
     const googleItems = events.filter(e=>e.origemDado==='GOOGLE_EAC');
     const byId = new Map(googleItems.map(e=>[String(e.id).replace(/^google:GOOGLE_EAC:/,''),e]));
     const {data:publishedRows,error:publishedError} = await db.from('eac_public_google_events')
       .select('id,google_event_id,atividade,inicio,termino,local')
       .eq('source','GOOGLE_EAC').eq('publication_status','PUBLICADO').gte('inicio',timeMin).lt('inicio',timeMax);
     if (publishedError) throw publishedError;
     for (const row of publishedRows || []) {
       const current = byId.get(String(row.google_event_id));
       if (!current) {
         const {error} = await db.from('eac_public_google_events').update({publication_status:'REVOGADO',atualizado_em:new Date().toISOString()}).eq('id',row.id).eq('source','GOOGLE_EAC');
         if (error) console.error('[calendar/google] publication_revoke_failed');
         continue;
       }
       if (row.atividade!==current.atividade || String(row.inicio)!==String(current.inicio) || String(row.local||'')!==String(current.local||'')) {
         const {error} = await db.from('eac_public_google_events').update({atividade:current.atividade,inicio:current.inicio,termino:current.termino||null,local:current.local||null,atualizado_em:new Date().toISOString()}).eq('id',row.id).eq('source','GOOGLE_EAC').eq('publication_status','PUBLICADO');
         if (error) console.error('[calendar/google] publication_update_failed');
       }
     }
   } catch {
     console.error('[calendar/google] publication_reconciliation_failed');
   }
 }
 return res.status(200).json({success:true,enabled:true,events,partial:issues.length>0,sourceErrors:issues,successfulSources});
}



export function oauthStart(req: NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const key=process.env.EAC_GOOGLE_OAUTH_SETUP_KEY||'';
 const supplied=String(req.headers['x-eac-oauth-setup-key']||'');
 const a=Buffer.from(key),b=Buffer.from(supplied);
 if(key.length<32||a.length!==b.length||!timingSafeEqual(a,b))return res.status(403).json({success:false,error:'NOT_AUTHORIZED'});
 const uri=process.env.EAC_GOOGLE_OAUTH_REDIRECT_URI||'';
 if(!uri||!uri.startsWith('https://'))return res.status(503).json({success:false,error:'REDIRECT_NOT_CONFIGURED'});
 const id=process.env.EAC_GOOGLE_CLIENT_ID,secret=process.env.EAC_GOOGLE_CLIENT_SECRET;
 if(!id||!secret)return res.status(503).json({success:false,error:'OAUTH_NOT_CONFIGURED'});
 const nonce=randomBytes(24).toString('hex');
 const state=nonce+'.'+createHmac('sha256',key).update(nonce).digest('hex');
 const auth=new google.auth.OAuth2(id,secret,uri);
 const authorizationUrl=auth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/calendar.readonly'],state});
 res.setHeader('Set-Cookie','eac_google_oauth_state='+state+'; Path=/api/calendar/google/oauth; Secure; HttpOnly; SameSite=Lax; Max-Age=600');
 return res.status(200).json({success:true,authorizationUrl});
}


export async function oauthCallback(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Robots-Tag','noindex');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET')return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const key=process.env.EAC_GOOGLE_OAUTH_SETUP_KEY||'';
 const state=String(req.query.state||'');
 const nonce=state.split('.')[0]||'';
 const expected=nonce+'.'+createHmac('sha256',key).update(nonce).digest('hex');
 const value=String(req.cookies?.eac_google_oauth_state||'');
 const a=Buffer.from(state),b=Buffer.from(expected);
 if(key.length<32||!value||value!==state||a.length!==b.length||!timingSafeEqual(a,b))
  return res.status(403).json({success:false,error:'INVALID_STATE'});
 const configured=process.env.EAC_GOOGLE_OAUTH_REDIRECT_URI||'';
 const host=String(req.headers.host||'');
 if(!configured||new URL(configured).host!==host)return res.status(403).json({success:false,error:'REDIRECT_MISMATCH'});
 const code=String(req.query.code||'');
 if(!code)return res.status(400).json({success:false,error:'NO_AUTHORIZATION_CODE'});
 res.setHeader('Set-Cookie','eac_google_oauth_state=; Path=/api/calendar/google/oauth; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
 try{
 const oauth=new google.auth.OAuth2(process.env.EAC_GOOGLE_CLIENT_ID,process.env.EAC_GOOGLE_CLIENT_SECRET,configured);
 const tokens=await oauth.getToken(code);
 return res.status(200).json({success:true,refreshToken:tokens.tokens.refresh_token||null,warning:'Guarde o refresh token como variável de ambiente sensível; nunca compartilhe este conteúdo.'});
 }catch{return res.status(502).json({success:false,error:'GOOGLE_AUTHORIZATION_FAILED'});}
}

