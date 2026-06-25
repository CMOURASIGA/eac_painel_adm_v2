#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config();

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados.');
  process.exit(1);
}

const inputPath = process.argv[2] || path.join(__dirname, '../documento projeto/carga inicial/Lista de Presença (respostas) - Página3.csv');
const dryRun = !process.argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'import-lista-presenca-csv' } },
});

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .toLowerCase();
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizePhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 8 || digits.length === 9) return `5521${digits}`;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function parseBrDateTime(value) {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const hour = Number(match[4] || 12);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  const dt = new Date(year, month, day, hour, minute, second, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((item) => item.replace(/^\uFEFF/, ''));
}

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = cols[i] ?? '';
    });
    row.__line = index + 2;
    return row;
  });
}

async function fetchAll(table, select, maxRows = 50000) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

async function maybeFirstExistingTable(candidates, select = '*') {
  for (const table of candidates.filter(Boolean)) {
    const probe = await supabase.from(table).select(select).limit(1);
    if (!probe.error) return table;
  }
  return null;
}

async function loadReferenceData() {
  const pessoas = await fetchAll('pessoas', 'id,nome_completo,nome_normalizado,telefone,telefone_normalizado');
  const adolescentes = await fetchAll('adolescentes', 'id,pessoa_id');
  const circlesTable = await maybeFirstExistingTable(['circulos'], 'id,nome');
  const circulos = circlesTable ? await fetchAll(circlesTable, 'id,nome') : [];
  const existingPresence = await fetchAll('presencas', 'id,data_presenca,telefone_normalizado,nome_digitado,nome,payload', 100000);

  const adolescenteByPessoaId = new Map(adolescentes.map((row) => [String(row.pessoa_id || '').trim(), String(row.id || '').trim()]));
  const pessoaByPhone = new Map();
  const pessoasByName = new Map();

  for (const pessoa of pessoas) {
    const id = String(pessoa.id || '').trim();
    if (!id) continue;
    const phoneKeys = [
      normalizePhone(pessoa.telefone_normalizado),
      normalizePhone(pessoa.telefone),
      digitsOnly(pessoa.telefone_normalizado),
      digitsOnly(pessoa.telefone),
    ].filter(Boolean);
    phoneKeys.forEach((key) => {
      if (!pessoaByPhone.has(key)) pessoaByPhone.set(key, pessoa);
    });

    const nameKey = normalizeName(pessoa.nome_normalizado || pessoa.nome_completo);
    if (!nameKey) continue;
    const bucket = pessoasByName.get(nameKey) || [];
    bucket.push(pessoa);
    pessoasByName.set(nameKey, bucket);
  }

  const circuloByName = new Map();
  circulos.forEach((row) => {
    const key = normalizeName(row.nome);
    if (key && !circuloByName.has(key)) circuloByName.set(key, String(row.id || '').trim());
  });

  const existingByKey = new Set();
  existingPresence.forEach((row) => {
    const rawDate = row.data_presenca ? new Date(row.data_presenca) : null;
    if (!rawDate || Number.isNaN(rawDate.getTime())) return;
    const day = isoDay(rawDate);
    const phone = normalizePhone(row.telefone_normalizado);
    const name = normalizeName(row.nome_digitado || row.nome);
    if (phone) existingByKey.add(`phone:${phone}|${day}`);
    if (name) existingByKey.add(`name:${name}|${day}`);
  });

  return {
    adolescenteByPessoaId,
    pessoaByPhone,
    pessoasByName,
    circuloByName,
    existingByKey,
  };
}

