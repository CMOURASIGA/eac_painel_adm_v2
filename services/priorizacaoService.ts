import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, any>;
type ServiceResult = { ok: true; data: JsonObject };

const cleanText = (value: any) => String(value ?? '').trim();
const pickFirst = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (!row) continue;
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return '';
};

async function findFirstTable(supabase: SupabaseClient, candidates: string[]) {
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

    if (lower.startsWith('vw_')) {
      const base = table.slice(3);
      if (base) normalized.add(base);
    }
    if (lower.endsWith('_view')) {
      const base = table.slice(0, -5);
      if (base) normalized.add(base);
    }
  }
  return Array.from(normalized);
}

const isMissingColumnError = (error: any) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('column') || msg.includes('schema cache');
};

const isInvalidUuidSyntaxError = (error: any) =>
  String(error?.message || '').toLowerCase().includes('invalid input syntax for type uuid');

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

async function findFirstRowByKeys(
  supabase: SupabaseClient,
  table: string,
  keys: string[],
  value: string
) {
  let lastErr: any = null;
  for (const key of keys) {
    if ((key === 'id' || key === 'uuid' || key === 'id_pessoa' || key === 'idPessoa' || key === 'pessoa_id' || key === 'pessoaId') && !isUuidLike(value)) {
      continue;
    }
    const res = await supabase.from(table).select('*').eq(key, value).limit(1);
    if (!res.error) {
      const row = Array.isArray(res.data) ? res.data[0] : null;
      if (row) return row;
      continue;
    }
    if (isMissingColumnError(res.error)) {
      lastErr = res.error;
      continue;
    }
    if (isInvalidUuidSyntaxError(res.error)) {
      lastErr = res.error;
      continue;
    }
    throw res.error;
  }
  if (lastErr) return null;
  return null;
}

async function updateByFirstExistingKey(
  supabase: SupabaseClient,
  table: string,
  whereKeys: string[],
  whereValue: string,
  body: JsonObject
) {
  let lastErr: any = null;
  for (const key of whereKeys) {
    if ((key === 'id' || key === 'uuid' || key === 'id_pessoa' || key === 'idPessoa' || key === 'pessoa_id' || key === 'pessoaId') && !isUuidLike(whereValue)) {
      continue;
    }
    const res = await supabase.from(table).update(body).eq(key, whereValue);
    if (!res.error) return true;
    if (isMissingColumnError(res.error)) {
      lastErr = res.error;
      continue;
    }
    if (isInvalidUuidSyntaxError(res.error)) {
      lastErr = res.error;
      continue;
    }
    throw res.error;
  }
  if (lastErr) return false;
  return false;
}

async function deleteByFirstExistingKey(
  supabase: SupabaseClient,
  table: string,
  whereKeys: string[],
  whereValue: string
) {
  let lastErr: any = null;
  for (const key of whereKeys) {
    if ((key === 'id' || key === 'uuid' || key === 'id_pessoa' || key === 'idPessoa' || key === 'pessoa_id' || key === 'pessoaId') && !isUuidLike(whereValue)) {
      continue;
    }
    const res = await supabase.from(table).delete().eq(key, whereValue);
    if (!res.error) return true;
    if (isMissingColumnError(res.error)) {
      lastErr = res.error;
      continue;
    }
    if (isInvalidUuidSyntaxError(res.error)) {
      lastErr = res.error;
      continue;
    }
    throw res.error;
  }
  if (lastErr) return false;
  return false;
}

async function deleteCirculoParticipantesByPrioritariaId(
  supabase: SupabaseClient,
  inscricaoPrioritariaId: string
) {
  const id = cleanText(inscricaoPrioritariaId);
  if (!id || !isUuidLike(id)) return false;

  const childTables = ['circulo_participantes', 'circulos_participantes'].filter(Boolean);
  const childKeys = ['inscricao_prioritaria_id', 'inscricaoPrioritariaId', 'prioritario_id', 'prioritarioId'];

  for (const table of childTables) {
    for (const key of childKeys) {
      const res = await supabase.from(table).delete().eq(key, id);
      if (!res.error) return true;
      if (isMissingColumnError(res.error)) continue;
      const msg = String(res.error?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) break;
      throw res.error;
    }
  }
  return false;
}

