import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export default function handler(req: NextApiRequest,res:NextApiResponse){
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
