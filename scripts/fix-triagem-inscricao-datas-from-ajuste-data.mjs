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

const inputPath = process.argv[2] || path.join(__dirname, '../documento projeto/carga inicial/eac_base_trabalho_ajuste_data.csv');
const ENCONTRO_NOME = String(process.env.EAC_TRIAGEM_ENCONTRO_NOME || 'EAC - A DEFINIR').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'fix-triagem-inscricao-datas-from-ajuste-data' } },
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
    .slice(1)
    .map((line, index) => {
      const values = parseCsvLine(line);
      return {
        rowNumber: index + 2,
        timestamp: String(values[0] || '').trim(),
        nomeCompleto: String(values[1] || '').trim(),
      };
    });
}

function parseLocalTimestampToIsoUtc(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh, mi, ss] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

async function maybeSingle(query) {
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function main() {
  const csvText = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(csvText);

  const firstByName = new Map();
  const duplicateNames = new Map();

  for (const row of rows) {
    const key = normalizeName(row.nomeCompleto);
    if (!key) continue;
    duplicateNames.set(key, (duplicateNames.get(key) || 0) + 1);
    if (!firstByName.has(key)) firstByName.set(key, row);
  }

  const encontro = await maybeSingle(
    supabase
      .from('encontros')
      .select('id,nome')
      .eq('nome', ENCONTRO_NOME),
  );

  if (!encontro?.id) {
    throw new Error(`Encontro nao encontrado: ${ENCONTRO_NOME}`);
  }

  const { data: inscricoes, error: inscricoesError } = await supabase
    .from('inscricoes')
    .select('id,adolescente_id,data_inscricao,encontro_id')
    .eq('encontro_id', encontro.id);
  if (inscricoesError) throw inscricoesError;

  const adolescenteIds = (inscricoes || []).map((row) => row.adolescente_id).filter(Boolean);
  const { data: adolescentes, error: adolescentesError } = adolescenteIds.length
    ? await supabase.from('adolescentes').select('id,pessoa_id').in('id', adolescenteIds)
    : { data: [], error: null };
  if (adolescentesError) throw adolescentesError;

  const pessoaIds = (adolescentes || []).map((row) => row.pessoa_id).filter(Boolean);
  const { data: pessoas, error: pessoasError } = pessoaIds.length
    ? await supabase.from('pessoas').select('id,nome_completo').in('id', pessoaIds)
    : { data: [], error: null };
  if (pessoasError) throw pessoasError;

  const pessoaById = new Map((pessoas || []).map((row) => [String(row.id), row]));
  const pessoaByAdolescenteId = new Map(
    (adolescentes || []).map((row) => [String(row.id), pessoaById.get(String(row.pessoa_id))]),
  );

  let updated = 0;
  let unchanged = 0;
  const missing = [];
  const usedDuplicates = [];

  for (const inscricao of inscricoes || []) {
    const pessoa = pessoaByAdolescenteId.get(String(inscricao.adolescente_id));
    const nomeCompleto = String(pessoa?.nome_completo || '').trim();
    const key = normalizeName(nomeCompleto);
    const source = firstByName.get(key);

    if (!source) {
      missing.push(nomeCompleto);
      continue;
    }

    const dataInscricao = parseLocalTimestampToIsoUtc(source.timestamp);
    if (!dataInscricao) {
      missing.push(nomeCompleto);
      continue;
    }

    if ((duplicateNames.get(key) || 0) > 1) {
      usedDuplicates.push({
        nomeCompleto,
        rowNumber: source.rowNumber,
        timestamp: source.timestamp,
        ocorrencias: duplicateNames.get(key),
      });
    }

    const current = String(inscricao.data_inscricao || '');
    const currentTime = current ? new Date(current).getTime() : null;
    const nextTime = new Date(dataInscricao).getTime();

    if (currentTime === nextTime) {
      unchanged += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from('inscricoes')
      .update({
        data_inscricao: dataInscricao,
        ultima_sincronizacao: new Date().toISOString(),
      })
      .eq('id', inscricao.id);
    if (updateError) throw updateError;

    updated += 1;
  }

  console.log(JSON.stringify({
    encontro,
    inputPath,
    sourceRows: rows.length,
    uniqueNames: firstByName.size,
    triagemRows: (inscricoes || []).length,
    updated,
    unchanged,
    missingCount: missing.length,
    missing: missing.slice(0, 20),
    duplicateNamesCount: usedDuplicates.length,
    duplicateNamesSample: usedDuplicates.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
