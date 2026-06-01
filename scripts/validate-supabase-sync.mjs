import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });

const now = new Date();
const isoStamp = now.toISOString().replace(/[:.]/g, '-');

const env = {
  supabaseUrl: String(process.env.SUPABASE_URL || '').trim(),
  supabaseKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() || String(process.env.SUPABASE_ANON_KEY || '').trim(),
  supabaseSchema: String(process.env.SUPABASE_SCHEMA || 'public').trim() || 'public',
  googleWebAppUrl: String(process.env.GOOGLE_WEBAPP_URL || process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL || process.env.VITE_GOOGLE_WEBAPP_URL || '').trim(),
  chaveMestra: String(process.env.CHAVE_MESTRA || 'EAC-Admin-Secure-778899').trim(),

  // optional table hints (same naming as the runtime integration)
  tUsers: String(process.env.EAC_SUPABASE_TABLE_USERS || '').trim(),
  tMembers: String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
  tNonEnrolled: String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
  tEmailStatus: String(process.env.EAC_SUPABASE_TABLE_EMAIL_STATUS || '').trim(),
  tPrioritarios: String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
  tCirculos: String(process.env.EAC_SUPABASE_TABLE_CIRCULOS || '').trim(),
  tPresence: String(process.env.EAC_SUPABASE_TABLE_PRESENCE || '').trim(),
  tEncontreiros: String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim(),
  tEvents: String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
  tComunicados: String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
  tLogs: String(process.env.EAC_SUPABASE_TABLE_LOGS || '').trim(),
};

const must = (value, name) => {
  if (!value) throw new Error(`ENV obrigatória ausente: ${name}`);
  return value;
};

const toCleanString = (value) => String(value ?? '').trim();
const normalizeDigits = (value) => String(value ?? '').replace(/\D/g, '');

const parseDateish = (value) => {
  const raw = toCleanString(value);
  if (!raw) return { ok: true, parsed: null };

  // BR dd/mm/yyyy
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    const dt = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00`);
    return { ok: !Number.isNaN(dt.getTime()), parsed: dt };
  }

  const dt = new Date(raw);
  return { ok: !Number.isNaN(dt.getTime()), parsed: Number.isNaN(dt.getTime()) ? null : dt };
};

const toBoolLike = (value) => {
  const s = toCleanString(value).toLowerCase();
  if (!s) return { ok: true, parsed: null };
  if (['sim', 's', 'yes', 'y', '1', 'true', 'x'].includes(s)) return { ok: true, parsed: true };
  if (['nao', 'não', 'n', 'no', '0', 'false'].includes(s)) return { ok: true, parsed: false };
  return { ok: false, parsed: null };
};

function uniqBy(list, keyFn) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const k = keyFn(item);
    if (!k) continue;
    if (!map.has(k)) map.set(k, item);
  }
  return Array.from(map.values());
}

function dupKeys(list, keyFn) {
  const counts = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const k = keyFn(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, c]) => c > 1).map(([k, c]) => ({ key: k, count: c }));
}

async function callAppsScript(action, payload = {}) {
  const webAppUrl = must(env.googleWebAppUrl, 'GOOGLE_WEBAPP_URL (ou VITE/NEXT_PUBLIC)');
  const body = { key: env.chaveMestra, action, payload };

  const res = await fetch(webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Apps Script retornou nÃ£o-JSON. HTTP ${res.status}. Amostra: ${(text || '').slice(0, 300)}`);
  }
  if (!res.ok || !(json?.success ?? json?.ok)) {
    throw new Error(`Apps Script erro HTTP ${res.status}: ${json?.error || 'Erro desconhecido'}`);
  }
  return json;
}

function getSupabaseClient() {
  const url = must(env.supabaseUrl, 'SUPABASE_URL');
  const key = must(env.supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY)');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: env.supabaseSchema },
    global: { fetch },
  });
}

const isMissingRelationError = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find the table');
};

async function queryFirstExistingTable(supabase, candidates, buildQuery) {
  let lastErr = null;
  for (const table of candidates.filter(Boolean)) {
    const { data, error } = await buildQuery(table);
    if (error) {
      lastErr = error;
      if (isMissingRelationError(error)) continue;
      throw error;
    }
    return { table, data };
  }
  throw lastErr || new Error('Nenhuma tabela candidata encontrada no Supabase.');
}

async function fetchAllRows(supabase, candidates, { maxRows = 20000 } = {}) {
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);

  const { table } = await queryFirstExistingTable(supabase, candidates, async (t) => {
    return await supabase.from(t).select('*').range(0, Math.min(pageSize - 1, maxRows - 1));
  });

  const out = [];
  for (let p = 0; p < pages; p += 1) {
    const from = p * pageSize;
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    if (from > to) break;

    const { data, error } = await supabase.from(table).select('*').range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { table, rows: out };
}

