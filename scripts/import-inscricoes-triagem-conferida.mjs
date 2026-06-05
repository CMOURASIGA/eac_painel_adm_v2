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
  console.error('Uso: node scripts/import-inscricoes-triagem-conferida.mjs <arquivo-csv>');
  process.exit(1);
}

const CURRENT_YEAR = Number(process.env.EAC_IMPORT_CURRENT_YEAR || new Date().getFullYear()) || new Date().getFullYear();
const ENCONTRO_NOME = String(process.env.EAC_TRIAGEM_ENCONTRO_NOME || 'EAC - A DEFINIR').trim();
const ENCONTRO_STATUS = String(process.env.EAC_TRIAGEM_ENCONTRO_STATUS || 'PLANEJADO').trim().toUpperCase();
const INSCRICAO_STATUS = 'INSCRITO';
const ORIGEM = 'PLANILHA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'import-inscricoes-triagem-conferida' } },
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

function parseDateFlexible(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    return `${br[3]}-${month}-${day}`;
  }

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseBooleanPtBr(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  if (['sim', 's', 'yes', 'y', 'true', '1'].includes(raw)) return true;
  if (['nao', 'não', 'n', 'no', 'false', '0'].includes(raw)) return false;
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

function maybeNull(value) {
  const clean = normalizeText(value);
  return clean || null;
}

function buildObservacoes(row) {
  const parts = [
    maybeNull(row.origem),
    maybeNull(row.acao_recomendada),
    maybeNull(row.status_inscricao_sugerido),
    maybeNull(row.cadastro_oficial_sugerido),
    maybeNull(row.encontrado_no_comunicado_geral),
    maybeNull(row.tipo_match_comunicado),
    maybeNull(row.tempo_participacao_paroquia),
    maybeNull(row.grupo_ou_ministerio),
    maybeNull(row.motivacao),
    maybeNull(row.expectativas),
    maybeNull(row.observacao_para_dev),
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : null;
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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = { __rowNumber: index + 2 };
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    return row;
  });
}

function isMeaningfulRow(row) {
  const nome = maybeNull(row.nome_completo);
  const nascimento = parseDateFlexible(row.data_nascimento_iso || row.data_nascimento_original);
  if (nome && nascimento) return true;

  const signals = [
    row.telefone_contato_normalizado,
    row.email_normalizado,
    row.responsavel_nome,
    row.responsavel_telefone_normalizado,
    row.responsavel_email_normalizado,
  ].map(maybeNull).filter(Boolean);

  return signals.length > 0 && Boolean(nome);
}

function scoreCanonicalRow(row) {
  let score = 0;
  if (normalizeText(row.acao_recomendada) === 'IMPORTAR_OU_ATUALIZAR') score += 40;
  if (normalizeText(row.encontrado_no_comunicado_geral) === 'SIM') score += 20;
  if (normalizeText(row.tipo_match_comunicado) === 'EXATO_NOME_NORMALIZADO_E_NASCIMENTO') score += 15;
  if (maybeNull(row.telefone_contato_normalizado)) score += 5;
  if (maybeNull(row.email_normalizado)) score += 5;
  if (maybeNull(row.responsavel_nome)) score += 5;
  if (maybeNull(row.responsavel_telefone_normalizado)) score += 5;
  if (maybeNull(row.responsavel_email_normalizado)) score += 5;
  return score;
}

function chooseCanonicalRow(rows) {
  return rows
    .slice()
    .sort((a, b) => {
      const scoreDiff = scoreCanonicalRow(b) - scoreCanonicalRow(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a.__rowNumber || 0) - Number(b.__rowNumber || 0);
    })[0];
}

function sanitizeAdolescentContact(row) {
  const childEmail = normalizeEmail(row.email_normalizado || row.email_original);
  const parentEmail = normalizeEmail(row.responsavel_email_normalizado || row.responsavel_email_original);
  const childPhone = normalizePhone(row.telefone_contato_normalizado || row.telefone_contato_original);
  const parentPhone = normalizePhone(row.responsavel_telefone_normalizado || row.responsavel_telefone_original);

  return {
    email: childEmail && childEmail === parentEmail ? null : childEmail,
    telefoneNormalizado: childPhone && childPhone === parentPhone ? null : childPhone,
    telefoneOriginal: childPhone && childPhone === parentPhone ? null : maybeNull(row.telefone_contato_original),
  };
}

