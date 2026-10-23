import React,{useMemo,useState} from 'react';
import qrcode from 'qrcode-generator';

export type PublicArtFormat='feed'|'story'|'square'|'whatsapp';
export type PublicArtStyle='colagem'|'clean'|'destaque';
export type PublicArtKind='mes'|'semana'|'evento';
type E={id:string;atividade:string;inicio:string;termino?:string;local?:string;origem:'EAC'|'GOOGLE_EAC'};
type Props={month:string;year:number;events:E[];format:PublicArtFormat;style:PublicArtStyle;kind:PublicArtKind;calendarUrl:string};

/* ------------------------------------------------------------------ */
/* ASSETS: tudo hospedado no próprio projeto (pasta public/).          */
/* Veja o arquivo LEIA-ME-ASSETS.md para a lista e as medidas.         */
/* ------------------------------------------------------------------ */
export const ART_ASSETS={
  seal:'https://i.imgur.com/c5XQ7TW.jpg',               // selo redondo "Encontro de Adolescentes com Cristo" (PNG transparente)
  photo:'https://i.imgur.com/q3XYZYq.jpg',   // foto dos jovens já em duotone azul (o html2canvas NÃO aplica filtros CSS)
};
const FONT_BASE='/assets/eac/fonts';
const FONT_CSS=`
@font-face{font-family:'Permanent Marker';src:url('${FONT_BASE}/PermanentMarker-Regular.woff2') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'Archivo Black';src:url('${FONT_BASE}/ArchivoBlack-Regular.woff2') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'Nunito';src:url('${FONT_BASE}/Nunito-ExtraBold.woff2') format('woff2');font-weight:800;font-display:block}
@font-face{font-family:'Nunito';src:url('${FONT_BASE}/Nunito-Black.woff2') format('woff2');font-weight:900;font-display:block}`;
const FONT_DISPLAY="'Permanent Marker','Marker Felt',cursive";
const FONT_BLOCK="'Archivo Black',Impact,'Arial Black',sans-serif";
const FONT_BODY="'Nunito','Arial Rounded MT Bold',Arial,sans-serif";

const C={navy:'#0b2a5b',navy2:'#071c40',blue:'#0a47a0',red:'#e8283c',green:'#0b8f68',yellow:'#ffc928',tan:'#e9c18a',kraft:'#b98a5b',paper:'#f6f1e6'};
const CARD_COLORS=[{bg:C.red,fg:'#fff'},{bg:C.blue,fg:'#fff'},{bg:C.green,fg:'#fff'},{bg:C.yellow,fg:C.navy}];

/* Dimensões e quantidade de eventos por formato (exportadas para a prévia). */
export const ART_SIZE:Record<PublicArtFormat,{w:number;h:number;limit:number;card:number;k:number;wide?:boolean}>={
  feed:{w:1080,h:1350,limit:4,card:112,k:1},
  story:{w:1080,h:1920,limit:8,card:120,k:1},
  square:{w:1080,h:1080,limit:3,card:92,k:0.8},
  whatsapp:{w:1200,h:675,limit:4,card:108,k:1,wide:true},
};

const THEME={
  colagem:{bg:C.kraft,torn:true,head:C.paper,title:C.navy,titleText:'#fff',accent:C.tan,foot:C.navy,photo:true},
  clean:{bg:'#eef3fb',torn:false,head:'#ffffff',title:C.navy,titleText:'#fff',accent:C.yellow,foot:C.navy,photo:false},
  destaque:{bg:C.navy2,torn:true,head:C.paper,title:C.yellow,titleText:C.navy,accent:C.red,foot:'#12408f',photo:true},
};

/* Formas "rasgadas" em SVG (o html2canvas não suporta clip-path). */
const RECT='0,0 100,0 100,100 0,100';
const P_PAPER='0,0 100,0 100,88 96,93 91,87 85,94 78,88 70,95 62,89 54,94 45,88 36,95 28,89 19,94 10,88 4,93 0,89';
const P_BRUSH='0,12 4,3 12,8 24,1 38,7 52,0 66,6 80,1 92,6 100,2 99,35 100,62 98,92 90,100 76,95 60,100 42,94 26,100 10,95 2,100 0,70 1,40';
const P_STRIP='1,10 8,2 22,8 40,1 60,7 80,0 97,6 100,30 98,60 100,90 88,98 70,92 50,100 30,93 10,99 0,85 2,55 0,30';
const P_FOOT='0,6 6,0 20,5 40,0 62,5 84,0 100,4 100,94 92,100 70,95 48,100 26,95 8,100 0,94';

const Torn=({fill,points}:{fill:string;points:string})=>
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',left:0,top:0,width:'100%',height:'100%'}}><polygon points={points} fill={fill}/></svg>;

