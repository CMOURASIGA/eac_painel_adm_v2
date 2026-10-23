import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
const cookieName='eac_google_oauth_state';
const redirect=()=>process.env.EAC_GOOGLE_OAUTH_REDIRECT_URI||'';
export async function POST(req:Request){
  const configured=process.env.EAC_GOOGLE_OAUTH_SETUP_KEY||'';
  const supplied=req.headers.get('x-eac-oauth-setup-key')||'';
  const a=Buffer.from(configured),b=Buffer.from(supplied);
  if(configured.length<32||a.length!==b.length||!timingSafeEqual(a,b))
    return NextResponse.json({success:false,error:'Autorização de configuração inválida.'},{status:403,headers:{'Cache-Control':'no-store'}});
  if(!redirect()||!redirect().startsWith('https://'))return NextResponse.json({success:false,error:'URI de retorno OAuth não configurada.'},{status:503});
  const clientId=process.env.EAC_GOOGLE_CLIENT_ID||'';
  const clientSecret=process.env.EAC_GOOGLE_CLIENT_SECRET||'';
  if(!clientId||!clientSecret)return NextResponse.json({success:false,error:'Credenciais OAuth não configuradas.'},{status:503});
  const nonce=randomBytes(24).toString('hex');
  const signature=createHmac('sha256',configured).update(nonce).digest('hex');
  const state=nonce+'.'+signature;
  const client=new google.auth.OAuth2(clientId,clientSecret,redirect());
  const authorizationUrl=client.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/calendar.readonly'],state});
  const response=NextResponse.json({success:true,authorizationUrl},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(cookieName,state,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/calendar/google/oauth',maxAge:600});
  return response;
}
