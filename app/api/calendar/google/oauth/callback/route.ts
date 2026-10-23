import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createHmac,timingSafeEqual } from 'node:crypto';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const url=new URL(req.url);
 const state=url.searchParams.get('state')||'';
 const cookie=req.headers.get('cookie')||'';
 const raw=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('eac_google_oauth_state='));
 const saved=raw?decodeURIComponent(raw.substring('eac_google_oauth_state='.length)):'';
 const secret=process.env.EAC_GOOGLE_OAUTH_SETUP_KEY||'';
 const nonce=state.split('.')[0]||'';
 const expected=nonce+'.'+createHmac('sha256',secret).update(nonce).digest('hex');
 const lhs=Buffer.from(state),rhs=Buffer.from(expected);
 if(!secret||!saved||saved!==state||lhs.length!==rhs.length||!timingSafeEqual(lhs,rhs))
   return NextResponse.json({success:false,error:'Estado OAuth inválido ou expirado.'},{status:403,headers:{'Cache-Control':'no-store'}});
 const redirect=process.env.EAC_GOOGLE_OAUTH_REDIRECT_URI||'';
 if(!redirect||new URL(redirect).origin!==url.origin)return NextResponse.json({success:false,error:'URI OAuth de retorno não corresponde ao ambiente.'},{status:403});
 const client=new google.auth.OAuth2(process.env.EAC_GOOGLE_CLIENT_ID,process.env.EAC_GOOGLE_CLIENT_SECRET,redirect);
 const code=url.searchParams.get('code');
 if(!code)return NextResponse.json({success:false,error:'Autorização Google não concluída.'},{status:400,headers:{'Cache-Control':'no-store'}});
 try{
  const {tokens}=await client.getToken(code);
  // Token shown only once in callback, never logged or saved in code.
  const response=NextResponse.json({success:true,refreshToken:tokens.refresh_token||null,info:tokens.refresh_token?'Armazene o token somente em EAC_GOOGLE_REFRESH_TOKEN na Vercel.':'Google não emitiu refresh token. Revogue o acesso anterior e repita a autorização.'},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});
  response.cookies.set('eac_google_oauth_state','',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/calendar/google/oauth',maxAge:0});
  return response;
 }catch{return NextResponse.json({success:false,error:'Troca de código OAuth falhou.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