/* Ícones em SVG inline (sem assets externos). */
type IconName='group'|'people'|'crown'|'cross'|'calendar'|'megaphone'|'link'|'clock'|'pin'|'heart';
const ICONS:Record<IconName,React.ReactNode>={
  group:<><circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2"/><circle cx="19" cy="10" r="2"/><path d="M6.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M2 18c0-2 1.3-3.6 3-4M22 18c0-2-1.3-3.6-3-4"/></>,
  people:<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 14.5c3 0 5 2 5 5"/></>,
  crown:<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>,
  cross:<path d="M12 3v18M6 9h12"/>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2M14 17.5h2"/></>,
  megaphone:<path d="M3 10v4h3l8 4V6L6 10H3zM17 9a4 4 0 010 6M6 14l1.5 6"/>,
  link:<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  pin:<><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></>,
  heart:<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>,
};
const Icon=({name,size,color,stroke=2}:{name:IconName;size:number;color:string;stroke?:number})=>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;

/* Ícone de cada atividade, escolhido pelo nome. */
const iconFor=(name:string):IconName=>{
  const n=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/pos.?encontro/.test(n))return 'group';
  if(/nossa senhora|maria|aparecida/.test(n))return 'crown';
  if(/joao paulo|missa|celebra|cruz|retiro|adora|ora[cç]/.test(n))return 'cross';
  if(/reuniao|equipe|coorden|forma[cç]/.test(n))return 'people';
  return 'calendar';
};

/* Imagem que some se o arquivo não existir (evita ícone quebrado no PNG). */
function Img({src,style,alt=''}:{src:string;style?:React.CSSProperties;alt?:string}){
  const [bad,setBad]=useState(false);
  return bad?null:<img src={src} alt={alt} crossOrigin="anonymous" onError={()=>setBad(true)} style={style}/>;
}

/* Chame antes do html2canvas: espera fontes e imagens do elemento. */
export async function waitForArtAssets(root:HTMLElement){
  const faces=['400 40px "Permanent Marker"','400 40px "Archivo Black"','800 40px "Nunito"','900 40px "Nunito"'];
  await Promise.all(faces.map(f=>document.fonts.load(f).catch(()=>[])));
  await document.fonts.ready;
  await Promise.all(Array.from(root.querySelectorAll('img')).map(img=>img.complete?Promise.resolve():new Promise<void>(r=>{img.onload=()=>r();img.onerror=()=>r()})));
  await Promise.all(Array.from(root.querySelectorAll('img')).map(img=>img.decode?img.decode().catch(()=>undefined):undefined));
}

