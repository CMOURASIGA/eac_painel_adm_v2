import type {NextApiRequest,NextApiResponse} from 'next';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

export async function eacStoreProducts(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 const url=process.env.SUPABASE_URL||'',anon=process.env.SUPABASE_ANON_KEY||'',service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 if(!url||!anon||!service)return res.status(503).json({success:false,error:'DATABASE_NOT_CONFIGURED'});
 const token=String(req.cookies?.eac_auth_token||'');
 if(!token)return res.status(401).json({success:false,error:'AUTH_REQUIRED'});
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const who=await auth.auth.getUser(token);
 if(who.error||!who.data.user)return res.status(401).json({success:false,error:'SESSION_INVALID'});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:profile,error:profileError}=await db.from('app_user_profiles').select('role,status').eq('auth_user_id',who.data.user.id).maybeSingle();
 if(profileError||!profile||String(profile.role).toUpperCase()!=='ADMIN'||String(profile.status).toUpperCase()!=='ATIVO')return res.status(403).json({success:false,error:'ADMIN_REQUIRED'});
 if(req.method==='GET'){
  const {data,error}=await db.from('eac_store_products').select('id,name,description,price,image_url,active,sort_order,updated_at').order('sort_order');
  return error?res.status(503).json({success:false,error:'CATALOG_NOT_READY'}):res.status(200).json({success:true,products:data||[]});
 }
 const name=String(req.body?.name||'').trim(),description=String(req.body?.description||'').trim();
 const price=Number(req.body?.price),active=req.body?.active===true,sortOrder=Number(req.body?.sort_order||0);
 const productId=req.body?.id?String(req.body.id):null;
 if(name.length<2||name.length>120||description.length>1500||!Number.isFinite(price)||price<0||!Number.isInteger(sortOrder)||Math.abs(sortOrder)>100000||productId&&!/^[a-f0-9-]{36}$/i.test(productId))return res.status(400).json({success:false,error:'INVALID_PRODUCT'});
 let imagePath:string|undefined,imageUrl:string|undefined;
 const imageBase64=String(req.body?.image_base64||'');
 if(imageBase64){
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageBase64);
  if(!match)return res.status(400).json({success:false,error:'INVALID_IMAGE_TYPE'});
  const buffer=Buffer.from(match[2],'base64');
  if(!buffer.length||buffer.length>3145728)return res.status(413).json({success:false,error:'IMAGE_TOO_LARGE'});
  const mime=match[1],ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  imagePath='products/'+randomUUID()+'.'+ext;
  const stored=await db.storage.from('eac-store-products').upload(imagePath,buffer,{contentType:mime,upsert:false});
  if(stored.error)return res.status(503).json({success:false,error:'IMAGE_STORAGE_FAILED'});
  imageUrl=db.storage.from('eac-store-products').getPublicUrl(imagePath).data.publicUrl;
 }
 const payload:any={name,description,price,active,sort_order:sortOrder,updated_at:new Date().toISOString()};
 if(imagePath){payload.image_path=imagePath;payload.image_url=imageUrl;}
 if(productId){
  const {data,error}=await db.from('eac_store_products').update(payload).eq('id',productId).select('id').maybeSingle();
  return error||!data?res.status(503).json({success:false,error:'PRODUCT_UPDATE_FAILED'}):res.status(200).json({success:true,id:data.id});
 }
 const {data,error}=await db.from('eac_store_products').insert(payload).select('id').single();
 return error||!data?res.status(503).json({success:false,error:'PRODUCT_CREATE_FAILED'}):res.status(200).json({success:true,id:data.id});
}
