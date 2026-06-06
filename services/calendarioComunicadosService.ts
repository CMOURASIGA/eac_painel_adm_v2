import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;
type ServiceResult = { ok: true; data: JsonObject };

const cleanText = (value: any) => String(value ?? '').trim();

async function findFirstTable(supabase: AnySupabaseClient, candidates: string[]) {
  let lastErr: any = null;
  for (const table of candidates) {
    const res = await supabase.from(table).select('*').limit(1);
    if (!res.error) return table;
    const msg = String(res.error?.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation')) {
      lastErr = res.error;
      continue;
    }
    throw res.error;
  }
  throw lastErr || new Error('Nenhuma tabela candidata foi encontrada no Supabase.');
}

function toWriteTableCandidates(candidates: string[]) {
  const normalized = new Set<string>();
  for (const raw of candidates) {
    const table = cleanText(raw);
    if (!table) continue;
    const lower = table.toLowerCase();
    const isView = lower.startsWith('vw_') || lower.endsWith('_view') || lower.includes('view');
    if (!isView) normalized.add(table);
    if (lower.startsWith('vw_')) normalized.add(table.slice(3));
    if (lower.endsWith('_view')) normalized.add(table.slice(0, -5));
  }
  return Array.from(normalized).filter(Boolean);
}

export async function saveEventService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const id = cleanText(payload.id) || (globalThis.crypto?.randomUUID?.() || `evt-${Date.now()}`);
  const atividade = cleanText(payload.atividade);
  const tipo = cleanText(payload.tipo) || 'Encontro';
  const inicio = cleanText(payload.inicio);
  const termino = cleanText(payload.termino);
  const local = cleanText(payload.local);
  const proprietario = cleanText(payload.proprietario);
  const status = cleanText(payload.status) || 'Confirmado';
  const encontroId = cleanText(payload.encontroId || payload.encontro_id);

  if (!atividade || !inicio || !termino) {
    return { ok: true, data: { success: false, error: 'Atividade, inicio e termino sao obrigatorios.' } };
  }

  const eventCandidates = [
    String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
    'eventos_agenda',
    'eventos',
    'events',
    'calendar_events',
    'vw_eventos_agenda',
    'eventos_agenda_view',
  ].filter(Boolean);
  const table = await findFirstTable(supabase, toWriteTableCandidates(eventCandidates));

  const payloadSnake = { id, atividade, tipo, inicio, termino, local: local || null, proprietario: proprietario || null, status, encontro_id: encontroId || null, updated_at: new Date().toISOString() };
  const payloadCamel = { id, atividade, tipo, inicio, termino, local: local || null, proprietario: proprietario || null, status, encontroId: encontroId || null, updatedAt: new Date().toISOString() };

  const existing = await supabase.from(table).select('id').eq('id', id).limit(1);
  if (existing.error) throw existing.error;
  const exists = Array.isArray(existing.data) && existing.data.length > 0;

  let result: any = null;
  if (exists) {
    let update = await supabase.from(table).update(payloadSnake as any).eq('id', id).select('*').limit(1);
    if (update.error) update = await supabase.from(table).update(payloadCamel as any).eq('id', id).select('*').limit(1);
    if (update.error) throw update.error;
    result = Array.isArray(update.data) ? update.data[0] : null;
  } else {
    let insert = await supabase.from(table).insert({ ...payloadSnake, created_at: new Date().toISOString() } as any).select('*').limit(1);
    if (insert.error) insert = await supabase.from(table).insert({ ...payloadCamel, createdAt: new Date().toISOString() } as any).select('*').limit(1);
    if (insert.error) throw insert.error;
    result = Array.isArray(insert.data) ? insert.data[0] : null;
  }

  return { ok: true, data: { success: true, source: 'supabase', event: result || payloadSnake, message: exists ? 'Evento atualizado com sucesso.' : 'Evento criado com sucesso.' } };
}

export async function deleteEventService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const id = cleanText(payload.id);
  if (!id) return { ok: true, data: { success: false, error: 'ID e obrigatorio para exclusao.' } };

  const eventCandidates = [
    String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
    'eventos_agenda',
    'eventos',
    'events',
    'calendar_events',
    'vw_eventos_agenda',
    'eventos_agenda_view',
  ].filter(Boolean);
  const table = await findFirstTable(supabase, toWriteTableCandidates(eventCandidates));

  const del = await supabase.from(table).delete().eq('id', id);
  if (del.error) throw del.error;
  return { ok: true, data: { success: true, source: 'supabase', id, message: `Evento #${id} removido.` } };
}