function summarizeRequired(list, requiredFields, getField) {
  const issues = [];
  for (const f of requiredFields) {
    const missing = [];
    for (let i = 0; i < list.length; i += 1) {
      const val = getField(list[i], f);
      if (val === undefined || val === null || String(val).trim() === '') {
        missing.push(i);
        if (missing.length >= 20) break;
      }
    }
    if (missing.length) issues.push({ field: f, missingCount: missing.length, sampleIdx: missing.slice(0, 10) });
  }
  return issues;
}

function buildReportSection({ name, sheetCount, dbCount, countDelta, requiredIssues, typeIssues, dupes }) {
  return {
    name,
    counts: { sheets: sheetCount, supabase: dbCount, delta: countDelta },
    requiredFieldIssues: requiredIssues,
    typeIssues,
    duplicates: dupes,
    ok:
      countDelta === 0 &&
      requiredIssues.length === 0 &&
      typeIssues.length === 0 &&
      dupes.length === 0,
  };
}

function markdownSummary(report) {
  const lines = [];
  lines.push(`# US-018.3 — RelatÃ³rio de integridade (Sheets -> Supabase)`);
  lines.push('');
  lines.push(`Data: ${now.toISOString()}`);
  lines.push('');
  lines.push(`Supabase schema: \`${env.supabaseSchema}\``);
  lines.push('');

  const total = report.sections.length;
  const ok = report.sections.filter((s) => s.ok).length;
  lines.push(`Resumo: ${ok}/${total} entidades OK.`);
  lines.push('');

  for (const s of report.sections) {
    lines.push(`## ${s.name}`);
    lines.push(`- Contagem: Sheets=${s.counts.sheets} | Supabase=${s.counts.supabase} | Delta=${s.counts.delta}`);
    if (s.requiredFieldIssues.length) {
      lines.push(`- Campos obrigatÃ³rios faltando: ${s.requiredFieldIssues.map((x) => `${x.field}(${x.missingCount})`).join(', ')}`);
    }
    if (s.typeIssues.length) {
      lines.push(`- Tipos invÃ¡lidos: ${s.typeIssues.map((x) => `${x.field}(${x.badCount})`).join(', ')}`);
    }
    if (s.duplicates.length) {
      lines.push(`- Duplicidades: ${s.duplicates.map((x) => `${x.key}(${x.count})`).slice(0, 8).join(', ')}${s.duplicates.length > 8 ? '...' : ''}`);
    }
    if (!s.requiredFieldIssues.length && !s.typeIssues.length && !s.duplicates.length) {
      lines.push(`- OK`);
    }
    lines.push('');
  }

  lines.push('## Regra de tratamento (proposta)');
  lines.push('- Normalizar telefones para somente dÃ­gitos (comparação/dedup).');
  lines.push('- Datas: aceitar ISO ou BR (dd/mm/aaaa); fora disso -> marcar como invÃ¡lida e corrigir na origem.');
  lines.push('- Booleanos: aceitar {Sim/Não, true/false, 1/0, x}; fora disso -> marcar como invÃ¡lido.');
  lines.push('- Registros com campos obrigatÃ³rios vazios -> quarentena (tabela `*_invalid`) ou `status_validacao = \"INVALID\"`.');
  lines.push('- Duplicidades (mesma chave natural) -> manter 1 canÃ´nico (mais recente) e registrar conflito em log de auditoria.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const supabase = getSupabaseClient();

  const sections = [];
  const raw = { sheets: {}, supabase: {} };

  const entities = [
    {
      name: 'Members (Cadastro Oficial)',
      action: 'GET_MEMBERS',
      sheetExtract: (json) => (Array.isArray(json?.members) ? json.members : []),
      supabaseTables: [env.tMembers, 'cadastro_oficial', 'cadastro', 'members', 'membros', 'adolescentes'],
      required: ['nome', 'telefone'],
      key: (r) => normalizeDigits(r?.telefone),
      typeChecks: [
        { field: 'email', check: (v) => !toCleanString(v) || toCleanString(v).includes('@') },
        { field: 'nascimento', check: (v) => parseDateish(v).ok },
      ],
    },
    {
      name: 'NonEnrolled (NÃ£o Inscritos)',
      action: 'GET_NON_ENROLLED',
      sheetExtract: (json) => (Array.isArray(json?.nonEnrolled) ? json.nonEnrolled : []),
      supabaseTables: [env.tNonEnrolled, 'vw_non_enrolled', 'non_enrolled', 'nao_inscritos', 'nao_inscritos_raw'],
      required: ['nome', 'telefone', 'bairro'],
      key: (r) => normalizeDigits(r?.telefone),
      typeChecks: [
        { field: 'email', check: (v) => !toCleanString(v) || toCleanString(v).includes('@') },
        { field: 'dataCadastro', check: (v) => parseDateish(v).ok },
        { field: 'dataNascimento', check: (v) => parseDateish(v).ok },
        { field: 'interesseConfirmado', check: (v) => toBoolLike(v).ok },
        { field: 'jaFezEac', check: (v) => toBoolLike(v).ok },
        { field: 'contatoMudou', check: (v) => toBoolLike(v).ok },
      ],
    },
    {
      name: 'InscriÃ§Ãµes PrioritÃ¡rias',
      action: 'GET_INSCRICOES_PRIORITARIAS',
      sheetExtract: (json) =>
        Array.isArray(json?.inscricoesPrioritarias) ? json.inscricoesPrioritarias : (Array.isArray(json?.items) ? json.items : []),
      supabaseTables: [env.tPrioritarios, 'inscricoes_prioritarias', 'prioritarios', 'inscricoes_prioritarias_view'],
      required: ['nome', 'telefone', 'bairro'],
      key: (r) => normalizeDigits(r?.telefone),
      typeChecks: [
        { field: 'email', check: (v) => !toCleanString(v) || toCleanString(v).includes('@') },
        { field: 'dataCadastro', check: (v) => parseDateish(v).ok },
        { field: 'dataNascimento', check: (v) => parseDateish(v).ok },
      ],
    },
    {
      name: 'CÃ­rculos DistribuÃ­dos',
      action: 'GET_CIRCULOS_DISTRIBUIDOS',
      sheetExtract: (json) => {
        const circulos = json?.circulos || {};
        // flatten for validation
        const out = [];
        Object.keys(circulos).forEach((k) => {
          const list = Array.isArray(circulos[k]) ? circulos[k] : [];
          list.forEach((p) => out.push({ ...p, circulo: k }));
        });
        return out;
      },
      supabaseTables: [env.tCirculos, 'circulos_distribuidos', 'circulos', 'circles_distribution'],
      required: ['nome', 'circulo'],
      key: (r) => `${toCleanString(r?.circulo)}:${toCleanString(r?.nome).toLowerCase()}`,
      typeChecks: [
        { field: 'idade', check: (v) => !toCleanString(v) || Number.isFinite(Number(String(v).replace(',', '.'))) },
      ],
    },
    {
      name: 'PresenÃ§a (Controle de PresenÃ§a)',
      action: 'GET_PRESENCE',
      sheetExtract: (json) => (Array.isArray(json?.presence) ? json.presence : []),
      supabaseTables: [env.tPresence, 'controle_presenca', 'presence', 'presenca'],
      required: ['nome', 'telefone'],
      key: (r) => `${normalizeDigits(r?.telefone)}:${toCleanString(r?.timestamp)}`,
      typeChecks: [
        { field: 'timestamp', check: (v) => parseDateish(v).ok },
        { field: 'presente', check: (v) => typeof v === 'boolean' || toBoolLike(v).ok },
      ],
    },
    {
      name: 'Encontreiros',
      action: 'GET_ENCONTREIROS',
      sheetExtract: (json) => (Array.isArray(json?.encontreiros) ? json.encontreiros : []),
      supabaseTables: [env.tEncontreiros, 'encontreiros', 'cadastro_encontreiros'],
      required: ['nomeCompleto'],
      key: (r) => `${toCleanString(r?.nomeCompleto).toLowerCase()}:${normalizeDigits(r?.celularWhatsapp)}`,
      typeChecks: [
        { field: 'timestamp', check: (v) => parseDateish(v).ok },
        { field: 'email', check: (v) => !toCleanString(v) || toCleanString(v).includes('@') },
      ],
    },
    {
      name: 'Agenda (Eventos)',
      action: 'GET_EVENTS',
      sheetExtract: (json) => (Array.isArray(json?.events) ? json.events : []),
      supabaseTables: [env.tEvents, 'eventos', 'events', 'calendar_events'],
      required: ['atividade', 'inicio'],
      key: (r) => `${toCleanString(r?.atividade).toLowerCase()}:${toCleanString(r?.inicio)}`,
      typeChecks: [
        { field: 'inicio', check: (v) => parseDateish(v).ok },
        { field: 'termino', check: (v) => parseDateish(v).ok },
      ],
    },
    {
      name: 'Comunicados',
      action: 'GET_COMUNICADOS',
      sheetExtract: (json) => (Array.isArray(json?.comunicados) ? json.comunicados : []),
      supabaseTables: [env.tComunicados, 'comunicados', 'announcements', 'notificacoes'],
      required: ['titulo'],
      key: (r) => `${toCleanString(r?.titulo).toLowerCase()}:${toCleanString(r?.assunto).toLowerCase()}`,
      typeChecks: [
        { field: 'dataAgendada', check: (v) => parseDateish(v).ok },
      ],
    },
    {
      name: 'Logs (Auditoria)',
      action: 'GET_LOGS',
      sheetExtract: (json) => (Array.isArray(json?.logs) ? json.logs : []),
      supabaseTables: [env.tLogs, 'logs', 'audit_logs', 'dispatch_logs'],
      required: ['dispatchName', 'timestamp'],
      key: (r) => `${toCleanString(r?.dispatchName).toLowerCase()}:${toCleanString(r?.timestamp)}`,
      typeChecks: [
        { field: 'timestamp', check: (v) => parseDateish(v).ok },
        { field: 'duration', check: (v) => !toCleanString(v) || Number.isFinite(Number(v)) },
      ],
    },
  ];

  for (const ent of entities) {
    // Sheets
    const sheetJson = await callAppsScript(ent.action, {});
    const sheetRows = ent.sheetExtract(sheetJson);
    raw.sheets[ent.action] = { count: sheetRows.length };

    // Supabase
    const { table, rows: dbRows } = await fetchAllRows(supabase, ent.supabaseTables, { maxRows: 30000 });
    raw.supabase[ent.action] = { table, count: dbRows.length };

    // Compare (by count + structural checks)
    const sheetCount = sheetRows.length;
    const dbCount = dbRows.length;
    const countDelta = dbCount - sheetCount;

    const getField = (row, field) => row?.[field];

    const requiredIssuesSheets = summarizeRequired(sheetRows, ent.required, getField);
    const requiredIssuesDb = summarizeRequired(dbRows, ent.required, getField);
    const requiredIssues = [
      ...requiredIssuesSheets.map((x) => ({ ...x, source: 'sheets' })),
      ...requiredIssuesDb.map((x) => ({ ...x, source: 'supabase' })),
    ];

    const typeIssues = [];
    for (const tc of ent.typeChecks || []) {
      const badSheet = [];
      for (let i = 0; i < sheetRows.length; i += 1) {
        const v = getField(sheetRows[i], tc.field);
        if (!tc.check(v)) {
          badSheet.push(i);
          if (badSheet.length >= 20) break;
        }
      }
      const badDb = [];
      for (let i = 0; i < dbRows.length; i += 1) {
        const v = getField(dbRows[i], tc.field);
        if (!tc.check(v)) {
          badDb.push(i);
          if (badDb.length >= 20) break;
        }
      }
      if (badSheet.length || badDb.length) {
        typeIssues.push({
          field: tc.field,
          sheetsBadCount: badSheet.length,
          supabaseBadCount: badDb.length,
          sheetsSampleIdx: badSheet.slice(0, 10),
          supabaseSampleIdx: badDb.slice(0, 10),
          badCount: badSheet.length + badDb.length,
        });
      }
    }

    const sheetDupes = dupKeys(sheetRows, ent.key);
    const dbDupes = dupKeys(dbRows, ent.key);
    const dupes = [
      ...sheetDupes.slice(0, 50).map((d) => ({ ...d, source: 'sheets' })),
      ...dbDupes.slice(0, 50).map((d) => ({ ...d, source: 'supabase' })),
    ];

    sections.push(
      buildReportSection({
        name: `${ent.name} [action:${ent.action}]`,
        sheetCount,
        dbCount,
        countDelta,
        requiredIssues,
        typeIssues,
        dupes,
      })
    );
  }

  const report = {
    generatedAt: now.toISOString(),
    env: {
      supabaseSchema: env.supabaseSchema,
      googleWebAppUrlConfigured: Boolean(env.googleWebAppUrl),
      supabaseConfigured: Boolean(env.supabaseUrl && env.supabaseKey),
    },
    raw,
    sections,
  };

  const reportsDir = path.join(repoRoot, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `US-018.3-sync-report-${isoStamp}.json`);
  const mdPath = path.join(reportsDir, `US-018.3-sync-report-${isoStamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, markdownSummary(report), 'utf8');

  // console summary
  const okCount = sections.filter((s) => s.ok).length;
  console.log(`[US-018.3] RelatÃ³rio gerado:`);
  console.log(`- JSON: ${path.relative(repoRoot, jsonPath)}`);
  console.log(`- MD:   ${path.relative(repoRoot, mdPath)}`);
  console.log(`- OK:   ${okCount}/${sections.length}`);

  if (okCount !== sections.length) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[US-018.3] Falha:', e);
  process.exitCode = 1;
});

