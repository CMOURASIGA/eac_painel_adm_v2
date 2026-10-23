import React from 'react';
import qrcode from 'qrcode-generator';
export type PublicArtFormat='feed'|'story'|'square'|'whatsapp';
export type PublicArtStyle='colagem'|'clean'|'destaque';
export type PublicArtKind='mes'|'semana'|'evento';
type E={id:string;atividade:string;inicio:string;termino?:string;local?:string;origem:'EAC'|'GOOGLE_EAC'};
type Props={month:string;year:number;events:E[];format:PublicArtFormat;style:PublicArtStyle;kind:PublicArtKind;calendarUrl:string};
const when=(value:string)=>new Date(value).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
const day=(value:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit'}).format(new Date(value));
const weekDay=(value:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(new Date(value)).toUpperCase();
export default function PublicAgendaArt({month,year,events,format,style,kind,calendarUrl}:Props){
 const clean=style==='clean', highlight=style==='destaque';
 const width=format==='whatsapp'?1200:1080,height=format==='story'?1920:format==='square'?1080:format==='whatsapp'?675:1350;
 const horizontal=format==='whatsapp';
 const limit=kind==='evento'?1:kind==='semana'?5:horizontal?4:format==='square'?4:format==='story'?7:6;
 const qr=qrcode(0,'M');qr.addData(calendarUrl);qr.make();const qrData=qr.createDataURL(4,2);
 const entries=events.slice(0,limit);
 const paper=!clean;
 const eventColumns=kind==='evento'?'1fr':entries.length<=2?'1fr':'1fr 1fr';
 return <div style={{width,height,background:clean?'#f3f7ff':highlight?'#08447d':'#b98a5b',fontFamily:'Arial,sans-serif',padding:horizontal?26:48,boxSizing:'border-box',display:'flex',flexDirection:'column',gap:horizontal?12:24,color:'#101d32',overflow:'hidden',position:'relative'}}>
   <div style={{position:'absolute',inset:0,opacity:clean?0.02:highlight?0.17:0.11,backgroundImage:'radial-gradient(#112f56 1.5px,transparent 1.5px)',backgroundSize:'18px 18px',pointerEvents:'none'}}/>
   <header style={{position:'relative',display:'flex',justifyContent:'space-between',alignItems:'center',background:'white',padding:horizontal?12:23,borderRadius:clean?22:4,boxShadow:clean?'none':'10px 13px 0 #132a4429',transform:clean?'none':'rotate(-1deg)'}}>
     <div style={{display:'flex',alignItems:'center',gap:18}}><img src="https://i.imgur.com/c5XQ7TW.png" crossOrigin="anonymous" alt="Logo oficial do EAC" style={{height:horizontal?50:116,width:horizontal?50:116,objectFit:'contain'}}/><div><div style={{fontSize:horizontal?35:72,fontWeight:1000,color:'#063f7c',lineHeight:1}}>EAC</div><div style={{fontSize:horizontal?12:23,fontWeight:900}}>PORCIÚNCULA DE SANT'ANNA</div></div></div><span style={{padding:horizontal?'8px 12px':'19px 25px',fontSize:horizontal?14:27,fontWeight:900,color:'#10284e',background:'#ffca0c',transform:'rotate(-4deg)'}}>VIVA O EAC!<br/>FAÇA ACONTECER!</span>
   </header>
   {paper&&<div style={{position:'absolute',top:46,left:150,width:145,height:27,background:'#ffd557bb',transform:'rotate(-6deg)',zIndex:3}}/>}
   <div style={{background:highlight?'#ffcb07':'#083c78',color:highlight?'#09264e':'white',textAlign:'center',padding:horizontal?'10px 8px':'30px 10px',transform:clean?'none':'rotate(-1.1deg)',position:'relative'}}>
     <div style={{fontSize:horizontal?42:79,fontWeight:1000,lineHeight:1.04}}>{kind==='mes'?'AGENDA EAC':kind==='semana'?'ESSA SEMANA NO EAC':'NÃO PERCA!'}</div>
     <div style={{fontSize:horizontal?23:47,color:highlight?'#f02a42':'#b6f527',fontWeight:1000,marginTop:7}}>{month.toUpperCase()} {year}</div>
   </div>
   <div style={{position:'relative',flex:1,display:'grid',gridTemplateColumns:eventColumns,gap:horizontal?9:19,alignContent:'start'}}>
    {entries.map((event,index)=><section key={event.id} style={{background:'white',border:clean?'1px solid #bfd2e4':'none',minHeight:horizontal?66:kind==='evento'?300:format==='story'?195:185,display:'flex',overflow:'hidden',borderRadius:clean?17:5,transform:clean?'none':index%2?'rotate(1deg)':'rotate(-1deg)',boxShadow:clean?'none':'7px 8px 0 #173c6027'}}>
      <div style={{background:highlight?['#ffcb07','#ed3248','#08a57e','#ffcb07'][index%4]:['#e92738','#063f7c','#03896e','#ffcf12'][index%4],color:highlight&&index%4===0||index%4===3?'#10284e':'white',width:horizontal?63:112,minWidth:horizontal?63:112,display:'flex',justifyContent:'center',alignItems:'center',flexDirection:'column'}}>
        <strong style={{fontSize:horizontal?33:55}}>{day(event.inicio)}</strong><span style={{fontSize:23,fontWeight:900}}>{weekDay(event.inicio)}</span>
      </div>
      <div style={{padding:horizontal?8:18,minWidth:0,alignSelf:'center'}}><strong style={{display:'block',fontSize:horizontal?18:kind==='evento'?36:27,lineHeight:1.12,overflowWrap:'anywhere'}}>{event.atividade}</strong><span style={{display:'block',fontSize:horizontal?13:21,fontWeight:700,marginTop:horizontal?3:13}}>◷ {when(event.inicio)}{event.termino?' - '+when(event.termino):''}</span></div>
    </section>)}
    {entries.length===0&&<p style={{fontSize:32,background:'white',padding:25}}>Fique ligado! Novos eventos podem entrar na agenda.</p>}
   </div>
   {paper&&!horizontal&&<div style={{position:'absolute',right:40,top:380,fontSize:84,fontWeight:900,color:'#ffca0c',transform:'rotate(16deg)'}}>✦</div>}
   <div style={{position:'relative',padding:horizontal?'10px':'23px',background:'#ffcc0d',textAlign:'center',fontSize:horizontal?15:26,fontWeight:900}}>✨ FIQUE LIGADO! NOVOS EVENTOS PODEM ENTRAR NA AGENDA!</div>
   <div style={{position:'relative',background:'#0d172c',color:'white',padding:horizontal?'10px 18px':'25px 28px',display:'flex',alignItems:'center',gap:15,justifyContent:'space-between'}}>
      <div style={{fontWeight:1000,fontSize:horizontal?18:33}}>NÃO FIQUE DE FORA!<br/><span style={{color:'#ffcf12'}}>MARQUE NA AGENDA<br/>E CHAME A GALERA!</span><div style={{fontSize:horizontal?11:21,marginTop:horizontal?5:19}}>ACOMPANHE: @eacporciunculadesantana</div><div style={{fontSize:horizontal?11:19,marginTop:horizontal?5:12}}>ACESSE A AGENDA PELO QR CODE →</div></div>
      <div style={{display:'flex',alignItems:'center',gap:14}}><img src={qrData} alt="QR Code da agenda pública" style={{width:horizontal?70:140,height:horizontal?70:140,background:'white',padding:7}}/><img src="/mascote-eac.png" alt="" style={{maxHeight:horizontal?87:210,maxWidth:horizontal?80:170,objectFit:'contain'}}/></div>
   </div>
 </div>;
}