export async function saveComunicadoService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const id = cleanText(payload.id);
  const titulo = cleanText(payload.titulo);
  const assunto = cleanText(payload.assunto);
  const corpo = cleanText(payload.corpo);
  const status = cleanText(payload.status) || 'Ativo';
  const segmento = cleanText(payload.segmento || payload.publico || payload.audiencia);
  const versao = cleanText(payload.versao || payload.version || '1');
  const dataAgendada = cleanText(payload.dataAgendada);
  const dataEventos = cleanText(payload.dataEventos);

  if (!id || !titulo) return { ok: true, data: { success: false, error: 'ID e titulo sao obrigatorios.' } };
  if (!assunto) return { ok: true, data: { success: false, error: 'Assunto do comunicado e obrigatorio.' } };
  if (!corpo) return { ok: true, data: { success: false, error: 'Corpo do comunicado e obrigatorio.' } };

  const statusNorm = status.toLowerCase();
  const allowedStatus = new Set(['ativo', 'inativo', 'rascunho', 'arquivado', 'pronto_disparo', 'pronto-disparo']);
  if (!allowedStatus.has(statusNorm)) {
    return { ok: true, data: { success: false, error: 'Status do comunicado invalido.' } };
  }

  const validarDisparo = Boolean(payload.validarDisparo || payload.validar_disparo);
  const publicoElegivel = Number(payload.publicoElegivel ?? payload.publico_elegivel ?? payload.publicoTotal ?? payload.publico_total ?? 0);
  if (validarDisparo && (statusNorm === 'pronto_disparo' || statusNorm === 'pronto-disparo') && publicoElegivel <= 0) {
    return { ok: true, data: { success: false, error: 'Nao e permitido preparar disparo sem publico elegivel.' } };
  }

  const comunicadoCandidates = [
    String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
    'comunicados',
    'announcements',
    'notificacoes',
    'vw_comunicados',
    'comunicados_view',
  ].filter(Boolean);
  const table = await findFirstTable(supabase, toWriteTableCandidates(comunicadoCandidates));

  const payloadSnake = {
    id,
    titulo,
    assunto,
    corpo,
    status,
    segmento: segmento || null,
    versao: versao || null,
    data_agendada: dataAgendada || null,
    data_eventos: dataEventos || null,
    updated_at: new Date().toISOString(),
  };
  const payloadCamel = {
    id,
    titulo,
    assunto,
    corpo,
    status,
    segmento: segmento || null,
    versao: versao || null,
    dataAgendada: dataAgendada || null,
    dataEventos: dataEventos || null,
    updatedAt: new Date().toISOString(),
  };

  const existing = await supabase.from(table).select('id').eq('id', id).limit(1);
  if (existing.error) throw existing.error;
  const exists = Array.isArray(existing.data) && existing.data.length > 0;

  let result: any = null;
  if (exists) {
    let update = await supabase.from(table).update(payloadSnake as any).eq('id', id).select('*').limit(1);
    if (update.error) update = await supabase.from(table).update(payloadCamel as any).eq('id', id).select('*').limit(1);
    if (update.error) throw update.error;
    result = Array.isArray(update.data) ? update.data[0] : null;
  } else {
    let insert = await supabase.from(table).insert(payloadSnake as any).select('*').limit(1);
    if (insert.error) insert = await supabase.from(table).insert(payloadCamel as any).select('*').limit(1);
    if (insert.error) throw insert.error;
    result = Array.isArray(insert.data) ? insert.data[0] : null;
  }

  return { ok: true, data: { success: true, source: 'supabase', comunicado: result || payloadSnake, message: exists ? 'Comunicado atualizado com sucesso.' : 'Comunicado criado com sucesso.' } };
}

export async function deleteComunicadoService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const id = cleanText(payload.id);
  if (!id) return { ok: true, data: { success: false, error: 'ID e obrigatorio para exclusao.' } };

  const comunicadoCandidates = [
    String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
    'comunicados',
    'announcements',
    'notificacoes',
    'vw_comunicados',
    'comunicados_view',
  ].filter(Boolean);
  const table = await findFirstTable(supabase, toWriteTableCandidates(comunicadoCandidates));

  // First try UUID/primary id deletion (default path).
  const delById = await supabase.from(table).delete().eq('id', id);
  if (!delById.error) {
    return { ok: true, data: { success: true, source: 'supabase', id, message: `Comunicado #${id} removido.` } };
  }

  // Fallback for legacy ids shown in UI (e.g. "99" from Apps Script / codigo_externo).
  // This also handles invalid UUID payloads that cannot be compared against `id`.
  const delByExternalCode = await supabase.from(table).delete().eq('codigo_externo', id);
  if (delByExternalCode.error) throw delByExternalCode.error;
  return { ok: true, data: { success: true, source: 'supabase', id, message: `Comunicado #${id} removido.` } };
}
