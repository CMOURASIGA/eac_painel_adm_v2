import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { createHmac, timingSafeEqual } from 'node:crypto';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
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
