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

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const ENCONTRO_ID_FALLBACK = String(process.env.EAC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE || '7191d2b7-4895-4d68-8360-cc2bda900ccb').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados.');
  process.exit(1);
}

const csvPath = process.argv[2];
const applyPhoneFixes = process.argv.includes('--apply-phone-fixes');
const applyEmailFixes = process.argv.includes('--apply-email-fixes');
const stageMissing = process.argv.includes('--stage-missing');

if (!csvPath) {
  console.error('Uso: node scripts/audit-presenca-cadastro.mjs <arquivo-csv> [--apply-phone-fixes] [--apply-email-fixes] [--stage-missing]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'audit-presenca-cadastro' } },
});

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeName(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizePhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function normalizeEmail(value) {
  const raw = clean(value).toLowerCase();
  return isValidEmail(raw) ? raw : '';
}

function isValidEmail(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line);
    const row = { __rowNumber: idx + 2 };
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function parseDate(value) {
  const raw = clean(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

async function fetchAll(queryFactory, pageSize = 1000) {
  const rows = [];
  let from = 0;

  for (;;) {
    const query = queryFactory().range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function resolveEncontreirosTable() {
  const candidates = [
    String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim(),
    'cadastro_encontreiros',
    'encontreiros',
    'cadastro_encontreiro',
  ].filter(Boolean);
  for (const table of candidates) {
    const probe = await supabase.from(table).select('id').limit(1);
    if (!probe.error) return table;
  }
  return '';
}

async function resolveCadastroEncontroId() {
  if (ENCONTRO_ID_FALLBACK) {
    const probe = await supabase.from('encontros').select('id').eq('id', ENCONTRO_ID_FALLBACK).limit(1).maybeSingle();
    if (!probe.error && probe.data?.id) return ENCONTRO_ID_FALLBACK;
  }

  const ativos = await supabase
    .from('cadastro_oficial')
    .select('encontro_id')
    .eq('ativo', true)
    .not('encontro_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (ativos.error) throw ativos.error;
  return clean(ativos.data?.encontro_id);
}

async function stageMissingRows(rows) {
  if (rows.length === 0) return { staged: 0, processed: null };
  const encontroId = await resolveCadastroEncontroId();
  if (!encontroId) throw new Error('Nenhum encontro valido encontrado para processar o cadastro oficial.');

  const importacaoId = randomUUID();
  const nowIso = new Date().toISOString();
  const spreadsheetId = `manual-csv-audit-${importacaoId}`;
  const nomeAba = 'Cadastro Oficial';

  const { error: importError } = await supabase.from('importacoes_planilha').insert({
    id: importacaoId,
    nome: `Audit CSV - ${nomeAba}`,
    spreadsheet_id: spreadsheetId,
    aba: nomeAba,
    tipo_importacao: 'FULL',
    status: 'PENDENTE',
    total_linhas: rows.length,
    total_importadas: rows.length,
    total_ignoradas: 0,
    total_erros: 0,
    iniciado_em: nowIso,
  });
  if (importError) throw importError;

  const stagingRows = rows.map((row) => ({
    id: randomUUID(),
    importacao_id: importacaoId,
    spreadsheet_id: spreadsheetId,
    nome_aba: nomeAba,
    numero_linha: Number(row.__rowNumber || 0),
    hash_linha: createHash('sha256').update(JSON.stringify({ nomeAba, numeroLinha: row.__rowNumber, payload: row })).digest('hex'),
    payload: row,
    status_processamento: 'PENDENTE',
    entidade_destino: 'cadastro_oficial',
    entidade_destino_id: null,
    mensagem_erro: null,
  }));

  for (let i = 0; i < stagingRows.length; i += 100) {
    const batch = stagingRows.slice(i, i + 100);
    const { error } = await supabase.from('staging_planilha_linhas').insert(batch);
    if (error) throw error;
  }

  const { data: processed, error: rpcError } = await supabase.rpc('fn_processar_staging_cadastro_oficial', {
    p_encontro_id_antes_corte: encontroId,
    p_encontro_id_apos_corte: null,
    p_numero_linha_corte: null,
    p_importacao_id: importacaoId,
    p_nome_aba: nomeAba,
  });
  if (rpcError) throw rpcError;

  await supabase
    .from('importacoes_planilha')
    .update({ status: 'CONCLUIDA', finalizado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq('id', importacaoId);

  return { staged: rows.length, encontroId, processed };
}

async function main() {
  const csvRows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  const officialRows = csvRows
    .map((row) => ({
      ...row,
      nome: clean(row['Nome completo']),
      nomeNormalizado: normalizeName(row['Nome completo']),
      nascimento: parseDate(row['Data de nascimento (DD/MM/AAAA)']),
      telefone: clean(row['Telefone de contato']),
      telefoneNormalizado: normalizePhone(row['Telefone de contato']),
      emailPrincipal: normalizeEmail(row['E-mail']),
      emailResponsavel: normalizeEmail(row['E-mail do responsável']),
    }))
    .filter((row) => row.nomeNormalizado);

  const latestImport = await supabase
    .from('importacoes_planilha')
    .select('id,iniciado_em,aba')
    .eq('aba', 'Cadastro Oficial')
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestImport.error) throw latestImport.error;

  const latestImportId = clean(latestImport.data?.id);
  const stagingRows = latestImportId
    ? await fetchAll(() => supabase.from('staging_planilha_linhas').select('numero_linha,payload').eq('importacao_id', latestImportId))
    : [];

  const activeCadastros = await fetchAll(() => supabase.from('cadastro_oficial').select('id,pessoa_id').eq('ativo', true));
  const pessoaIds = Array.from(new Set(activeCadastros.map((row) => clean(row.pessoa_id)).filter(Boolean)));
  const pessoas = pessoaIds.length
    ? await fetchAll(() => supabase.from('pessoas').select('id,nome_completo,data_nascimento,telefone,telefone_normalizado,email,email_normalizado').in('id', pessoaIds))
    : [];

  const pessoasById = new Map(pessoas.map((row) => [clean(row.id), row]));
  const activeMembers = activeCadastros
    .map((cadastro) => {
      const pessoa = pessoasById.get(clean(cadastro.pessoa_id));
      if (!pessoa) return null;
      return {
        cadastroId: clean(cadastro.id),
        pessoaId: clean(pessoa.id),
        nome: clean(pessoa.nome_completo),
        nomeNormalizado: normalizeName(pessoa.nome_completo),
        nascimento: parseDate(pessoa.data_nascimento),
        telefone: clean(pessoa.telefone),
        telefoneNormalizado: normalizePhone(pessoa.telefone_normalizado || pessoa.telefone),
        email: normalizeEmail(pessoa.email_normalizado || pessoa.email),
      };
    })
    .filter(Boolean);

  const byNameBirth = new Map();
  const byName = new Map();
  for (const member of activeMembers) {
    const key = `${member.nomeNormalizado}|${member.nascimento}`;
    if (!byNameBirth.has(key)) byNameBirth.set(key, []);
    byNameBirth.get(key).push(member);
    if (!byName.has(member.nomeNormalizado)) byName.set(member.nomeNormalizado, []);
    byName.get(member.nomeNormalizado).push(member);
  }

  const sourceRowsMap = new Map(
    officialRows.map((row) => [Number(row.__rowNumber || 0), { rowNumber: Number(row.__rowNumber || 0), payload: row, source: 'csv' }])
  );
  stagingRows.forEach((row) => {
    const rowNumber = Number(row.numero_linha || 0);
    if (!rowNumber) return;
    sourceRowsMap.set(rowNumber, { rowNumber, payload: row.payload || {}, source: 'staging' });
  });
  const phoneSourceRows = Array.from(sourceRowsMap.values()).sort((a, b) => a.rowNumber - b.rowNumber);

  const phoneFixes = [];
  for (const row of phoneSourceRows) {
    const payload = row.payload || {};
    const nome = clean(payload['Nome completo']);
    const nomeNormalizado = normalizeName(nome);
    const nascimento = parseDate(payload['Data de nascimento (DD/MM/AAAA)']);
    const telefone = clean(payload['Telefone de contato']);
    const telefoneNormalizado = normalizePhone(telefone);
    if (!nomeNormalizado || !telefoneNormalizado) continue;

    const exact = byNameBirth.get(`${nomeNormalizado}|${nascimento}`) || [];
    const loose = byName.get(nomeNormalizado) || [];
    const matches = exact.length > 0 ? exact : loose.length === 1 ? loose : [];
    if (matches.length !== 1) continue;

    const member = matches[0];
    if (member.telefoneNormalizado) continue;
    phoneFixes.push({
      pessoaId: member.pessoaId,
      nome: member.nome,
      telefone,
      telefoneNormalizado,
      source: row.source,
      sourceLine: row.rowNumber,
    });
  }

  const emailFixes = [];
  for (const row of phoneSourceRows) {
    const payload = row.payload || {};
    const nome = clean(payload['Nome completo']);
    const nomeNormalizado = normalizeName(nome);
    const nascimento = parseDate(payload['Data de nascimento (DD/MM/AAAA)']);
    const emailPrincipal = normalizeEmail(payload['E-mail']);
    const emailResponsavel = normalizeEmail(payload['E-mail do responsável']);
    const emailEscolhido = emailPrincipal || emailResponsavel || '';
    if (!nomeNormalizado) continue;

    const exact = byNameBirth.get(`${nomeNormalizado}|${nascimento}`) || [];
    const loose = byName.get(nomeNormalizado) || [];
    const matches = exact.length > 0 ? exact : loose.length === 1 ? loose : [];
    if (matches.length !== 1) continue;

    const member = matches[0];
    if (member.email === emailEscolhido) continue;
    if (!emailEscolhido && !member.email) continue;

    emailFixes.push({
      pessoaId: member.pessoaId,
      nome: member.nome,
      emailAtual: member.email || '',
      emailPrincipal,
      emailResponsavel,
      emailEscolhido,
      source: row.source,
      sourceLine: row.rowNumber,
    });
  }

  const activeIdentitySet = new Set(activeMembers.map((member) => `${member.nomeNormalizado}|${member.nascimento}`));
  const activePhoneSet = new Set(activeMembers.map((member) => member.telefoneNormalizado).filter(Boolean));
  const missingFromCadastro = officialRows.filter((row) => {
    if (activeIdentitySet.has(`${row.nomeNormalizado}|${row.nascimento}`)) return false;
    if (row.telefoneNormalizado && activePhoneSet.has(row.telefoneNormalizado)) return false;
    return true;
  });

  const encontreirosTable = await resolveEncontreirosTable();
  let appliedPhones = 0;
  if (applyPhoneFixes) {
    for (const fix of phoneFixes) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('pessoas')
        .update({
          telefone: fix.telefone,
          telefone_normalizado: fix.telefoneNormalizado,
          atualizado_em: nowIso,
          ultima_sincronizacao: nowIso,
        })
        .eq('id', fix.pessoaId);
      if (error) throw error;

      if (encontreirosTable) {
        await supabase
          .from(encontreirosTable)
          .update({
            telefone: fix.telefone,
            telefone_normalizado: fix.telefoneNormalizado,
            celular_whatsapp: fix.telefone,
            celularWhatsapp: fix.telefone,
            whatsapp_normalizado: fix.telefoneNormalizado,
            whatsappNormalizado: fix.telefoneNormalizado,
            atualizado_em: nowIso,
          })
          .eq('pessoa_id', fix.pessoaId);
      }
      appliedPhones += 1;
    }
  }

  let appliedEmails = 0;
  if (applyEmailFixes) {
    for (const fix of emailFixes) {
      const nowIso = new Date().toISOString();
      const body = {
        email: fix.emailEscolhido || null,
        email_normalizado: fix.emailEscolhido || null,
        atualizado_em: nowIso,
        ultima_sincronizacao: nowIso,
      };
      const { error } = await supabase.from('pessoas').update(body).eq('id', fix.pessoaId);
      if (error) throw error;

      if (encontreirosTable) {
        await supabase
          .from(encontreirosTable)
          .update({
            email: fix.emailEscolhido || null,
            email_normalizado: fix.emailEscolhido || null,
            atualizado_em: nowIso,
          })
          .eq('pessoa_id', fix.pessoaId);
      }
      appliedEmails += 1;
    }
  }

  const stagedMissingResult = stageMissing ? await stageMissingRows(missingFromCadastro) : null;

  console.log(JSON.stringify({
    csvPath: path.resolve(csvPath),
    latestImportId: latestImportId || null,
    latestImportAt: latestImport.data?.iniciado_em || null,
    activeCadastroCount: activeMembers.length,
    stagingRowsCount: stagingRows.length,
    phoneFixesFound: phoneFixes.length,
    phoneFixesApplied: appliedPhones,
    phoneFixesSample: phoneFixes.slice(0, 20),
    emailFixesFound: emailFixes.length,
    emailFixesApplied: appliedEmails,
    emailFixesSample: emailFixes.slice(0, 20),
    missingFromCadastroCount: missingFromCadastro.length,
    missingFromCadastroSample: missingFromCadastro.slice(0, 20).map((row) => ({
      rowNumber: row.__rowNumber,
      nome: row.nome,
      nascimento: row.nascimento,
      telefone: row.telefoneNormalizado,
    })),
    stageMissingApplied: Boolean(stagedMissingResult),
    stageMissingResult: stagedMissingResult,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
