import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const env = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  tPrioritarios: String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
  tPresence: String(process.env.EAC_SUPABASE_TABLE_PRESENCE || '').trim(),
};

if (!env.url || !env.key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

const supabase = createClient(env.url, env.key, { auth: { persistSession: false } });

const toClean = (v) => String(v ?? '').trim();
const normalizeDigits = (v) => String(v ?? '').replace(/\D/g, '');
const toIsoDay = (v) => {
  const s = toClean(v);
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const normPhone = (v) => {
  const d = normalizeDigits(v);
  if (!d) return '';
  if (d.startsWith('55')) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
};

function toWriteCandidates(candidates) {
  const out = new Set();
  for (const raw of candidates.filter(Boolean)) {
    const t = toClean(raw);
    if (!t) continue;
    const lower = t.toLowerCase();
    const isView = lower.startsWith('vw_') || lower.endsWith('_view') || lower.includes('view');
    if (!isView) out.add(t);
    if (lower.startsWith('vw_')) out.add(t.slice(3));
    if (lower.endsWith('_view')) out.add(t.slice(0, -5));
  }
  return Array.from(out).filter(Boolean);
}

async function firstTable(candidates) {
  for (const table of candidates.filter(Boolean)) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) return table;
  }
  return null;
}

async function fetchAll(table, maxRows = 20000) {
  const pageSize = 1000;
  const out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase.from(table).select('*').range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

function bestRow(a, b) {
  const statusA = toClean(a?.status || a?.status_priorizacao || '').toUpperCase();
  const statusB = toClean(b?.status || b?.status_priorizacao || '').toUpperCase();
  const scoreA = statusA === 'PRIORIZADO' ? 1 : 0;
  const scoreB = statusB === 'PRIORIZADO' ? 1 : 0;
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  const timeA = new Date(toClean(a?.atualizado_em || a?.updated_at || a?.criado_em || a?.created_at || 0)).getTime() || 0;
  const timeB = new Date(toClean(b?.atualizado_em || b?.updated_at || b?.criado_em || b?.created_at || 0)).getTime() || 0;
  return timeA >= timeB ? a : b;
}

async function deleteByAnyId(table, row) {
  const ids = [
    ['inscricao_prioritaria_id', row?.inscricao_prioritaria_id],
    ['id', row?.id],
    ['uuid', row?.uuid],
  ].filter(([, v]) => toClean(v));
  for (const [k, v] of ids) {
    const { error } = await supabase.from(table).delete().eq(k, v);
    if (!error) return true;
  }
  return false;
}

async function sanitizePrioritarias() {
  const table = await firstTable(toWriteCandidates([
    env.tPrioritarios,
    'inscricoes_prioritarias',
    'prioritarios',
    'inscricoes_prioritarias_view',
    'vw_inscricoes_prioritarias',
  ]));
  if (!table) return { table: null, total: 0, deduped: 0, updated: 0 };
  const rows = await fetchAll(table, 30000);
  const groups = new Map();

  for (const row of rows) {
    const key =
      toClean(row?.inscricao_id) ||
      toClean(row?.adolescente_id) ||
      toClean(row?.pessoa_id) ||
      `${toClean(row?.nome_completo || row?.nome).toLowerCase()}|${normPhone(row?.telefone_normalizado || row?.telefone)}`;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let deduped = 0;
  let updated = 0;
  const childTable = await firstTable(['circulo_participantes', 'circulos_participantes']);

  for (const list of groups.values()) {
    if (!Array.isArray(list) || list.length === 0) continue;
    let keep = list[0];
    for (let i = 1; i < list.length; i += 1) keep = bestRow(keep, list[i]);
    for (const row of list) {
      if (row === keep) continue;
      const pid = toClean(row?.inscricao_prioritaria_id || row?.id || row?.uuid);
      if (childTable && pid) {
        await supabase.from(childTable).delete().eq('inscricao_prioritaria_id', pid);
      }
      const ok = await deleteByAnyId(table, row);
      if (ok) deduped += 1;
    }

    const keepId = toClean(keep?.inscricao_prioritaria_id || keep?.id || keep?.uuid);
    if (keepId) {
      const body = {
        telefone_normalizado: normPhone(keep?.telefone_normalizado || keep?.telefone) || null,
        nome_normalizado: toClean(keep?.nome_normalizado || keep?.nome_completo || keep?.nome).toLowerCase() || null,
        status: 'PRIORIZADO',
      };
      const { error } = await supabase.from(table).update(body).eq('inscricao_prioritaria_id', keepId);
      if (!error) updated += 1;
      else {
        const alt = await supabase.from(table).update(body).eq('id', keepId);
        if (!alt.error) updated += 1;
      }
    }
  }

  return { table, total: rows.length, deduped, updated };
}

async function sanitizePresencas() {
  const table = await firstTable(toWriteCandidates([
    env.tPresence,
    'presencas',
    'controle_presenca',
    'presenca',
    'vw_presencas_historico',
    'vw_presencas_detalhadas',
  ]));
  if (!table) return { table: null, total: 0, deduped: 0, updated: 0 };
  const rows = await fetchAll(table, 40000);
  const groups = new Map();

  for (const row of rows) {
    const tel = normPhone(row?.telefone_normalizado || row?.telefone || row?.telefone_digitado);
    const day = toIsoDay(row?.data_presenca || row?.timestamp || row?.created_at);
    if (!tel || !day) continue;
    const key = `${tel}|${day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let deduped = 0;
  let updated = 0;
  for (const [key, list] of groups.entries()) {
    let keep = list[0];
    for (let i = 1; i < list.length; i += 1) keep = bestRow(keep, list[i]);
    for (const row of list) {
      if (row === keep) continue;
      const id = toClean(row?.id || row?.presenca_id || row?.uuid);
      if (!id) continue;
      let del = await supabase.from(table).delete().eq('id', id);
      if (del.error) del = await supabase.from(table).delete().eq('presenca_id', id);
      if (!del.error) deduped += 1;
    }

    const [tel] = key.split('|');
    const keepId = toClean(keep?.id || keep?.presenca_id || keep?.uuid);
    if (keepId) {
      const body = { telefone_normalizado: tel };
      let up = await supabase.from(table).update(body).eq('id', keepId);
      if (up.error) up = await supabase.from(table).update(body).eq('presenca_id', keepId);
      if (!up.error) updated += 1;
    }
  }
  return { table, total: rows.length, deduped, updated };
}

async function main() {
  const p = await sanitizePrioritarias();
  const pr = await sanitizePresencas();
  console.log('[sanitize] prioritarias:', p);
  console.log('[sanitize] presencas:', pr);
}

main().catch((e) => {
  console.error('[sanitize] erro fatal:', e?.message || e);
  process.exit(1);
});
