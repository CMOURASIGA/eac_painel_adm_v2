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

const defaultInputPath = path.join(__dirname, '../documento projeto/carga inicial/Respostas - Encontreiros.csv');
const inputPath = process.argv[2] || defaultInputPath;
const reportPath = process.argv[3] || path.join(__dirname, '../documento projeto/carga inicial/preview-import-encontreiros.json');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'preview-import-encontreiros-csv' } },
});

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return cleanText(value)
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
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  let buffer = '';
  let inQuotes = false;

  for (const line of lines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) inQuotes = !inQuotes;
    if (!inQuotes) {
      if (buffer.trim()) rows.push(buffer);
      buffer = '';
    }
  }

  if (rows.length === 0) return [];

  const headers = parseCsvLine(rows[0]);
  return rows.slice(1).map((row, index) => {
    const cols = parseCsvLine(row);
    const out = { __line: index + 2 };
    headers.forEach((header, i) => {
      out[header] = cols[i] ?? '';
    });
    return out;
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

function pushMapList(map, key, item) {
  if (!key) return;
  const list = map.get(key) || [];
  list.push(item);
  map.set(key, list);
}

function dedupeById(items, idField = 'id') {
  return Array.from(new Map((items || []).map((item) => [String(item?.[idField] || ''), item])).values())
    .filter((item) => String(item?.[idField] || '').trim());
}

function isMinor(ageRaw) {
  const age = Number(String(ageRaw || '').trim());
  return Number.isFinite(age) ? age < 18 : null;
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo nao encontrado: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf8');
  const csvRows = parseCsv(content);

  const [vwEncontreiros, pessoas, adolescentes, pessoaPapeis] = await Promise.all([
    fetchAll('vw_encontreiros', 'encontreiro_id,pessoa_id,nome_completo,nome_normalizado,telefone,telefone_normalizado,email,classificacao'),
    fetchAll('pessoas', 'id,nome_completo,nome_normalizado,telefone,telefone_normalizado,email,data_nascimento,bairro,idade_calculada'),
    fetchAll('adolescentes', 'id,pessoa_id'),
    fetchAll('pessoa_papeis', 'pessoa_id,papel,ativo'),
  ]);

  const adolescenteByPessoaId = new Map(adolescentes.map((row) => [String(row.pessoa_id || '').trim(), row]));
  const papeisByPessoaId = new Map();
  for (const row of pessoaPapeis) {
    const pessoaId = String(row.pessoa_id || '').trim();
    if (!pessoaId) continue;
    const set = papeisByPessoaId.get(pessoaId) || new Set();
    if (row.ativo !== false) set.add(String(row.papel || '').trim().toUpperCase());
    papeisByPessoaId.set(pessoaId, set);
  }

  const encontreiroByPhone = new Map();
  const encontreiroByName = new Map();
  for (const row of vwEncontreiros) {
    const normalized = {
      ...row,
      pessoa_id: String(row.pessoa_id || '').trim(),
      encontreiro_id: String(row.encontreiro_id || '').trim(),
    };
    [
      normalizePhone(row.telefone_normalizado),
      normalizePhone(row.telefone),
      digitsOnly(row.telefone_normalizado),
      digitsOnly(row.telefone),
    ].filter(Boolean).forEach((key) => {
      if (!encontreiroByPhone.has(key)) encontreiroByPhone.set(key, normalized);
    });
    const nameKey = normalizeName(row.nome_normalizado || row.nome_completo);
    if (nameKey && !encontreiroByName.has(nameKey)) encontreiroByName.set(nameKey, normalized);
  }

  const pessoasByPhone = new Map();
  const pessoasByName = new Map();
  for (const row of pessoas) {
    const normalized = { ...row, id: String(row.id || '').trim() };
    [
      normalizePhone(row.telefone_normalizado),
      normalizePhone(row.telefone),
      digitsOnly(row.telefone_normalizado),
      digitsOnly(row.telefone),
    ].filter(Boolean).forEach((key) => pushMapList(pessoasByPhone, key, normalized));
    pushMapList(pessoasByName, normalizeName(row.nome_normalizado || row.nome_completo), normalized);
  }

  const csvPhoneOwners = new Map();
  const csvEmailOwners = new Map();
  const csvIdentitySeen = new Map();

  for (const row of csvRows) {
    const name = cleanText(row['Nome completo']);
    const phone = normalizePhone(row['Celular / WhatsApp']);
    const email = cleanText(row['E-mail']).toLowerCase();
    const nameKey = normalizeName(name);
    const identityKey = `${nameKey}|${phone || email || String(row.__line)}`;
    pushMapList(csvPhoneOwners, phone, { line: row.__line, name });
    pushMapList(csvEmailOwners, email, { line: row.__line, name });
    pushMapList(csvIdentitySeen, identityKey, row.__line);
  }

  const stats = {
    csvRows: csvRows.length,
    existingEncontreiros: vwEncontreiros.length,
    uniqueCandidates: 0,
    duplicateRowsInCsv: 0,
    alreadyExists: 0,
    newSafeCreatePessoa: 0,
    newSafeReusePessoa: 0,
    conflicts: 0,
    minors: 0,
    adults: 0,
  };

  const report = {
    inputPath,
    generatedAt: new Date().toISOString(),
    stats,
    alreadyExists: [],
    newSafe: [],
    conflicts: [],
    duplicateRows: [],
  };

  const seenIdentity = new Set();

  for (const row of csvRows) {
    const nome = cleanText(row['Nome completo']);
    const email = cleanText(row['E-mail']).toLowerCase();
    const telefone = normalizePhone(row['Celular / WhatsApp']);
    const telefoneDigits = digitsOnly(row['Celular / WhatsApp']);
    const nascimento = cleanText(row['Data de nascimento']);
    const idade = cleanText(row.Idade);
    const bairro = cleanText(row['Bairro onde mora']);
    const classificacao = cleanText(row.Classificação || row['ClassificaÃ§Ã£o']);
    const nameKey = normalizeName(nome);
    const identityKey = `${nameKey}|${telefone || email || String(row.__line)}`;
    const phoneOwners = (csvPhoneOwners.get(telefone) || []).filter((item) => normalizeName(item.name) !== nameKey);
    const emailOwners = (csvEmailOwners.get(email) || []).filter((item) => normalizeName(item.name) !== nameKey);

    const baseEntry = {
      line: row.__line,
      nome,
      email,
      telefone,
      nascimento,
      idade,
      bairro,
      classificacao,
      minor: isMinor(idade),
    };

    if (baseEntry.minor === true) stats.minors += 1;
    if (baseEntry.minor === false) stats.adults += 1;

    const duplicateLines = csvIdentitySeen.get(identityKey) || [];
    if (seenIdentity.has(identityKey)) {
      stats.duplicateRowsInCsv += 1;
      report.duplicateRows.push({
        ...baseEntry,
        reason: 'CSV_DUPLICATE_SAME_IDENTITY',
        canonicalLine: duplicateLines[0] || null,
        duplicateLines,
      });
      continue;
    }
    seenIdentity.add(identityKey);
    stats.uniqueCandidates += 1;

    const existingByPhone = telefone ? encontreiroByPhone.get(telefone) || encontreiroByPhone.get(telefoneDigits) : null;
    const existingByName = nameKey ? encontreiroByName.get(nameKey) : null;

    if (existingByPhone || existingByName) {
      const existing = existingByPhone || existingByName;
      stats.alreadyExists += 1;
      report.alreadyExists.push({
        ...baseEntry,
        reason: existingByPhone ? 'ALREADY_EXISTS_ENCONTREIRO_PHONE' : 'ALREADY_EXISTS_ENCONTREIRO_NAME',
        encontroeiroId: existing.encontreiro_id,
        pessoaId: existing.pessoa_id,
        existingNome: existing.nome_completo,
        existingTelefone: existing.telefone_normalizado || existing.telefone || '',
        existingClassificacao: existing.classificacao || '',
      });
      continue;
    }

    const peopleByPhone = dedupeById([
      ...(telefone ? (pessoasByPhone.get(telefone) || []) : []),
      ...(telefoneDigits ? (pessoasByPhone.get(telefoneDigits) || []) : []),
    ]);
    const peopleByName = dedupeById(pessoasByName.get(nameKey) || []);

    const phonePerson = peopleByPhone.length === 1 ? peopleByPhone[0] : null;
    const namePerson = peopleByName.length === 1 ? peopleByName[0] : null;

    if (phoneOwners.length > 0) {
      stats.conflicts += 1;
      report.conflicts.push({
        ...baseEntry,
        reason: 'CSV_SHARED_PHONE_DIFFERENT_NAMES',
        conflictingCsvRows: phoneOwners,
        matchedPessoasByPhone: peopleByPhone.map((p) => ({ pessoaId: p.id, nome: p.nome_completo })),
      });
      continue;
    }

    if (email && emailOwners.length > 0) {
      stats.conflicts += 1;
      report.conflicts.push({
        ...baseEntry,
        reason: 'CSV_SHARED_EMAIL_DIFFERENT_NAMES',
        conflictingCsvRows: emailOwners,
        matchedPessoasByEmail: [],
      });
      continue;
    }

    if (peopleByPhone.length > 1) {
      stats.conflicts += 1;
      report.conflicts.push({
        ...baseEntry,
        reason: 'BASE_PHONE_MATCH_MULTIPLE_PESSOAS',
        matchedPessoasByPhone: peopleByPhone.map((p) => ({ pessoaId: p.id, nome: p.nome_completo, telefone: p.telefone_normalizado || p.telefone || '' })),
      });
      continue;
    }

    if (peopleByName.length > 1) {
      stats.conflicts += 1;
      report.conflicts.push({
        ...baseEntry,
        reason: 'BASE_NAME_MATCH_MULTIPLE_PESSOAS',
        matchedPessoasByName: peopleByName.map((p) => ({ pessoaId: p.id, nome: p.nome_completo, telefone: p.telefone_normalizado || p.telefone || '' })),
      });
      continue;
    }

    if (phonePerson && namePerson && phonePerson.id !== namePerson.id) {
      stats.conflicts += 1;
      report.conflicts.push({
        ...baseEntry,
        reason: 'BASE_PHONE_AND_NAME_POINT_TO_DIFFERENT_PESSOAS',
        pessoaByPhone: { pessoaId: phonePerson.id, nome: phonePerson.nome_completo },
        pessoaByName: { pessoaId: namePerson.id, nome: namePerson.nome_completo },
      });
      continue;
    }

    const matchedPessoa = phonePerson || namePerson || null;
    if (matchedPessoa) {
      stats.newSafeReusePessoa += 1;
      const pessoaId = String(matchedPessoa.id || '').trim();
      const adolescente = adolescenteByPessoaId.get(pessoaId) || null;
      const papeis = Array.from(papeisByPessoaId.get(pessoaId) || []);
      report.newSafe.push({
        ...baseEntry,
        reason: phonePerson ? 'SAFE_REUSE_PESSOA_PHONE' : 'SAFE_REUSE_PESSOA_NAME',
        pessoaId,
        adolescenteId: adolescente?.id || null,
        papeisAtivos: papeis,
        pessoaNome: matchedPessoa.nome_completo,
        pessoaTelefone: matchedPessoa.telefone_normalizado || matchedPessoa.telefone || '',
        acaoSugerida: 'REAPROVEITAR_PESSOA_E_CRIAR_ENCONTREIRO_SE_NAO_EXISTIR',
      });
      continue;
    }

    stats.newSafeCreatePessoa += 1;
    report.newSafe.push({
      ...baseEntry,
      reason: 'SAFE_CREATE_PESSOA_AND_ENCONTREIRO',
      pessoaId: null,
      adolescenteId: null,
      papeisAtivos: [],
      acaoSugerida: 'CRIAR_PESSOA_GARANTIR_PAPEL_ENCONTREIRO_E_CRIAR_ENCONTREIRO',
    });
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    success: true,
    reportPath,
    stats,
    samples: {
      alreadyExists: report.alreadyExists.slice(0, 8),
      newSafe: report.newSafe.slice(0, 8),
      conflicts: report.conflicts.slice(0, 8),
      duplicateRows: report.duplicateRows.slice(0, 8),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
