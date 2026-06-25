#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config();

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

const jsonPath = process.argv[2];
const encontroId = process.argv[3];

if (!jsonPath || !encontroId) {
  console.error('Uso: node scripts/load-cadastro-oficial-staging.mjs <arquivo-json> <encontro-id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'load-cadastro-oficial-staging' } },
});

const SPREADSHEET_ID_CADASTRO = '13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk';
const SPREADSHEET_NAME_CADASTRO = 'Comunicado Geral.xlsx';

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function sanitizeRow(row) {
  const next = { ...row };
  const childEmail = normalizeEmail(next['E-mail']);
  const parentEmail = normalizeEmail(next['E-mail do responsável']);
  const childPhone = digitsOnly(next['Telefone de contato']);
  const parentPhone = digitsOnly(next['Telefone do responsável']);

  if (childEmail && parentEmail && childEmail === parentEmail) {
    next['E-mail'] = '';
  }

  if (childPhone && parentPhone && childPhone === parentPhone) {
    next['Telefone de contato'] = '';
  }

  return next;
}

async function main() {
  const raw = fs.readFileSync(path.resolve(jsonPath), 'utf8').replace(/^\uFEFF/, '');
  const rows = JSON.parse(raw);
  const importacaoId = randomUUID();
  const nowIso = new Date().toISOString();

  const { error: importError } = await supabase.from('importacoes_planilha').insert({
    id: importacaoId,
    nome: `${SPREADSHEET_NAME_CADASTRO} - Cadastro Oficial`,
    spreadsheet_id: SPREADSHEET_ID_CADASTRO,
    aba: 'Cadastro Oficial',
    tipo_importacao: 'FULL',
    status: 'PENDENTE',
    total_linhas: Array.isArray(rows) ? rows.length : 0,
    total_importadas: Array.isArray(rows) ? rows.length : 0,
    total_ignoradas: 0,
    total_erros: 0,
    mensagem_erro: null,
    iniciado_em: nowIso,
  });
  if (importError) throw importError;

  const stagingRows = (Array.isArray(rows) ? rows : []).map((row, idx) => {
    const payload = sanitizeRow(row);
    return ({
    id: randomUUID(),
    importacao_id: importacaoId,
    spreadsheet_id: SPREADSHEET_ID_CADASTRO,
    nome_aba: 'Cadastro Oficial',
    numero_linha: Number(payload.__rowNumber || idx + 2),
    hash_linha: createHash('sha256')
      .update(JSON.stringify({ nomeAba: 'Cadastro Oficial', numeroLinha: Number(payload.__rowNumber || idx + 2), payload }))
      .digest('hex'),
    payload,
    status_processamento: 'PENDENTE',
    entidade_destino: null,
    entidade_destino_id: null,
    mensagem_erro: null,
  })});

  for (const batch of chunk(stagingRows, 100)) {
    const { error } = await supabase.from('staging_planilha_linhas').insert(batch);
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc('fn_processar_staging_cadastro_oficial', {
    p_encontro_id_antes_corte: encontroId,
    p_encontro_id_apos_corte: null,
    p_numero_linha_corte: null,
    p_importacao_id: importacaoId,
    p_nome_aba: 'Cadastro Oficial',
  });

  if (error) throw error;

  const { error: patchError } = await supabase
    .from('importacoes_planilha')
    .update({
      status: 'CONCLUIDA',
      total_linhas: stagingRows.length,
      total_importadas: stagingRows.length,
      total_ignoradas: 0,
      total_erros: 0,
      mensagem_erro: null,
      finalizado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', importacaoId);
  if (patchError) throw patchError;

  console.log(JSON.stringify({ importacaoId, result: data }, null, 2));
}

main().catch((error) => {
  console.error('[load-cadastro-oficial-staging] erro fatal:', error?.message || error);
  process.exit(1);
});
