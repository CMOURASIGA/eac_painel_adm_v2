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
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node scripts/import-cadastro-oficial-inicial.mjs <arquivo-json-exportado>');
  process.exit(1);
}

const CURRENT_YEAR = Number(process.env.EAC_IMPORT_CURRENT_YEAR || new Date().getFullYear()) || new Date().getFullYear();
const ENCONTRO_NOME = String(process.env.EAC_IMPORT_ENCONTRO_NOME || 'EAC - Importação Inicial da Planilha Principal').trim();
const ENCONTRO_STATUS = String(process.env.EAC_IMPORT_ENCONTRO_STATUS || 'PLANEJADO').trim().toUpperCase();
const INSCRICAO_STATUS = String(process.env.EAC_IMPORT_INSCRICAO_STATUS || 'CONFIRMADO').trim().toUpperCase();
const ORIGEM = 'PLANILHA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'import-cadastro-oficial-inicial' } },
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

function normalizeEmail(value) {
  const raw = normalizeText(value).toLowerCase();
  return raw || null;
}

function parseBooleanPtBr(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  if (['sim', 's', 'yes', 'y', 'true', '1'].includes(raw)) return true;
  if (['nao', 'não', 'n', 'no', 'false', '0'].includes(raw)) return false;
  return null;
}

function parseDateFlexible(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    return `${br[3]}-${month}-${day}`;
  }

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }

  return null;
}

function computeAge(rawAge, birthDateIso) {
  const ageDigits = digitsOnly(rawAge);
  if (ageDigits) return Number(ageDigits);
  if (!birthDateIso) return null;
  const year = Number(String(birthDateIso).slice(0, 4));
  if (!year) return null;
  return CURRENT_YEAR - year;
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

function safeErrorMessage(error) {
  return String(error?.message || error || 'erro desconhecido');
}

async function maybeSingle(query) {
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function ensureEncontro() {
  const existing = await maybeSingle(
    supabase
      .from('encontros')
      .select('id,nome,status,data_inicio,data_fim')
      .eq('nome', ENCONTRO_NOME),
  );

  if (existing?.id) return existing;

  let inserted = await supabase
    .from('encontros')
    .insert({
      nome: ENCONTRO_NOME,
      numero: null,
      status: ENCONTRO_STATUS,
      data_inicio: null,
      data_fim: null,
    })
    .select('id,nome,status,data_inicio,data_fim')
    .single();

  if (inserted.error) {
    inserted = await supabase
      .from('encontros')
      .insert({
        nome: ENCONTRO_NOME,
        numero: null,
        status: ENCONTRO_STATUS,
        data_inicio: `${CURRENT_YEAR}-01-01`,
        data_fim: `${CURRENT_YEAR}-12-31`,
      })
      .select('id,nome,status,data_inicio,data_fim')
      .single();
  }

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function findPessoaAdolescente({ nomeCompleto, nomeNormalizado, dataNascimento, email, telefoneNormalizado }) {
  if (nomeNormalizado && dataNascimento) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('data_nascimento', dataNascimento),
    );
    if (found?.id) return found.id;
  }

  if (telefoneNormalizado) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id,nome_normalizado,data_nascimento')
        .eq('telefone_normalizado', telefoneNormalizado),
    );
    if (found?.id && (!found.nome_normalizado || found.nome_normalizado === nomeNormalizado || found.data_nascimento === dataNascimento)) {
      return found.id;
    }
  }

  if (email) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id,nome_normalizado,data_nascimento')
        .eq('email_normalizado', email),
    );
    if (found?.id && (!found.nome_normalizado || found.nome_normalizado === nomeNormalizado || found.data_nascimento === dataNascimento)) {
      return found.id;
    }
  }

  return null;
}

