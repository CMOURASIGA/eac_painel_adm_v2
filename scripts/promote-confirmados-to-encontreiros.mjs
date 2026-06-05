#!/usr/bin/env node

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

const encontroId = process.argv[2] || '01a689fc-ec90-4363-beb4-0e2681347deb';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'promote-confirmados-to-encontreiros' } },
});

function toCleanString(value) {
  return String(value ?? '').trim();
}

async function resolveEncontreirosTable() {
  const envTable = String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim();
  const candidates = ['encontreiros', 'cadastro_encontreiros', 'cadastro_encontreiro', envTable]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter((value) => !/^vw_/i.test(value));

  for (const table of candidates) {
    const probe = await supabase.from(table).select('*').limit(1);
    if (!probe.error) return table;
  }
  return '';
}

async function pickPayloadByExistingColumns(table, payload) {
  const filtered = {};
  for (const [key, value] of Object.entries(payload)) {
    const probe = await supabase.from(table).select(key).limit(1);
    if (!probe.error) filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : payload;
}

async function ensurePessoaPapelAtivo(pessoaId, papel) {
  const { data: existing, error: existingError } = await supabase
    .from('pessoa_papeis')
    .select('id,ativo')
    .eq('pessoa_id', pessoaId)
    .eq('papel', papel)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    if (existing.ativo === true) return existing.id;
    const { error: updateError } = await supabase.from('pessoa_papeis').update({ ativo: true }).eq('id', existing.id);
    if (updateError) throw updateError;
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

async function upsertEncontreiroFromEncontrista(params) {
  const table = await resolveEncontreirosTable();
  if (!table) return { created: false, updated: false, skipped: true };

  const nowIso = new Date().toISOString();
  const payloadCamel = {
    pessoa_id: params.pessoaId,
    nomeCompleto: params.nome,
    nome_completo: params.nome,
    email: params.email || null,
    celularWhatsapp: params.telefone || null,
    celular_whatsapp: params.telefone || null,
    bairro: params.bairro || null,
    dataNascimento: params.dataNascimento || null,
    data_nascimento: params.dataNascimento || null,
    idade: params.idade || null,
    classificacao: 'ADOLESCENTE',
    origem_cadastro: 'CONFIRMACAO_ENCONTRISTA',
    origemCadastro: 'CONFIRMACAO_ENCONTRISTA',
    referencia_encontrista: true,
    referenciaEncontrista: true,
    criado_via_sistema: true,
    created_at: nowIso,
    updated_at: nowIso,
    timestamp: nowIso,
  };

  const payload = await pickPayloadByExistingColumns(table, payloadCamel);

  const byPessoa = await supabase.from(table).select('id').eq('pessoa_id', params.pessoaId).limit(1);
  const existingByPessoa = Array.isArray(byPessoa.data) && byPessoa.data[0]?.id ? byPessoa.data[0] : null;

  if (existingByPessoa?.id) {
    const safeUpdate = await pickPayloadByExistingColumns(table, { ...payload, updated_at: nowIso });
    const { error } = await supabase.from(table).update(safeUpdate).eq('id', existingByPessoa.id);
    if (error) throw error;
    return { created: false, updated: true, skipped: false };
  }

  const byEmail = params.email
    ? await supabase.from(table).select('id').eq('email', params.email).limit(1)
    : { data: [], error: null };
  const existingByEmail = Array.isArray(byEmail.data) && byEmail.data[0]?.id ? byEmail.data[0] : null;

  if (existingByEmail?.id) {
    const safeUpdate = await pickPayloadByExistingColumns(table, { ...payload, updated_at: nowIso });
    const { error } = await supabase.from(table).update(safeUpdate).eq('id', existingByEmail.id);
    if (error) throw error;
    return { created: false, updated: true, skipped: false };
  }

  const safeInsert = await pickPayloadByExistingColumns(table, payload);
  const { error } = await supabase.from(table).insert(safeInsert);
  if (error) throw error;
  return { created: true, updated: false, skipped: false };
}

async function main() {
  const { data: inscricoes, error: inscricoesError } = await supabase
    .from('inscricoes')
    .select('id,adolescente_id')
    .eq('encontro_id', encontroId)
    .eq('status', 'CONFIRMADO');

  if (inscricoesError) throw inscricoesError;

  const adolescenteIds = [...new Set((inscricoes || []).map((row) => toCleanString(row.adolescente_id)).filter(Boolean))];
  const stats = {
    encontroId,
    confirmados: adolescenteIds.length,
    papeisEncontreiroGarantidos: 0,
    encontreirosCriados: 0,
    encontreirosAtualizados: 0,
    erros: [],
  };

  for (const adolescenteId of adolescenteIds) {
    try {
      const { data: adolescente, error: adolescenteError } = await supabase
        .from('adolescentes')
        .select('pessoa_id')
        .eq('id', adolescenteId)
        .limit(1)
        .maybeSingle();
      if (adolescenteError) throw adolescenteError;

      const pessoaId = toCleanString(adolescente?.pessoa_id);
      if (!pessoaId) throw new Error(`adolescente ${adolescenteId} sem pessoa_id`);

      await ensurePessoaPapelAtivo(pessoaId, 'ENCONTRISTA');
      await ensurePessoaPapelAtivo(pessoaId, 'ENCONTREIRO');
      stats.papeisEncontreiroGarantidos += 1;

      const { data: pessoa, error: pessoaError } = await supabase
        .from('pessoas')
        .select('nome_completo,email,telefone,bairro,data_nascimento,idade_calculada')
        .eq('id', pessoaId)
        .limit(1)
        .maybeSingle();
      if (pessoaError) throw pessoaError;

      const syncResult = await upsertEncontreiroFromEncontrista({
        pessoaId,
        nome: toCleanString(pessoa?.nome_completo),
        email: toCleanString(pessoa?.email),
        telefone: toCleanString(pessoa?.telefone),
        bairro: toCleanString(pessoa?.bairro),
        dataNascimento: toCleanString(pessoa?.data_nascimento),
        idade: toCleanString(pessoa?.idade_calculada),
      });

      if (syncResult.created) stats.encontreirosCriados += 1;
      if (syncResult.updated) stats.encontreirosAtualizados += 1;
    } catch (error) {
      stats.erros.push({
        adolescenteId,
        error: String(error?.message || error || 'erro desconhecido'),
      });
    }
  }

  const { count: pessoaPapeisEncontreiroCount, error: countPapelError } = await supabase
    .from('pessoa_papeis')
    .select('*', { count: 'exact', head: true })
    .eq('papel', 'ENCONTREIRO')
    .eq('ativo', true);
  if (countPapelError) throw countPapelError;

  const encontreiroTable = await resolveEncontreirosTable();
  let encontreirosCount = null;
  if (encontreiroTable) {
    const { count, error } = await supabase.from(encontreiroTable).select('*', { count: 'exact', head: true });
    if (error) throw error;
    encontreirosCount = Number(count || 0);
  }

  console.log(JSON.stringify({
    ...stats,
    pessoaPapeisEncontreiroAtivos: Number(pessoaPapeisEncontreiroCount || 0),
    tabelaEncontreiros: encontreiroTable || null,
    totalEncontreirosTabela: encontreirosCount,
  }, null, 2));

  if (stats.erros.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('[promote-confirmados-to-encontreiros] erro fatal:', String(error?.message || error));
  process.exit(1);
});
