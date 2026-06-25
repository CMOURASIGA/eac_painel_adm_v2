#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

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
const currentYear = Number(process.argv[4] || '2026');

if (!jsonPath || !encontroId) {
  console.error('Uso: node scripts/repair-cadastro-oficial-relations.mjs <arquivo-json> <encontro-id> [ano]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'repair-cadastro-oficial-relations' } },
});

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeEmail(value) {
  const raw = normalizeText(value).toLowerCase();
  return raw || null;
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizePhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function parseDateFlexible(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function buildObservacoes(row) {
  const parts = [
    normalizeText(row['Sexo']),
    normalizeText(row['Endereço completo']),
    normalizeText(row['Há quanto tempo participa da nossa paróquia?']),
    normalizeText(row['Participa de algum grupo ou ministério? Qual?']),
    normalizeText(row['O que te motivou a participar do EAC?']),
    normalizeText(row['Quais suas expectativas para o encontro?']),
    normalizeText(row['Pertence à Porciúncula?']),
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

async function maybeSingle(query) {
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function findOrCreatePessoaResponsavel(row, adolescentePessoaId) {
  const nome = normalizeText(row['Nome do responsável']) || `Responsável de ${normalizeText(row['Nome completo'])}`;
  const nomeNorm = normalizeName(nome);
  const email = normalizeEmail(row['E-mail do responsável']);
  const telefone = normalizeText(row['Telefone do responsável']);
  const telefoneNorm = normalizePhone(telefone);

  const candidates = [];
  if (nomeNorm && email) {
    const found = await maybeSingle(
      supabase.from('pessoas').select('id').eq('nome_normalizado', nomeNorm).eq('email_normalizado', email),
    );
    if (found?.id && found.id !== adolescentePessoaId) candidates.push(found.id);
  }
  if (nomeNorm && telefoneNorm) {
    const found = await maybeSingle(
      supabase.from('pessoas').select('id').eq('nome_normalizado', nomeNorm).eq('telefone_normalizado', telefoneNorm),
    );
    if (found?.id && found.id !== adolescentePessoaId) candidates.push(found.id);
  }
  if (nomeNorm) {
    const found = await maybeSingle(
      supabase.from('pessoas').select('id').eq('nome_normalizado', nomeNorm).is('data_nascimento', null),
    );
    if (found?.id && found.id !== adolescentePessoaId) candidates.push(found.id);
  }

  const existingId = candidates[0] || null;
  const body = {
    nome_completo: nome,
    nome_normalizado: nomeNorm,
    email,
    email_normalizado: email,
    telefone,
    telefone_normalizado: telefoneNorm,
    origem_dado: 'PLANILHA',
    criado_via_sistema: false,
    data_importacao: new Date().toISOString(),
    ultima_sincronizacao: new Date().toISOString(),
  };

  if (existingId) {
    const { error } = await supabase.from('pessoas').update(body).eq('id', existingId);
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await supabase.from('pessoas').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function upsertResponsavelForAdolescente(adolescenteId, pessoaResponsavelId, row) {
  const nome = normalizeText(row['Nome do responsável']) || `Responsável de ${normalizeText(row['Nome completo'])}`;
  const email = normalizeEmail(row['E-mail do responsável']);
  const telefone = normalizeText(row['Telefone do responsável']);
  const telefoneNorm = normalizePhone(telefone);

  const { data: links, error: linksError } = await supabase
    .from('adolescente_responsaveis')
    .select('id,responsavel_id')
    .eq('adolescente_id', adolescenteId);
  if (linksError) throw linksError;

  let responsavelId = null;
  if (Array.isArray(links) && links[0]?.responsavel_id) {
    responsavelId = String(links[0].responsavel_id);
    const { error } = await supabase
      .from('responsaveis')
      .update({
        pessoa_id: pessoaResponsavelId,
        nome,
        telefone,
        telefone_normalizado: telefoneNorm,
        email,
        email_normalizado: email,
        origem_dado: 'PLANILHA',
        criado_via_sistema: false,
        data_importacao: new Date().toISOString(),
      })
      .eq('id', responsavelId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('responsaveis')
      .insert({
        pessoa_id: pessoaResponsavelId,
        nome,
        telefone,
        telefone_normalizado: telefoneNorm,
        email,
        email_normalizado: email,
        origem_dado: 'PLANILHA',
        criado_via_sistema: false,
        data_importacao: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    responsavelId = data.id;
  }

  if (Array.isArray(links) && links[0]?.id) {
    const { error } = await supabase
      .from('adolescente_responsaveis')
      .update({
        responsavel_id: responsavelId,
        principal: true,
        grau_parentesco: 'Pai/Mãe',
        origem_dado: 'PLANILHA',
        criado_via_sistema: false,
        data_importacao: new Date().toISOString(),
      })
      .eq('id', links[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('adolescente_responsaveis')
      .insert({
        adolescente_id: adolescenteId,
        responsavel_id: responsavelId,
        principal: true,
        grau_parentesco: 'Pai/Mãe',
        origem_dado: 'PLANILHA',
        criado_via_sistema: false,
        data_importacao: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

async function main() {
  const raw = fs.readFileSync(path.resolve(jsonPath), 'utf8').replace(/^\uFEFF/, '');
  const importRows = JSON.parse(raw);
  const rowMap = new Map((Array.isArray(importRows) ? importRows : []).map((row) => [Number(row.__rowNumber || 0), row]));

  const { data: inscricoes, error } = await supabase
    .from('inscricoes')
    .select('id,adolescente_id,id_origem_planilha,status,adolescentes(id,pessoa_id)')
    .eq('encontro_id', encontroId)
    .limit(5000);
  if (error) throw error;

  let repairedChildren = 0;
  let repairedParents = 0;

  for (const inscricao of inscricoes || []) {
    const ref = String(inscricao.id_origem_planilha || '');
    const rowNumber = Number(ref.split(':').pop() || 0);
    const row = rowMap.get(rowNumber);
    if (!row) continue;

    const pessoaId = inscricao?.adolescentes?.pessoa_id;
    const adolescenteId = inscricao?.adolescente_id;
    if (!pessoaId || !adolescenteId) continue;

    const nascimento = parseDateFlexible(row['Data de nascimento (DD/MM/AAAA)']);
    const year = Number(String(nascimento || '').slice(0, 4));
    const idade = year ? (currentYear - year) : null;

    const { error: updateChildError } = await supabase
      .from('pessoas')
      .update({
        nome_completo: normalizeText(row['Nome completo']),
        nome_normalizado: normalizeName(row['Nome completo']),
        data_nascimento: nascimento,
        idade_calculada: idade,
        telefone: normalizeText(row['Telefone de contato']) || null,
        telefone_normalizado: normalizePhone(row['Telefone de contato']),
        email: normalizeEmail(row['E-mail']),
        email_normalizado: normalizeEmail(row['E-mail']),
        bairro: normalizeText(row['Bairro']) || null,
        observacoes: buildObservacoes(row),
        origem_dado: 'PLANILHA',
        criado_via_sistema: false,
        ultima_sincronizacao: new Date().toISOString(),
      })
      .eq('id', pessoaId);
    if (updateChildError) throw updateChildError;
    repairedChildren++;

    const hasResponsavel = normalizeText(row['Nome do responsável']) || normalizeText(row['Telefone do responsável']) || normalizeText(row['E-mail do responsável']);
    if (hasResponsavel) {
      const pessoaResponsavelId = await findOrCreatePessoaResponsavel(row, pessoaId);
      await upsertResponsavelForAdolescente(adolescenteId, pessoaResponsavelId, row);
      repairedParents++;
    }
  }

  console.log(JSON.stringify({ repairedChildren, repairedParents, totalInscricoes: (inscricoes || []).length }, null, 2));
}

main().catch((error) => {
  console.error('[repair-cadastro-oficial-relations] erro fatal:', error?.message || error);
  process.exit(1);
});