async function syncInscricaoStatus(
  supabase: SupabaseClient,
  inscricaoId: string,
  targetStatus: string
) {
  const id = cleanText(inscricaoId);
  if (!id || !isUuidLike(id)) return false;

  const writeTables = [
    String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
    'inscricoes',
  ].filter(Boolean);

  for (const table of writeTables) {
    const attempts = [{ status_inscricao: targetStatus }, { status: targetStatus }];
    for (const body of attempts) {
      const res = await supabase.from(table).update(body as any).eq('inscricao_id', id);
      if (!res.error) return true;
      if (isMissingColumnError(res.error)) {
        const fallback = await supabase.from(table).update(body as any).eq('id', id);
        if (!fallback.error) return true;
        if (isMissingColumnError(fallback.error)) continue;
      }
    }
  }
  return false;
}

export async function prioritizeNonEnrolledService(supabase: SupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const linhaOrigem = cleanText(payload.linhaOrigem || payload.linha_origem);
  const prioridadeId = cleanText(payload.id || payload.prioritarioId || payload.inscricao_prioritaria_id);
  const priorizarRaw = payload.priorizar;
  const priorizar = priorizarRaw === undefined ? true : Boolean(priorizarRaw);

  if (!linhaOrigem && !prioridadeId) {
    return { ok: true, data: { success: false, error: 'linhaOrigem e obrigatoria.' } };
  }

  const nonTables = [
    String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
    'nao_inscritos',
    'non_enrolled',
    'nao_inscritos_raw',
  ].filter(Boolean);

  const priTables = [
    String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
    'inscricoes_prioritarias',
    'prioritarios',
    'inscricoes_prioritarias_view',
    'vw_inscricoes_prioritarias',
  ].filter(Boolean);

  const nonTable = await findFirstTable(supabase, nonTables);
  const priWriteTables = toWriteTableCandidates(priTables);
  const priTable = await findFirstTable(supabase, priWriteTables);

  const sourceRow = linhaOrigem
    ? await findFirstRowByKeys(
      supabase,
      nonTable,
      ['linha_origem', 'linhaOrigem', 'id', 'id_pessoa', 'idPessoa'],
      linhaOrigem
    )
    : null;
  if (priorizar && !sourceRow) {
    return { ok: true, data: { success: false, error: 'Nao inscrito nao encontrado para priorizacao.' } };
  }

  const sourceId = cleanText(pickFirst(sourceRow, ['linhaOrigem', 'linha_origem', 'id_pessoa', 'idPessoa', 'id']));
  const pessoaId = cleanText(pickFirst(sourceRow, ['id_pessoa', 'idPessoa', 'pessoa_id', 'pessoaId']));
  const telefone = cleanText(pickFirst(sourceRow, ['telefone', 'whatsapp', 'celular']));
  const email = cleanText(pickFirst(sourceRow, ['email']));
  const nome = cleanText(pickFirst(sourceRow, ['nome', 'nome_completo', 'nomeCompleto']));

  let existingPriority: any = null;
  if (!existingPriority && prioridadeId) {
    existingPriority = await findFirstRowByKeys(
      supabase,
      priTable,
      ['inscricao_prioritaria_id', 'id', 'uuid'],
      prioridadeId
    );
  }
  if (!existingPriority && sourceId) {
    existingPriority = await findFirstRowByKeys(supabase, priTable, ['linha_origem', 'linhaOrigem'], sourceId);
  }
  if (!existingPriority && linhaOrigem) {
    existingPriority = await findFirstRowByKeys(
      supabase,
      priTable,
      ['linha_origem', 'linhaOrigem', 'id_pessoa', 'idPessoa', 'pessoa_id', 'id', 'uuid'],
      linhaOrigem
    );
  }
  if (!existingPriority && pessoaId) {
    existingPriority = await findFirstRowByKeys(supabase, priTable, ['id_pessoa', 'idPessoa', 'pessoa_id'], pessoaId);
  }
  if (!existingPriority && email) {
    existingPriority = await findFirstRowByKeys(supabase, priTable, ['email'], email);
  }
  if (!existingPriority && telefone) {
    existingPriority = await findFirstRowByKeys(supabase, priTable, ['telefone'], telefone);
  }

  if (priorizar) {
    if (existingPriority) {
      return { ok: true, data: { success: false, duplicate: true, source: 'supabase', error: 'Registro ja priorizado. Duplicidade bloqueada.' } };
    }

    const insertAttempts = [
      {
        linha_origem: sourceId || linhaOrigem,
        id_pessoa: pessoaId || null,
        nome,
        email,
        telefone,
        origem: 'NAO_INSCRITO',
        status_priorizacao: 'PRIORIZADO',
        created_at: new Date().toISOString(),
      },
      {
        linhaOrigem: sourceId || linhaOrigem,
        idPessoa: pessoaId || null,
        nome,
        email,
        telefone,
        origem: 'NAO_INSCRITO',
        statusPriorizacao: 'PRIORIZADO',
        createdAt: new Date().toISOString(),
      },
    ];

    let inserted = false;
    let insertError: any = null;
    for (const body of insertAttempts) {
      const res = await supabase.from(priTable).insert(body as any).select('*').limit(1);
      if (!res.error) {
        inserted = true;
        insertError = null;
        break;
      }
      insertError = res.error;
    }
    if (!inserted && insertError) throw insertError;

    for (const body of [{ statusPriorizacao: 'SIM' }, { status_priorizacao: 'SIM' }]) {
      const updated = linhaOrigem && await updateByFirstExistingKey(
        supabase,
        nonTable,
        ['linha_origem', 'linhaOrigem', 'id', 'id_pessoa', 'idPessoa'],
        linhaOrigem,
        body
      );
      if (updated) break;
    }
    const inscricaoIdToPrioritize = cleanText(
      pickFirst(existingPriority, ['inscricao_id']) ||
      pickFirst(sourceRow, ['inscricao_id', 'id_inscricao'])
    );
    await syncInscricaoStatus(supabase, inscricaoIdToPrioritize, 'PRIORIZADO');

    return { ok: true, data: { success: true, source: 'supabase', priorizado: true, inserted: true, message: 'Registro priorizado com sucesso.' } };
  }

  const inscricaoIdToDeprioritize = cleanText(
    pickFirst(existingPriority, ['inscricao_id']) ||
    (isUuidLike(linhaOrigem) ? linhaOrigem : '')
  );

  if (existingPriority) {
    const existingId = cleanText(pickFirst(existingPriority, ['inscricao_prioritaria_id', 'id', 'uuid']));
    let deleted = false;

    if (existingId) {
      await deleteCirculoParticipantesByPrioritariaId(supabase, existingId);
      deleted = await deleteByFirstExistingKey(
        supabase,
        priTable,
        ['inscricao_prioritaria_id', 'id', 'uuid'],
        existingId
      );
    }

    if (!deleted && sourceId) {
      deleted = await deleteByFirstExistingKey(supabase, priTable, ['linha_origem', 'linhaOrigem'], sourceId);
    }
    if (!deleted && linhaOrigem) {
      deleted = await deleteByFirstExistingKey(
        supabase,
        priTable,
        ['linha_origem', 'linhaOrigem', 'id_pessoa', 'idPessoa', 'pessoa_id'],
        linhaOrigem
      );
    }
    if (!deleted && pessoaId) {
      deleted = await deleteByFirstExistingKey(supabase, priTable, ['id_pessoa', 'idPessoa', 'pessoa_id'], pessoaId);
    }
    if (!deleted && email) {
      deleted = await deleteByFirstExistingKey(supabase, priTable, ['email'], email);
    }
    if (!deleted && telefone) {
      deleted = await deleteByFirstExistingKey(supabase, priTable, ['telefone'], telefone);
    }
  }

  for (const body of [{ statusPriorizacao: '' }, { status_priorizacao: '' }]) {
    const updated = linhaOrigem && await updateByFirstExistingKey(
      supabase,
      nonTable,
      ['linha_origem', 'linhaOrigem', 'id', 'id_pessoa', 'idPessoa'],
      linhaOrigem,
      body
    );
    if (updated) break;
  }
  await syncInscricaoStatus(supabase, inscricaoIdToDeprioritize, 'INSCRITO');

  return { ok: true, data: { success: true, source: 'supabase', priorizado: false, removed: true, message: 'Priorizacao removida com sucesso.' } };
}
