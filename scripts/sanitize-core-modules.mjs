import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const env = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  tMembers: String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
  tNonEnrolled: String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
  tEncontreiros: String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim(),
};

if (!env.url || !env.key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

const supabase = createClient(env.url, env.key, { auth: { persistSession: false } });

const clean = (v) => String(v ?? '').trim();
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const phone = (v) => {
  const d = digits(v);
  if (!d) return '';
  if (d.startsWith('55')) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
};
const timeMs = (row) => {
  const t = new Date(clean(row?.updated_at || row?.atualizado_em || row?.created_at || row?.criado_em || 0)).getTime();
  return Number.isFinite(t) ? t : 0;
};

function toWriteCandidates(candidates) {
  const out = new Set();
  for (const raw of candidates.filter(Boolean)) {
    const t = clean(raw);
    if (!t) continue;
    const l = t.toLowerCase();
    const isView = l.startsWith('vw_') || l.endsWith('_view') || l.includes('view');
    if (!isView) out.add(t);
    if (l.startsWith('vw_')) out.add(t.slice(3));
    if (l.endsWith('_view')) out.add(t.slice(0, -5));
  }
  return Array.from(out).filter(Boolean);
}

async function firstExisting(candidates) {
  for (const t of candidates) {
    const { error } = await supabase.from(t).select('*').limit(1);
    if (!error) return t;
  }
  return null;
}

async function fetchAll(table, maxRows = 40000) {
  const page = 1000;
  const out = [];
  for (let from = 0; from < maxRows; from += page) {
    const to = Math.min(from + page - 1, maxRows - 1);
    const { data, error } = await supabase.from(table).select('*').range(from, to);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function deleteRow(table, row) {
  const ids = [
    ['id', row?.id],
    ['uuid', row?.uuid],
    ['inscricao_id', row?.inscricao_id],
    ['inscricao_prioritaria_id', row?.inscricao_prioritaria_id],
  ].filter(([, v]) => clean(v));
  for (const [k, v] of ids) {
    const { error } = await supabase.from(table).delete().eq(k, v);
    if (!error) return true;
  }
  return false;
}

async function sanitizeModule({ label, candidates, keyFn, updateFn }) {
  const table = await firstExisting(toWriteCandidates(candidates));
  if (!table) return { label, table: null, total: 0, deduped: 0, updated: 0 };

  const rows = await fetchAll(table);
  const groups = new Map();
  for (const row of rows) {
    const key = clean(keyFn(row));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let deduped = 0;
  let updated = 0;
  for (const list of groups.values()) {
    if (!Array.isArray(list) || list.length === 0) continue;
    let keep = list[0];
    for (let i = 1; i < list.length; i += 1) {
      keep = timeMs(list[i]) > timeMs(keep) ? list[i] : keep;
    }
    for (const row of list) {
      if (row === keep) continue;
      const ok = await deleteRow(table, row);
      if (ok) deduped += 1;
    }

    const body = updateFn(keep);
    if (body && typeof body === 'object') {
      let ok = false;
      if (clean(keep?.id)) {
        const res = await supabase.from(table).update(body).eq('id', keep.id);
        ok = !res.error;
      }
      if (!ok && clean(keep?.uuid)) {
        const res = await supabase.from(table).update(body).eq('uuid', keep.uuid);
        ok = !res.error;
      }
      if (!ok && clean(keep?.inscricao_id)) {
        const res = await supabase.from(table).update(body).eq('inscricao_id', keep.inscricao_id);
        ok = !res.error;
      }
      if (ok) updated += 1;
    }
  }

  return { label, table, total: rows.length, deduped, updated };
}

async function main() {
  const report = [];

  report.push(await sanitizeModule({
    label: 'non_enrolled',
    candidates: [env.tNonEnrolled, 'nao_inscritos', 'nao_inscritos_raw', 'non_enrolled', 'vw_nao_inscritos'],
    keyFn: (r) => `${clean(r?.nome || r?.nome_completo).toLowerCase()}|${phone(r?.telefone_normalizado || r?.telefone || r?.celular)}`,
    updateFn: (r) => ({
      telefone_normalizado: phone(r?.telefone_normalizado || r?.telefone || r?.celular) || null,
      nome_normalizado: clean(r?.nome_normalizado || r?.nome || r?.nome_completo).toLowerCase() || null,
    }),
  }));

  report.push(await sanitizeModule({
    label: 'members',
    candidates: [env.tMembers, 'cadastro_oficial', 'cadastro', 'members', 'membros', 'vw_cadastro_oficial'],
    keyFn: (r) => `${clean(r?.nome || r?.nome_completo).toLowerCase()}|${phone(r?.telefone_normalizado || r?.telefone)}`,
    updateFn: (r) => ({
      telefone_normalizado: phone(r?.telefone_normalizado || r?.telefone) || null,
      nome_normalizado: clean(r?.nome_normalizado || r?.nome || r?.nome_completo).toLowerCase() || null,
    }),
  }));

  report.push(await sanitizeModule({
    label: 'encontreiros',
    candidates: [env.tEncontreiros, 'encontreiros', 'cadastro_encontreiros', 'vw_encontreiros'],
    keyFn: (r) => `${clean(r?.nomeCompleto || r?.nome_completo || r?.nome).toLowerCase()}|${phone(r?.celularWhatsapp || r?.celular_whatsapp || r?.telefone || r?.whatsappNormalizado)}`,
    updateFn: (r) => ({
      whatsapp_normalizado: phone(r?.celularWhatsapp || r?.celular_whatsapp || r?.telefone || r?.whatsappNormalizado) || null,
    }),
  }));

  console.log('[sanitize-core] report:', report);
}

main().catch((e) => {
  console.error('[sanitize-core] erro fatal:', e?.message || e);
  process.exit(1);
});

