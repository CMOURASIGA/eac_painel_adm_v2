import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;
type ServiceResult = { ok: true; data: JsonObject };

const cleanText = (value: any) => String(value ?? '').trim();
const pickFirst = (row: any, keys: string[]) => {
  for (const key of keys) {
    const v = row?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};

async function fetchAllRowsSimple(supabase: AnySupabaseClient, tableCandidates: string[], maxRows = 30000) {
  for (const table of tableCandidates) {
    const res = await supabase.from(table).select('*').limit(maxRows);
    if (!res.error) return Array.isArray(res.data) ? res.data : [];
    const msg = String(res.error?.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation')) continue;
    throw res.error;
  }
  return [];
}

export async function logDispatchExecutionService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const dispatchId = cleanText(payload.dispatchId);
  const dispatchName = cleanText(payload.dispatchName);
  const operator = cleanText(payload.operator) || 'Sistema';
  const status = cleanText(payload.status) || 'SUCCESS';
  const responseSummary = cleanText(payload.responseSummary);
  const duration = Number(payload.duration || 0);
  const semanaId = cleanText(payload.semanaId || payload.semana_id);

  const logTables = ['logs', 'dispatch_logs', 'audit_logs', 'eac_logs'];
  let inserted = false;
  for (const table of logTables) {
    for (const body of [
      { dispatch_id: dispatchId, dispatch_name: dispatchName, operator, timestamp: new Date().toISOString(), duration, status, response_summary: responseSummary, semana_id: semanaId || null },
      { dispatchId, dispatchName, operator, timestamp: new Date().toISOString(), duration, status, responseSummary, semanaId: semanaId || null },
    ]) {
      try {
        const res = await supabase.from(table).insert(body as any);
        if (!res.error) {
          inserted = true;
          break;
        }
      } catch {
      }
    }
    if (inserted) break;
  }

  return { ok: true, data: { success: true, source: 'supabase', inserted } };
}

export async function logDispatchDestinatariosService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const dispatchId = cleanText(payload.dispatchId);
  const dispatchName = cleanText(payload.dispatchName);
  const operator = cleanText(payload.operator) || 'Sistema';
  const semanaId = cleanText(payload.semanaId || payload.semana_id);
  const itens = Array.isArray(payload.itens) ? payload.itens : [];

  if (!dispatchId || itens.length === 0) return { ok: true, data: { success: true, source: 'supabase', inserted: 0 } };

  const tableCandidates = ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'];
  let inserted = 0;
  for (const table of tableCandidates) {
    const rowsSnake = itens.map((it: any) => ({
      dispatch_id: dispatchId,
      dispatch_name: dispatchName,
      operator,
      destinatario: cleanText(it.destinatario || it.email || it.telefone || it.nome),
      status: cleanText(it.status) || 'IGNORADO',
      detalhe: cleanText(it.detalhe || it.message || ''),
      semana_id: semanaId || null,
      payload: typeof it === 'object' ? it : { valor: it },
      created_at: new Date().toISOString(),
    }));
    const rowsCamel = itens.map((it: any) => ({
      dispatchId,
      dispatchName,
      operator,
      destinatario: cleanText(it.destinatario || it.email || it.telefone || it.nome),
      status: cleanText(it.status) || 'IGNORADO',
      detalhe: cleanText(it.detalhe || it.message || ''),
      semanaId: semanaId || null,
      payload: typeof it === 'object' ? it : { valor: it },
      createdAt: new Date().toISOString(),
    }));

    const a = await supabase.from(table).insert(rowsSnake as any);
    if (!a.error) { inserted = rowsSnake.length; break; }
    const b = await supabase.from(table).insert(rowsCamel as any);
    if (!b.error) { inserted = rowsCamel.length; break; }
  }

  return { ok: true, data: { success: true, source: 'supabase', inserted } };
}

export async function buildNonEnrolledDispatchAudienceService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const tipo = cleanText(payload.tipo || 'waitlist');
  const rows = await fetchAllRowsSimple(supabase, [
    String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
    'nao_inscritos',
    'non_enrolled',
    'nao_inscritos_raw',
  ].filter(Boolean));

  const list = rows.map((row: any) => ({
    linhaOrigem: cleanText(pickFirst(row, ['linhaOrigem', 'linha_origem', 'id'])),
    nome: cleanText(pickFirst(row, ['nome', 'nome_completo'])),
    email: cleanText(pickFirst(row, ['email'])),
    telefone: cleanText(pickFirst(row, ['telefone', 'whatsapp', 'celular'])),
    bairro: cleanText(pickFirst(row, ['bairro'])),
    statusEnvio: cleanText(pickFirst(row, ['statusEnvio', 'status_envio', 'H'])).toLowerCase(),
    statusPreConfirmacao: cleanText(pickFirst(row, ['statusPreConfirmacao', 'status_pre_confirmacao', 'P'])).toLowerCase(),
    statusPriorizacao: cleanText(pickFirst(row, ['statusPriorizacao', 'status_priorizacao', 'Q'])).toLowerCase(),
  }));

  const isEmailValido = (v: any) => {
    const e = cleanText(v);
    return e.includes('@') && e.includes('.');
  };
  const isBlank = (v: any) => cleanText(v) === '';
  const isPriorizado = (v: any) => ['sim', 's', 'yes', 'y', '1', 'true'].includes(cleanText(v));

  const audience = list.filter((row: any) => {
    const base = isBlank(row.statusEnvio) && isEmailValido(row.email) && isBlank(row.statusPreConfirmacao);
    if (!base) return false;
    if (tipo === 'waitlist') return true;
    if (tipo === 'nao_participacao') return !isPriorizado(row.statusPriorizacao);
    return true;
  });

  return {
    ok: true,
    data: {
      success: true,
      source: 'supabase',
      tipo,
      total: audience.length,
      recipients: audience.map((row: any) => ({ id: row.linhaOrigem, nome: row.nome, email: row.email, telefone: row.telefone, bairro: row.bairro })),
    },
  };
}