function findPessoaMatch(row, refs) {
  const phoneNorm = normalizePhone(row.Telefone);
  const phoneDigits = digitsOnly(row.Telefone);
  const nameNorm = normalizeName(row['Nome completo']);

  const phoneCandidates = [phoneNorm, phoneDigits].filter(Boolean);
  for (const key of phoneCandidates) {
    const pessoa = refs.pessoaByPhone.get(key);
    if (pessoa) {
      return { pessoa, matchType: 'PHONE' };
    }
  }

  const named = refs.pessoasByName.get(nameNorm) || [];
  if (named.length === 1) {
    return { pessoa: named[0], matchType: 'NAME_EXACT' };
  }

  if (named.length > 1 && phoneNorm) {
    const byTail = named.find((pessoa) => normalizePhone(pessoa.telefone_normalizado || pessoa.telefone) === phoneNorm);
    if (byTail) return { pessoa: byTail, matchType: 'NAME_PHONE' };
  }

  return { pessoa: null, matchType: 'PENDING' };
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo nao encontrado: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(content);
  const refs = await loadReferenceData();

  const stats = {
    total: rows.length,
    prepared: 0,
    imported: 0,
    skippedExisting: 0,
    matchedPhone: 0,
    matchedNameExact: 0,
    matchedNamePhone: 0,
    pending: 0,
    withCircle: 0,
    errors: 0,
  };

  const prepared = [];
  const samples = [];

  for (const row of rows) {
    const nome = normalizeText(row['Nome completo']);
    const telefoneInformado = normalizeText(row.Telefone);
    const circulo = normalizeText(row.Circulo);
    const dt = parseBrDateTime(row['Carimbo de data/hora']);
    if (!nome || !dt) {
      stats.errors += 1;
      continue;
    }

    const day = isoDay(dt);
    const { pessoa, matchType } = findPessoaMatch(row, refs);
    const phoneNorm = normalizePhone(telefoneInformado);
    const nameNorm = normalizeName(nome);

    if ((phoneNorm && refs.existingByKey.has(`phone:${phoneNorm}|${day}`)) || refs.existingByKey.has(`name:${nameNorm}|${day}`)) {
      stats.skippedExisting += 1;
      continue;
    }

    if (matchType === 'PHONE') stats.matchedPhone += 1;
    else if (matchType === 'NAME_EXACT') stats.matchedNameExact += 1;
    else if (matchType === 'NAME_PHONE') stats.matchedNamePhone += 1;
    else stats.pending += 1;

    const pessoaId = pessoa?.id ? String(pessoa.id) : null;
    const adolescenteId = pessoaId ? (refs.adolescenteByPessoaId.get(pessoaId) || null) : null;
    const circleId = refs.circuloByName.get(normalizeName(circulo)) || null;
    if (circleId) stats.withCircle += 1;

    const payload = {
      pessoa_id: pessoaId,
      adolescente_id: adolescenteId,
      encontro_id: null,
      circulo_id: circleId,
      data_presenca: dt.toISOString(),
      mes: dt.getMonth() + 1,
      telefone_digitado: telefoneInformado,
      telefone_normalizado: phoneNorm || digitsOnly(telefoneInformado) || null,
      nome_digitado: nome,
      status_conciliacao: pessoaId ? 'CONCILIADO' : 'PENDENTE',
      origem: 'IMPORT_LISTA_PRESENCA_CSV',
      circulo_informado: circulo || null,
      status_presenca: 'REGISTRADA',
      criado_via_sistema: true,
      payload: {
        canal: 'IMPORT_LISTA_PRESENCA_CSV',
        matchType,
        csvLine: row.__line,
        csvTimestamp: row['Carimbo de data/hora'],
      },
    };

    prepared.push(payload);
    stats.prepared += 1;

    if (samples.length < 12) {
      samples.push({
        line: row.__line,
        nome,
        telefone: telefoneInformado,
        circulo,
        matchType,
        pessoa_id: pessoaId,
        adolescente_id: adolescenteId,
      });
    }
  }

  if (!dryRun && prepared.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < prepared.length; i += chunkSize) {
      const chunk = prepared.slice(i, i + chunkSize);
      const { error } = await supabase.from('presencas').insert(chunk);
      if (error) throw error;
      stats.imported += chunk.length;
    }
  }

  console.log(JSON.stringify({
    success: true,
    dryRun,
    inputPath,
    stats,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
