import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'crypto';

type AnySupabase = SupabaseClient<any, 'public', string, any, any>;
type JsonObject = Record<string, any>;
type Result = { ok: true; data: JsonObject } | { ok: false; error: string; details?: any };

const clean = (v: any) => String(v ?? '').trim();
const digits = (v: any) => clean(v).replace(/\D/g, '');
const nowIso = () => new Date().toISOString();
const hash = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

const normalizedNameKey = (v: any) =>
  clean(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

function phoneNorm(v: any) {
  const d = digits(v);
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

function secret() {
  const value = clean(process.env.PRESENCA_V2_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CHAVE_MESTRA);
  if (!value) throw new Error('PRESENCA_V2_TOKEN_SECRET_NOT_CONFIGURED');
  return value;
}

function tokenFor(kind: 'session' | 'responsible', id: string) {
  return createHmac('sha256', secret()).update(`presenca-v2:${kind}:${id}`, 'utf8').digest('base64url');
}

async function ensureDueClose(supabase: AnySupabase, session: any) {
  if (!session || session.status !== 'ABERTA' || !session.encerramento_programado_em) return session;
  const due = Date.parse(session.encerramento_programado_em);
  if (!Number.isFinite(due) || due > Date.now()) return session;
  const closedAt = nowIso();
  const { data, error } = await supabase.from('presenca_sessoes')
    .update({
      status: 'ENCERRADA',
      encerrada_em: closedAt,
      encerrada_origem: 'RESPONSAVEL',
      encerramento_solicitado_em: null,
      encerramento_programado_em: null,
      atualizado_em: closedAt,
    })
    .eq('id', session.id)
    .eq('status', 'ABERTA')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await audit(supabase, data.id, 'CLOSED_MANUAL', 'RESPONSAVEL', data.responsavel_grupo_id, {});
    return data;
  }
  return session;
}

async function audit(supabase: AnySupabase, sessaoId: string, event: string, actor: 'ADM'|'RESPONSAVEL'|'SYSTEM', groupId?: string | null, detalhes: any = {}) {
  const payload: any = {
    sessao_id: sessaoId,
    tipo: event,
    tipo_evento: event,
    ator_tipo: actor,
    detalhes: detalhes || {},
  };
  if (groupId) payload.responsavel_grupo_id = groupId;
  const { error } = await supabase.from('presenca_sessao_eventos').insert(payload);
  if (error) throw error;
}

async function getGroup(supabase: AnySupabase, id: string) {
  const { data, error } = await supabase.from('presenca_responsaveis_grupos').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getGroupByToken(supabase: AnySupabase, rawToken: string) {
  if (!rawToken) return null;
  const expected = hash(rawToken);
  const { data, error } = await supabase.from('presenca_responsaveis_grupos')
    .select('*')
    .eq('access_token_hash', expected)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureResponsibleToken(supabase: AnySupabase, group: any) {
  const raw = tokenFor('responsible', group.id);
  const expectedHash = hash(raw);
  if (clean(group.access_token_hash) !== expectedHash) {
    const { error } = await supabase.from('presenca_responsaveis_grupos')
      .update({ access_token_hash: expectedHash })
      .eq('id', group.id);
    if (error) throw error;
  }
  return raw;
}

async function loadHistoricalCircleLabels(supabase: AnySupabase, ids: string[]) {
  const map = new Map<string,string>();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('eac_circulos_historicos').select('id,edicao,cor').in('id', ids);
  if (error) throw error;
  for (const row of data || []) map.set(row.id, `EAC ${row.edicao} · ${row.cor}`);
  return map;
}

async function listGroups(supabase: AnySupabase) {
  const { data: groups, error } = await supabase.from('presenca_responsaveis_grupos')
    .select('*')
    .order('nome_exibicao', { ascending: true });
  if (error) throw error;
  const out: any[] = [];
  for (const group of groups || []) {
    const { data: members, error: me } = await supabase.from('presenca_responsavel_membros')
      .select('id,nome_snapshot,papel_snapshot,pessoa_id,ativo')
      .eq('grupo_id', group.id);
    if (me) throw me;
    const { data: links, error: le } = await supabase.from('presenca_responsavel_circulos')
      .select('circulo_id,circulo_historico_id')
      .eq('grupo_id', group.id);
    if (le) throw le;
    const historicalIds = (links || []).map((x:any)=>clean(x.circulo_historico_id)).filter(Boolean);
    const labels = await loadHistoricalCircleLabels(supabase, historicalIds);
    const circles = (links || []).map((x:any) => x.circulo_historico_id ? labels.get(x.circulo_historico_id) : clean(x.circulo_id)).filter(Boolean);
    const accessToken = await ensureResponsibleToken(supabase, group);
    out.push({
      id: group.id,
      code: group.codigo,
      kind: group.tipo === 'POS' ? 'POS' : group.tipo === 'TIOS' ? 'TIOS' : 'HISTORICO',
      label: group.nome_exibicao,
      active: group.ativo === true,
      members: (members || []).filter((m:any)=>m.ativo !== false).map((m:any)=>({ id:m.id, name:m.nome_snapshot, role:m.papel_snapshot, pessoaId:m.pessoa_id })),
      circles,
      circlePairLabel: circles.join(' + '),
      accessToken,
    });
  }
  return out;
}

async function sessionRaw(supabase: AnySupabase, id: string) {
  const { data, error } = await supabase.from('presenca_sessoes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return await ensureDueClose(supabase, data);
}

async function eligiblePeople(supabase: AnySupabase, session: any) {
  const people = new Map<string, any>();
  const addPeople = async (ids: string[], circle?: string) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    for (let i=0;i<unique.length;i+=200) {
      const chunk=unique.slice(i,i+200);
      const { data, error } = await supabase.from('pessoas').select('id,nome_completo,telefone,telefone_normalizado').in('id', chunk);
      if (error) throw error;
      for (const p of data || []) {
        const pid=clean(p.id);
        const current=people.get(pid) || {};
        const incomingCircle=clean(circle);
        const existingCircles=clean(current.circle).split(' | ').map((x:string)=>x.trim()).filter(Boolean);
        if(incomingCircle && !existingCircles.includes(incomingCircle)) existingCircles.push(incomingCircle);
        people.set(pid,{
          ...current,
          id:pid,
          name:clean(p.nome_completo),
          phone:phoneNorm(p.telefone_normalizado||p.telefone),
          circle:existingCircles.join(' | '),
        });
      }
    }
  };

  if (session.tipo === 'REUNIAO_DUPLA_TIOS') {
    const { data: links, error } = await supabase.from('presenca_responsavel_circulos')
      .select('circulo_historico_id,circulo_id')
      .eq('grupo_id', session.responsavel_grupo_id);
    if (error) throw error;
    for (const link of links || []) {
      if (link.circulo_historico_id) {
        const { data: circle } = await supabase.from('eac_circulos_historicos').select('edicao,cor').eq('id', link.circulo_historico_id).maybeSingle();
        const { data: members, error: me } = await supabase.from('eac_circulo_membros_historicos')
          .select('pessoa_id')
          .eq('circulo_id', link.circulo_historico_id)
          .not('pessoa_id','is',null);
        if (me) throw me;
        await addPeople((members||[]).map((m:any)=>clean(m.pessoa_id)), circle ? `EAC ${circle.edicao} · ${circle.cor}` : '');
      } else if (link.circulo_id) {
        const { data: members, error: me } = await supabase.from('circulo_participantes').select('pessoa_id').eq('circulo_id',link.circulo_id).not('pessoa_id','is',null);
        if (me) throw me;
        await addPeople((members||[]).map((m:any)=>clean(m.pessoa_id)));
      }
    }
  } else {
    const { data: circles, error: ce } = await supabase.from('eac_circulos_historicos').select('id,edicao,cor').in('edicao',[35,36,37]);
    if (ce) throw ce;
    const circleMap=new Map<string,string>((circles||[]).map((circle:any)=>[clean(circle.id), `EAC ${circle.edicao} · ${circle.cor}`]));
    const circleIds=Array.from(circleMap.keys());
    if (circleIds.length) {
      const { data: members, error: me } = await supabase.from('eac_circulo_membros_historicos')
        .select('pessoa_id,circulo_id')
        .in('circulo_id',circleIds)
        .not('pessoa_id','is',null);
      if (me) throw me;
      const byCircle=new Map<string,string[]>();
      for(const member of members||[]){
        const cid=clean(member.circulo_id);
        const ids=byCircle.get(cid)||[];
        ids.push(clean(member.pessoa_id));
        byCircle.set(cid,ids);
      }
      for(const [cid,ids] of byCircle.entries()) {
        await addPeople(ids,circleMap.get(cid)||'');
      }
    }
    const { data: enc, error: ee } = await supabase.from('encontreiros').select('pessoa_id').eq('classificacao','ADOLESCENTE').eq('status','DISPONIVEL').not('pessoa_id','is',null);
    if (ee) throw ee;
    await addPeople((enc||[]).map((m:any)=>clean(m.pessoa_id)));
  }

  const ids=Array.from(people.keys());
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const [{data: adolescents,error:ae},{data: workers,error:we}] = await Promise.all([
      supabase.from('adolescentes').select('id,pessoa_id').in('pessoa_id',chunk),
      supabase.from('encontreiros').select('id,pessoa_id').in('pessoa_id',chunk),
    ]);
    if(ae) throw ae; if(we) throw we;
    for(const a of adolescents||[]){const p=people.get(a.pessoa_id); if(p&&!p.adolescenteId)p.adolescenteId=a.id;}
    for(const e of workers||[]){const p=people.get(e.pessoa_id); if(p&&!p.encontreiroId)p.encontreiroId=e.id;}
  }
  const deduped = new Map<string, any>();
  for (const person of people.values()) {
    const exactPhone = phoneNorm(person.phone);
    const key = exactPhone
      ? `${normalizedNameKey(person.name)}|${exactPhone}`
      : `${normalizedNameKey(person.name)}|id:${person.id}`;

    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, person);
      continue;
    }

    const currentCircles = clean(current.circle).split(' | ').map((x:string)=>x.trim()).filter(Boolean);
    const incomingCircles = clean(person.circle).split(' | ').map((x:string)=>x.trim()).filter(Boolean);
    for (const circle of incomingCircles) {
      if (!currentCircles.includes(circle)) currentCircles.push(circle);
    }

    const preferIncoming = !clean(current.circle) && Boolean(clean(person.circle));
    deduped.set(key, {
      ...(preferIncoming ? person : current),
      circle: currentCircles.join(' | '),
      duplicatePersonIds: Array.from(new Set([
        ...(Array.isArray(current.duplicatePersonIds) ? current.duplicatePersonIds : [current.id]),
        ...(Array.isArray(person.duplicatePersonIds) ? person.duplicatePersonIds : [person.id]),
      ])),
    });
  }

  return Array.from(deduped.values()).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

async function decorateSession(supabase: AnySupabase, row: any) {
  row = await ensureDueClose(supabase,row);
  const [group, eligible, pres, pend] = await Promise.all([
    getGroup(supabase,row.responsavel_grupo_id),
    eligiblePeople(supabase,row),
    supabase.from('presencas').select('id,pessoa_id').eq('sessao_id',row.id),
    supabase.from('presenca_pendencias').select('id,status').eq('sessao_id',row.id),
  ]);
  if(pres.error) throw pres.error; if(pend.error) throw pend.error;
  const publicToken=tokenFor('session',row.id);
  const expectedHash=hash(publicToken);
  if(clean(row.public_token_hash)!==expectedHash){
    const {error}=await supabase.from('presenca_sessoes').update({public_token_hash:expectedHash,atualizado_em:nowIso()}).eq('id',row.id);
    if(error) throw error;
  }
  return {
    id:row.id,
    title:row.titulo,
    type:row.tipo,
    status:row.status,
    responsibleId:row.responsavel_grupo_id,
    responsibleLabel:group?.nome_exibicao||'',
    scheduledAt:row.agendada_para,
    openedAt:row.aberta_em,
    closedAt:row.encerrada_em,
    closeRequestedAt:row.encerramento_solicitado_em,
    closeScheduledAt:row.encerramento_programado_em,
    responsibleReopens:Number(row.reaberturas_responsavel||0),
    totalReopens:Number(row.total_reaberturas||0),
    eligibleCount:eligible.length,
    confirmedCount:(pres.data||[]).length,
    pendingCount:(pend.data||[]).filter((x:any)=>x.status==='PENDENTE').length,
    publicToken,
  };
}

async function listSessions(supabase: AnySupabase, groupId?: string) {
  let q=supabase.from('presenca_sessoes').select('*').order('agendada_para',{ascending:false});
  if(groupId) q=q.eq('responsavel_grupo_id',groupId);
  const {data,error}=await q;
  if(error) throw error;
  const out=[];
  for(const row of data||[]) out.push(await decorateSession(supabase,row));
  return out;
}

async function insertPresence(supabase: AnySupabase, session: any, person: any, enteredName: string, enteredPhone: string, extra:any={}) {
  const now=new Date();
  const body:any={
    pessoa_id:person?.id||null,
    adolescente_id:person?.adolescenteId||null,
    encontreiro_id:person?.encontreiroId||null,
    encontro_id:session.encontro_id||null,
    circulo_id:null,
    sessao_id:session.id,
    data_presenca:now.toISOString(),
    mes:now.getMonth()+1,
    telefone_digitado:enteredPhone||null,
    telefone_normalizado:phoneNorm(enteredPhone)||null,
    nome_digitado:enteredName||person?.name||'',
    status_conciliacao:person?.id?'CONCILIADO':'PENDENTE',
    origem:'SISTEMA_CHECKIN_PUBLICO',
    circulo_informado:person?.circle||null,
    status_presenca:'REGISTRADA',
    criado_via_sistema:true,
    payload:{
      canal:'PRESENCA_V2',
      sessaoId:session.id,
      tipoReuniao:session.tipo==='REUNIAO_DUPLA_TIOS'?'REUNIAO_CIRCULO':'POS_ENCONTRO',
      ...extra
    },
  };
  const {data,error}=await supabase.from('presencas').insert(body).select('*').maybeSingle();
  if(error) throw error;
  return data;
}

async function createPending(supabase: AnySupabase, session:any, person:any, name:string, phone:string, motivo:string){
  const key=hash([session.id,person?.id||'',clean(name).toLowerCase(),phoneNorm(phone),motivo].join('|'));
  const {data:existing,error:exErr}=await supabase.from('presenca_pendencias').select('*').eq('chave_idempotencia',key).maybeSingle();
  if(exErr) throw exErr;
  if(existing) return {row:existing,already:true};
  const payload:any={
    sessao_id:session.id,
    pessoa_id:person?.id||null,
    adolescente_id:person?.adolescenteId||null,
    encontreiro_id:person?.encontreiroId||null,
    nome_informado:clean(name),
    telefone_informado:clean(phone),
    telefone_normalizado:phoneNorm(phone)||null,
    motivo,
    status:'PENDENTE',
    chave_idempotencia:key,
    payload:{canal:'PRESENCA_V2'},
  };
  const {data,error}=await supabase.from('presenca_pendencias').insert(payload).select('*').maybeSingle();
  if(error) throw error;
  return {row:data,already:false};
}

async function publicCheckin(supabase: AnySupabase,payload:any){
  const id=clean(payload.sessionId);
  const session=await sessionRaw(supabase,id);
  if(!session||session.status!=='ABERTA') return {status:'SESSION_CLOSED'};
  const people=await eligiblePeople(supabase,session);
  const person=people.find((p:any)=>p.id===clean(payload.personId))||null;
  const enteredPhone=phoneNorm(payload.phone);
  const enteredName=clean(payload.name);

  if(person){
    const {data:already,error}=await supabase.from('presencas').select('id').eq('sessao_id',session.id).eq('pessoa_id',person.id).maybeSingle();
    if(error) throw error;
    if(already) return {status:'ALREADY_PRESENT'};
  }

  if(!person) {
    return {status:'NOT_ELIGIBLE'};
  }

  let reason='';
  let phoneAddedToProfile=false;
  if(!enteredPhone) reason='MISSING_PHONE';
  else if(!person.phone) {
    const {error:updatePhoneError}=await supabase.from('pessoas')
      .update({telefone:enteredPhone,telefone_normalizado:enteredPhone})
      .eq('id',person.id)
      .or('telefone.is.null,telefone.eq.');
    if(updatePhoneError) throw updatePhoneError;
    person.phone=enteredPhone;
    phoneAddedToProfile=true;
  } else if(enteredPhone!==person.phone) reason='PHONE_MISMATCH';
  else {
    const same=people.filter((p:any)=>p.phone&&p.phone===enteredPhone);
    const distinctIdentities=new Set(same.map((p:any)=>normalizedNameKey(p.name)));
    if(distinctIdentities.size>1) reason='PHONE_SHARED';
  }

  if(reason){
    const pending=await createPending(supabase,session,person,enteredName,enteredPhone,reason);
    return {status:pending.already?'ALREADY_PENDING':'PENDING',reason};
  }

  await insertPresence(supabase,session,person,enteredName,enteredPhone,{phoneAddedToProfile});
  return {status:'CONFIRMED',phoneAddedToProfile};
}

async function listPending(supabase:AnySupabase){
  const {data,error}=await supabase.from('presenca_pendencias').select('*').order('criado_em',{ascending:false});
  if(error) throw error;
  const rows=data||[];
  const ids=Array.from(new Set(rows.map((r:any)=>clean(r.pessoa_id)).filter(Boolean)));
  const names=new Map<string,string>();
  if(ids.length){
    const {data:p,error:pe}=await supabase.from('pessoas').select('id,nome_completo').in('id',ids);
    if(pe) throw pe;
    for(const x of p||[]) names.set(x.id,x.nome_completo);
  }
  return rows.map((r:any)=>({
    key:r.id,
    id:r.id,
    sessionId:r.sessao_id,
    personId:r.pessoa_id,
    matchedPersonId:r.pessoa_id,
    name:r.nome_informado||names.get(r.pessoa_id)||'',
    matchedPersonName:names.get(r.pessoa_id)||'',
    phone:r.telefone_informado||'',
    reason:r.motivo,
    status:r.status==='APROVADA'?'APPROVED':r.status==='DESCARTADA'?'REJECTED':'PENDING',
    createdAt:r.criado_em,
    resolvedAt:r.resolvido_em,
    presenceId:r.presenca_id,
  }));
}

async function analytics(supabase:AnySupabase){
  const sessions=(await listSessions(supabase))
    .filter((s:any)=>s.status==='ENCERRADA')
    .sort((a:any,b:any)=>Date.parse(a.scheduledAt||'')-Date.parse(b.scheduledAt||''));

  const {data:records,error}=await supabase.from('presencas')
    .select('id,sessao_id,pessoa_id,circulo_informado')
    .not('sessao_id','is',null);
  if(error) throw error;

  const recordsBySession=new Map<string,any[]>();
  for(const record of records||[]){
    const sid=clean(record.sessao_id);
    const list=recordsBySession.get(sid)||[];
    list.push(record);
    recordsBySession.set(sid,list);
  }

  const peopleStats=new Map<string,any>();
  const groupStats=new Map<string,any>();
  const evolution:any[]=[];
  const confirmedUnique=new Set<string>();
  let totalEligible=0;
  let totalPresent=0;
  let unlinkedConfirmedCount=0;

  for(const session of sessions){
    const eligible=await eligiblePeople(supabase,session);
    const confirmed=recordsBySession.get(session.id)||[];
    const confirmedIds=new Set<string>(confirmed.map((r:any)=>clean(r.pessoa_id)).filter(Boolean));

    for(const pid of confirmedIds) confirmedUnique.add(pid);
    unlinkedConfirmedCount += confirmed.filter((r:any)=>!clean(r.pessoa_id)).length;

    const knownPresent=eligible.filter((person:any)=>confirmedIds.has(person.id)).length;
    totalEligible += eligible.length;
    totalPresent += knownPresent;

    const sessionRate=eligible.length ? (knownPresent*100/eligible.length) : 0;
    evolution.push({
      id:session.id,
      title:session.title,
      responsibleLabel:session.responsibleLabel,
      scheduledAt:session.scheduledAt,
      rate:sessionRate,
      knownPresent,
      eligible:eligible.length,
      unlinkedPresent:confirmed.filter((r:any)=>!clean(r.pessoa_id)).length,
    });

    const group=await getGroup(supabase,session.responsibleId);
    if(group){
      const current=groupStats.get(group.id)||{
        key:group.id,
        kind:group.tipo==='POS'?'POS':'TIOS',
        label:group.nome_exibicao||session.responsibleLabel||'Responsável',
        sessions:0,
        present:0,
        eligible:0,
      };
      current.sessions+=1;
      current.present+=knownPresent;
      current.eligible+=eligible.length;
      current.rate=current.eligible ? (current.present*100/current.eligible) : 0;
      groupStats.set(group.id,current);
    }

    for(const person of eligible){
      const current=peopleStats.get(person.id)||{
        id:person.id,
        name:person.name,
        circle:person.circle||'',
        eligibleSessions:0,
        present:0,
        absences:0,
        consecutiveAbsences:0,
        rate:0,
      };

      current.name=person.name||current.name;
      if(person.circle){
        const circles=clean(current.circle).split(' | ').map((x:string)=>x.trim()).filter(Boolean);
        for(const item of clean(person.circle).split(' | ').map((x:string)=>x.trim()).filter(Boolean)){
          if(!circles.includes(item)) circles.push(item);
        }
        current.circle=circles.join(' | ');
      }

      current.eligibleSessions+=1;
      if(confirmedIds.has(person.id)){
        current.present+=1;
        current.consecutiveAbsences=0;
      }else{
        current.absences+=1;
        current.consecutiveAbsences+=1;
      }
      current.rate=current.eligibleSessions ? (current.present*100/current.eligibleSessions) : 0;
      peopleStats.set(person.id,current);
    }
  }

  const people=Array.from(peopleStats.values())
    .sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),'pt-BR'));

  return {
    summary:{
      closedSessions:sessions.length,
      uniqueParticipants:confirmedUnique.size,
      confirmedPresences:totalPresent,
      averageAttendance:totalEligible ? (totalPresent*100/totalEligible) : 0,
      neverParticipated:people.filter((p:any)=>p.eligibleSessions>0&&p.present===0).length,
      unlinkedConfirmedCount,
    },
    groups:Array.from(groupStats.values())
      .sort((a:any,b:any)=>String(a.label).localeCompare(String(b.label),'pt-BR')),
    sessionEvolution:evolution,
    people,
  };
}