function toImportRows(rawRows) {
  const filtered = rawRows.filter(isMeaningfulRow);
  const groups = new Map();
  const dropped = [];

  for (const row of filtered) {
    const nomeCompleto = maybeNull(row.nome_completo);
    const nomeNormalizado = normalizeName(nomeCompleto);
    const dataNascimento = parseDateFlexible(row.data_nascimento_iso || row.data_nascimento_original);
    const key = maybeNull(row.chave_nome_nascimento) || (nomeNormalizado && dataNascimento ? `${nomeNormalizado}|${dataNascimento}` : `linha:${row.__rowNumber}`);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const importRows = [];

  for (const [key, rows] of groups.entries()) {
    const canonical = chooseCanonicalRow(rows);
    const adolescentContact = sanitizeAdolescentContact(canonical);
    const responsavelNome = maybeNull(canonical.responsavel_nome) || (maybeNull(canonical.nome_completo) ? `Responsável de ${canonical.nome_completo}` : null);

    importRows.push({
      key,
      rowNumber: Number(canonical.__rowNumber || 0),
      sourceRows: rows.map((row) => Number(row.__rowNumber || 0)),
      duplicateCount: rows.length,
      nomeCompleto: maybeNull(canonical.nome_completo),
      nomeNormalizado: normalizeName(canonical.nome_completo),
      dataNascimento: parseDateFlexible(canonical.data_nascimento_iso || canonical.data_nascimento_original),
      idadeCalculada: computeAge(canonical.idade_informada, parseDateFlexible(canonical.data_nascimento_iso || canonical.data_nascimento_original)),
      sexo: maybeNull(canonical.sexo),
      telefone: adolescentContact.telefoneOriginal,
      telefoneNormalizado: adolescentContact.telefoneNormalizado,
      email: adolescentContact.email,
      bairro: maybeNull(canonical.bairro),
      observacoes: buildObservacoes(canonical),
      aceiteImagem: parseBooleanPtBr(canonical.autorizacao_imagem),
      aceiteNormas: parseBooleanPtBr(canonical.aceite_normas_evento),
      responsavel: {
        nomeCompleto: responsavelNome,
        nomeNormalizado: normalizeName(responsavelNome),
        telefone: maybeNull(canonical.responsavel_telefone_original),
        telefoneNormalizado: normalizePhone(canonical.responsavel_telefone_normalizado || canonical.responsavel_telefone_original),
        email: normalizeEmail(canonical.responsavel_email_normalizado || canonical.responsavel_email_original),
      },
      payload: canonical,
    });

    if (rows.length > 1) {
      dropped.push({
        key,
        canonicalRow: Number(canonical.__rowNumber || 0),
        discardedRows: rows
          .map((row) => Number(row.__rowNumber || 0))
          .filter((rowNumber) => rowNumber !== Number(canonical.__rowNumber || 0)),
      });
    }
  }

  return { importRows, filteredRowCount: filtered.length, duplicatesCollapsed: dropped };
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

async function ensureEncontroTecnico() {
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
      data_inicio: `${CURRENT_YEAR}-01-01`,
      data_fim: `${CURRENT_YEAR}-12-31`,
    })
    .select('id,nome,status,data_inicio,data_fim')
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function findPessoaAdolescente({ nomeNormalizado, dataNascimento, email, telefoneNormalizado }) {
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
        .select('id')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('email_normalizado', email),
    );
    if (found?.id) return found.id;
  }

  if (nomeNormalizado && telefoneNormalizado) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('telefone_normalizado', telefoneNormalizado),
    );
    if (found?.id) return found.id;
  }

  if (nomeNormalizado) {
    const found = await maybeSingle(
      supabase
        .from('pessoas')
        .select('id')
        .eq('nome_normalizado', nomeNormalizado)
        .is('data_nascimento', null),
    );
    if (found?.id) return found.id;
  }

  return null;
}

