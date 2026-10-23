import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';
export async function publicEacCalendar(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','public, max-age=60, s-maxage=180');
 if(req.method!=='GET')return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const year=Number(req.query.year),month=Number(req.query.month);
 if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12)return res.status(400).json({success:false,error:'INVALID_PERIOD'});
 const url=process.env.SUPABASE_URL||'',anon=process.env.SUPABASE_ANON_KEY||'';
 if(!url||!anon)return res.status(503).json({success:false,error:'PUBLIC_DATA_NOT_CONFIGURED'});
 const db=createClient(url,anon,{auth:{persistSession:false}});
 const from=`${year}-${String(month).padStart(2,'0')}-01T00:00:00-03:00`;
 const next=new Date(Date.UTC(year,month,1));
 const to=`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-01T00:00:00-03:00`;
 const [internal,google]=await Promise.all([
  db.from('vw_public_calendar_events').select('id,atividade,tipo,inicio,termino,local,status').gte('inicio',from).lt('inicio',to).limit(2500),
  db.from('eac_public_google_events').select('id,atividade,tipo,inicio,termino,local,status').eq('publication_status','PUBLICADO').eq('source','GOOGLE_EAC').gte('inicio',from).lt('inicio',to).limit(2500)
 ]);
 if(internal.error||google.error)return res.status(503).json({success:false,error:'PUBLIC_CALENDAR_NOT_READY'});
 const entries=[...(internal.data||[]).map(e=>({...e,origem:'EAC'})),...(google.data||[]).map(e=>({...e,origem:'GOOGLE_EAC'}))].filter(e=>!['CANCELADO','CANCELADA'].includes(String(e.status||'').toUpperCase())).sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
 return res.status(200).json({success:true,events:entries});
}
