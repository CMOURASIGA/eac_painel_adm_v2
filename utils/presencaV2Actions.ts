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
  const circlesByPerson = new Map<string, Set<string>>();
  const ids = new Set<string>();
  const sessionType=clean(session?.tipo||session?.type);
  const responsibleGroupId=clean(session?.responsavel_grupo_id||session?.responsibleId);

  const collect = (personId: string, circle?: string) => {
    const pid=clean(personId);
    if(!pid) return;
    ids.add(pid);
    const label=clean(circle);
    if(!label) return;
    const labels=circlesByPerson.get(pid)||new Set<string>();
    labels.add(label);
    circlesByPerson.set(pid,labels);
  };

  if (sessionType === 'REUNIAO_DUPLA_TIOS') {
    const { data: links, error } = await supabase.from('presenca_responsavel_circulos')
      .select('circulo_historico_id,circulo_id')
      .eq('grupo_id', responsibleGroupId);
    if (error) throw error;

    const historicalIds=Array.from(new Set((links||[]).map((x:any)=>clean(x.circulo_historico_id)).filter(Boolean)));
    const currentIds=Array.from(new Set((links||[]).map((x:any)=>clean(x.circulo_id)).filter(Boolean)));

    const [historicalCirclesResult,historicalMembersResult,currentMembersResult,operationalAssignmentsResult]=await Promise.all([
      historicalIds.length
        ? supabase.from('eac_circulos_historicos').select('id,edicao,cor').in('id',historicalIds)
        : Promise.resolve({data:[],error:null}),
      historicalIds.length
        ? supabase.from('eac_circulo_membros_historicos').select('pessoa_id,circulo_id').in('circulo_id',historicalIds).not('pessoa_id','is',null)
        : Promise.resolve({data:[],error:null}),
      currentIds.length
        ? supabase.from('circulo_participantes').select('pessoa_id,circulo_id').in('circulo_id',currentIds).not('pessoa_id','is',null)
        : Promise.resolve({data:[],error:null}),
      supabase.from('presenca_responsavel_pessoas')
        .select('pessoa_id,circulo_historico_id')
        .eq('grupo_id',responsibleGroupId)
        .eq('ativo',true),
    ]);
    if(historicalCirclesResult.error) throw historicalCirclesResult.error;
    if(historicalMembersResult.error) throw historicalMembersResult.error;
    if(currentMembersResult.error) throw currentMembersResult.error;
    if(operationalAssignmentsResult.error && clean(operationalAssignmentsResult.error.code)!=='42P01') throw operationalAssignmentsResult.error;

    const historicalLabels=new Map<string,string>((historicalCirclesResult.data||[]).map((circle:any)=>[
      clean(circle.id),
      `EAC ${circle.edicao} · ${circle.cor}`
    ]));

    for(const member of historicalMembersResult.data||[]){
      collect(member.pessoa_id,historicalLabels.get(clean(member.circulo_id))||'');
    }
    for(const member of operationalAssignmentsResult.data||[]){
      collect(member.pessoa_id,historicalLabels.get(clean(member.circulo_historico_id))||'');
    }
    for(const member of currentMembersResult.data||[]){
      collect(member.pessoa_id);
    }
  } else {
    const [
      { data: circles, error: ce },
      { data: enc, error: ee },
      { data: eac34Encounters, error: e34e },
    ] = await Promise.all([
      supabase.from('eac_circulos_historicos').select('id,edicao,cor').in('edicao',[35,36,37]),
      supabase.from('encontreiros').select('pessoa_id').eq('classificacao','ADOLESCENTE').eq('status','DISPONIVEL').not('pessoa_id','is',null),
      supabase.from('encontros').select('id,numero').eq('numero',34),
    ]);
    if (ce) throw ce;
    if (ee) throw ee;
    if (e34e) throw e34e;

    const circleMap=new Map<string,string>((circles||[]).map((circle:any)=>[
      clean(circle.id),
      `EAC ${circle.edicao} · ${circle.cor}`
    ]));
    const circleIds=Array.from(circleMap.keys());

    if(circleIds.length){
      const {data:members,error:me}=await supabase.from('eac_circulo_membros_historicos')
        .select('pessoa_id,circulo_id')
        .in('circulo_id',circleIds)
        .not('pessoa_id','is',null);
      if(me) throw me;
      for(const member of members||[]){
        collect(member.pessoa_id,circleMap.get(clean(member.circulo_id))||'');
      }
    }

    const eac34Ids=Array.from(new Set((eac34Encounters||[]).map((row:any)=>clean(row.id)).filter(Boolean)));
    if(eac34Ids.length){
      const {data:eac34Registrations,error:e34re}=await supabase.from('inscricoes')
        .select('adolescente_id')
        .in('encontro_id',eac34Ids)
        .eq('status','PRIORIZADO')
        .not('adolescente_id','is',null);
      if(e34re) throw e34re;

      const eac34AdolescentIds=Array.from(new Set((eac34Registrations||[])
        .map((row:any)=>clean(row.adolescente_id))
        .filter(Boolean)));
      if(eac34AdolescentIds.length){
        const {data:eac34Adolescents,error:e34ae}=await supabase.from('adolescentes')
          .select('id,pessoa_id')
          .in('id',eac34AdolescentIds)
          .not('pessoa_id','is',null);
        if(e34ae) throw e34ae;
        for(const adolescent of eac34Adolescents||[]){
          collect(adolescent.pessoa_id,'EAC 34 · Sem círculo');
        }
      }
    }

    for(const worker of enc||[]) collect(worker.pessoa_id);
  }

  const allIds=Array.from(ids);
  for(let i=0;i<allIds.length;i+=200){
    const chunk=allIds.slice(i,i+200);
    const {data,error}=await supabase.from('pessoas')
      .select('id,nome_completo,telefone,telefone_normalizado')
      .in('id',chunk);
    if(error) throw error;
    for(const p of data||[]){
      const pid=clean(p.id);
      people.set(pid,{
        id:pid,
        name:clean(p.nome_completo),
        phone:phoneNorm(p.telefone_normalizado||p.telefone),
        circle:Array.from(circlesByPerson.get(pid)||[]).join(' | '),
      });
    }
  }

  for(let i=0;i<allIds.length;i+=200){
    const chunk=allIds.slice(i,i+200);
    const [{data:adolescents,error:ae},{data:workers,error:we}] = await Promise.all([
      supabase.from('adolescentes').select('id,pessoa_id').in('pessoa_id',chunk),
      supabase.from('encontreiros').select('id,pessoa_id').in('pessoa_id',chunk),
    ]);
    if(ae) throw ae;
    if(we) throw we;
    for(const a of adolescents||[]){
      const p=people.get(clean(a.pessoa_id));
      if(p&&!p.adolescenteId) p.adolescenteId=a.id;
    }
    for(const e of workers||[]){
      const p=people.get(clean(e.pessoa_id));
      if(p&&!p.encontreiroId) p.encontreiroId=e.id;
    }
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

async function tiosContextByPerson(supabase:AnySupabase, personIds:string[]) {
  const ids=Array.from(new Set((personIds||[]).map((id)=>clean(id)).filter(Boolean)));
  const result=new Map<string,any>();
  if(!ids.length) return result;

  const members:any[]=[];
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const {data,error}=await supabase.from('eac_circulo_membros_historicos')
      .select('pessoa_id,circulo_id')
      .in('pessoa_id',chunk)
      .not('circulo_id','is',null);
    if(error) throw error;
    members.push(...(data||[]));
  }

  const circleIds=Array.from(new Set(members.map((row:any)=>clean(row.circulo_id)).filter(Boolean)));
  if(!circleIds.length) return result;

  const [{data:circles,error:circlesError},{data:links,error:linksError}]=await Promise.all([
    supabase.from('eac_circulos_historicos').select('id,edicao,cor').in('id',circleIds),
    supabase.from('presenca_responsavel_circulos').select('grupo_id,circulo_historico_id').in('circulo_historico_id',circleIds),
  ]);
  if(circlesError) throw circlesError;
  if(linksError) throw linksError;

  const groupIds=Array.from(new Set((links||[]).map((row:any)=>clean(row.grupo_id)).filter(Boolean)));
  const groupsMap=new Map<string,any>();
  if(groupIds.length){
    const {data:groups,error:groupsError}=await supabase.from('presenca_responsaveis_grupos')
      .select('id,nome_exibicao,tipo,ativo')
      .in('id',groupIds);
    if(groupsError) throw groupsError;
    for(const group of groups||[]){
      if(group.tipo==='TIOS'){
        groupsMap.set(clean(group.id),{
          id:clean(group.id),
          label:clean(group.nome_exibicao)||'Tios de Círculo',
          active:group.ativo!==false,
        });
      }
    }
  }

  const circleMap=new Map<string,any>();
  for(const circle of circles||[]){
    circleMap.set(clean(circle.id),{
      id:clean(circle.id),
      edition:Number(circle.edicao||0),
      color:clean(circle.cor),
      label:`EAC ${Number(circle.edicao||0)} · ${clean(circle.cor)}`,
      groups:[],
    });
  }
  for(const link of links||[]){
    const circle=circleMap.get(clean(link.circulo_historico_id));
    const group=groupsMap.get(clean(link.grupo_id));
    if(!circle||!group) continue;
    if(!circle.groups.some((item:any)=>item.id===group.id)) circle.groups.push(group);
  }

  for(const member of members){
    const personId=clean(member.pessoa_id);
    const circle=circleMap.get(clean(member.circulo_id));
    if(!personId||!circle||!circle.groups.length) continue;
    const current=result.get(personId)||{labels:[],groups:[],circles:[]};
    for(const group of circle.groups){
      if(!current.groups.some((item:any)=>item.id===group.id)) current.groups.push(group);
      if(group.label && !current.labels.includes(group.label)) current.labels.push(group.label);
    }
    if(!current.circles.some((item:any)=>item.id===circle.id)){
      current.circles.push({
        id:circle.id,
        edition:circle.edition,
        color:circle.color,
        label:circle.label,
        groups:circle.groups,
      });
    }
    result.set(personId,current);
  }

  return result;
}

