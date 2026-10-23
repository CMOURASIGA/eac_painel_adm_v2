import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 if(process.env.EAC_GOOGLE_CALENDAR_ENABLED!=='true')return res.status(200).json({success:true,enabled:false,events:[]});
 const token=String(req.cookies?.eac_auth_token||'');
 const url=process.env.SUPABASE_URL||'',anon=process.env.SUPABASE_ANON_KEY||'',service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!token||!url||!anon||!service)return res.status(401).json({success:false,error:'AUTH_REQUIRED'});
 const authClient=createClient(url,anon,{auth:{persistSession:false}});
 const identity=await authClient.auth.getUser(token);
 if(identity.error||!identity.data.user?.email)return res.status(401).json({success:false,error:'AUTH_INVALID'});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:profile,error:profileError}=await db.from('app_user_profiles').select('role,status,allowed_modules').eq('email',identity.data.user.email).maybeSingle();
 if(profileError||!profile||profile.status!=='ATIVO'||(profile.role!=='ADMIN'&&!Array.isArray(profile.allowed_modules))||
    (profile.role!=='ADMIN'&&!profile.allowed_modules.includes('calendar')))return res.status(403).json({success:false,error:'ACCESS_DENIED'});
 const year=Number(req.query.year),month=Number(req.query.month);
 if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12)return res.status(400).json({success:false,error:'INVALID_PERIOD'});
 const {EAC_GOOGLE_CLIENT_ID:id,EAC_GOOGLE_CLIENT_SECRET:secret,EAC_GOOGLE_REFRESH_TOKEN:refresh,EAC_PAROQUIA_CALENDAR_ID:calendarId}=process.env;
 if(!id||!secret||!refresh||!calendarId)return res.status(503).json({success:false,error:'NOT_CONFIGURED'});
 try{
 const oauth=new google.auth.OAuth2(id,secret);oauth.setCredentials({refresh_token:refresh});
 const client=google.calendar({version:'v3',auth:oauth});const events:any[]=[];let pageToken:string|undefined;
 do{
 const result=await client.events.list({calendarId,timeMin:new Date(Date.UTC(year,month-1,1)).toISOString(),timeMax:new Date(Date.UTC(year,month,1)).toISOString(),maxResults:2500,singleEvents:true,showDeleted:false,pageToken});
 for(const e of result.data.items||[]){if(e.status==='cancelled'||!e.start)continue;const start=e.start.dateTime||(e.start.date?e.start.date+'T12:00:00':null);if(!start)continue;
 events.push({id:'google:'+e.id,atividade:e.summary||'Evento da paróquia',tipo:'Paróquia',inicio:start,termino:e.end?.dateTime||(e.end?.date?e.end.date+'T12:00:00':start),local:e.location||'',status:'Confirmado',origemDado:'GOOGLE_PAROQUIA',googleReadOnly:true});}
 pageToken=result.data.nextPageToken||undefined;
 }while(pageToken&&events.length<10000);
 return res.status(200).json({success:true,enabled:true,events});
 }catch{return res.status(502).json({success:false,error:'Falha na consulta Google Calendar'});}
}
