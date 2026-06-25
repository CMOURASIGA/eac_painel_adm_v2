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

const defaultCsvPath = path.join(__dirname, '../documento projeto/carga inicial/Respostas - Encontreiros.csv');
const defaultPreviewPath = path.join(__dirname, '../documento projeto/carga inicial/preview-import-encontreiros.json');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const positional = args.filter((arg) => !arg.startsWith('--'));
const csvPath = positional[0] || defaultCsvPath;
const previewPath = positional[1] || defaultPreviewPath;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'import-safe-encontreiros-csv' } },
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

function parseDateMaybe(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!parts) return null;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  const year = Number(parts[3]);

  let month = a;
  let day = b;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeBooleanText(value) {
  return cleanText(value);
}

function classifyByCsv(row) {
  const raw = cleanText(row.Classificação || row['ClassificaÃ§Ã£o']);
  if (raw) return raw;
  const ageRaw = cleanText(row.Idade).replace(/[^\d]/g, '');
  if (!ageRaw) return 'OUTRO';
  return Number(ageRaw) <= 17 ? 'Adolescente' : 'Adulto';
}

async function callRpc(fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data;
}

async function main() {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV nao encontrado: ${csvPath}`);
  if (!fs.existsSync(previewPath)) throw new Error(`Preview nao encontrado: ${previewPath}`);

  const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
  const previewSafe = Array.isArray(preview?.newSafe) ? preview.newSafe : [];

  const csvByLine = new Map(csvRows.map((row) => [Number(row.__line), row]));
  const stats = {
    dryRun,
    safeFromPreview: previewSafe.length,
    prepared: 0,
    imported: 0,
    skippedMissingCsvLine: 0,
    skippedNoName: 0,
    reusedPessoa: 0,
    createdPessoa: 0,
    ensuredEncontreiro: 0,
    errors: 0,
  };

  const samples = [];

  for (const item of previewSafe) {
    const line = Number(item.line);
    const row = csvByLine.get(line);
    if (!row) {
      stats.skippedMissingCsvLine += 1;
      continue;
    }

    const nome = cleanText(row['Nome completo']);
    if (!nome) {
      stats.skippedNoName += 1;
      continue;
    }

    const dataNascimento = parseDateMaybe(row['Data de nascimento']);
    const telefone = cleanText(row['Celular / WhatsApp']);
    const email = cleanText(row['E-mail']).toLowerCase();
    const bairro = cleanText(row['Bairro onde mora']);
    const endereco = cleanText(row['Endereço completo'] || row['EndereÃ§o completo']);
    const responsavel = cleanText(row['Responsável / Grau de Parentesco e Contato (caso menor de idade)'] || row['ResponsÃ¡vel / Grau de Parentesco e Contato (caso menor de idade)']);
    const classificacao = classifyByCsv(row);
    const pessoaIdPreview = cleanText(item.pessoaId);

    const payload = {
      p_nome: nome,
      p_email: email || null,
      p_telefone: telefone || null,
      p_data_nascimento: dataNascimento,
      p_bairro: bairro || null,
      p_observacoes: cleanText(classificacao) || null,
      p_origem: 'PLANILHA',
      p_criado_via_sistema: false,
      p_nome_completo: nome,
      p_idade: cleanText(row.Idade) || null,
      p_celular_whatsapp: telefone || null,
      p_endereco_completo: endereco || null,
      p_responsavel_contato: responsavel || null,
      p_frequenta_missas: normalizeBooleanText(row['Frequenta missas?']),
      p_onde_missas: cleanText(row['Se sim, onde?']) || null,
      p_participa_movimento: normalizeBooleanText(row['Participa de algum movimento da igreja?']),
      p_movimento_paroquia: cleanText(row['Se sim, qual e em qual paróquia?'] || row['Se sim, qual e em qual parÃ³quia?']) || null,
      p_paroquia_fez_eac: cleanText(row['Paróquia onde você fez o EAC'] || row['ParÃ³quia onde vocÃª fez o EAC']) || null,
      p_ja_trabalhou_eac: normalizeBooleanText(row['Já trabalhou em algum EAC?'] || row['JÃ¡ trabalhou em algum EAC?']),
      p_ja_coordenou_equipe: normalizeBooleanText(row['Já coordenou alguma equipe?'] || row['JÃ¡ coordenou alguma equipe?']),
      p_pais_fizeram_encontro: normalizeBooleanText(row['Seus pais já fizeram algum encontro?'] || row['Seus pais jÃ¡ fizeram algum encontro?']),
      p_possui_alergia: cleanText(row['Possui alguma alergia? Se sim, qual?']) || null,
      p_toma_remedio: cleanText(row['Toma algum remédio? Se sim, qual?'] || row['Toma algum remÃ©dio? Se sim, qual?']) || null,
      p_alimentacao_especial: cleanText(row['Possui alguma alimentação especial?'] || row['Possui alguma alimentaÃ§Ã£o especial?']) || null,
      p_sugestao_ultimo_encontro: cleanText(row['Se você trabalhou no nosso último encontro, tem alguma sugestão para melhorarmos?'] || row['Se vocÃª trabalhou no nosso Ãºltimo encontro, tem alguma sugestÃ£o para melhorarmos?']) || null,
      p_dica_pos_encontro: cleanText(row['Nos dê uma dica sobre o que você gostaria que acontecesse em algum pós-encontro.'] || row['Nos dÃª uma dica sobre o que vocÃª gostaria que acontecesse em algum pÃ³s-encontro.']) || null,
      p_classificacao: classificacao || null,
    };

    stats.prepared += 1;

    if (samples.length < 12) {
      samples.push({
        line,
        nome,
        classificacao,
        pessoaIdPreview: pessoaIdPreview || null,
        suggestedAction: item.acaoSugerida || null,
      });
    }

    if (dryRun) continue;

    try {
      const pessoaId = await callRpc('eac_upsert_pessoa', {
        p_nome: payload.p_nome,
        p_email: payload.p_email,
        p_telefone: payload.p_telefone,
        p_data_nascimento: payload.p_data_nascimento,
        p_bairro: payload.p_bairro,
        p_observacoes: payload.p_observacoes,
        p_origem: payload.p_origem,
        p_criado_via_sistema: payload.p_criado_via_sistema,
      });

      if (!pessoaId) throw new Error(`eac_upsert_pessoa retornou vazio na linha ${line}`);

      if (pessoaIdPreview && pessoaIdPreview === String(pessoaId)) stats.reusedPessoa += 1;
      else if (pessoaIdPreview) stats.reusedPessoa += 1;
      else stats.createdPessoa += 1;

      await callRpc('eac_ensure_papel', {
        p_pessoa_id: pessoaId,
        p_papel: 'ENCONTREIRO',
        p_origem: payload.p_origem,
      });

      await callRpc('eac_ensure_encontreiro', {
        p_pessoa_id: pessoaId,
        p_nome_completo: payload.p_nome_completo,
        p_data_nascimento: payload.p_data_nascimento,
        p_idade: payload.p_idade,
        p_email: payload.p_email,
        p_celular_whatsapp: payload.p_celular_whatsapp,
        p_endereco_completo: payload.p_endereco_completo,
        p_responsavel_contato: payload.p_responsavel_contato,
        p_bairro: payload.p_bairro,
        p_frequenta_missas: payload.p_frequenta_missas,
        p_onde_missas: payload.p_onde_missas,
        p_participa_movimento: payload.p_participa_movimento,
        p_movimento_paroquia: payload.p_movimento_paroquia,
        p_paroquia_fez_eac: payload.p_paroquia_fez_eac,
        p_ja_trabalhou_eac: payload.p_ja_trabalhou_eac,
        p_ja_coordenou_equipe: payload.p_ja_coordenou_equipe,
        p_pais_fizeram_encontro: payload.p_pais_fizeram_encontro,
        p_possui_alergia: payload.p_possui_alergia,
        p_toma_remedio: payload.p_toma_remedio,
        p_alimentacao_especial: payload.p_alimentacao_especial,
        p_sugestao_ultimo_encontro: payload.p_sugestao_ultimo_encontro,
        p_dica_pos_encontro: payload.p_dica_pos_encontro,
        p_classificacao: payload.p_classificacao,
      });

      stats.ensuredEncontreiro += 1;
      stats.imported += 1;
    } catch (error) {
      stats.errors += 1;
      if (samples.length < 24) {
        samples.push({
          line,
          nome,
          error: String(error?.message || error),
        });
      }
    }
  }

  console.log(JSON.stringify({
    success: stats.errors === 0,
    csvPath,
    previewPath,
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
