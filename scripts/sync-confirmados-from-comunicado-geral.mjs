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
const CURRENT_YEAR = Number(process.env.EAC_IMPORT_CURRENT_YEAR || 2026) || 2026;
const inputPath = process.argv[2] || path.join(__dirname, '../documento projeto/carga inicial/Comunicado Geral - Cadastro Oficial (3).csv');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'sync-confirmados-from-comunicado-geral' } },
});

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseCsvLine(line) {
  const values = [];
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
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvLine);
}

function parseFlexibleDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brDate) return `${brDate[3]}-${brDate[2].padStart(2, '0')}-${brDate[1].padStart(2, '0')}`;

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function computeAge(birthDateIso) {
  const year = Number(String(birthDateIso || '').slice(0, 4));
  if (!year) return null;
  return CURRENT_YEAR - year;
}

async function fetchAll(table, select, filterFn) {
  let query = supabase.from(table).select(select);
  if (filterFn) query = filterFn(query);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function main() {
  const csvRows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
  const headers = csvRows[0] || [];
  const dataRows = csvRows.slice(1);

  const nameIndex = headers.findIndex((h) => String(h).trim() === 'Nome completo');
  const birthIndex = headers.findIndex((h) => String(h).trim().startsWith('Data de nascimento'));
  const sexoIndex = headers.findIndex((h) => String(h).trim() === 'Sexo');

  if (nameIndex < 0 || birthIndex < 0 || sexoIndex < 0) {
    throw new Error('Colunas esperadas nao encontradas no CSV de comunicado geral.');
  }

  const firstByName = new Map();
  const duplicateCounts = new Map();

  dataRows.forEach((row, idx) => {
    const nome = String(row[nameIndex] || '').trim();
    const key = normalizeName(nome);
    if (!key) return;
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
    if (!firstByName.has(key)) {
      firstByName.set(key, {
        rowNumber: idx + 2,
        nomeCompleto: nome,
        dataNascimento: parseFlexibleDate(row[birthIndex]),
        sexo: String(row[sexoIndex] || '').trim(),
      });
    }
  });

  const cadastroRows = await fetchAll('cadastro_oficial', '*', (q) => q.eq('ativo', true));
  const pessoaIds = Array.from(new Set(cadastroRows.map((row) => String(row.pessoa_id || '').trim()).filter(Boolean)));
  const pessoas = pessoaIds.length
    ? await fetchAll('pessoas', 'id,nome_completo,data_nascimento,idade_calculada,sexo', (q) => q.in('id', pessoaIds))
    : [];

  let updated = 0;
  let unchanged = 0;
  const missing = [];
  const duplicates = [];

  for (const pessoa of pessoas) {
    const key = normalizeName(pessoa.nome_completo);
    const source = firstByName.get(key);
    if (!source) {
      missing.push(pessoa.nome_completo);
      continue;
    }

    if ((duplicateCounts.get(key) || 0) > 1) {
      duplicates.push({
        nomeCompleto: pessoa.nome_completo,
        ocorrencias: duplicateCounts.get(key),
        rowNumber: source.rowNumber,
      });
    }

    const nextBirthDate = source.dataNascimento || null;
    const nextSexo = source.sexo || null;
    const nextAge = nextBirthDate ? computeAge(nextBirthDate) : null;

    const currentBirthDate = String(pessoa.data_nascimento || '').trim() || null;
    const currentSexo = String(pessoa.sexo || '').trim() || null;
    const currentAge = Number.isFinite(Number(pessoa.idade_calculada)) ? Number(pessoa.idade_calculada) : null;

    if (currentBirthDate === nextBirthDate && currentSexo === nextSexo && currentAge === nextAge) {
      unchanged += 1;
      continue;
    }

    const nowIso = new Date().toISOString();
    const payload = {
      data_nascimento: nextBirthDate,
      sexo: nextSexo,
      idade_calculada: nextAge,
      atualizado_em: nowIso,
      ultima_sincronizacao: nowIso,
    };

    const { error } = await supabase.from('pessoas').update(payload).eq('id', pessoa.id);
    if (error) throw error;
    updated += 1;
  }

  console.log(JSON.stringify({
    inputPath,
    currentYear: CURRENT_YEAR,
    sourceRows: dataRows.length,
    uniqueNames: firstByName.size,
    cadastroOficialAtivo: cadastroRows.length,
    updated,
    unchanged,
    missingCount: missing.length,
    missing: missing.slice(0, 20),
    duplicateNamesCount: duplicates.length,
    duplicateNamesSample: duplicates.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
