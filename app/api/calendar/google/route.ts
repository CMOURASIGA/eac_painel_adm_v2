import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { authorizeRequest } from '../../../../utils/apiAuth';

export const dynamic = 'force-dynamic';

const config = () => ({
  clientId: process.env.EAC_GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.EAC_GOOGLE_CLIENT_SECRET || '',
  refreshToken: process.env.EAC_GOOGLE_REFRESH_TOKEN || '',
  calendarId: process.env.EAC_PAROQUIA_CALENDAR_ID || '',
});
type CalendarItem = {id:string;atividade:string;tipo:string;inicio:string;termino:string;local:string;status:string;origemDado:string;googleReadOnly:boolean};
let cached: { key:string; expiry:number; events:CalendarItem[] } | null = null;

export async function GET(req:Request) {
  // This module's existing authorization is enforced server-side. Never disclose OAuth credentials.
  const auth = await authorizeRequest(req, {module:'calendar', action:'view'});
  if (!auth.ok) return NextResponse.json(auth.body,{status:auth.status,headers:{'Cache-Control':'no-store'}});
  if (String(process.env.EAC_GOOGLE_CALENDAR_ENABLED).toLowerCase()!=='true') {
    return NextResponse.json({success:true,enabled:false,events:[]},{headers:{'Cache-Control':'no-store'}});
  }
  const c=config();
  if (!c.clientId||!c.clientSecret||!c.refreshToken||!c.calendarId) {
    return NextResponse.json({success:false,error:'A conexão Google Calendar do EAC ainda não foi configurada.'},{status:503});
  }
  const url=new URL(req.url);
  const year=Number(url.searchParams.get('year'));
  const month=Number(url.searchParams.get('month'));
  if (!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12) {
    return NextResponse.json({success:false,error:'Período inválido.'},{status:400});
  }
  const timeMin=new Date(Date.UTC(year,month-1,1)).toISOString();
  const timeMax=new Date(Date.UTC(year,month,1)).toISOString(); // exclusivo: primeiro dia do mês seguinte
  const key=c.calendarId+':'+year+':'+month;
  if(cached?.key===key&&cached.expiry>Date.now()) return NextResponse.json({success:true,enabled:true,events:cached.events,syncedFrom:'cache'},{headers:{'Cache-Control':'private, max-age=60'}});
  try {
    const client=new google.auth.OAuth2(c.clientId,c.clientSecret);
    client.setCredentials({refresh_token:c.refreshToken});
    const calendar=google.calendar({version:'v3',auth:client});
    const events:CalendarItem[]=[];
    let pageToken:string|undefined;
    do {
      const result=await calendar.events.list({calendarId:c.calendarId,timeMin,timeMax,singleEvents:true,maxResults:2500,pageToken,showDeleted:false});
      for(const e of result.data.items||[]){
        if(e.status==='cancelled'||!e.start) continue;
        const start=e.start.dateTime||(e.start.date ? e.start.date+'T12:00:00' : undefined);
        const end=e.end?.dateTime||(e.end?.date ? e.end.date+'T12:00:00' : undefined)||start;
        if(!start)continue;
        events.push({id:'google:'+e.id,atividade:e.summary||'Evento da paróquia',tipo:'Paróquia',inicio:start,termino:end||start,local:e.location||'',status:'Confirmado',origemDado:'GOOGLE_PAROQUIA',googleReadOnly:true});
      }
      pageToken=result.data.nextPageToken||undefined;
    }while(pageToken&&events.length<10000);
    cached={key,expiry:Date.now()+60000,events};
    return NextResponse.json({success:true,enabled:true,events,syncedFrom:'google'},{headers:{'Cache-Control':'private, max-age=60'}});
  }catch{
    return NextResponse.json({success:false,error:'Não foi possível consultar a agenda compartilhada da paróquia.'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