async function findPessoaResponsavel({ nomeNormalizado, email, telefoneNormalizado }) {
  if (nomeNormalizado && email) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id,nome_normalizado')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('email_normalizado', email),
    );
    if (found?.id) return found.id;
  }

  if (nomeNormalizado && telefoneNormalizado) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id,nome_normalizado')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('telefone_normalizado', telefoneNormalizado),
    );
    if (found?.id) return found.id;
  }

  if (nomeNormalizado) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id,nome_normalizado,data_nascimento')
        .eq('nome_normalizado', nomeNormalizado)
        .is('data_nascimento', null),
    );
    if (found?.id) return found.id;
  }

  return null;
}

async function upsertPessoaAdolescente(payload) {
  const existingId = await findPessoaAdolescente(payload);
  const body = {
    nome_completo: payload.nomeCompleto,
    nome_normalizado: payload.nomeNormalizado,
    data_nascimento: payload.dataNascimento,
    idade_calculada: payload.idadeCalculada,
    telefone: payload.telefone,
    telefone_normalizado: payload.telefoneNormalizado,
    bairro: payload.bairro,
    email: payload.email,
    email_normalizado: payload.email,
    observacoes: payload.observacoes,
    origem_dado: ORIGEM,
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

async function upsertPessoaResponsavel(payload) {
  const existingId = await findPessoaResponsavel(payload);
  const body = {
    nome_completo: payload.nomeCompleto,
    nome_normalizado: payload.nomeNormalizado,
    telefone: payload.telefone,
    telefone_normalizado: payload.telefoneNormalizado,
    email: payload.email,
    email_normalizado: payload.email,
    origem_dado: ORIGEM,
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

async function ensurePessoaPapel(pessoaId, papel) {
  const existing = await maybeSingle(
    supabase
      .from('pessoa_papeis')
      .select('id,ativo')
      .eq('pessoa_id', pessoaId)
      .eq('papel', papel),
  );

  if (existing?.id) {
    if (existing.ativo === true) return existing.id;
    const { error } = await supabase.from('pessoa_papeis').update({ ativo: true }).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from('pessoa_papeis')
    .insert({ pessoa_id: pessoaId, papel, ativo: true })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureAdolescente(pessoaId, jaFezEac) {
  const existing = await maybeSingle(
    supabase.from('adolescentes').select('id').eq('pessoa_id', pessoaId),
  );

  const body = {
    pessoa_id: pessoaId,
    aceite_normas: true,
    ja_fez_eac: Boolean(jaFezEac),
    origem_dado: ORIGEM,
    criado_via_sistema: false,
    data_importacao: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('adolescentes').update(body).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from('adolescentes').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function ensureResponsavel(pessoaId, payload) {
  const existing = await maybeSingle(
    supabase.from('responsaveis').select('id').eq('pessoa_id', pessoaId),
  );

  const body = {
    pessoa_id: pessoaId,
    nome: payload.nomeCompleto,
    telefone: payload.telefone,
    telefone_normalizado: payload.telefoneNormalizado,
    email: payload.email,
    email_normalizado: payload.email,
    origem_dado: ORIGEM,
    criado_via_sistema: false,
    data_importacao: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('responsaveis').update(body).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from('responsaveis').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function ensureVinculoResponsavel(adolescenteId, responsavelId) {
  const existing = await maybeSingle(
    supabase
      .from('adolescente_responsaveis')
      .select('id')
      .eq('adolescente_id', adolescenteId)
      .eq('responsavel_id', responsavelId),
  );

  const body = {
    adolescente_id: adolescenteId,
    responsavel_id: responsavelId,
    principal: true,
    grau_parentesco: 'Pai/Mãe',
    origem_dado: ORIGEM,
    criado_via_sistema: false,
    data_importacao: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('adolescente_responsaveis').update(body).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from('adolescente_responsaveis').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function ensureCadastroOficial(pessoaId, encontroId) {
  const existing = await maybeSingle(
    supabase
      .from('cadastro_oficial')
      .select('id')
      .eq('pessoa_id', pessoaId)
      .eq('ativo', true),
  );

  const body = {
    pessoa_id: pessoaId,
    encontro_id: encontroId,
    origem: ORIGEM,
    status: 'ATIVO',
    elegivel_encontreiro: false,
    observacoes: 'Carga inicial da aba Cadastro Oficial (confirmados).',
    ativo: true,
  };

  if (existing?.id) {
    const { error } = await supabase.from('cadastro_oficial').update(body).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from('cadastro_oficial').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function ensureInscricao(encontroId, adolescenteId, rowRef, emailAdolescente, emailResponsavel) {
  const existing = await maybeSingle(
    supabase
      .from('inscricoes')
      .select('id')
      .eq('encontro_id', encontroId)
      .eq('adolescente_id', adolescenteId),
  );

  const body = {
    encontro_id: encontroId,
    adolescente_id: adolescenteId,
    email_adolescente_snapshot: emailAdolescente,
    email_responsavel_snapshot: emailResponsavel,
    email_destino_snapshot: emailResponsavel || emailAdolescente,
    status: INSCRICAO_STATUS,
    origem_dado: ORIGEM,
    criado_via_sistema: false,
    data_inscricao: new Date().toISOString(),
    data_importacao: new Date().toISOString(),
    id_origem_planilha: rowRef,
    ultima_sincronizacao: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('inscricoes').update(body).eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from('inscricoes').insert(body).select('id').single();
  if (error) throw error;
  return data.id;
}

async function fetchCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return Number(count || 0);
}

function toImportRows(rawRows) {
  return rawRows
    .map((row) => {
      const nomeCompleto = normalizeText(row['Nome completo']);
      const dataNascimento = parseDateFlexible(row['Data de nascimento (DD/MM/AAAA)']);
      const telefone = normalizeText(row['Telefone de contato']);
      const email = normalizeEmail(row['E-mail']);
      const responsavelNome = normalizeText(row['Nome do responsável']);
      const responsavelTelefone = normalizeText(row['Telefone do responsável']);
      const responsavelEmail = normalizeEmail(row['E-mail do responsável']);
      const idade = computeAge(row['Idade'], dataNascimento);
      return {
        rowNumber: Number(row.__rowNumber || 0),
        nomeCompleto,
        nomeNormalizado: normalizeName(nomeCompleto),
        dataNascimento,
        idadeCalculada: idade,
        telefone,
        telefoneNormalizado: normalizePhone(telefone),
        email,
        bairro: normalizeText(row['Bairro']) || null,
        observacoes: buildObservacoes(row),
        jaFezEac: false,
        aceiteImagem: parseBooleanPtBr(row['Autorizo o uso de minha imagem em fotos e vídeos para fins de divulgação do evento.']),
        aceiteNormas: parseBooleanPtBr(row['Estou ciente e concordo com as normas do evento.']),
        responsavel: {
          nomeCompleto: responsavelNome,
          nomeNormalizado: normalizeName(responsavelNome),
          telefone: responsavelTelefone,
          telefoneNormalizado: normalizePhone(responsavelTelefone),
          email: responsavelEmail,
        },
      };
    })
    .filter((row) => row.nomeCompleto);
}

async function main() {
  const rawJson = fs.readFileSync(path.resolve(inputPath), 'utf8').replace(/^\uFEFF/, '');
  const rows = JSON.parse(rawJson);
  const importRows = toImportRows(Array.isArray(rows) ? rows : []);
  const encontro = await ensureEncontro();

  const stats = {
    rows: importRows.length,
    pessoasAdolescentes: 0,
    adolescentes: 0,
    pessoasResponsaveis: 0,
    responsaveis: 0,
    vinculos: 0,
    papeis: 0,
    cadastros: 0,
    inscricoes: 0,
    errors: [],
  };

  const seen = {
    pessoasAdolescentes: new Set(),
    adolescentes: new Set(),
    pessoasResponsaveis: new Set(),
    responsaveis: new Set(),
    vinculos: new Set(),
    papeis: new Set(),
    cadastros: new Set(),
    inscricoes: new Set(),
  };

  for (const row of importRows) {
    try {
      if (!row.dataNascimento && row.idadeCalculada == null) {
        throw new Error('data_nascimento e idade ausentes');
      }
      if (!row.telefoneNormalizado) {
        throw new Error('telefone do adolescente ausente ou inválido');
      }

      const pessoaAdolescenteId = await upsertPessoaAdolescente(row);
      const adolescenteId = await ensureAdolescente(pessoaAdolescenteId, row.jaFezEac);
      const papelId = await ensurePessoaPapel(pessoaAdolescenteId, 'ENCONTRISTA');

      let pessoaResponsavelId = null;
      let responsavelId = null;
      let vinculoId = null;
      if (row.responsavel.nomeCompleto || row.responsavel.telefoneNormalizado || row.responsavel.email) {
        pessoaResponsavelId = await upsertPessoaResponsavel({
          ...row.responsavel,
          nomeCompleto: row.responsavel.nomeCompleto || `Responsável de ${row.nomeCompleto}`,
          nomeNormalizado: row.responsavel.nomeNormalizado || normalizeName(`Responsável de ${row.nomeCompleto}`),
        });
        responsavelId = await ensureResponsavel(pessoaResponsavelId, {
          ...row.responsavel,
          nomeCompleto: row.responsavel.nomeCompleto || `Responsável de ${row.nomeCompleto}`,
        });
        vinculoId = await ensureVinculoResponsavel(adolescenteId, responsavelId);
      }

      const cadastroId = await ensureCadastroOficial(pessoaAdolescenteId, encontro.id);
      const inscricaoId = await ensureInscricao(
        encontro.id,
        adolescenteId,
        `Cadastro Oficial:${row.rowNumber}`,
        row.email,
        row.responsavel.email,
      );

      seen.pessoasAdolescentes.add(pessoaAdolescenteId);
      seen.adolescentes.add(adolescenteId);
      if (pessoaResponsavelId) seen.pessoasResponsaveis.add(pessoaResponsavelId);
      if (responsavelId) seen.responsaveis.add(responsavelId);
      if (vinculoId) seen.vinculos.add(vinculoId);
      seen.papeis.add(papelId);
      seen.cadastros.add(cadastroId);
      seen.inscricoes.add(inscricaoId);
    } catch (error) {
      stats.errors.push({
        rowNumber: row.rowNumber,
        nome: row.nomeCompleto,
        error: safeErrorMessage(error),
      });
    }
  }

  stats.pessoasAdolescentes = seen.pessoasAdolescentes.size;
  stats.adolescentes = seen.adolescentes.size;
  stats.pessoasResponsaveis = seen.pessoasResponsaveis.size;
  stats.responsaveis = seen.responsaveis.size;
  stats.vinculos = seen.vinculos.size;
  stats.papeis = seen.papeis.size;
  stats.cadastros = seen.cadastros.size;
  stats.inscricoes = seen.inscricoes.size;

  const counts = {
    encontros: await fetchCount('encontros'),
    pessoas: await fetchCount('pessoas'),
    adolescentes: await fetchCount('adolescentes'),
    responsaveis: await fetchCount('responsaveis'),
    adolescente_responsaveis: await fetchCount('adolescente_responsaveis'),
    pessoa_papeis: await fetchCount('pessoa_papeis'),
    cadastro_oficial: await fetchCount('cadastro_oficial'),
    inscricoes: await fetchCount('inscricoes'),
  };

  console.log(JSON.stringify({
    encontro,
    currentYear: CURRENT_YEAR,
    statusInscricao: INSCRICAO_STATUS,
    importStats: stats,
    dbCounts: counts,
  }, null, 2));

  if (stats.errors.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[import-cadastro-oficial-inicial] erro fatal:', safeErrorMessage(error));
  process.exit(1);
});