async function upsertPessoaAdolescente(payload) {
  const existingId = await findPessoaAdolescente(payload);
  const now = new Date().toISOString();
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
    data_importacao: now,
    ultima_sincronizacao: now,
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
  const now = new Date().toISOString();
  const body = {
    nome_completo: payload.nomeCompleto,
    nome_normalizado: payload.nomeNormalizado,
    telefone: payload.telefone,
    telefone_normalizado: payload.telefoneNormalizado,
    email: payload.email,
    email_normalizado: payload.email,
    origem_dado: ORIGEM,
    criado_via_sistema: false,
    data_importacao: now,
    ultima_sincronizacao: now,
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

async function ensureAdolescente(pessoaId) {
  const existing = await maybeSingle(
    supabase.from('adolescentes').select('id').eq('pessoa_id', pessoaId),
  );

  const body = {
    pessoa_id: pessoaId,
    aceite_normas: true,
    ja_fez_eac: false,
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

async function ensureInscricao(encontroId, adolescenteId, rowRef, emailAdolescente, emailResponsavel) {
  const existing = await maybeSingle(
    supabase
      .from('inscricoes')
      .select('id,status')
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
    return { id: existing.id, existed: true };
  }

  const { data, error } = await supabase.from('inscricoes').insert(body).select('id').single();
  if (error) throw error;
  return { id: data.id, existed: false };
}

async function hasCadastroOficialAtivo(pessoaId) {
  const existing = await maybeSingle(
    supabase
      .from('cadastro_oficial')
      .select('id')
      .eq('pessoa_id', pessoaId)
      .eq('ativo', true),
  );
  return Boolean(existing?.id);
}

async function fetchCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return Number(count || 0);
}

async function main() {
  const rawCsv = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const rows = parseCsv(rawCsv);
  const prep = toImportRows(rows);
  const encontro = await ensureEncontroTecnico();

  const stats = {
    csvRows: rows.length,
    meaningfulRows: prep.filteredRowCount,
    canonicalRows: prep.importRows.length,
    duplicatesCollapsed: prep.duplicatesCollapsed.length,
    pessoasAdolescentes: 0,
    adolescentes: 0,
    pessoasResponsaveis: 0,
    responsaveis: 0,
    vinculos: 0,
    papeis: 0,
    inscricoesCriadas: 0,
    inscricoesAtualizadas: 0,
    reaproveitadosDos137: 0,
    novosSemCadastroOficial: 0,
    inscricoesIgnoradasPorCadastroOficial: 0,
    errors: [],
  };

  const seen = {
    pessoasAdolescentes: new Set(),
    adolescentes: new Set(),
    pessoasResponsaveis: new Set(),
    responsaveis: new Set(),
    vinculos: new Set(),
    papeis: new Set(),
  };

  for (const row of prep.importRows) {
    try {
      if (!row.nomeCompleto || !row.dataNascimento) {
        throw new Error('registro sem nome completo ou data de nascimento');
      }

      const pessoaAdolescenteId = await upsertPessoaAdolescente(row);
      const adolescenteId = await ensureAdolescente(pessoaAdolescenteId);
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

      const emCadastroOficial = await hasCadastroOficialAtivo(pessoaAdolescenteId);
      if (emCadastroOficial) {
        stats.reaproveitadosDos137 += 1;
        stats.inscricoesIgnoradasPorCadastroOficial += 1;
      } else {
        const { id: inscricaoId, existed } = await ensureInscricao(
          encontro.id,
          adolescenteId,
          `Triagem conferida:${row.rowNumber}`,
          row.email,
          row.responsavel.email,
        );

        if (existed) stats.inscricoesAtualizadas += 1;
        else stats.inscricoesCriadas += 1;

        void inscricaoId;
        stats.novosSemCadastroOficial += 1;
      }

      seen.pessoasAdolescentes.add(pessoaAdolescenteId);
      seen.adolescentes.add(adolescenteId);
      seen.papeis.add(papelId);
      if (pessoaResponsavelId) seen.pessoasResponsaveis.add(pessoaResponsavelId);
      if (responsavelId) seen.responsaveis.add(responsavelId);
      if (vinculoId) seen.vinculos.add(vinculoId);
    } catch (error) {
      stats.errors.push({
        rowNumber: row.rowNumber,
        sourceRows: row.sourceRows,
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
    encontroTecnico: encontro,
    statusInscricao: INSCRICAO_STATUS,
    importStats: stats,
    duplicatesCollapsed: prep.duplicatesCollapsed,
    dbCounts: counts,
  }, null, 2));

  if (stats.errors.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('[import-inscricoes-triagem-conferida] erro fatal:', safeErrorMessage(error));
  process.exit(1);
});