async function decorateSession(
  supabase: AnySupabase,
  row: any,
  preloaded: { eligible?: any[]; group?: any; presences?: any[]; pendings?: any[] } = {}
) {
  row = await ensureDueClose(supabase,row);
  const [group, eligible, pres, pend] = await Promise.all([
    preloaded.group !== undefined ? Promise.resolve(preloaded.group) : getGroup(supabase,row.responsavel_grupo_id),
    Array.isArray(preloaded.eligible) ? Promise.resolve(preloaded.eligible) : eligiblePeople(supabase,row),
    Array.isArray(preloaded.presences)
      ? Promise.resolve({data:preloaded.presences,error:null})
      : supabase.from('presencas').select('id,pessoa_id').eq('sessao_id',row.id),
    Array.isArray(preloaded.pendings)
      ? Promise.resolve({data:preloaded.pendings,error:null})
      : supabase.from('presenca_pendencias').select('id,status').eq('sessao_id',row.id),
  ]);
  if(pres.error) throw pres.error;
  if(pend.error) throw pend.error;
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

async function responsibleCircleMaintenanceScope(supabase:AnySupabase, group:any){
  if(!group || group.tipo!=='TIOS') throw new Error('Manutenção de adolescentes disponível somente para Tios de Círculo.');
  const {data:links,error:linksError}=await supabase.from('presenca_responsavel_circulos')
    .select('circulo_historico_id')
    .eq('grupo_id',group.id)
    .not('circulo_historico_id','is',null);
  if(linksError) throw linksError;
  const circleIds=Array.from(new Set((links||[]).map((row:any)=>clean(row.circulo_historico_id)).filter(Boolean)));
  if(!circleIds.length) return {authorizedCircles:[],editions:[]};

  const {data:circles,error:circlesError}=await supabase.from('eac_circulos_historicos')
    .select('id,edicao,cor')
    .in('id',circleIds);
  if(circlesError) throw circlesError;
  const authorizedCircles=(circles||[]).map((circle:any)=>({
    id:clean(circle.id),
    edition:Number(circle.edicao),
    color:clean(circle.cor),
  }));
  return {
    authorizedCircles,
    editions:Array.from(new Set(authorizedCircles.map((circle:any)=>circle.edition))).filter(Boolean),
  };
}

async function responsibleCircleMaintenanceList(supabase:AnySupabase, group:any){
  const scope=await responsibleCircleMaintenanceScope(supabase,group);
  if(!scope.editions.length) return {authorizedCircles:scope.authorizedCircles,people:[]};

  const {data:allCircles,error:circlesError}=await supabase.from('eac_circulos_historicos')
    .select('id,edicao,cor')
    .in('edicao',scope.editions);
  if(circlesError) throw circlesError;
  const circleMap=new Map<string,any>((allCircles||[]).map((circle:any)=>[clean(circle.id),{
    id:clean(circle.id),
    edition:Number(circle.edicao),
    color:clean(circle.cor),
  }]));
  const allCircleIds=Array.from(circleMap.keys());
  if(!allCircleIds.length) return {authorizedCircles:scope.authorizedCircles,people:[]};

  const [{data:members,error:membersError},{data:responsibilityLinks,error:responsibilityError}]=await Promise.all([
    supabase.from('eac_circulo_membros_historicos')
      .select('id,circulo_id,pessoa_id,nome_origem,ordem_origem,conciliacao_status')
      .in('circulo_id',allCircleIds),
    supabase.from('presenca_responsavel_circulos')
      .select('grupo_id,circulo_historico_id')
      .in('circulo_historico_id',allCircleIds),
  ]);
  if(membersError) throw membersError;
  if(responsibilityError) throw responsibilityError;

  const groupIds=Array.from(new Set((responsibilityLinks||[]).map((row:any)=>clean(row.grupo_id)).filter(Boolean)));
  const groupLabels=new Map<string,string>();
  if(groupIds.length){
    const {data:groups,error:groupsError}=await supabase.from('presenca_responsaveis_grupos')
      .select('id,nome_exibicao,tipo,ativo')
      .in('id',groupIds);
    if(groupsError) throw groupsError;
    for(const item of groups||[]){
      if(item.tipo==='TIOS' && item.ativo!==false) groupLabels.set(clean(item.id),clean(item.nome_exibicao));
    }
  }
  const responsibleByCircle=new Map<string,string[]>();
  for(const link of responsibilityLinks||[]){
    const label=groupLabels.get(clean(link.grupo_id));
    const cid=clean(link.circulo_historico_id);
    if(!label||!cid) continue;
    const values=responsibleByCircle.get(cid)||[];
    if(!values.includes(label)) values.push(label);
    responsibleByCircle.set(cid,values);
  }

  const personIds=Array.from(new Set((members||[]).map((row:any)=>clean(row.pessoa_id)).filter(Boolean)));
  const personMap=new Map<string,any>();
  for(let i=0;i<personIds.length;i+=200){
    const chunk=personIds.slice(i,i+200);
    const {data:people,error:peopleError}=await supabase.from('pessoas')
      .select('id,nome_completo,telefone_normalizado,telefone')
      .in('id',chunk);
    if(peopleError) throw peopleError;
    for(const person of people||[]) personMap.set(clean(person.id),person);
  }

  const rows=(members||[]).map((member:any)=>{
    const circle=circleMap.get(clean(member.circulo_id));
    const person=personMap.get(clean(member.pessoa_id));
    return {
      memberId:clean(member.id),
      personId:clean(member.pessoa_id)||null,
      name:clean(person?.nome_completo)||clean(member.nome_origem)||'Sem nome',
      phone:phoneNorm(person?.telefone_normalizado||person?.telefone)||'',
      edition:Number(circle?.edition||0),
      currentCircleId:clean(circle?.id),
      currentCircle:clean(circle?.color),
      currentResponsibleLabels:responsibleByCircle.get(clean(circle?.id))||[],
      reconciliationStatus:clean(member.conciliacao_status)||'',
      order:Number(member.ordem_origem||0),
    };
  }).sort((a:any,b:any)=>a.name.localeCompare(b.name,'pt-BR'));

  return {authorizedCircles:scope.authorizedCircles,people:rows};
}

async function responsibleCircleMaintenancePreview(supabase:AnySupabase, group:any, payload:any){
  const memberId=clean(payload.memberId);
  const targetCircleId=clean(payload.targetCircleId);
  if(!memberId||!targetCircleId) throw new Error('Adolescente e círculo de destino são obrigatórios.');

  const scope=await responsibleCircleMaintenanceScope(supabase,group);
  const target=scope.authorizedCircles.find((circle:any)=>circle.id===targetCircleId);
  if(!target) throw new Error('O círculo de destino não pertence ao escopo deste responsável.');

  const {data:member,error:memberError}=await supabase.from('eac_circulo_membros_historicos')
    .select('id,circulo_id,pessoa_id,nome_origem,conciliacao_status')
    .eq('id',memberId)
    .maybeSingle();
  if(memberError) throw memberError;
  if(!member) throw new Error('Adolescente histórico não encontrado.');

  const {data:source,error:sourceError}=await supabase.from('eac_circulos_historicos')
    .select('id,edicao,cor')
    .eq('id',member.circulo_id)
    .maybeSingle();
  if(sourceError) throw sourceError;
  if(!source) throw new Error('Círculo atual não encontrado.');
  if(Number(source.edicao)!==Number(target.edition)) throw new Error('A correção não pode mover o adolescente entre edições diferentes do EAC.');
  if(clean(source.id)===targetCircleId) throw new Error('O adolescente já está vinculado a este círculo.');

  let person:any=null;
  if(member.pessoa_id){
    const {data,error}=await supabase.from('pessoas')
      .select('id,nome_completo,telefone_normalizado,telefone')
      .eq('id',member.pessoa_id)
      .maybeSingle();
    if(error) throw error;
    person=data;
  }
  const personId=clean(member.pessoa_id);
  const [adolescentsResult,presencesResult,duplicatesResult,targetResponsibilityResult,sourceResponsibilityResult]=await Promise.all([
    personId
      ? supabase.from('adolescentes').select('id,pessoa_id').eq('pessoa_id',personId)
      : Promise.resolve({data:[],error:null}),
    personId
      ? supabase.from('presencas').select('id,sessao_id,circulo_informado,status_presenca').eq('pessoa_id',personId)
      : Promise.resolve({data:[],error:null}),
    personId
      ? supabase.from('eac_circulo_membros_historicos').select('id,circulo_id').eq('pessoa_id',personId)
      : Promise.resolve({data:[],error:null}),
    supabase.from('presenca_responsavel_circulos').select('grupo_id').eq('circulo_historico_id',targetCircleId),
    supabase.from('presenca_responsavel_circulos').select('grupo_id').eq('circulo_historico_id',source.id),
  ]);
  if(adolescentsResult.error) throw adolescentsResult.error;
  if(presencesResult.error) throw presencesResult.error;
  if(duplicatesResult.error) throw duplicatesResult.error;
  if(targetResponsibilityResult.error) throw targetResponsibilityResult.error;
  if(sourceResponsibilityResult.error) throw sourceResponsibilityResult.error;

  const linkedGroupIds=Array.from(new Set([
    ...(targetResponsibilityResult.data||[]).map((x:any)=>clean(x.grupo_id)),
    ...(sourceResponsibilityResult.data||[]).map((x:any)=>clean(x.grupo_id)),
  ].filter(Boolean)));
  const labels=new Map<string,string>();
  if(linkedGroupIds.length){
    const {data:groups,error}=await supabase.from('presenca_responsaveis_grupos')
      .select('id,nome_exibicao,tipo,ativo')
      .in('id',linkedGroupIds);
    if(error) throw error;
    for(const item of groups||[]) if(item.tipo==='TIOS'&&item.ativo!==false) labels.set(clean(item.id),clean(item.nome_exibicao));
  }
  const toLabels=(rows:any[])=>Array.from(new Set((rows||[]).map((x:any)=>labels.get(clean(x.grupo_id))).filter(Boolean)));

  const duplicateCircleIds=Array.from(new Set((duplicatesResult.data||[])
    .map((row:any)=>clean(row.circulo_id))
    .filter(Boolean)));
  const duplicateCircleEditions=new Map<string,number>();
  if(duplicateCircleIds.length){
    const {data:duplicateCircles,error:duplicateCirclesError}=await supabase.from('eac_circulos_historicos')
      .select('id,edicao')
      .in('id',duplicateCircleIds);
    if(duplicateCirclesError) throw duplicateCirclesError;
    for(const circle of duplicateCircles||[]) duplicateCircleEditions.set(clean(circle.id),Number(circle.edicao));
  }
  const duplicateSameEdition=(duplicatesResult.data||[]).filter((row:any)=>{
    if(clean(row.id)===memberId) return false;
    const circleId=clean(row.circulo_id);
    return duplicateCircleEditions.get(circleId)===Number(source.edicao);
  });

  return {
    memberId,
    personId:personId||null,
    name:clean(person?.nome_completo)||clean(member.nome_origem)||'Sem nome',
    phone:phoneNorm(person?.telefone_normalizado||person?.telefone)||'',
    edition:Number(source.edicao),
    sourceCircle:{id:clean(source.id),color:clean(source.cor),responsibleLabels:toLabels(sourceResponsibilityResult.data||[])},
    targetCircle:{id:target.id,color:target.color,responsibleLabels:toLabels(targetResponsibilityResult.data||[])},
    checks:{
      person:Boolean(personId),
      adolescentLinks:(adolescentsResult.data||[]).length,
      presenceRecords:(presencesResult.data||[]).length,
      historicalMemberships:(duplicatesResult.data||[]).length,
      duplicateMembershipWarning:duplicateSameEdition.length>0,
      sourceHasOtherResponsible:toLabels(sourceResponsibilityResult.data||[]).some((label:string)=>label!==clean(group.nome_exibicao)),
      targetAuthorized:true,
      sameEdition:true,
    },
    policy:{
      updateHistoricalMembership:true,
      updatePastPresences:false,
      updatePerson:false,
      updateAdolescentRecord:false,
      note:'Presenças anteriores não são reescritas. A correção altera o vínculo histórico usado nas próximas chamadas e mantém auditoria.',
    },
  };
}

async function responsibleCircleMaintenanceApply(supabase:AnySupabase, group:any, payload:any){
  const preview=await responsibleCircleMaintenancePreview(supabase,group,payload);
  const memberId=preview.memberId;
  const sourceCircleId=preview.sourceCircle.id;
  const targetCircleId=preview.targetCircle.id;

  if(preview.checks.duplicateMembershipWarning){
    throw new Error('A pessoa possui outro vínculo histórico na mesma edição. A correção foi bloqueada para evitar duplicidade.');
  }

  const {data:updated,error:updateError}=await supabase.from('eac_circulo_membros_historicos')
    .update({
      circulo_id:targetCircleId,
      conciliacao_status:'CONCILIADO',
    })
    .eq('id',memberId)
    .eq('circulo_id',sourceCircleId)
    .select('id,circulo_id,pessoa_id,nome_origem')
    .maybeSingle();
  if(updateError) throw updateError;
  if(!updated) throw new Error('O vínculo mudou durante a operação. Atualize a tela e tente novamente.');

  const auditPayload={
    grupo_id:group.id,
    membro_historico_id:memberId,
    pessoa_id:preview.personId||null,
    edicao:preview.edition,
    circulo_origem_id:sourceCircleId,
    circulo_destino_id:targetCircleId,
    nome_snapshot:preview.name,
    detalhes:{
      actor:'RESPONSAVEL',
      responsibleLabel:clean(group.nome_exibicao),
      sourceResponsibleLabels:preview.sourceCircle.responsibleLabels,
      targetResponsibleLabels:preview.targetCircle.responsibleLabels,
      checks:preview.checks,
      policy:preview.policy,
    },
  };
  const {error:auditError}=await supabase.from('presenca_manutencao_circulo_auditoria').insert(auditPayload);
  if(auditError){
    await supabase.from('eac_circulo_membros_historicos')
      .update({circulo_id:sourceCircleId})
      .eq('id',memberId)
      .eq('circulo_id',targetCircleId);
    if(clean(auditError.code)==='42P01'){
      throw new Error('A auditoria de manutenção ainda não foi instalada no banco. A alteração foi desfeita com segurança.');
    }
    throw auditError;
  }

  return {
    changed:true,
    memberId,
    personId:preview.personId,
    name:preview.name,
    edition:preview.edition,
    from:preview.sourceCircle,
    to:preview.targetCircle,
    preservedPresenceRecords:preview.checks.presenceRecords,
  };
}

async function responsibleOperationalCandidates(supabase:AnySupabase, group:any){
  const scope=await responsibleCircleMaintenanceScope(supabase,group);
  const {data:workers,error:workersError}=await supabase.from('encontreiros')
    .select('id,pessoa_id,classificacao,status')
    .eq('classificacao','ADOLESCENTE')
    .eq('status','DISPONIVEL')
    .not('pessoa_id','is',null);
  if(workersError) throw workersError;

  const personIds=Array.from(new Set((workers||[]).map((row:any)=>clean(row.pessoa_id)).filter(Boolean)));
  const personMap=new Map<string,any>();
  for(let i=0;i<personIds.length;i+=200){
    const chunk=personIds.slice(i,i+200);
    const {data:people,error}=await supabase.from('pessoas')
      .select('id,nome_completo,telefone_normalizado,telefone')
      .in('id',chunk);
    if(error) throw error;
    for(const person of people||[]) personMap.set(clean(person.id),person);
  }

  let assignments:any[]=[];
  const assignmentsResult=await supabase.from('presenca_responsavel_pessoas')
    .select('id,pessoa_id,encontreiro_id,circulo_historico_id,ativo')
    .eq('grupo_id',group.id);
  if(assignmentsResult.error && clean(assignmentsResult.error.code)!=='42P01') throw assignmentsResult.error;
  assignments=assignmentsResult.data||[];
  const assignmentByPerson=new Map<string,any>(assignments.map((row:any)=>[clean(row.pessoa_id),row]));

  const historicalRowsResult=personIds.length
    ? await supabase.from('eac_circulo_membros_historicos')
        .select('pessoa_id,circulo_id')
        .in('pessoa_id',personIds)
    : {data:[],error:null};
  if(historicalRowsResult.error) throw historicalRowsResult.error;

  const historicalCircleIds=Array.from(new Set((historicalRowsResult.data||[]).map((row:any)=>clean(row.circulo_id)).filter(Boolean)));
  const historicalCircleMap=new Map<string,any>();
  if(historicalCircleIds.length){
    const {data:circles,error}=await supabase.from('eac_circulos_historicos')
      .select('id,edicao,cor')
      .in('id',historicalCircleIds);
    if(error) throw error;
    for(const circle of circles||[]) historicalCircleMap.set(clean(circle.id),circle);
  }
  const historyByPerson=new Map<string,any[]>();
  for(const row of historicalRowsResult.data||[]){
    const circle=historicalCircleMap.get(clean(row.circulo_id));
    if(!circle) continue;
    const pid=clean(row.pessoa_id);
    const values=historyByPerson.get(pid)||[];
    values.push({edition:Number(circle.edicao),color:clean(circle.cor)});
    historyByPerson.set(pid,values);
  }

  const workerByPerson=new Map<string,any>();
  for(const worker of workers||[]) workerByPerson.set(clean(worker.pessoa_id),worker);

  const people=personIds.map((pid)=>{
    const person=personMap.get(pid);
    const worker=workerByPerson.get(pid);
    const assignment=assignmentByPerson.get(pid);
    const assignedCircle=scope.authorizedCircles.find((circle:any)=>circle.id===clean(assignment?.circulo_historico_id))||null;
    return {
      personId:pid,
      encontreiroId:clean(worker?.id)||null,
      name:clean(person?.nome_completo)||'Sem nome',
      phone:phoneNorm(person?.telefone_normalizado||person?.telefone)||'',
      classification:clean(worker?.classificacao)||'',
      status:clean(worker?.status)||'',
      histories:historyByPerson.get(pid)||[],
      assignmentId:clean(assignment?.id)||null,
      currentOperationalCircleId:assignedCircle?.id||null,
      currentOperationalCircle:assignedCircle?.color||null,
      assigned:Boolean(assignment?.ativo && assignedCircle),
    };
  }).sort((a:any,b:any)=>a.name.localeCompare(b.name,'pt-BR'));

  return {authorizedCircles:scope.authorizedCircles,people};
}

async function responsibleOperationalAssignmentPreview(supabase:AnySupabase, group:any, payload:any){
  const personId=clean(payload.personId);
  const targetCircleId=clean(payload.targetCircleId);
  if(!personId||!targetCircleId) throw new Error('Adolescente e círculo de destino são obrigatórios.');

  const scope=await responsibleCircleMaintenanceScope(supabase,group);
  const target=scope.authorizedCircles.find((circle:any)=>circle.id===targetCircleId);
  if(!target) throw new Error('O círculo de destino não pertence ao escopo deste responsável.');

  const {data:person,error:personError}=await supabase.from('pessoas')
    .select('id,nome_completo,telefone_normalizado,telefone')
    .eq('id',personId)
    .maybeSingle();
  if(personError) throw personError;
  if(!person) throw new Error('Pessoa não encontrada.');

  const {data:worker,error:workerError}=await supabase.from('encontreiros')
    .select('id,pessoa_id,classificacao,status')
    .eq('pessoa_id',personId)
    .eq('classificacao','ADOLESCENTE')
    .eq('status','DISPONIVEL')
    .maybeSingle();
  if(workerError) throw workerError;
  if(!worker) throw new Error('A pessoa não está disponível como adolescente/encontreiro.');

  const [historyResult,presenceResult,currentAssignmentResult]=await Promise.all([
    supabase.from('eac_circulo_membros_historicos').select('id,circulo_id').eq('pessoa_id',personId),
    supabase.from('presencas').select('id,sessao_id,circulo_informado').eq('pessoa_id',personId),
    supabase.from('presenca_responsavel_pessoas').select('id,circulo_historico_id,ativo').eq('grupo_id',group.id).eq('pessoa_id',personId).maybeSingle(),
  ]);
  if(historyResult.error) throw historyResult.error;
  if(presenceResult.error) throw presenceResult.error;
  if(currentAssignmentResult.error && clean(currentAssignmentResult.error.code)!=='42P01') throw currentAssignmentResult.error;

  let currentCircle:any=null;
  if(currentAssignmentResult.data?.circulo_historico_id){
    const {data,error}=await supabase.from('eac_circulos_historicos')
      .select('id,edicao,cor')
      .eq('id',currentAssignmentResult.data.circulo_historico_id)
      .maybeSingle();
    if(error) throw error;
    currentCircle=data;
  }

  return {
    personId,
    encontreiroId:clean(worker.id),
    name:clean(person.nome_completo)||'Sem nome',
    phone:phoneNorm(person.telefone_normalizado||person.telefone)||'',
    targetCircle:{id:target.id,edition:target.edition,color:target.color},
    currentOperationalCircle:currentCircle ? {id:clean(currentCircle.id),edition:Number(currentCircle.edicao),color:clean(currentCircle.cor)} : null,
    checks:{
      person:true,
      encontreiro:true,
      classification:clean(worker.classificacao),
      status:clean(worker.status),
      historicalMemberships:(historyResult.data||[]).length,
      presenceRecords:(presenceResult.data||[]).length,
      existingOperationalAssignment:Boolean(currentAssignmentResult.data?.id),
      targetAuthorized:true,
    },
    policy:{
      updateHistoricalMembership:false,
      createHistoricalMembership:false,
      updatePerson:false,
      updateEncontreiro:false,
      preservePastPresences:true,
      note:'O vínculo é apenas operacional para a chamada dos Tios. Não cria participação histórica no EAC.',
    },
  };
}

async function responsibleOperationalAssignmentApply(supabase:AnySupabase, group:any, payload:any){
  const preview=await responsibleOperationalAssignmentPreview(supabase,group,payload);
  const now=nowIso();
  const existing=await supabase.from('presenca_responsavel_pessoas')
    .select('id,circulo_historico_id')
    .eq('grupo_id',group.id)
    .eq('pessoa_id',preview.personId)
    .maybeSingle();
  if(existing.error && clean(existing.error.code)!=='42P01') throw existing.error;
  if(clean(existing.error?.code)==='42P01') throw new Error('A estrutura de vínculo operacional ainda não foi instalada no banco.');

  const sourceCircleId=clean(existing.data?.circulo_historico_id)||null;
  let saved:any=null;
  if(existing.data?.id){
    const {data,error}=await supabase.from('presenca_responsavel_pessoas')
      .update({
        encontreiro_id:preview.encontreiroId,
        circulo_historico_id:preview.targetCircle.id,
        ativo:true,
        origem:'MANUTENCAO_RESPONSAVEL',
        atualizado_em:now,
      })
      .eq('id',existing.data.id)
      .select('*')
      .maybeSingle();
    if(error) throw error;
    saved=data;
  }else{
    const {data,error}=await supabase.from('presenca_responsavel_pessoas')
      .insert({
        grupo_id:group.id,
        pessoa_id:preview.personId,
        encontreiro_id:preview.encontreiroId,
        circulo_historico_id:preview.targetCircle.id,
        ativo:true,
        origem:'MANUTENCAO_RESPONSAVEL',
        criado_em:now,
        atualizado_em:now,
      })
      .select('*')
      .maybeSingle();
    if(error) throw error;
    saved=data;
  }

  const {error:auditError}=await supabase.from('presenca_manutencao_operacional_auditoria').insert({
    grupo_id:group.id,
    pessoa_id:preview.personId,
    encontreiro_id:preview.encontreiroId,
    circulo_origem_id:sourceCircleId,
    circulo_destino_id:preview.targetCircle.id,
    nome_snapshot:preview.name,
    detalhes:{
      actor:'RESPONSAVEL',
      responsibleLabel:clean(group.nome_exibicao),
      checks:preview.checks,
      policy:preview.policy,
    },
  });
  if(auditError){
    if(existing.data?.id){
      await supabase.from('presenca_responsavel_pessoas')
        .update({circulo_historico_id:sourceCircleId,atualizado_em:nowIso()})
        .eq('id',existing.data.id);
    }else if(saved?.id){
      await supabase.from('presenca_responsavel_pessoas').delete().eq('id',saved.id);
    }
    if(clean(auditError.code)==='42P01') throw new Error('A auditoria operacional ainda não foi instalada no banco. A alteração foi desfeita.');
    throw auditError;
  }

  return {
    assigned:true,
    personId:preview.personId,
    name:preview.name,
    from:preview.currentOperationalCircle,
    to:preview.targetCircle,
    historicalMembershipsPreserved:preview.checks.historicalMemberships,
    presenceRecordsPreserved:preview.checks.presenceRecords,
  };
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
  const postTiosStats=new Map<string,any>();
  const postTiosSeen=new Set<string>();
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
      type:session.type,
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

    if(session.type==='POS_ENCONTRO_GERAL'){
      const tiosContext=await tiosContextByPerson(supabase,eligible.map((person:any)=>person.id));
      for(const person of eligible){
        const context=tiosContext.get(person.id);
        if(!context) continue;
        for(const circle of context.circles||[]){
          for(const tios of circle.groups||[]){
            const seenKey=`${session.id}|${tios.id}|${person.id}`;
            if(postTiosSeen.has(seenKey)) continue;
            postTiosSeen.add(seenKey);

            const current=postTiosStats.get(tios.id)||{
              key:tios.id,
              label:tios.label,
              sessionIds:new Set<string>(),
              present:0,
              eligible:0,
              circles:new Map<string,any>(),
            };
            current.sessionIds.add(session.id);
            current.eligible+=1;
            if(confirmedIds.has(person.id)) current.present+=1;

            const circleCurrent=current.circles.get(circle.id)||{
              id:circle.id,
              label:circle.label,
              edition:circle.edition,
              color:circle.color,
              present:0,
              eligible:0,
              people:new Map<string,any>(),
            };
            circleCurrent.eligible+=1;
            if(confirmedIds.has(person.id)) circleCurrent.present+=1;

            const personCurrent=circleCurrent.people.get(person.id)||{
              id:person.id,
              name:person.name,
              circle:circle.label,
              eligibleSessions:0,
              present:0,
              absences:0,
              rate:0,
            };
            personCurrent.eligibleSessions+=1;
            if(confirmedIds.has(person.id)) personCurrent.present+=1;
            else personCurrent.absences+=1;
            personCurrent.rate=personCurrent.eligibleSessions ? personCurrent.present*100/personCurrent.eligibleSessions : 0;
            circleCurrent.people.set(person.id,personCurrent);

            current.circles.set(circle.id,circleCurrent);
            postTiosStats.set(tios.id,current);
          }
        }
      }
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

  const postTios=Array.from(postTiosStats.values()).map((group:any)=>({
    key:group.key,
    label:group.label,
    sessions:group.sessionIds.size,
    present:group.present,
    eligible:group.eligible,
    absences:Math.max(0,group.eligible-group.present),
    rate:group.eligible ? group.present*100/group.eligible : 0,
    circles:Array.from(group.circles.values()).map((circle:any)=>({
      id:circle.id,
      label:circle.label,
      edition:circle.edition,
      color:circle.color,
      present:circle.present,
      eligible:circle.eligible,
      absences:Math.max(0,circle.eligible-circle.present),
      rate:circle.eligible ? circle.present*100/circle.eligible : 0,
      people:Array.from(circle.people.values()).sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),'pt-BR')),
    })).sort((a:any,b:any)=>Number(a.edition)-Number(b.edition)||String(a.color).localeCompare(String(b.color),'pt-BR')),
  })).sort((a:any,b:any)=>Number(b.rate)-Number(a.rate)||Number(b.present)-Number(a.present)||String(a.label).localeCompare(String(b.label),'pt-BR'));

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
    postTios,
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
      const sessions=(await listSessions(supabase,group.id)).filter((s:any)=>s.status==='AGENDADA'||s.status==='ABERTA'||s.status==='ENCERRADA');
      return {ok:true,data:{success:true,responsible:{id:group.id,label:group.nome_exibicao,kind:group.tipo==='TIOS'?'TIOS':group.tipo==='POS'?'POS':'HISTORICO'},sessions,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_OPERATIONAL_CANDIDATES'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Vínculo operacional disponível somente para Tios de Círculo.'}};
      const result=await responsibleOperationalCandidates(supabase,group);
      return {ok:true,data:{success:true,responsible:{id:group.id,label:group.nome_exibicao},...result,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_OPERATIONAL_ASSIGNMENT_PREVIEW'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Vínculo operacional disponível somente para Tios de Círculo.'}};
      const preview=await responsibleOperationalAssignmentPreview(supabase,group,payload);
      return {ok:true,data:{success:true,preview,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_OPERATIONAL_ASSIGNMENT_APPLY'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Vínculo operacional disponível somente para Tios de Círculo.'}};
      const result=await responsibleOperationalAssignmentApply(supabase,group,payload);
      return {ok:true,data:{success:true,result,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_LIST'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Manutenção de adolescentes disponível somente para Tios de Círculo.'}};
      const result=await responsibleCircleMaintenanceList(supabase,group);
      return {ok:true,data:{success:true,responsible:{id:group.id,label:group.nome_exibicao},...result,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_PREVIEW'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Manutenção de adolescentes disponível somente para Tios de Círculo.'}};
      const preview=await responsibleCircleMaintenancePreview(supabase,group,payload);
      return {ok:true,data:{success:true,preview,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CIRCLE_MAINTENANCE_APPLY'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'Manutenção de adolescentes disponível somente para Tios de Círculo.'}};
      const result=await responsibleCircleMaintenanceApply(supabase,group,payload);
      return {ok:true,data:{success:true,result,source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_EXPORT_ADOLESCENTS'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='POS') return {ok:true,data:{success:false,error:'A exportação geral de adolescentes está disponível somente para o responsável do Pós.'}};

      const [
        {data:adolescents,error:adolescentsError},
        {data:historicalMembers,error:historicalMembersError},
        {data:prioritizedRegistrations,error:prioritizedRegistrationsError},
      ]=await Promise.all([
        supabase.from('adolescentes')
          .select('id,pessoa_id')
          .not('pessoa_id','is',null),
        supabase.from('eac_circulo_membros_historicos')
          .select('pessoa_id')
          .eq('conciliacao_status','CONCILIADO')
          .not('pessoa_id','is',null),
        supabase.from('inscricoes')
          .select('adolescente_id')
          .eq('status','PRIORIZADO')
          .not('adolescente_id','is',null),
      ]);
      if(adolescentsError) throw adolescentsError;
      if(historicalMembersError) throw historicalMembersError;
      if(prioritizedRegistrationsError) throw prioritizedRegistrationsError;

      const adolescentPersonById=new Map<string,string>();
      for(const adolescent of adolescents||[]){
        const adolescentId=clean(adolescent.id);
        const personId=clean(adolescent.pessoa_id);
        if(adolescentId&&personId) adolescentPersonById.set(adolescentId,personId);
      }

      const linkedPersonIds=new Set<string>();
      for(const member of historicalMembers||[]){
        const personId=clean(member.pessoa_id);
        if(personId) linkedPersonIds.add(personId);
      }
      for(const registration of prioritizedRegistrations||[]){
        const personId=adolescentPersonById.get(clean(registration.adolescente_id));
        if(personId) linkedPersonIds.add(personId);
      }

      const ids=Array.from(new Set((adolescents||[])
        .map((row:any)=>clean(row.pessoa_id))
        .filter((personId:string)=>Boolean(personId)&&linkedPersonIds.has(personId))));
      const rows:any[]=[];
      for(let i=0;i<ids.length;i+=200){
        const chunk=ids.slice(i,i+200);
        const {data:people,error:peopleError}=await supabase.from('pessoas')
          .select('id,nome_completo,telefone_normalizado')
          .in('id',chunk);
        if(peopleError) throw peopleError;
        for(const person of people||[]){
          rows.push({
            nome:clean(person.nome_completo),
            telefone_normalizado:clean(person.telefone_normalizado),
          });
        }
      }

      rows.sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
      return {ok:true,data:{success:true,rows,total:rows.length,generatedAt:nowIso(),source:'supabase'}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_ATTENDANCE_LIST'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'A chamada por checklist está disponível somente para Tios de Círculo.'}};

      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id) return {ok:true,data:{success:false,error:'Reunião fora do escopo deste responsável.'}};
      if(!['ABERTA','ENCERRADA'].includes(session.status)) return {ok:true,data:{success:false,error:'A chamada só fica disponível após a abertura da reunião.'}};

      const people=await eligiblePeople(supabase,session);
      const eligibleIds=people.map((person:any)=>clean(person.id)).filter(Boolean);
      const confirmedIds=new Set<string>();
      if(eligibleIds.length){
        for(let i=0;i<eligibleIds.length;i+=200){
          const chunk=eligibleIds.slice(i,i+200);
          const {data:confirmed,error}=await supabase.from('presencas')
            .select('pessoa_id')
            .eq('sessao_id',session.id)
            .in('pessoa_id',chunk);
          if(error) throw error;
          for(const row of confirmed||[]) if(row.pessoa_id) confirmedIds.add(clean(row.pessoa_id));
        }
      }

      return {ok:true,data:{success:true,session:await decorateSession(supabase,session),people:people.map((person:any)=>({
        id:person.id,
        name:person.name,
        circle:person.circle||'',
        phoneMissing:!person.phone,
        present:confirmedIds.has(person.id),
      }))}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CONFIRM_ATTENDANCE'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      if(group.tipo!=='TIOS') return {ok:true,data:{success:false,error:'A chamada por checklist está disponível somente para Tios de Círculo.'}};

      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id) return {ok:true,data:{success:false,error:'Reunião fora do escopo deste responsável.'}};
      if(session.status!=='ABERTA') return {ok:true,data:{success:false,error:'A chamada só pode ser confirmada enquanto a reunião estiver aberta.'}};

      const people=await eligiblePeople(supabase,session);
      const peopleById=new Map<string,any>(people.map((person:any)=>[clean(person.id),person]));
      const requested=Array.isArray(payload.personIds)?payload.personIds.map((id:any)=>clean(id)).filter(Boolean):[];
      const selectedIds=Array.from(new Set<string>(requested));
      if(selectedIds.some((id)=>!peopleById.has(id))) return {ok:true,data:{success:false,error:'A lista contém adolescente fora do escopo desta reunião.'}};

      const eligibleIds=Array.from(peopleById.keys());
      const selectedSet=new Set(selectedIds);
      const existingIds=new Set<string>();

      if(eligibleIds.length){
        for(let i=0;i<eligibleIds.length;i+=200){
          const chunk=eligibleIds.slice(i,i+200);
          const {data:existing,error}=await supabase.from('presencas')
            .select('id,pessoa_id')
            .eq('sessao_id',session.id)
            .in('pessoa_id',chunk);
          if(error) throw error;
          for(const row of existing||[]) if(row.pessoa_id) existingIds.add(clean(row.pessoa_id));
        }
      }

      const toRemove=eligibleIds.filter((id)=>existingIds.has(id)&&!selectedSet.has(id));
      if(toRemove.length){
        for(let i=0;i<toRemove.length;i+=200){
          const chunk=toRemove.slice(i,i+200);
          const {error}=await supabase.from('presencas')
            .delete()
            .eq('sessao_id',session.id)
            .in('pessoa_id',chunk);
          if(error) throw error;
        }
      }

      const toAdd=selectedIds.filter((id)=>!existingIds.has(id));
      for(const id of toAdd){
        const person=peopleById.get(id);
        await insertPresence(supabase,session,person,person?.name||'',person?.phone||'',{
          canal:'CHECKLIST_RESPONSAVEL',
          responsavelGrupoId:group.id,
        });
      }

      await audit(supabase,session.id,'ATTENDANCE_CHECKLIST_CONFIRMED','RESPONSAVEL',group.id,{
        present:selectedIds.length,
        absent:Math.max(0,eligibleIds.length-selectedIds.length),
        eligible:eligibleIds.length,
        added:toAdd.length,
        removed:toRemove.length,
      });

      return {ok:true,data:{success:true,present:selectedIds.length,absent:Math.max(0,eligibleIds.length-selectedIds.length),eligible:eligibleIds.length}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CREATE_SESSION'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};

      const type=group.tipo==='POS'?'POS_ENCONTRO_GERAL':'REUNIAO_DUPLA_TIOS';
      if(!['POS','TIOS'].includes(clean(group.tipo))) return {ok:true,data:{success:false,error:'Este responsável não pode criar reuniões.'}};
      const scheduledAt=clean(payload.scheduledAt);
      if(!scheduledAt) return {ok:true,data:{success:false,error:'Informe a data e hora da reunião.'}};

      const title=type==='POS_ENCONTRO_GERAL'?'Pós-encontro':`Reunião de círculos · ${group.nome_exibicao}`;
      const body:any={encontro_id:null,responsavel_grupo_id:group.id,tipo:type,titulo:title,agendada_para:scheduledAt,status:'AGENDADA'};
      const {data,error}=await supabase.from('presenca_sessoes').insert(body).select('*').maybeSingle();
      if(error) throw error;
      const raw=tokenFor('session',data.id);
      const {error:ue}=await supabase.from('presenca_sessoes').update({public_token_hash:hash(raw),atualizado_em:nowIso()}).eq('id',data.id);
      if(ue) throw ue;
      await audit(supabase,data.id,'SESSION_CREATED','RESPONSAVEL',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,{...data,public_token_hash:hash(raw)})}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_UPDATE_SESSION'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id) return {ok:true,data:{success:false,error:'Reunião fora do escopo deste responsável.'}};
      if(session.status!=='AGENDADA') return {ok:true,data:{success:false,error:'Somente reuniões agendadas podem ser editadas.'}};
      const scheduledAt=clean(payload.scheduledAt);
      if(!scheduledAt) return {ok:true,data:{success:false,error:'Informe a data e hora da reunião.'}};
      const {data,error}=await supabase.from('presenca_sessoes')
        .update({agendada_para:scheduledAt,atualizado_em:nowIso()})
        .eq('id',session.id).eq('status','AGENDADA').select('*').maybeSingle();
      if(error) throw error;
      if(!data) return {ok:true,data:{success:false,error:'A reunião não está mais disponível para edição.'}};
      await audit(supabase,session.id,'SESSION_UPDATED','RESPONSAVEL',group.id,{scheduledAt});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_OPEN_SESSION'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id) return {ok:true,data:{success:false,error:'Reunião fora do escopo deste responsável.'}};
      if(session.status!=='AGENDADA') return {ok:true,data:{success:false,error:'Somente reuniões agendadas podem ser abertas.'}};
      const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes')
        .update({status:'ABERTA',aberta_em:t,atualizado_em:t})
        .eq('id',session.id).eq('status','AGENDADA').select('*').maybeSingle();
      if(error) throw error;
      if(!data) return {ok:true,data:{success:false,error:'A reunião não está mais disponível para abertura.'}};
      await audit(supabase,session.id,'SESSION_OPENED','RESPONSAVEL',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
    }
    if(action==='PRESENCA_V2_RESPONSIBLE_CANCEL_SESSION'){
      const token=clean(payload.token);
      const group=await getGroupByToken(supabase,token);
      if(!group) return {ok:true,data:{success:false,error:'Acesso de responsável inválido ou revogado.'}};
      const session=await sessionRaw(supabase,clean(payload.sessionId));
      if(!session||session.responsavel_grupo_id!==group.id) return {ok:true,data:{success:false,error:'Reunião fora do escopo deste responsável.'}};
      if(session.status!=='AGENDADA') return {ok:true,data:{success:false,error:'Somente reuniões agendadas podem ser canceladas.'}};
      const t=nowIso();
      const {data,error}=await supabase.from('presenca_sessoes')
        .update({status:'CANCELADA',cancelada_em:t,atualizado_em:t})
        .eq('id',session.id).eq('status','AGENDADA').select('*').maybeSingle();
      if(error) throw error;
      if(!data) return {ok:true,data:{success:false,error:'A reunião não está mais disponível para cancelamento.'}};
      await audit(supabase,session.id,'SESSION_CANCELLED','RESPONSAVEL',group.id,{});
      return {ok:true,data:{success:true,session:await decorateSession(supabase,data)}};
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
      const [people,group,presencesResult,pendingsResult]=await Promise.all([
        eligiblePeople(supabase,session),
        getGroup(supabase,session.responsavel_grupo_id),
        supabase.from('presencas').select('id,pessoa_id').eq('sessao_id',session.id),
        supabase.from('presenca_pendencias').select('id,status').eq('sessao_id',session.id),
      ]);
      if(presencesResult.error) throw presencesResult.error;
      if(pendingsResult.error) throw pendingsResult.error;
      const presences=presencesResult.data||[];
      const pendings=pendingsResult.data||[];
      const confirmedIds=new Set<string>();
      for(const row of presences) if(row.pessoa_id) confirmedIds.add(clean(row.pessoa_id));
      const tiosContext=await tiosContextByPerson(supabase,people.map((p:any)=>p.id));
      return {ok:true,data:{success:true,session:{...(await decorateSession(supabase,session,{eligible:people,group,presences,pendings})),people:people.map((p:any)=>({
        id:p.id,
        name:p.name,
        circle:p.circle||'',
        tiosLabels:Array.isArray(tiosContext.get(p.id)?.labels) ? tiosContext.get(p.id).labels : [],
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