const clock=(v:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
const dayOf=(v:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit'}).format(new Date(v));
const weekDay=(v:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(new Date(v)).toUpperCase();

function Card({e,i,h,big}:{e:E;i:number;h:number;big?:boolean}){
  const col=CARD_COLORS[i%4];
  return <section style={{display:'flex',height:h,flexShrink:0,background:'#fffdf8',borderRadius:14,overflow:'hidden',boxShadow:'0 6px 0 rgba(10,30,70,.2)'}}>
    <div style={{width:h*1.08,flexShrink:0,background:col.bg,color:col.fg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <span style={{fontFamily:FONT_BLOCK,fontSize:h*.5,lineHeight:1}}>{dayOf(e.inicio)}</span>
      <span style={{fontWeight:900,fontSize:h*.19,marginTop:4}}>{weekDay(e.inicio)}</span>
    </div>
    <div style={{flex:1,minWidth:0,padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',gap:big?14:8,color:C.navy}}>
      <strong style={{fontWeight:900,fontSize:big?58:h*.32,lineHeight:1.1,overflowWrap:'anywhere'}}>{e.atividade}</strong>
      <span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:big?34:h*.25}}>
        <Icon name="clock" size={big?34:h*.25} color={C.navy}/>{clock(e.inicio)}{e.termino?' - '+clock(e.termino):''}
      </span>
      {big&&<span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:30}}><Icon name="pin" size={30} color={C.navy}/>{e.local||'Local a confirmar'}</span>}
    </div>
    <div style={{display:'flex',alignItems:'center',paddingRight:big?40:26}}><Icon name={iconFor(e.atividade)} size={big?96:h*.52} color={C.navy} stroke={1.8}/></div>
  </section>;
}

export default function PublicAgendaArt({month,year,events,format,style,kind,calendarUrl}:Props){
  const t=THEME[style];
  const S=ART_SIZE[format];
  const compact=format==='square';
  const k=S.k;
  const limit=kind==='evento'?1:S.limit;
  const entries=events.slice(0,limit);
  const extra=Math.max(0,events.length-entries.length);
  const qrData=useMemo(()=>{const qr=qrcode(0,'M');qr.addData(calendarUrl);qr.make();return qr.createDataURL(8,2)},[calendarUrl]);
  const shownUrl=calendarUrl.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const [line1,line2]=kind==='mes'?['AGENDA','EAC']:kind==='semana'?['SEMANA','NO EAC']:['NÃO','PERCA!'];
  const shape=(p:string)=>t.torn?p:RECT;
  const showPhoto=t.photo;
  const photoH=S.wide?'75%':'32%';

  const photo=showPhoto?<>
    <Img src={ART_ASSETS.photo} style={{position:'absolute',right:0,bottom:0,width:S.wide?'30%':'38%',height:photoH,objectFit:'contain',objectPosition:'right bottom'}}/>

  </>:null;

  const wordmark=(size:number)=><div style={{color:C.navy}}>
    <div style={{fontFamily:FONT_BLOCK,fontSize:size,lineHeight:.9,letterSpacing:-2}}>EAC</div>
    <div style={{fontFamily:FONT_BLOCK,fontSize:size*.24,lineHeight:1.12,marginTop:6}}>PORCIÚNCULA<br/>DE SANT'ANNA</div>
  </div>;

  const seal=(size:number)=><Img src={ART_ASSETS.seal} alt="Selo oficial do EAC" style={{width:size,height:size,objectFit:'contain',flexShrink:0}}/>;

  const urlPill=(size:number)=><div style={{display:'inline-flex',alignItems:'center',gap:12,background:'#fff',borderRadius:999,padding:`${size*.32}px ${size*.7}px`,color:C.navy,fontWeight:900,fontSize:size}}>
    <Icon name="link" size={size*1.05} color={C.navy}/>{shownUrl}
  </div>;

  const banner=(big:boolean)=><div style={{position:'relative',alignSelf:'flex-start',transform:'rotate(-1.5deg)',padding:big?'26px 44px 26px 34px':'14px 26px 14px 20px'}}>
    <Torn fill={C.yellow} points={shape(P_STRIP)}/>
    <div style={{position:'relative',display:'flex',alignItems:'center',gap:big?22:14,color:C.navy}}>
      <Icon name="megaphone" size={big?78:52} color={C.navy} stroke={1.8}/>
      <div><div style={{fontFamily:FONT_DISPLAY,fontSize:big?56:36,lineHeight:1}}>Fique ligado!</div>
      <div style={{fontWeight:900,fontSize:big?24:15,marginTop:4}}>NOVOS EVENTOS PODEM ENTRAR NA AGENDA!</div></div>
    </div>
  </div>;

  const emptyCard=<p style={{margin:0,background:'#fffdf8',borderRadius:14,padding:28,fontWeight:900,fontSize:32,color:C.navy}}>Fique ligado! Novos eventos serão divulgados em breve.</p>;

  const root:React.CSSProperties={width:S.w,height:S.h,position:'relative',overflow:'hidden',background:t.bg,fontFamily:FONT_BODY,color:C.navy,display:'flex',flexDirection:'column',boxSizing:'border-box'};

  /* ---------------- Layout horizontal (WhatsApp 1200×675) ---------------- */
  if(S.wide){
    return <div style={{...root,padding:28,gap:14}}>
      <style>{FONT_CSS}</style>{photo}
      <div style={{position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:22,height:150,flexShrink:0}}>
        <div style={{position:'relative',padding:'12px 26px',background:'transparent'}}>
          <Torn fill={t.head} points={shape(P_STRIP)}/><div style={{position:'relative'}}>{wordmark(70)}</div>
        </div>
        <div style={{position:'relative',flex:1,textAlign:'center',padding:'16px 24px',transform:'rotate(-1deg)'}}>
          <Torn fill={t.title} points={shape(P_BRUSH)}/>
          <div style={{position:'relative',color:t.titleText}}>
            <div style={{fontFamily:FONT_DISPLAY,fontSize:62,lineHeight:1}}>{line1} <span style={{color:t.accent}}>{line2}</span></div>
            <div style={{fontFamily:FONT_BLOCK,fontSize:30,marginTop:4}}>{month.toUpperCase()} <span style={{color:t.accent}}>{year}</span></div>
          </div>
        </div>
        {seal(132)}
      </div>
      <div style={{position:'relative',zIndex:2,flex:1,minHeight:0,display:'grid',gridTemplateColumns:kind==='evento'||entries.length<2?'1fr':'1fr 1fr',gap:14,alignContent:'center'}}>
        {entries.map((e,i)=><Card key={e.id} e={e} i={i} h={S.card} big={false}/>)}
        {entries.length===0&&emptyCard}
      </div>
      <div style={{position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:22,flexShrink:0}}>
        {banner(false)}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8,color:'#fff'}}>
          {extra>0&&<span style={{fontWeight:900,fontSize:18}}>+{extra} {extra===1?'evento':'eventos'} no calendário completo</span>}
          <span style={{fontWeight:900,fontSize:16}}>ACESSE O CALENDÁRIO COMPLETO</span>
          {urlPill(20)}
        </div>
        <img src={qrData} alt="QR Code da agenda pública" style={{width:104,height:104,background:'#fff',padding:6,borderRadius:8,flexShrink:0}}/>
      </div>
    </div>;
  }

  /* ---------------- Layout vertical (feed, story, quadrado) ---------------- */
  const m=48;
  return <div style={root}>
    <style>{FONT_CSS}</style>{photo}

    <header style={{position:'relative',zIndex:2,padding:`${40*k}px ${m}px ${72*k}px`,flexShrink:0}}>
      <Torn fill={t.head} points={shape(P_PAPER)}/>
      <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        {wordmark(122*k)}
        <div style={{position:'relative',transform:'rotate(-5deg)',padding:'16px 26px',textAlign:'center',color:C.navy}}>
          <Torn fill={C.tan} points={shape(P_STRIP)}/>
          <div style={{position:'relative',fontFamily:FONT_DISPLAY,fontSize:38*k,lineHeight:1.15}}>“Viva o EAC!<br/>Faça acontecer!”</div>
        </div>
        {seal(190*k)}
      </div>
    </header>

    <div style={{position:'relative',zIndex:3,margin:`-${38*k}px ${28}px 0`,padding:`${34*k}px 36px ${30*k}px`,transform:'rotate(-1deg)',flexShrink:0}}>
      <Torn fill={t.title} points={shape(P_BRUSH)}/>
      <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',gap:28,color:t.titleText}}>
        {!compact&&<Icon name="calendar" size={128} color={t.titleText} stroke={1.6}/>}
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:FONT_DISPLAY,fontSize:118*k,lineHeight:1,transform:'rotate(-1deg)'}}>{line1} <span style={{color:t.accent}}>{line2}</span></div>
          <div style={{fontFamily:FONT_BLOCK,fontSize:66*k,marginTop:8}}>{month.toUpperCase()} <span style={{color:t.accent}}>{year}</span></div>
        </div>
      </div>
    </div>

    <div style={{position:'relative',zIndex:2,flex:1,minHeight:0,margin:`${28*k}px ${m}px 0`,display:'flex',flexDirection:'column',gap:14}}>
      {entries.map((e,i)=><Card key={e.id} e={e} i={i} h={kind==='evento'?280:S.card} big={kind==='evento'}/>)}
      {entries.length===0&&emptyCard}
      {extra>0&&<span style={{alignSelf:'flex-end',fontWeight:900,fontSize:24,color:'#fff',background:C.navy,borderRadius:999,padding:'6px 20px'}}>+{extra} {extra===1?'evento':'eventos'} no calendário completo</span>}
    </div>

    {!compact&&<div style={{position:'relative',zIndex:2,margin:`18px ${m}px 0`,display:'flex'}}>{banner(true)}</div>}

    <footer style={{position:'relative',zIndex:2,margin:`${compact?16:18}px 40px 40px`,padding:compact?'22px 30px':'30px 36px',flexShrink:0}}>
      <Torn fill={t.foot} points={shape(P_FOOT)}/>
      <div style={{position:'relative',display:'flex',alignItems:'center',gap:compact?24:30,color:'#fff'}}>
        <img src={qrData} alt="QR Code da agenda pública" style={{width:compact?150:176,height:compact?150:176,background:'#fff',padding:8,borderRadius:8,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:FONT_BLOCK,fontSize:compact?34:42,lineHeight:1.05}}>NÃO FIQUE DE FORA!</div>
          <div style={{fontFamily:FONT_BLOCK,fontSize:compact?28:36,lineHeight:1.1,color:C.yellow,marginTop:6}}>MARQUE NA AGENDA<br/>E CHAME A GALERA!</div>
          <div style={{fontWeight:900,fontSize:compact?17:21,margin:'14px 0 10px'}}>ACESSE O CALENDÁRIO COMPLETO:</div>
          {urlPill(compact?24:30)}
        </div>
        {!compact&&<div style={{transform:'rotate(5deg)',background:C.paper,color:C.navy,padding:'18px 26px',fontFamily:FONT_DISPLAY,fontSize:42,lineHeight:1.15,textAlign:'center',flexShrink:0,boxShadow:'6px 7px 0 rgba(0,0,0,.25)'}}>
          “Amizade,<br/>fé,<br/>serviço,<br/>sempre!”<div style={{marginTop:6}}><Icon name="heart" size={40} color={C.navy}/></div>
        </div>}
      </div>
    </footer>
  </div>;
}