export async function handlePresenceV2Action(supabase: AnySupabase, action: string, payload: JsonObject = {}): Promise<Result> {
  try {
    if(action==='PRESENCA_V2_LIST_RESPONSIBLE_GROUPS'){
      return {ok:true,data:{success:true,responsibleGroups:await listGroups(supabase),source:'supabase'}};
    }
    if(action==='PRESENCA_V2_LIST_SESSIONS'){
      return {ok:true,data:{success:true,sessions:await listSessions(supabase),source:'supabase'}};
    }
    if(action==='PRESENCA_V2_LIST_RESPONSIBLE_SESSIONS'){
      const token=clean(payload.token||payload.scope);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      const sessions=(await listSessions(supabase,group.id)).filter((s:any)=>s.status==='ABERTA'||s.status==='ENCERRADA');
      return {ok:true,data:{success:true,responsible:{id:group.id,label:group.nome_exibicao},sessions,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_CREATE_SESSION'){
      const group=await getGroup(supabase,clean(payload.responsibleId));
      if(!group) return {ok:true,data:{success:false,error:'Responsável inválido.'}};
      const type=clean(payload.type);
      if(type==='REUNIAO_DUPLA_TIOS'&&group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Grupo incompatível com reunião de círculos.'}};
      if(type==='POS_ENCONTRO_GERAL'&&group.tipo!=='POS') return {ok:true,data:{success:false,error:'Grupo incompatível com Pós-encontro.'}};

      const title=type==='POS_ENCONTRO_GERAL'?'Pós-encontro':`Reunião de círculos · ${group.nome_exibicao}`;
      const body:any={encontro_id:null,responsavel_grupo_id:group.id,tipo:type,titulo:title,agendada_para:payload.scheduledAt,status:'AGENDADA'};
      const {data,error}=await supabase.from('presenca_sessoes').insert(body).select('*').maybeSingle();
      if(error) throw error;
      const raw=tokenFor('session',data.id);
      const {error:ue}=await supabase.from('presenca_sessoes').update({public_token_hash:hash(raw),atualizado_em:nowIso()}).eq('id',data.id);
      if(ue) throw ue;
      await audit(supabase,data.id,'SESSION_CREATED','ADM',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,{...data,public_token_hash:hash(raw)}),source:'supabase'}};
    }
    if(action==='PRESENCA_V2_UPDATE_SESSION'){
      const id=clean(payload.sessionId);
      const session=await sessionRaw(supabase,id);
      if(!session) return {ok:true,data:{success:false,error:'Reunião não encontrada.'}};
      if(session.status!=='AGENDADA') return {ok:true,data:{success:false,error:'Somente reuniões agendadas podem ser editadas.'}};

      const group=await getGroup(supabase,clean(payload.responsibleId));
      if(!group) return {ok:true,data:{success:false,error:'Responsável inválido.'}};
      if(session.tipo==='REUNIAO_DUPLA_TIOS'&&group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Grupo incompatível com reunião de círculos.'}};
      if(session.tipo==='POS_ENCONTRO_GERAL'&&group.tipo!=='POS') return {ok:true,data:{success:false,error:'Grupo incompatível com Pós-encontro.'}};

      const scheduledAt=clean(payload.scheduledAt);
      if(!scheduledAt) return {ok:true,data:{success:false,error:'Informe a data e hora da reunião.'}};
      const title=session.tipo==='POS_ENCONTRO_GERAL'?'Pós-encontro':`Reunião de círculos · ${group.nome_exibicao}`;
      const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes')
        .update({
          responsavel_grupo_id:group.id,
          titulo:title,
          agendada_para:scheduledAt,
          atualizado_em:t,
        })
        .eq('id',id)
        .eq('status','AGENDADA')
        .select('*')
        .maybeSingle();
      if(error) throw error;
      if(!data) return {ok:true,data:{success:false,error:'A reunião não está mais disponível para edição.'}};
      await audit(supabase,id,'SESSION_UPDATED','ADM',group.id,{scheduledAt});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_DELETE_SESSION'){
      const id=clean(payload.sessionId);
      const session=await sessionRaw(supabase,id);
      if(!session) return {ok:true,data:{success:false,error:'Reunião não encontrada.'}};
      if(!['AGENDADA','CANCELADA'].includes(session.status)) return {ok:true,data:{success:false,error:'Somente reuniões agendadas ou canceladas podem ser excluídas.'}};

      const [{count:presenceCount,error:presenceError},{count:pendingCount,error:pendingError}] = await Promise.all([
        supabase.from('presencas').select('id',{count:'exact',head:true}).eq('sessao_id',id),
        supabase.from('presenca_pendencias').select('id',{count:'exact',head:true}).eq('sessao_id',id),
      ]);
      if(presenceError) throw presenceError;
      if(pendingError) throw pendingError;
      if(Number(presenceCount||0)>0 || Number(pendingCount||0)>0) {
        return {ok:true,data:{success:false,error:'A reunião possui presença ou pendência vinculada e não pode ser excluída.'}};
      }

      const {error:eventError}=await supabase.from('presenca_sessao_eventos').delete().eq('sessao_id',id);
      if(eventError) throw eventError;
      const {error:deleteError}=await supabase.from('presenca_sessoes').delete().eq('id',id);
      if(deleteError) throw deleteError;
      return {ok:true,data:{success:true,deletedId:id}};
    }
    if(action==='PRESENCA_V2_OPEN_SESSION'){
      const id=clean(payload.sessionId); const opened=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes').update({status:'ABERTA',aberta_em:opened,atualizado_em:opened}).eq('id',id).eq('status','AGENDADA').select('*').maybeSingle();
      if(error) throw error; if(!data) return {ok:true,data:{success:false,error:'Somente sessões agendadas podem ser abertas.'}};
      await audit(supabase,id,'SESSION_OPENED','ADM',data.responsavel_grupo_id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_CANCEL_SESSION'){
      const id=clean(payload.sessionId); const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes').update({status:'CANCELADA',cancelada_em:t,atualizado_em:t}).eq('id',id).eq('status','AGENDADA').select('*').maybeSingle();
      if(error) throw error; if(!data) return {ok:true,data:{success:false,error:'Somente sessões agendadas podem ser canceladas.'}};
      await audit(supabase,id,'SESSION_CANCELLED','ADM',data.responsavel_grupo_id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_CLOSE_SESSION'){
      const id=clean(payload.sessionId); const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes').update({status:'ENCERRADA',encerrada_em:t,encerrada_origem:'ADM',encerramento_solicitado_em:null,encerramento_programado_em:null,atualizado_em:t}).eq('id',id).eq('status','ABERTA').select('*').maybeSingle();
      if(error) throw error; if(!data) return {ok:true,data:{success:false,error:'Sessão não está aberta.'}};
      await audit(supabase,id,'CLOSED_ADMIN','ADM',data.responsavel_grupo_id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_REOPEN_SESSION_ADMIN'){
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.status!=='ENCERRADA') return {ok:true,data:{success:false,error:'Somente sessões encerradas podem ser reabertas pelo ADM.'}};
      const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes').update({
        status:'ABERTA',
        encerrada_em:null,
        encerrada_origem:null,
        total_reaberturas:Number(session.total_reaberturas||0)+1,
        ultima_reabertura_em:t,
        encerramento_solicitado_em:null,
        encerramento_programado_em:null,
        atualizado_em:t
      }).eq('id',session.id).select('*').maybeSingle();
      if(error) throw error;
      await audit(supabase,session.id,'REOPENED_ADMIN','ADM',session.responsavel_grupo_id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_REQUEST_CLOSE'){
      const token=clean(payload.token); const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso inválido.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id||session.status!=='ABERTA') return {ok:true,data:{success:false,error:'Sessão não pode ser encerrada por este responsável.'}};
      const requested=new Date(); const scheduled=new Date(requested.getTime()+60000);
      const {data,error}=await supabase.from('presenca_sessoes').update({encerramento_solicitado_em:requested.toISOString(),encerramento_programado_em:scheduled.toISOString(),atualizado_em:requested.toISOString()}).eq('id',session.id).select('*').maybeSingle();
      if(error) throw error; await audit(supabase,session.id,'CLOSE_REQUESTED','RESPONSAVEL',group.id,{seconds:60});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_CANCEL_CLOSE'){
      const token=clean(payload.token); const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso inválido.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id||session.status!=='ABERTA') return {ok:true,data:{success:false,error:'Sessão inválida.'}};
      const {data,error}=await supabase.from('presenca_sessoes').update({encerramento_solicitado_em:null,encerramento_programado_em:null,atualizado_em:nowIso()}).eq('id',session.id).select('*').maybeSingle();
      if(error) throw error; await audit(supabase,session.id,'CLOSE_CANCELLED','RESPONSAVEL',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_REOPEN_SESSION'){
      const token=clean(payload.token); const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso inválido.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id||session.status!=='ENCERRADA') return {ok:true,data:{success:false,error:'Sessão não pode ser reaberta.'}};
      if(Number(session.reaberturas_responsavel||0)>=1) return {ok:true,data:{success:false,error:'A reabertura do responsável já foi utilizada. Procure o ADM.'}};
      const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes').update({status:'ABERTA',encerrada_em:null,encerrada_origem:null,reaberturas_responsavel:1,total_reaberturas:Number(session.total_reaberturas||0)+1,ultima_reabertura_em:t,encerramento_solicitado_em:null,encerramento_programado_em:null,atualizado_em:t}).eq('id',session.id).select('*').maybeSingle();
      if(error) throw error; await audit(supabase,session.id,'REOPENED_RESPONSIBLE','RESPONSAVEL',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_GET_PUBLIC_SESSION'){
      const raw=clean(payload.token); if(!raw) return {ok:true,data:{success:false,error:'Sessão inválida.'}};
      const expected=hash(raw);
      const {data,error}=await supabase.from('presenca_sessoes').select('*').eq('public_token_hash',expected).maybeSingle();
      if(error) throw error; const session=await ensureDueClose(supabase,data);
      if(!session) return {ok:true,data:{success:false,error:'Sessão não encontrada.'}};
      const people=await eligiblePeople(supabase,session);
      const eligibleIds=people.map((p:any)=>p.id).filter(Boolean);
      const confirmedIds=new Set<string>();
      if(eligibleIds.length){
        for(let i=0;i<eligibleIds.length;i+=200){
          const chunk=eligibleIds.slice(i,i+200);
          const {data:confirmed,error:confirmedError}=await supabase.from('presencas')
            .select('pessoa_id')
            .eq('sessao_id',session.id)
            .in('pessoa_id',chunk);
          if(confirmedError) throw confirmedError;
          for(const row of confirmed||[]) if(row.pessoa_id) confirmedIds.add(clean(row.pessoa_id));
        }
      }
      return {ok:true,data:{success:true,session:{...(await decorateSession(supabase,session)),people:people.map((p:any)=>({
        id:p.id,
        name:p.name,
        circle:p.circle||'',
        hasPhone:Boolean(p.phone),
        phoneLast4:p.phone ? p.phone.slice(-4) : '',
        phone:p.phone || '',
        alreadyPresent:confirmedIds.has(p.id),
      }))}}};
    }
    if(action==='PRESENCA_V2_PUBLIC_CHECKIN'){
      return {ok:true,data:{success:true,result:await publicCheckin(supabase,payload)}};
    }
    if(action==='PRESENCA_V2_LIST_PENDING'){
      return {ok:true,data:{success:true,requests:await listPending(supabase),records:[],source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESOLVE_PENDING'){
      const id=clean(payload.key); const decision=clean(payload.decision).toUpperCase();
      const {data:row,error}=await supabase.from('presenca_pendencias').select('*').eq('id',id).maybeSingle(); if(error) throw error;
      if(!row||row.status!=='PENDENTE') return {ok:true,data:{success:false,error:'Pendência não está disponível para conciliação.'}};
      const session=await sessionRaw(supabase,row.sessao_id);
      if(!session||session.status!=='ENCERRADA') return {ok:true,data:{success:false,error:'Conciliação permitida apenas com a sessão encerrada.'}};
      let presenceId:any=null;
      if(decision==='APPROVE'||decision==='APROVAR'||decision==='APROVADA'){
        const people=await eligiblePeople(supabase,session);
        const person=people.find((p:any)=>p.id===row.pessoa_id)||null;
        const saved=await insertPresence(supabase,session,person,row.nome_informado,row.telefone_informado,{reconciled:true,pendingId:row.id});
        presenceId=saved?.id||null;
      }
      const status=(decision==='APPROVE'||decision==='APROVAR'||decision==='APROVADA')?'APROVADA':'DESCARTADA';
      const {data:updated,error:ue}=await supabase.from('presenca_pendencias').update({status,resolvido_em:nowIso(),presenca_id:presenceId}).eq('id',row.id).select('*').maybeSingle();
      if(ue) throw ue;
      return {ok:true,data:{success:true,request:{...updated,status:status==='APROVADA'?'APPROVED':'REJECTED'}}};
    }
    if(action==='PRESENCA_V2_GET_ANALYTICS'){
      return {ok:true,data:{success:true,analytics:await analytics(supabase),source:'supabase'}};
    }
    return {ok:false,error:'PRESENCA_V2_ACTION_NOT_IMPLEMENTED'};
  } catch (error:any) {
    return {ok:false,error:error?.message||'Falha na Presença V2.',details:error};
  }
}
