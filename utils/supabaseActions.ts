Warning: truncated output (original token count: 55001)
Total output lines: 5351

﻿import type { SupabaseClient as BaseSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from './supabaseServer.js';
import { createHash, timingSafeEqual } from 'crypto';
import { markPresenceService } from '../services/presencaBusinessService.js';
import { prioritizeNonEnrolledService } from '../services/priorizacaoService.js';
import {
  saveEventService,
  deleteEventService,
  saveComunicadoService,
  deleteComunicadoService,
} from '../services/calendarioComunicadosService.js';
import {
  logDispatchExecutionService,
  logDispatchDestinatariosService,
  buildNonEnrolledDispatchAudienceService,
} from '../services/disparosBusinessService.js';

type JsonObject = Record<string, any>;
type SupabaseClient = BaseSupabaseClient<any, 'public', string, any, any>;

type SupabaseActionContext = {
  action: string;
  payload: JsonObject;
};

type SupabaseActionResult =
  | { ok: true; data: JsonObject; error?: undefined; details?: undefined }
  | { ok: false; error: string; details?: any; data?: undefined };

const DEFAULT_MAX_ROWS = 10000;

const isMissingRelationError = (err: any) => {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('relation') && msg.includes('does not exist')
  );
};

const isPermissionDeniedError = (err: any) => {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('permission denied') ||
    msg.includes('insufficient privilege') ||
    msg.includes('not authorized')
  );
};

const normalizeDigits = (value: any) => String(value || '').replace(/\D/g, '');
const cleanText = (value: any) => String(value ?? '').trim();

const hashSha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function secureCompare(a: string, b: string) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function isLikelyPasswordHash(value: string) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.startsWith('sha256:')) return true;
  if (/^[a-f0-9]{64}$/i.test(v)) return true;
  if (v.startsWith('$2a$') || v.startsWith('$2b$') || v.startsWith('$2y$')) return true;
  return false;
}

async function enviarEmailCadastroEfetivado(opts: {
  nome: string;
  email: string;
  assunto: string;
  mensagemHtml: string;
}) {
  const senderMode = cleanText(process.env.EAC_EMAIL_SENDER_MODE || '').toLowerCase();
  const senderFrom = cleanText(process.env.EAC_EMAIL_FROM || '');
  if (senderMode !== 'smtp' || !senderFrom) return { sent: false as const, reason: 'smtp_not_configured' };

  const to = cleanText(opts.email).toLowerCase();
  if (!to || !to.includes('@') || !to.includes('.')) return { sent: false as const, reason: 'missing_destination_email' };

  const smtpHost = cleanText(process.env.SMTP_HOST || 'smtp.gmail.com');
  const smtpPort = Number(process.env.SMTP_PORT || 587) || 587;
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
  const smtpUser = cleanText(process.env.SMTP_USER || '');
  const smtpPass = cleanText(process.env.SMTP_PASS || process.env.passwordGmail || '');
  if (!smtpUser || !smtpPass) return { sent: false as const, reason: 'smtp_credentials_missing' };

  const nodemailerMod: any = await import('nodemailer');
  const nodemailer = nodemailerMod?.default || nodemailerMod;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const htmlBody = `
    <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:680px;margin:0 auto;border:1px solid #dbe3ef;border-radius:24px;overflow:hidden;background:#ffffff;">
        <div style="background:#044372;padding:24px 16px;text-align:center;">
          <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" style="height:40px;display:inline-block;" />
        </div>
        <div style="padding:28px 30px;color:#334155;font-size:16px;line-height:1.65;">
          ${opts.mensagemHtml}
        </div>
        <div style="padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <a href="https://www.instagram.com/eacporciunculadesantana/" style="display:inline-block;background:#044372;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Siga nosso Instagram</a>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: senderFrom,
    to,
    subject: cleanText(opts.assunto) || 'EAC: Cadastro efetivado',
    html: htmlBody,
    textEncoding: 'base64',
  });

  return { sent: true as const, reason: 'ok' };
}

const pickFirst = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (!row) continue;
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return '';
};

const toYesNo = (value: any) => {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return '';
  if (['sim', 's', 'yes', 'y', '1', 'true', 'x'].includes(s)) return 'Sim';
  if (['nao', 'não', 'n', 'no', '0', 'false'].includes(s)) return 'Não';
  return String(value ?? '').trim();
};

const toBool = (value: any) => ['1', 'true', 'sim', 'yes', 'y', 'x'].includes(String(value ?? '').trim().toLowerCase());
const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

async function queryFirstExistingTable<T>(
  supabase: SupabaseClient,
  tableCandidates: string[],
  run: (tableName: string) => Promise<{ data: T | null; error: any }>
): Promise<{ table: string; data: T }> {
  let lastErr: any = null;
  const denied: string[] = [];
  const missing: string[] = [];
  for (const table of tableCandidates) {
    const { data, error } = await run(table);
    if (error) {
      lastErr = error;
      if (isPermissionDeniedError(error)) {
        denied.push(table);
        continue;
      }
      if (isMissingRelationError(error)) {
        missing.push(table);
        continue;
      }
      throw error;
    }
    return { table, data: (data as T) ?? (null as any) };
  }
  if (lastErr) {
    if (denied.length > 0) {
      throw new Error(`Permissão insuficiente nas fontes: ${denied.join(', ')}.`);
    }
    if (missing.length > 0) {
      throw new Error(`Nenhuma fonte encontrada no schema: ${missing.join(', ')}.`);
    }
    throw lastErr;
  }
  throw new Error('Nenhuma tabela candidata foi encontrada no Supabase.');
}

async function fetchAllRows(
  supabase: SupabaseClient,
  tableCandidates: string[],
  opts: { orderBy?: string; ascending?: boolean; maxRows?: number } = {}
) {
  const maxRows = Math.max(1, Number(opts.maxRows || process.env.EAC_SUPABASE_MAX_ROWS || DEFAULT_MAX_ROWS) || DEFAULT_MAX_ROWS);
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);

  const all: any[] = [];
  const { table } = await queryFirstExistingTable<any[]>(
    supabase,
    tableCandidates,
    async (tableName) => {
      const query = supabase.from(tableName).select('*').range(0, Math.min(pageSize - 1, maxRows - 1));
      if (opts.orderBy) query.order(opts.orderBy, { ascending: opts.ascending ?? true });
      return await query;
    }
  );

  for (let p = 0; p < pages; p += 1) {
    const from = p * pageSize;
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    if (from > to) break;

    const query = supabase.from(table).select('*').range(from, to);
    if (opts.orderBy) query.order(opts.orderBy, { ascending: opts.ascending ?? true });
    const { data, error } = await query;
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

async function getAvailableColumns(supabase: SupabaseClient, tableName: string): Promise<Set<string>> {
  const raw = cleanText(tableName);
  if (!raw) return new Set<string>();
  const probe = await supabase.from(raw).select('*').limit(1);
  if (probe.error) return new Set<string>();
  const row = Array.isArray(probe.data) ? probe.data[0] : null;
  if (!row || typeof row !== 'object') return new Set<string>();
  return new Set(Object.keys(row).map((k) => cleanText(k)).filter(Boolean));
}

function pickPayloadByColumns(payload: Record<string, any>, columns: Set<string>) {
  if (!columns || columns.size === 0) return payload;
  const filtered: Record<string, any> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (columns.has(key)) filtered[key] = value;
  });
  return filtered;
}

async function pickPayloadByExistingColumns(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, any>
) {
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload || {})) {
    const probe = await supabase.from(table).select(key).limit(1);
    if (!probe.error) filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : payload;
}

function extractOriginFields(row: any) {
  return {
    origem_dado: pickFirst(row, ['origem_dado', 'origemDado', 'data_origin', 'source_origin']),
    data_importacao: pickFirst(row, ['data_importacao', 'dataImportacao', 'imported_at', 'importedAt']),
    id_origem_planilha: pickFirst(row, ['id_origem_planilha', 'idOrigemPlanilha', 'sheet_row_id', 'sheetRowId']),
    ultima_sincronizacao: pickFirst(row, ['ultima_sincronizacao', 'ultimaSincronizacao', 'synced_at', 'syncedAt', 'updated_at', 'updatedAt']),
    criado_via_sistema: pickFirst(row, ['criado_via_sistema', 'criadoViaSistema', 'created_by_system', 'createdBySystem']),
  };
}

function normalizeMember(row: any) {
  const statusRaw = pickFirst(row, [
    'status',
    'status_inscricao',
    'statusInscricao',
    'status_operacional',
    'statusOperacional',
    'situacao',
    'situacao_inscricao',
  ]);
  return {
    ...extractOriginFields(row),
    cadastro_oficial_id: pickFirst(row, ['cadastro_oficial_id', 'cadastroOficialId', 'id']),
    pessoa_id: pickFirst(row, ['pessoa_id', 'pessoaId']),
    adolescente_id: pickFirst(row, ['adolescente_id', 'adolescenteId']),
    responsavel_id: pickFirst(row, ['responsavel_id', 'responsavelId']),
    timestamp: pickFirst(row, ['timestamp', 'carimbo', 'created_at', 'createdAt']),
    nome: pickFirst(row, ['nome', 'name', 'nome_completo', 'nomeCompleto']),
    nascimento: pickFirst(row, ['nascimento', 'data_nascimento', 'dataNascimento']),
    sexo: pickFirst(row, ['sexo', 'gender']),
    endereco: pickFirst(row, ['endereco', 'endereço', 'address', 'endereco_completo', 'enderecoCompleto']),
    bairro: pickFirst(row, ['bairro', 'neighborhood']),
    telefone: pickFirst(row, ['telefone', 'celular', 'whatsapp', 'phone']),
    email: pickFirst(row, ['email', 'e-mail']),
    responsavelNome: pickFirst(row, ['responsavelNome', 'responsavel_nome', 'nome_responsavel']),
    responsavelTel: pickFirst(row, ['responsavelTel', 'responsavel_tel', 'responsavel_telefone', 'telefone_responsavel']),
    responsavelEmail: pickFirst(row, ['responsavelEmail', 'responsavel_email', 'email_responsavel']),
    tempoParoquia: pickFirst(row, ['tempoParoquia', 'tempo_paroquia']),
    participaGrupo: pickFirst(row, ['participaGrupo', 'participa_grupo']),
    motivacao: pickFirst(row, ['motivacao', 'motivação']),
    expectativas: pickFirst(row, ['expectativas']),
    autorizaImagem: toYesNo(pickFirst(row, ['autorizaImagem', 'autoriza_imagem'])),
    concordaNormas: toYesNo(pickFirst(row, ['concordaNormas', 'concorda_normas'])),
    idade: pickFirst(row, ['idade', 'idade_snapshot', 'age']),
    pertencePorciuncula: toYesNo(pickFirst(row, ['pertencePorciuncula', 'pertence_porciuncula'])),
    statusAniv: pickFirst(row, ['statusAniv', 'status_aniv']),
    whatsapp: pickFirst(row, ['whatsapp', 'telefone_whatsapp', 'celularWhatsapp', 'celular_whatsapp']),
    anivSimNao: toYesNo(pickFirst(row, ['anivSimNao', 'aniv_sim_nao'])),
    statusEnvioCom: pickFirst(row, ['statusEnvioCom', 'status_envio_com']),
    statusEnvioSem: pickFirst(row, ['statusEnvioSem', 'status_envio_sem']),
    status: statusRaw,
    statusInscricao: statusRaw,
    priorizado: pickFirst(row, ['priorizado', 'is_priorizado']),
    confirmado: pickFirst(row, ['confirmado', 'is_confirmado']),
    naoSelecionado: pickFirst(row, ['naoSelecionado', 'nao_selecionado', 'status_nao_selecionado']),
    desistente: pickFirst(row, ['desistente', 'is_desistente']),
    cancelado: pickFirst(row, ['cancelado', 'is_cancelado']),
  };
}

function normalizePhoneStorage(value: any) {
  const raw = cleanText(value);
  if (!raw) return { original: '', normalized: '' };
  return { original: raw, normalized: normalizeDigits(raw) };
}

function parseMemberBirthDate(value: any) {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function calcCurrentAgeFromBirthDate(value: any) {
  const iso = parseMemberBirthDate(value);
  if (!iso) return null;
  const dt = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - dt.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dt.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dt.getUTCDate())) age -= 1;
  return age;
}

function parseLooseAge(value: any) {
  const raw = cleanText(value);
  if (!raw) return NaN;

  const numeric = Number(raw.replace(',', '.'));
  if (Number.isFinite(numeric)) return Math.floor(numeric);

  const digits = raw.match(/\d{1,3}/g);
  if (!digits || digits.length === 0) return NaN;

  for (const token of digits) {
    const n = Number(token);
    if (Number.isFinite(n) && n >= 0 && n <= 120) return Math.floor(n);
  }

  return NaN;
}

function isEligibleForCircleByAge(age: number, birthDate: any, minAge: number, maxAge: number) {
  if (!Number.isFinite(age)) return false;
  if (age >= minAge && age <= maxAge) return true;

  if (age !== 12) return false;

  const iso = parseMemberBirthDate(birthDate);
  if (!iso) return false;
  const birth = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;

  const turns13At = new Date(Date.UTC(
    birth.getUTCFullYear() + 13,
    birth.getUTCMonth(),
    birth.getUTCDate(),
    12, 0, 0, 0
  ));
  const now = new Date();
  const diffMs = turns13At.getTime() - now.getTime();
  const sixMonthsMs = 183 * 24 * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs <= sixMonthsMs;
}

function buildMemberRecord(params: {
  cadastro: any;
  pessoa: any;
  adolescente: any;
  responsavel: any;
}) {
  const { cadastro, pessoa, adolescente, responsavel } = params;
  const participaGrupo =
    pickFirst(adolescente, ['grupo_ministerio_descricao', 'participa_grupo_ministerio']) ||
    pickFirst(pessoa, ['participa_grupo', 'participaGrupo']);

  return normalizeMember({
    ...extractOriginFields(cadastro),
    cadastro_oficial_id: pickFirst(cadastro, ['id']),
    pessoa_id: pickFirst(pessoa, ['id', 'pessoa_id']),
    adolescente_id: pickFirst(adolescente, ['id', 'adolescente_id']),
    responsavel_id: pickFirst(responsavel, ['id', 'responsavel_id']),
    timestamp: pickFirst(cadastro, ['data_entrada_cadastro', 'created_at', 'criado_em', 'updated_at', 'atualizado_em']),
    nome_completo: pickFirst(pessoa, ['nome_completo']),
    nascimento: pickFirst(pessoa, ['data_nascimento']),
    sexo: pickFirst(pessoa, ['sexo']),
    endereco: pickFirst(pessoa, ['endereco']),
    bairro: pickFirst(pessoa, ['bairro']),
    telefone: pickFirst(pessoa, ['telefone']),
    whatsapp: pickFirst(pessoa, ['telefone']),
    email: pickFirst(pessoa, ['email']),
    responsavel_nome: pickFirst(responsavel, ['nome']),
    responsavel_telefone: pickFirst(responsavel, ['telefone']),
    responsavel_email: pickFirst(responsavel, ['email']),
    tempo_paroquia: pickFirst(adolescente, ['tempo_participacao_paroquia']),
    participa_grupo: participaGrupo,
    motivacao: pickFirst(adolescente, ['motivacao']),
    expectativas: pickFirst(adolescente, ['expectativas']),
    autoriza_imagem: pickFirst(adolescente, ['autorizacao_imagem']),
    concorda_normas: pickFirst(adolescente, ['aceite_normas']),
    pertence_porciuncula: pickFirst(pessoa, ['pertence_porciuncula']),
    idade: pickFirst(pessoa, ['idade_calculada']),
    status: 'CONFIRMADO',
    status_inscricao: 'CONFIRMADO',
    confirmado: 'Sim',
  });
}

async function fetchActiveMembersFromNormalizedTables(supabase: SupabaseClient) {
  let cadastroRows: any[] = [];
  try {
    cadastroRows = await fetchAllRows(supabase, ['cadastro_oficial'].filter(Boolean), { maxRows: 50000 });
  } catch {
    cadastroRows = [];
  }
  const activeCadastros = (Array.isArray(cadastroRows) ? cadastroRows : []).filter((row: any) => {
    return row?.ativo !== false && cleanText(pickFirst(row, ['status'])).toUpperCase() !== 'INATIVO';
  });

  const pessoaIds = Array.from(new Set(activeCadastros.map((row: any) => cleanText(row?.pessoa_id)).filter(Boolean)));
  const [pessoasRes, adolescentesRes] = await Promise.all([
    pessoaIds.length ? supabase.from('pessoas').select('*').in('id', pessoaIds) : Promise.resolve({ data: [], error: null } as any),
    pessoaIds.length ? supabase.from('adolescentes').select('*').in('pessoa_id', pessoaIds) : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (pessoasRes.error) throw pessoasRes.error;
  if (adolescentesRes.error) throw adolescentesRes.error;

  const adolescentes = Array.isArray(adolescentesRes.data) ? adolescentesRes.data : [];
  const pessoas = Array.isArray(pessoasRes.data) ? pessoasRes.data : [];
  const adolescentesByPessoaId = new Map<string, any>(adolescentes.map((row: any) => [cleanText(row?.pessoa_id), row]));

  const adolescenteIds = adolescentes.map((row: any) => cleanText(row?.id)).filter(Boolean);
  const vinculosRes = adolescenteIds.length
    ? await supabase
        .from('adolescente_responsaveis')
        .select('id,adolescente_id,responsavel_id,principal')
        .in('adolescente_id', adolescenteIds)
        .order('principal', { ascending: false })
    : ({ data: [], error: null } as any);
  if (vinculosRes.error) throw vinculosRes.error;

  const vinculos = Array.isArray(vinculosRes.data) ? vinculosRes.data : [];
  const principalVinculoByAdolescenteId = new Map<string, any>();
  vinculos.forEach((row: any) => {
    const key = cleanText(row?.adolescente_id);
    if (!key || principalVinculoByAdolescenteId.has(key)) return;
    principalVinculoByAdolescenteId.set(key, row);
  });

  const responsavelIds = Array.from(
    new Set(vinculos.map((row: any) => cleanText(row?.responsavel_id)).filter(Boolean))
  );
  const responsaveisRes = responsavelIds.length
    ? await supabase.from('responsaveis').select('*').in('id', responsavelIds)
    : ({ data: [], error: null } as any);
  if (responsaveisRes.error) throw responsaveisRes.error;

  const pessoasById = new Map<string, any>(pessoas.map((row: any) => [cleanText(row?.id), row]));
  const responsaveisById = new Map<string, any>(
    (Array.isArray(responsaveisRes.data) ? responsaveisRes.data : []).map((row: any) => [cleanText(row?.id), row])
  );

  const members = activeCadastros
    .map((cadastro: any) => {
      const pessoaId = cleanText(cadastro?.pessoa_id);
      const pessoa = pessoasById.get(pessoaId);
      const adolescente = adolescentesByPessoaId.get(pessoaId);
      const vinculo = adolescente ? principalVinculoByAdolescenteId.get(cleanText(adolescente?.id)) : null;
      const responsavel = vinculo ? responsaveisById.get(cleanText(vinculo?.responsavel_id)) : null;
      return buildMemberRecord({ cadastro, pessoa, adolescente, responsavel });
    })
    .filter((member: any) => cleanText(member?.nome));

  if (members.length === 0) {
    const fallbackRows = await fetchAllRows(
      supabase,
      [
        String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
        'vw_cadastro_oficial',
        'cadastro',
        'members',
        'membros',
        'adolescentes',
      ].filter(Boolean),
      { maxRows: 50000 }
    );

    const fallbackMembers = (Array.isArray(fallbackRows) ? fallbackRows : [])
      .map(normalizeMember)
      .filter((member: any) => cleanText(member?.nome));

    fallbackMembers.sort((a: any, b: any) => cleanText(a?.nome).localeCompare(cleanText(b?.nome)));
    return fallbackMembers;
  }

  members.sort((a: any, b: any) => cleanText(a?.nome).localeCompare(cleanText(b?.nome)));
  return members;
}

async function resolveMemberContext(supabase: SupabaseClient, payload: any) {
  const pessoaIdFromPayload = cleanText(payload?.pessoa_id);
  const adolescenteIdFromPayload = cleanText(payload?.adolescente_id);
  const responsavelIdFromPayload = cleanText(payload?.responsavel_id);
  const cadastroIdFromPayload = cleanText(payload?.cadastro_oficial_id);
  const email = cleanText(payload?.email).toLowerCase();
  const originalEmail = cleanText(payload?.originalEmail).toLowerCase();

  let cadastro: any = null;
  let pessoa: any = null;
  let adolescente: any = null;
  let responsavel: any = null;

  if (cadastroIdFromPayload) {
    const res = await supabase.from('cadastro_oficial').select('*').eq('id', cadastroIdFromPayload).limit(1).maybeSingle();
    if (!res.error) cadastro = res.data || null;
  }

  if (!cadastro && pessoaIdFromPayload) {
    const res = await supabase.from('cadastro_oficial').select('*').eq('pessoa_id', pessoaIdFromPayload).eq('ativo', true).limit(1).maybeSingle();
    if (!res.error) cadastro = res.data || null;
  }

  if (!cadastro && (email || originalEmail)) {
    const emailCandidates = [email, originalEmail].filter(Boolean);
    const pessoaRes = await supabase.from('pessoas').select('id,email').in('email', emailCandidates).limit(2);
    if (!pessoaRes.error) {
      const pessoaIds = (Array.isArray(pessoaRes.data) ? pessoaRes.data : []).map((row: any) => cleanText(row?.id)).filter(Boolean);
      if (pessoaIds.length) {
        const cadastroRes = await supabase.from('cadastro_oficial').select('*').in('pessoa_id', pessoaIds).eq('ativo', true).limit(1).maybeSingle();
        if (!cadastroRes.error) cadastro = cadastroRes.data || null;
      }
    }
  }

  if (cadastro?.pessoa_id) {
    const pessoaRes = await supabase.from('pessoas').select('*').eq('id', cadastro.pessoa_id).limit(1).maybeSingle();
    if (pessoaRes.error) throw pessoaRes.error;
    pessoa = pessoaRes.data || null;
  } else if (pessoaIdFromPayload) {
    const pessoaRes = await supabase.from('pessoas').select('*').eq('id', pessoaIdFromPayload).limit(1).maybeSingle();
    if (pessoaRes.error) throw pessoaRes.error;
    pessoa = pessoaRes.data || null;
  }

  if (adolescenteIdFromPayload) {
    const adolescenteRes = await supabase.from('adolescentes').select('*').eq('id', adolescenteIdFromPayload).limit(1).maybeSingle();
    if (adolescenteRes.error) throw adolescenteRes.error;
    adolescente = adolescenteRes.data || null;
  } else if (pessoa?.id) {
    const adolescenteRes = await supabase.from('adolescentes').select('*').eq('pessoa_id', pessoa.id).limit(1).maybeSingle();
    if (adolescenteRes.error) throw adolescenteRes.error;
    adolescente = adolescenteRes.data || null;
  }

  if (responsavelIdFromPayload) {
    const responsavelRes = await supabase.from('responsaveis').select('*').eq('id', responsavelIdFromPayload).limit(1).maybeSingle();
    if (responsavelRes.error) throw responsavelRes.error;
    responsavel = responsavelRes.data || null;
  } else if (adolescente?.id) {
    const vinculoRes = await supabase
      .from('adolescente_responsaveis')
      .select('responsavel_id,principal')
      .eq('adolescente_id', adolescente.id)
      .order('principal', { ascending: false })
      .limit(1);
    if (vinculoRes.error) throw vinculoRes.error;
    const responsavelId = cleanText(Array.isArray(vinculoRes.data) ? vinculoRes.data[0]?.responsavel_id : '');
    if (responsavelId) {
      const responsavelRes = await supabase.from('responsaveis').select('*').eq('id', responsavelId).limit(1).maybeSingle();
      if (responsavelRes.error) throw responsavelRes.error;
      responsavel = responsavelRes.data || null;
    }
  }

  return { cadastro, pessoa, adolescente, responsavel };
}

function normalizeNonEnrolled(row: any) {
  return {
    ...extractOriginFields(row),
    linhaOrigem: pickFirst(row, ['linhaOrigem', 'linha_origem', 'id_pessoa', 'idPessoa', 'id']),
    nome: pickFirst(row, ['nome', 'nome_completo', 'nomeCompleto']),
    nascimento: pickFirst(row, ['nascimento', 'data_nascimento', 'dataNascimento', 'dataNascimentoRaw']),
    dataNascimento: pickFirst(row, ['dataNascimento', 'data_nascimento', 'nascimento']),
    email: pickFirst(row, ['email', 'e-mail']),
    status: pickFirst(row, ['status']),
    dataCadastro: pickFirst(row, ['dataCadastro', 'data_cadastro', 'created_at', 'createdAt']),
    telefone: pickFirst(row, ['telefone', 'celular', 'whatsapp', 'phone']),
    bairro: pickFirst(row, ['bairro', 'bairro_snapshot']),
    sexo: pickFirst(row, ['sexo', 'sexo_snapshot']),
    statusEnvio: pickFirst(row, ['statusEnvio', 'status_envio']),
    interesseConfirmado: pickFirst(row, ['interesseConfirmado', 'interesse_confirmado', 'interesse']),
    jaFezEac: pickFirst(row, ['jaFezEac', 'ja_fez_eac', 'fezEac']),
    contatoMudou: pickFirst(row, ['contatoMudou', 'contato_mudou']),
    recado: pickFirst(row, ['recado']),
    dataResposta: pickFirst(row, ['dataResposta', 'data_resposta']),
    amigo: pickFirst(row, ['amigo', 'amigoParaFazer', 'amigo_para_fazer']),
    nomeAmigo: pickFirst(row, ['nomeAmigo', 'nome_amigo']),
    statusPreConfirmacao: pickFirst(row, ['statusPreConfirmacao', 'status_pre_confirmacao', 'preConfirmacaoStatus']),
    statusPriorizacao: pickFirst(row, ['statusPriorizacao', 'status_priorizacao']),
  };
}

function normalizeCalendarEvent(row: any) {
  return {
    ...extractOriginFields(row),
    id: pickFirst(row, ['id', 'uuid']) || undefined,
    atividade: pickFirst(row, ['atividade', 'title', 'nome', 'name']),
    tipo: pickFirst(row, ['tipo', 'type']),
    inicio: pickFirst(row, ['inicio', 'start', 'inicio_iso', 'start_at', 'startAt']),
    termino: pickFirst(row, ['termino', 'end', 'termino_iso', 'end_at', 'endAt']),
    local: pickFirst(row, ['local', 'location']),
    proprietario: pickFirst(row, ['proprietario', 'owner']),
    status: pickFirst(row, ['status']),
    encontroId: pickFirst(row, ['encontro_id', 'encontroId']),
  };
}

function normalizeComunicado(row: any) {
  return {
    ...extractOriginFields(row),
    id: pickFirst(row, ['id', 'uuid']) || '',
    titulo: pickFirst(row, ['titulo', 'title']),
    assunto: pickFirst(row, ['assunto', 'subject']),
    corpo: pickFirst(row, ['corpo', 'body', 'conteudo', 'content']),
    status: pickFirst(row, ['status']),
    dataAgendada: pickFirst(row, ['dataAgendada', 'data_agendada', 'scheduled_at', 'scheduledAt']),
    dataEventos: pickFirst(row, ['dataEventos', 'data_eventos', 'events_at', 'eventsAt']),
  };
}

function normalizeUserPermission(value: any) {
  return toYesNo(value) || 'Não';
}

function normalizeUserRecord(row: any) {
  return {
    id: pickFirst(row, ['id', 'uuid']),
    usuario: pickFirst(row, ['usuario', 'email', 'login']),
    senha: pickFirst(row, ['senha', 'password', 'password_hash']),
    perfil: pickFirst(row, ['perfil', 'role', 'perfil_nome']) || 'Simples',
    status: pickFirst(row, ['status']) || 'Ativo',
    inclusao: normalizeUserPermission(pickFirst(row, ['inclusao', 'can_create'])),
    alteracao: normalizeUserPermission(pickFirst(row, ['alteracao', 'can_edit'])),
    visualizacao: normalizeUserPermission(pickFirst(row, ['visualizacao', 'can_view'])),
    exclusao: normalizeUserPermission(pickFirst(row, ['exclusao', 'can_delete'])),
    disparo: normalizeUserPermission(pickFirst(row, ['disparo'])),
    calendario: normalizeUserPermission(pickFirst(row, ['calendario', 'calendar'])),
    comunicado: normalizeUserPermission(pickFirst(row, ['comunicado'])),
    log: normalizeUserPermission(pickFirst(row, ['log'])),
    usuario_mod: normalizeUserPermission(pickFirst(row, ['usuario_mod', 'users'])),
    ajuste: normalizeUserPermission(pickFirst(row, ['ajuste', 'settings'])),
    ajuda: normalizeUserPermission(pickFirst(row, ['ajuda', 'help'])),
    cadastro: normalizeUserPermission(pickFirst(row, ['cadastro', 'members'])),
    encontreiro: normalizeUserPermission(pickFirst(row, ['encontreiro'])),
    encontreiro_inclusao: normalizeUserPermission(pickFirst(row, ['encontreiro_inclusao'])),
    encontreiro_alteracao: normalizeUserPermission(pickFirst(row, ['encontreiro_alteracao'])),
    encontreiro_visualizacao: normalizeUserPermission(pickFirst(row, ['encontreiro_visualizacao'])),
    encontreiro_exclusao: normalizeUserPermission(pickFirst(row, ['encontreiro_exclusao'])),
    encontreiro_dados_sensiveis: normalizeUserPermission(pickFirst(row, ['encontreiro_dados_sensiveis'])),
    prioritarios: normalizeUserPermission(pickFirst(row, ['prioritarios'])),
    circulos: normalizeUserPermission(pickFirst(row, ['circulos', 'circles'])),
    presenca: normalizeUserPermission(pickFirst(row, ['presenca', 'presence'])),
  };
}

function yesNoToBool(value: any) {
  return normalizeUserPermission(value) === 'Sim';
}

function boolToYesNo(value: any) {
  return value ? 'Sim' : 'Não';
}

function profileToLegacyUserRecord(row: any) {
  const role = cleanText(row?.role).toUpperCase();
  const isAdmin = role === 'ADMIN';
  const status = cleanText(row?.status).toUpperCase() === 'ATIVO' ? 'Ativo' : 'Inativo';
  const modules = Array.isArray(row?.allowed_modules) ? row.allowed_modules.map((x: any) => cleanText(x)) : [];
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};

  const canCreate = isAdmin || toBool(metadata?.canCreate);
  const canEdit = isAdmin || toBool(metadata?.canEdit);
  const canDelete = isAdmin || toBool(metadata?.canDelete);
  const mod = (name: string) => isAdmin || modules.includes(name);

  return {
    id: cleanText(row?.id || row?.auth_user_id),
    usuario: cleanText(row?.email),
    senha: '',
    perfil: isAdmin ? 'Administrador' : 'Simples',
    status,
    inclusao: boolToYesNo(canCreate),
    alteracao: boolToYesNo(canEdit),
    visualizacao: 'Sim',
    exclusao: boolToYesNo(canDelete),
    disparo: boolToYesNo(mod('dispatches')),
    calendario: boolToYesNo(mod('calendar')),
    comunicado: boolToYesNo(mod('comunicados')),
    log: boolToYesNo(mod('logs')),
    usuario_mod: boolToYesNo(mod('users')),
    ajuste: boolToYesNo(mod('settings')),
    ajuda: boolToYesNo(mod('help')),
    cadastro: boolToYesNo(mod('members')),
    encontreiro: boolToYesNo(mod('encontreiros')),
    encontreiro_inclusao: boolToYesNo(isAdmin || toBool(metadata?.encontreiros?.canCreate) || canCreate),
    encontreiro_alteracao: boolToYesNo(isAdmin || toBool(metadata?.encontreiros?.canEdit) || canEdit),
    encontreiro_visualizacao: 'Sim',
    encontreiro_exclusao: boolToYesNo(isAdmin || toBool(metadata?.encontreiros?.canDelete) || canDelete),
    encontreiro_dados_sensiveis: boolToYesNo(isAdmin || toBool(metadata?.encontreiros?.canViewSensitive)),
    prioritarios: boolToYesNo(mod('inscricoes_prioritarias')),
    circulos: boolToYesNo(mod('inscricoes_prioritarias_circulos')),
    presenca: boolToYesNo(mod('presence')),
  };
}

function buildAllowedModulesFromLegacyPayload(payload: any, isAdmin: boolean) {
  if (isAdmin) {
    return ['dashboard','dispatches','calendar','comunicados','logs','users','settings','help','members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','encontreiros','presence','inscricoes_review'];
  }
  const mods = new Set<string>(['dashboard']);
  if (yesNoToBool(payload.cadastro)) mods.add('members');
  if (yesNoToBool(payload.prioritarios)) mods.add('inscricoes_prioritarias');
  if (yesNoToBool(payload.circulos)) mods.add('inscricoes_prioritarias_circulos');
  if (yesNoToBool(payload.encontreiro)) mods.add('encontreiros');
  if (yesNoToBool(payload.presenca)) mods.add('presence');
  if (yesNoToBool(payload.calendario)) mods.add('calendar');
  if (yesNoToBool(payload.comunicado)) mods.add('comunicados');
  if (yesNoToBool(payload.disparo)) mods.add('dispatches');
  if (yesNoToBool(payload.log)) mods.add('logs');
  if (yesNoToBool(payload.usuario_mod)) mods.add('users');
  if (yesNoToBool(payload.ajuda)) mods.add('help');
  if (yesNoToBool(payload.ajuste)) mods.add('settings');
  mods.add('inscricoes_review');
  return Array.from(mods);
}

function buildPublicPresenceCandidates(payload: {
  encontreiros?: any[];
  encontristas?: any[];
  presence?: any[];
}) {
  const toClean = (v: any) => String(v ?? '').trim();
  const normalizeDigitsLocal = (v: any) => String(v || '').replace(/\D/g, '');
  const normalizeTextLocal = (v: any) =>
    toClean(v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const encontreiros = Array.isArray(payload?.encontreiros) ? payload.encontreiros : [];
  const encontristas = Array.isArray(payload?.encontristas) ? payload.encontristas : [];
  const presence = Array.isArray(payload?.presence) ? payload.presence : [];

  const map = new Map<string, any>();
  const identityToKey = new Map<string, string>();
  const upsert = (row: any, origem: 'ENCONTREIRO' | 'ENCONTRISTA') => {
    const nome = toClean(row?.nomeCompleto || row?.nome || row?.nome_completo || row?.name);
    if (!nome) return;
    const telefone = toClean(row?.celularWhatsapp || row?.telefone || row?.whatsapp || row?.celular || row?.phone);
    const email = toClean(row?.email || row?.email_adolescente || row?.email_responsavel);
    const pessoaId = toClean(row?.pessoaId || row?.pessoa_id);
    const identities = [
      pessoaId ? `pessoa:${pessoaId}` : '',
      normalizeDigitsLocal(telefone) ? `tel:${normalizeDigitsLocal(telefone)}` : '',
      email ? `email:${normalizeTextLocal(email)}` : '',
      `nome:${normalizeTextLocal(nome)}`,
    ].filter(Boolean);
    const key =
      identities.map((identity) => identityToKey.get(identity)).find(Boolean) ||
      identities[0] ||
      `nome:${normalizeTextLocal(nome)}`;
    const prev = map.get(key);
    map.set(key, {
      key,
      nome,
      pessoaId: pessoaId || prev?.pessoaId || '',
      telefone: telefone || prev?.telefone || '',
      email: email || prev?.email || '',
      hasPhone: Boolean(telefone || prev?.telefone),
      hasEmail: Boolean(email || prev?.email),
      circulo: toClean(
        row?.circulo ||
        row?.grupoSugerido ||
        row?.grupo_sugerido ||
        row?.circuloInformado ||
        row?.circulo_informado ||
        prev?.circulo ||
        ''
      ),
      origem: prev?.origem === 'ENCONTRISTA' || origem === 'ENCONTRISTA' ? 'ENCONTRISTA' : 'ENCONTREIRO',
    });
    identities.forEach((identity) => identityToKey.set(identity, key));
  };

  encontreiros.forEach((r: any) => upsert(r, 'ENCONTREIRO'));
  encontristas.forEach((r: any) => upsert(r, 'ENCONTRISTA'));

  if (map.size === 0) {
    presence.forEach((row: any) => {
      const nome = toClean(row?.nome || row?.nome_digitado || row?.nome_completo);
      if (!nome) return;
      const telefone = toClean(row?.telefone || row?.telefone_digitado || row?.telefone_normalizado);
      const email = toClean(row?.email || row?.email_adolescente || row?.email_responsavel);
      const pessoaId = toClean(row?.pessoaId || row?.pessoa_id);
      const telKey = normalizeDigitsLocal(telefone);
      const key = pessoaId ? `pessoa:${pessoaId}` : (telKey ? `tel:${telKey}` : `nome:${normalizeTextLocal(nome)}`);
      if (map.has(key)) return;
      map.set(key, {
        key,
        nome,
        pessoaId,
        telefone,
        email,
        hasPhone: Boolean(telefone),
        hasEmail: Boolean(email),
        circulo: toClean(row?.circulo || row?.circulo_informado),
        origem: 'ENCONTREIRO',
      });
    });
  }

  const candidates = Array.from(map.values()).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return {
    success: true,
    candidates,
    debug: {
      encontreirosCount: encontreiros.length,
      encontristasCount: encontristas.length,
      presenceCount: presence.length,
    },
  };
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const target = cleanText(email).toLowerCase();
  if (!target) return null;
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 20; i += 1) {
    const out = await supabase.auth.admin.listUsers({ page, perPage });
    if (out.error) throw out.error;
    const users = Array.isArray(out.data?.users) ? out.data.users : [];
    const found = users.find((u: any) => cleanText(u?.email).toLowerCase() === target);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function normalizeLog(row: any) {
  return {
    ...extractOriginFields(row),
    id: pickFirst(row, ['id', 'uuid']) || '',
    dispatchId: pickFirst(row, ['dispatchId', 'dispatch_id', 'dispatch', 'dispatch_key']),
    dispatchName: pickFirst(row, ['dispatchName', 'dispatch_name', 'name']),
    operator: pickFirst(row, ['operator', 'operador', 'user', 'usuario']),
    timestamp: pickFirst(row, ['timestamp', 'created_at', 'createdAt', 'time']),
    duration: Number(pickFirst(row, ['duration', 'duration_ms', 'ms']) || 0),
    status: pickFirst(row, ['status']) || 'SUCCESS',
    responseSummary: pickFirst(row, ['responseSummary', 'response_summary', 'summary']),
  };
}

function toIsoDateOrEmpty(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function normalizeDispatchExecucao(row: any) {
  return {
    id: pickFirst(row, ['id', 'uuid']),
    tipo: pickFirst(row, ['tipo', 'dispatch_type']),
    status: cleanText(pickFirst(row, ['status'])).toUpperCase() || 'PENDENTE',
    semanaId: pickFirst(row, ['semana_id', 'semanaId']),
    totalDestinatarios: Number(pickFirst(row, ['total_destinatarios', 'totalDestinatarios']) || 0),
    totalEnviados: Number(pickFirst(row, ['total_enviados', 'totalEnviados']) || 0),
    totalErros: Number(pickFirst(row, ['total_erros', 'totalErros']) || 0),
    executadoPor: pickFirst(row, ['executado_por', 'executadoPor', 'operator']),
    payload: row?.payload && typeof row.payload === 'object' ? row.payload : {},
    createdAt: pickFirst(row, ['created_at', 'createdAt', 'timestamp']),
  };
}

function safeOperationalSettings() {
  const mode = String(process.env.EAC_DATA_MODE || '').trim().toLowerCase() || 'supabase';
  return {
    env: String(process.env.NODE_ENV || 'development'),
    dataMode: mode,
    allowSheetsFallbackRead: String(process.env.EAC_ALLOW_SHEETS_FALLBACK_READ || '').toLowerCase() === 'true',
    maxRows: Number(process.env.EAC_SUPABASE_MAX_ROWS || DEFAULT_MAX_ROWS),
    tables: {
      members: String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim() || 'inscricoes',
      nonEnrolled: String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim() || 'nao_inscritos',
      events: String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim() || 'eventos_agenda',
      comunicados: String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim() || 'comunicados',
      logs: String(process.env.EAC_SUPABASE_TABLE_LOGS || '').trim() || 'logs',
      profiles: 'app_user_profiles',
    },
    authConfigured: {
      hasUrl: Boolean(cleanText(process.env.SUPABASE_URL)),
      hasAnon: Boolean(cleanText(process.env.SUPABASE_ANON_KEY)),
      hasServiceRole: Boolean(cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY)),
    },
  };
}

const HELP_CONTENT_BY_MODULE: Record<string, { title: string; quickGuide: string[] }> = {
  dispatches: {
    title: 'Guia de Disparos',
    quickGuide: [
      'Revise público elegível antes de executar.',
      'Use retentativa apenas para falhas técnicas.',
      'Confira logs por dispatchId após cada execução.',
    ],
  },
  calendar: {
    title: 'Guia de Calendário',
    quickGuide: [
      'Cadastre data/hora com status correto do evento.',
      'Eventos cancelados não devem entrar em disparo.',
      'Valide semana/mês antes de publicar agenda.',
    ],
  },
  comunicados: {
    title: 'Guia de Comunicados',
    quickGuide: [
      'Preencha título, assunto e corpo sempre.',
      'Use status rascunho para revisão interna.',
      'Só marque pronto para disparo com público elegível.',
    ],
  },
  logs: {
    title: 'Guia de Logs Operacionais',
    quickGuide: [
      'Filtre por período e operador para auditoria.',
      'Use dispatchId para investigar execução específica.',
      'Exporte CSV para evidência de homologação.',
    ],
  },
  settings: {
    title: 'Guia de Ajustes',
    quickGuide: [
      'Nunca exponha chaves sensíveis no frontend.',
      'Use apenas flags operacionais em ambiente local.',
      'Valide impacto em produção antes de alterar parâmetro.',
    ],
  },
};

function parseDateFlexible(value: any): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const raw = cleanText(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const d = Number(brMatch[1]);
    const m = Number(brMatch[2]);
    const y = Number(brMatch[3]);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeEventStatus(value: any) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return 'AGENDADO';
  if (raw.includes('confirm')) return 'CONFIRMADO';
  if (raw.includes('cancel')) return 'CANCELADO';
  if (raw.includes('a confirmar') || raw.includes('a_confirmar')) return 'AGENDADO';
  if (raw.includes('agend')) return 'AGENDADO';
  return cleanText(value).toUpperCase();
}

function formatCalendarLocalDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function parseExternalCalendarDate(value: any, fallbackHour = 19) {
  const raw = cleanText(value);
  if (!raw) return '';

  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    let hour = match[4] != null ? Number(match[4]) : fallbackHour;
    let minute = match[5] != null ? Number(match[5]) : 0;
    let second = match[6] != null ? Number(match[6]) : 0;
    if (hour === 0 && minute === 0 && second === 0) {
      hour = fallbackHour;
    }
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (!Number.isNaN(date.getTime())) {
      return formatCalendarLocalDateTime(year, month, day, hour, minute, second);
    }
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    let hour = direct.getHours();
    let minute = direct.getMinutes();
    let second = direct.getSeconds();
    if (hour === 0 && minute === 0 && second === 0) {
      hour = fallbackHour;
    }
    return formatCalendarLocalDateTime(
      direct.getFullYear(),
      direct.getMonth() + 1,
      direct.getDate(),
      hour,
      minute,
      second
    );
  }
  return '';
}

function extractSpreadsheetId(value: string) {
  const raw = cleanText(value);
  if (!raw) return '';
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
  return '';
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.replace(/\r/g, '').trim());
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      if (current.trim()) rows.push(parseCsvLine(current));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) rows.push(parseCsvLine(current));
  return rows;
}

async function fetchPublicGoogleCalendarRows() {
  const configuredId = extractSpreadsheetId(String(process.env.EAC_GOOGLE_SHEET_CALENDAR_ID || ''));
  const configuredUrl = cleanText(process.env.EAC_GOOGLE_SHEET_CALENDAR_URL || '');
  const spreadsheetId =
    configuredId ||
    extractSpreadsheetId(configuredUrl) ||
    '1IXyy-Ozpst82DNwtypaDHUpEH4P5MfPEsnMOjw3wM9c';
  const gid = cleanText(process.env.EAC_GOOGLE_SHEET_CALENDAR_GID || '0') || '0';

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const response = await fetch(exportUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
  });

  if (!response.ok) {
    throw new Error(`Falha ao ler planilha pública do calendário (${response.status}).`);
  }

  const csvText = await response.text();
  const parsedRows = parseCsvText(csvText);
  if (parsedRows.length <= 1) return [];

  return parsedRows
    .slice(1)
    .map((row, index) => ({
      id: `sheet-cal-${index + 2}`,
      atividade: cleanText(row[0]),
      tipo: cleanText(row[1]),
      inicio: cleanText(row[2]),
      termino: cleanText(row[3]),
      local: cleanText(row[4]),
      proprietario: cleanText(row[5]),
      status: cleanText(row[6]) || 'Confirmado',
      id_origem_planilha: `${gid}:${index + 2}`,
      origem_dado: 'PLANILHA',
    }))
    .filter((row) => row.atividade);
}

function isLikelyReplyMessage(row: any) {
  const direction = cleanText(pickFirst(row, ['direction', 'direcao', 'tipo', 'message_type', 'tipo_mensagem'])).toLowerCase();
  if (['reply', 'resposta', 'received', 'inbound', 'entrada'].includes(direction)) return true;
  const isReply = cleanText(pickFirst(row, ['is_reply', 'eh_resposta', 'resposta'])).toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(isReply);
}

function normalizeEncontreiro(row: any, i: number) {
  const id = pickFirst(row, ['encontreiro_id', 'id', 'uuid']) || `enc-${i + 1}`;
  return {
    ...extractOriginFields(row),
    id,
    pessoaId: pickFirst(row, ['pessoaId', 'pessoa_id']),
    rowNumber: Number(pickFirst(row, ['rowNumber', 'row_number', 'linha', 'row']) || (i + 2)),
    timestamp: pickFirst(row, ['data_importacao', 'dataImportacao', 'timestamp', 'data_presenca', 'created_at', 'createdAt', 'criado_em']),
    nomeCompleto: pickFirst(row, ['nomeCompleto', 'nome_completo', 'nome', 'name']),
    dataNascimento: pickFirst(row, ['dataNascimento', 'data_nascimento', 'nascimento']),
    idade: pickFirst(row, ['idade', 'idade_snapshot', 'age']),
    email: pickFirst(row, ['email']),
    celularWhatsapp: pickFirst(row, ['celularWhatsapp', 'celular_whatsapp', 'whatsapp', 'telefone']),
    enderecoCompleto: pickFirst(row, ['enderecoCompleto', 'endereco_completo', 'endereco']),
    responsavelContato: pickFirst(row, ['responsavelContato', 'responsavel_contato']),
    bairro: pickFirst(row, ['bairro', 'bairro_snapshot']),
    frequentaMissas: pickFirst(row, ['frequentaMissas', 'frequenta_missas']),
    ondeMissas: pickFirst(row, ['ondeMissas', 'onde_missas']),
    participaMovimento: pickFirst(row, ['participaMovimento', 'participa_movimento']),
    movimentoParoquia: pickFirst(row, ['movimentoParoquia', 'movimento_paroquia']),
    paroquiaFezEac: pickFirst(row, ['paroquiaFezEac', 'paroquia_fez_eac']),
    jaTrabalhouEac: pickFirst(row, ['jaTrabalhouEac', 'ja_trabalhou_eac']),
    jaCoordenouEquipe: pickFirst(row, ['jaCoordenouEquipe', 'ja_coordenou_equipe']),
    paisFizeramEncontro: pickFirst(row, ['paisFizeramEncontro', 'pais_fizeram_encontro']),
    possuiAlergia: pickFirst(row, ['possuiAlergia', 'possui_alergia']),
    tomaRemedio: pickFirst(row, ['tomaRemedio', 'toma_remedio']),
    alimentacaoEspecial: pickFirst(row, ['alimentacaoEspecial', 'alimentacao_especial']),
    sugestaoUltimoEncontro: pickFirst(row, ['sugestaoUltimoEncontro', 'sugestao_ultimo_encontro']),
    dicaPosEncontro: pickFirst(row, ['dicaPosEncontro', 'dica_pos_encontro']),
    classificacao: pickFirst(row, ['classificacao', 'classificação']),
    whatsappNormalizado: pickFirst(row, ['whatsappNormalizado', 'whatsapp_normalizado']),
    whatsappLink: pickFirst(row, ['whatsappLink', 'whatsapp_link']),
  };
}

function normalizePresence(row: any, i: number) {
  const id = pickFirst(row, ['id', 'presenca_id', 'uuid']) || `pres-${i + 1}`;
  return {
    ...extractOriginFields(row),
    id,
    rowNumber: Number(pickFirst(row, ['rowNumber', 'row_number', 'linha', 'row']) || (i + 2)),
    nome: pickFirst(row, ['nome', 'nome_digitado', 'nome_completo', 'name']),
    telefone: pickFirst(row, ['telefone', 'telefone_digitado', 'telefone_normalizado', 'celular', 'whatsapp']),
    circulo: pickFirst(row, ['circulo', 'circulo_informado', 'círculo', 'circle']),
    encontroId: pickFirst(row, ['encontro_id', 'encontroId']),
    encontroNome: pickFirst(row, ['encontro_nome', 'encontroNome', 'nome_encontro']),
    timestamp: pickFirst(row, ['timestamp', 'data_presenca', 'created_at', 'createdAt']),
    mes: pickFirst(row, ['mes', 'mês', 'month']),
    ano: pickFirst(row, ['ano', 'year']),
    telCadastrado: pickFirst(row, ['telCadastrado', 'tel_cadastrado', 'telefone_cadastrado']),
    presente: Boolean(
      pickFirst(row, ['presente', 'present']) ||
      cleanText(pickFirst(row, ['status_presenca'])) === 'REGISTRADA'
    ),
  };
}

function normalizeEquipe(row: any) {
  return {
    id: pickFirst(row, ['id', 'uuid']),
    nome: pickFirst(row, ['nome', 'name']),
    descricao: pickFirst(row, ['descricao', 'description']),
    ativa: pickFirst(row, ['ativa', 'ativo', 'active']),
  };
}

function groupCirculos(rows: any[]) {
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const circulo = String(pickFirst(row, ['circulo', 'nome_circulo', 'grupo_sugerido', 'círculo', 'circle']) || '').trim() || 'Circulo Excedente';
    if (!grouped[circulo]) grouped[circulo] = [];
    grouped[circulo].push({
      nome: pickFirst(row, ['nome', 'nome_completo', 'nome_snapshot', 'name']),
      idade: pickFirst(row, ['idade', 'idade_snapshot', 'age']),
      bairro: pickFirst(row, ['bairro', 'bairro_snapshot']),
      sexo: pickFirst(row, ['sexo', 'sexo_snapshot']),
      grupoSugerido: pickFirst(row, ['grupoSugerido', 'grupo_sugerido']),
    });
  }
  return grouped;
}

function createEmptyCircleGroups() {
  return {
    'Circulo 1': [],
    'Circulo 2': [],
    'Circulo 3': [],
    'Circulo 4': [],
    'Circulo 5': [],
    'Circulo 6': [],
    'Circulo Excedente': [],
  } as Record<string, any[]>;
}

function buildEncontreiroRowPayload(payload: JsonObject, mode: 'camel' | 'snake') {
  const mapKey = (camel: string, snake: string) => (mode === 'camel' ? camel : snake);
  const out: Record<string, any> = {
    [mapKey('timestamp', 'timestamp')]: cleanText(payload.timestamp) || new Date().toISOString(),
    [mapKey('nomeCompleto', 'nome_completo')]: cleanText(payload.nomeCompleto),
    [mapKey('dataNascimento', 'data_nascimento')]: cleanText(payload.dataNascimento),
    [mapKey('idade', 'idade')]: cleanText(payload.idade),
    [mapKey('email', 'email')]: cleanText(payload.email),
    [mapKey('celularWhatsapp', 'celular_whatsapp')]: cleanText(payload.celularWhatsapp),
    [mapKey('enderecoCompleto', 'endereco_completo')]: cleanText(payload.enderecoCompleto),
    [mapKey('responsavelContato', 'responsavel_contato')]: cleanText(payload.responsavelContato),
    [mapKey('bairro', 'bairro')]: cleanText(payload.bairro),
    [mapKey('frequentaMissas', 'frequenta_missas')]: cleanText(payload.frequentaMissas),
    [mapKey('ondeMissas', 'onde_missas')]: cleanText(payload.ondeMissas),
    [mapKey('participaMovimento', 'participa_movimento')]: cleanText(payload.participaMovimento),
    [mapKey('movimentoParoquia', 'movimento_paroquia')]: cleanText(payload.movimentoParoquia),
    [mapKey('paroquiaFezEac', 'paroquia_fez_eac')]: cleanText(payload.paroquiaFezEac),
    [mapKey('jaTrabalhouEac', 'ja_trabalhou_eac')]: cleanText(payload.jaTrabalhouEac),
    [mapKey('jaCoordenouEquipe', 'ja_coordenou_equipe')]: cleanText(payload.jaCoordenouEquipe),
    [mapKey('paisFizeramEncontro', 'pais_fizeram_encontro')]: cleanText(payload.paisFizeramEncontro),
    [mapKey('possuiAlergia', 'possui_alergia')]: cleanText(payload.possuiAlergia),
    [mapKey('tomaRemedio', 'toma_remedio')]: cleanText(payload.tomaRemedio),
    [mapKey('alimentacaoEspecial', 'alimentacao_especial')]: cleanText(payload.alimentacaoEspecial),
    [mapKey('sugestaoUltimoEncontro', 'sugestao_ultimo_encontro')]: cleanText(payload.sugestaoUltimoEncontro),
    [mapKey('dicaPosEncontro', 'dica_pos_encontro')]: cleanText(payload.dicaPosEncontro),
    [mapKey('classificacao', 'classificacao')]: cleanText(payload.classificacao),
  };
  return out;
}

function normalizeEncontreiroClassification(payload: JsonObject) {
  const raw = cleanText(payload.classificacao);
  if (raw) return raw;
  const ageDigits = cleanText(payload.idade).replace(/\D/g, '');
  if (!ageDigits) return 'OUTRO';
  return Number(ageDigits) <= 17 ? 'Adolescente' : 'Adulto';
}

async function saveEncontreiroViaRpc(supabase: SupabaseClient, payload: JsonObject) {
  const pessoaIdRpc = await supabase.rpc('eac_upsert_pessoa', {
    p_nome: cleanText(payload.nomeCompleto),
    p_email: cleanText(payload.email) || null,
    p_telefone: cleanText(payload.celularWhatsapp) || null,
    p_data_nascimento: cleanText(payload.dataNascimento) || null,
    p_bairro: cleanText(payload.bairro) || null,
    p_observacoes: cleanText(payload.classificacao) || null,
    p_origem: 'PLANILHA',
    p_criado_via_sistema: false,
  });
  if (pessoaIdRpc.error) throw pessoaIdRpc.error;

  const pessoaId = cleanText(pessoaIdRpc.data);
  if (!pessoaId) throw new Error('Falha ao resolver pessoa do encontreiro.');

  const papelRpc = await supabase.rpc('eac_ensure_papel', {
    p_pessoa_id: pessoaId,
    p_papel: 'ENCONTREIRO',
    p_origem: 'PLANILHA',
  });
  if (papelRpc.error) throw papelRpc.error;

  const encontreiroRpc = await supabase.rpc('eac_ensure_encontreiro', {
    p_pessoa_id: pessoaId,
    p_nome_completo: cleanText(payload.nomeCompleto),
    p_data_nascimento: cleanText(payload.dataNascimento) || null,
    p_idade: cleanText(payload.idade) || null,
    p_email: cleanText(payload.email) || null,
    p_celular_whatsapp: cleanText(payload.celularWhatsapp) || null,
    p_endereco_completo: cleanText(payload.enderecoCompleto) || null,
    p_responsavel_contato: cleanText(payload.responsavelContato) || null,
    p_bairro: cleanText(payload.bairro) || null,
    p_frequenta_missas: cleanText(payload.frequentaMissas) || null,
    p_onde_missas: cleanText(payload.ondeMissas) || null,
    p_participa_movimento: cleanText(payload.participaMovimento) || null,
    p_movimento_paroquia: cleanText(payload.movimentoParoquia) || null,
    p_paroquia_fez_eac: cleanText(payload.paroquiaFezEac) || null,
    p_ja_trabalhou_eac: cleanText(payload.jaTrabalhouEac) || null,
    p_ja_coordenou_equipe: cleanText(payload.jaCoordenouEquipe) || null,
    p_pais_fizeram_encontro: cleanText(payload.paisFizeramEncontro) || null,
    p_possui_alergia: cleanText(payload.possuiAlergia) || null,
    p_toma_remedio: cleanText(payload.tomaRemedio) || null,
    p_alimentacao_especial: cleanText(payload.alimentacaoEspecial) || null,
    p_sugestao_ultimo_encontro: cleanText(payload.sugestaoUltimoEncontro) || null,
    p_dica_pos_encontro: cleanText(payload.dicaPosEncontro) || null,
    p_classificacao: normalizeEncontreiroClassification(payload),
  });
  if (encontreiroRpc.error) throw encontreiroRpc.error;

  const encontreiroId = cleanText(encontreiroRpc.data);
  let saved: any = null;
  try {
    const rows = await fetchAllRows(supabase, getEncontreirosReadCandidates(), { maxRows: 5000 });
    saved = rows.find((row: any) =>
      cleanText(row?.encontreiro_id || row?.id) === encontreiroId ||
      cleanText(row?.pessoa_id) === pessoaId
    ) || null;
  } catch {
    saved = null;
  }

  return {
    pessoaId,
    encontreiroId,
    savedNormalized: saved ? normalizeEncontreiro(saved, 0) : {
      id: encontreiroId,
      nomeCompleto: cleanText(payload.nomeCompleto),
      email: cleanText(payload.email),
      celularWhatsapp: cleanText(payload.celularWhatsapp),
      bairro: cleanText(payload.bairro),
      classificacao: normalizeEncontreiroClassification(payload),
    },
  };
}

function getEncontreirosReadCandidates() {
  const envTable = String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim();
  const tableComTr = `encon${'treiros'}`;
  const tableSemTr = `encon${'teiros'}`;
  const base = [
    'encontreiros',
    tableComTr,
    tableSemTr,
    'cadastro_encontreiros',
    envTable.startsWith('vw_') ? envTable.replace(/^vw_/, '') : '',
    envTable,
    'vw_encontreiros',
    'vw_encontreiros',
  ].filter(Boolean);
  return Array.from(new Set(base));
}

function getEncontreirosWriteCandidates() {
  const envTable = String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim();
  const tableComTr = `encon${'treiros'}`;
  const tableSemTr = `encon${'teiros'}`;
  const base = [
    envTable,
    envTable.startsWith('vw_') ? envTable.replace(/^vw_/, '') : '',
    'encontreiros',
    tableComTr,
    tableSemTr,
    'cadastro_encontreiros',
  ].filter(Boolean);
  return Array.from(new Set(base.filter((name) => !String(name).toLowerCase().startsWith('vw_'))));
}

async function loadEncontreirosForScreen(supabase: SupabaseClient) {
  const structuralTableCandidates = [
    'encontreiros',
    'cadastro_encontreiros',
  ].filter(Boolean);

  let structuralTable = '';
  for (const table of structuralTableCandidates) {
    const probe = await supabase.from(table).select('id,pessoa_id').limit(1);
    if (!probe.…25001 tokens truncated…,
          source: 'runtime',
          module: moduleName,
          help: HELP_CONTENT_BY_MODULE[moduleName] || null,
        },
      };
    }

    if (ctx.action === 'GET_ENCONTREIROS') {
      const classificacaoFilter = cleanText(ctx.payload.classificacao).toLowerCase();
      const includeSensitive = String(ctx.payload.includeSensitive ?? '').toLowerCase() === 'true' || ctx.payload.includeSensitive === true;

      let rows: any[] = [];
      try {
        rows = await loadEncontreirosForScreen(supabase);
      } catch (e: any) {
        const msg = String(e?.message || '');
        // Não quebra a tela quando nenhuma fonte estiver acessível; retorna vazio com diagnóstico.
        if (isMissingRelationError(e) || isPermissionDeniedError(e)) {
          return {
            ok: true,
            data: {
              success: true,
              encontreiros: [],
              indicators: { total: 0, novosSemestre: 0 },
              bairroStats: [],
              source: 'supabase',
              warning: `Não foi possível ler as fontes de encontreiros. Detalhe: ${msg}`,
            }
          };
        }
        throw e;
      }
      let encontreiros = rows.map(normalizeEncontreiro).filter((r) => String(r.nomeCompleto || '').trim());
      if (classificacaoFilter) {
        encontreiros = encontreiros.filter((r: any) =>
          cleanText(r.classificacao).toLowerCase() === classificacaoFilter
        );
      }
      if (!includeSensitive) {
        encontreiros = encontreiros.map((r: any) => ({
          ...r,
          possuiAlergia: '',
          tomaRemedio: '',
          alimentacaoEspecial: '',
        }));
      }
      encontreiros.sort((a: any, b: any) => String(b?.timestamp || '').localeCompare(String(a?.timestamp || '')));

      // indicadores aproximados
      const now = new Date();
      const startMonth = now.getMonth() < 6 ? 0 : 6;
      const semesterStart = new Date(now.getFullYear(), startMonth, 1);
      const novosSemestre = encontreiros.filter((r: any) => {
        const t = new Date(String(r.timestamp || ''));
        return !isNaN(t.getTime()) && t >= semesterStart;
      }).length;

      const bairroMap = new Map<string, number>();
      encontreiros.forEach((r: any) => {
        const b = String(r.bairro || '').trim();
        if (!b) return;
        bairroMap.set(b, (bairroMap.get(b) || 0) + 1);
      });
      const bairroStats = Array.from(bairroMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([nome, quantidade]) => ({ nome, quantidade }));

      return {
        ok: true,
        data: {
          success: true,
          encontreiros,
          indicators: { total: encontreiros.length, novosSemestre },
          bairroStats,
          source: 'supabase',
        }
      };
    }

    if (ctx.action === 'GET_ENCONTROS_EQUIPES') {
      const rows = await fetchAllRows(supabase, ['encontros'], { maxRows: 5000 });
      const encontros = rows
        .map((row: any) => ({
          id: cleanText(pickFirst(row, ['id', 'encontro_id', 'encontroId'])),
          nome: cleanText(pickFirst(row, ['nome', 'titulo', 'descricao', 'name'])),
          dataInicio: pickFirst(row, ['data_inicio', 'dataInicio', 'inicio']),
        }))
        .filter((row: any) => row.id && row.nome)
        .sort((a: any, b: any) => String(b.dataInicio || '').localeCompare(String(a.dataInicio || '')) || a.nome.localeCompare(b.nome, 'pt-BR'));
      return { ok: true, data: { success: true, encontros, source: 'supabase' } };
    }

    if (ctx.action === 'GET_ENCONTRO_EQUIPES') {
      const encontroId = cleanText(ctx.payload.encontroId || ctx.payload.encontro_id);
      if (!encontroId) return { ok: true, data: { success: false, error: 'encontroId é obrigatório.' } };

      const [equipesRows, vinculosRows, encontreirosRows] = await Promise.all([
        fetchAllRows(supabase, ['equipes'], { maxRows: 5000 }),
        fetchAllRows(supabase, ['encontreiro_equipes'], { maxRows: 20000 }),
        loadEncontreirosForScreen(supabase),
      ]);
      const peopleById = new Map<string, any>();
      (Array.isArray(encontreirosRows) ? encontreirosRows : []).forEach((row: any) => {
        const keys = [pickFirst(row, ['id']), pickFirst(row, ['pessoa_id', 'pessoaId'])].map(cleanText).filter(Boolean);
        keys.forEach((id) => peopleById.set(id, row));
      });
      const teamById = new Map<string, any>();
      (Array.isArray(equipesRows) ? equipesRows : []).forEach((row: any) => {
        const team = normalizeEquipe(row);
        if (cleanText(team.id)) teamById.set(cleanText(team.id), team);
      });
      const linked = (Array.isArray(vinculosRows) ? vinculosRows : []).filter((row: any) => cleanText(pickFirst(row, ['encontro_id', 'encontroId'])) === encontroId);
      const membrosPorEquipe = new Map<string, any[]>();
      linked.forEach((row: any) => {
        const equipeId = cleanText(pickFirst(row, ['equipe_id', 'equipeId']));
        const encontreiroId = cleanText(pickFirst(row, ['encontreiro_id', 'encontreiroId', 'pessoa_id', 'pessoaId']));
        if (!equipeId || !encontreiroId) return;
        const pessoa = peopleById.get(encontreiroId) || {};
        const membros = membrosPorEquipe.get(equipeId) || [];
        membros.push({
          encontreiroId,
          nome: cleanText(pickFirst(pessoa, ['nome_completo', 'nomeCompleto', 'nome'])) || 'Encontreiro',
          bairro: cleanText(pickFirst(pessoa, ['bairro'])),
          funcao: cleanText(pickFirst(row, ['funcao'])) || 'Membro',
          observacao: cleanText(pickFirst(row, ['observacao'])),
        });
        membrosPorEquipe.set(equipeId, membros);
      });
      const equipes = Array.from(teamById.values()).map((team: any) => ({
        equipeId: cleanText(team.id),
        nome: cleanText(team.nome) || 'Equipe',
        membros: membrosPorEquipe.get(cleanText(team.id)) || [],
      }));
      return { ok: true, data: { success: true, encontroId, equipes, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_ENCONTRO_EQUIPE_MEMBROS') {
      const encontroId = cleanText(ctx.payload.encontroId || ctx.payload.encontro_id);
      const equipeId = cleanText(ctx.payload.equipeId || ctx.payload.equipe_id);
      const membros = Array.isArray(ctx.payload.membros) ? ctx.payload.membros : [];
      if (!encontroId || !equipeId) return { ok: true, data: { success: false, error: 'encontroId e equipeId são obrigatórios.' } };

      const deleted = await supabase.from('encontreiro_equipes').delete().eq('encontro_id', encontroId).eq('equipe_id', equipeId);
      if (deleted.error) throw deleted.error;
      const payload = membros.map((m: any) => ({
        encontro_id: encontroId,
        equipe_id: equipeId,
        encontreiro_id: cleanText(m.encontreiroId || m.encontreiro_id || m.pessoaId || m.pessoa_id),
        funcao: cleanText(m.funcao) || 'Membro',
        observacao: cleanText(m.observacao) || null,
        ativo: true,
      })).filter((m: any) => m.encontreiro_id);
      if (payload.length) {
        const inserted = await supabase.from('encontreiro_equipes').insert(payload);
        if (inserted.error) throw inserted.error;
      }
      return { ok: true, data: { success: true, encontroId, equipeId, total: payload.length, source: 'supabase' } };
    }

    if (ctx.action === 'GET_HISTORICO_ENCONTREIRO_EQUIPES') {
      const encontreiroId = cleanText(ctx.payload.encontreiroId || ctx.payload.encontreiro_id || ctx.payload.id);
      if (!encontreiroId) return { ok: true, data: { success: false, error: 'encontreiroId é obrigatório.' } };
      const [vinculos, equipesRows, encontrosRows] = await Promise.all([
        fetchAllRows(supabase, ['encontreiro_equipes'], { maxRows: 20000 }),
        fetchAllRows(supabase, ['equipes'], { maxRows: 5000 }),
        fetchAllRows(supabase, ['encontros'], { maxRows: 5000 }),
      ]);
      const equipesById = new Map<string, any>();
      (Array.isArray(equipesRows) ? equipesRows : []).forEach((row: any) => equipesById.set(cleanText(pickFirst(row, ['id'])), normalizeEquipe(row)));
      const encontrosById = new Map<string, any>();
      (Array.isArray(encontrosRows) ? encontrosRows : []).forEach((row: any) => encontrosById.set(cleanText(pickFirst(row, ['id'])), row));
      const historico = (Array.isArray(vinculos) ? vinculos : []).filter((row: any) => cleanText(pickFirst(row, ['encontreiro_id', 'encontreiroId', 'pessoa_id', 'pessoaId'])) === encontreiroId).map((row: any) => {
        const equipe = equipesById.get(cleanText(pickFirst(row, ['equipe_id', 'equipeId']))) || {};
        const encontro = encontrosById.get(cleanText(pickFirst(row, ['encontro_id', 'encontroId']))) || {};
        return {
          encontroId: cleanText(pickFirst(row, ['encontro_id', 'encontroId'])),
          encontro: cleanText(pickFirst(encontro, ['nome', 'titulo', 'descricao'])),
          equipe: cleanText(equipe.nome),
          funcao: cleanText(row.funcao) || 'Membro',
          observacao: cleanText(row.observacao),
        };
      });
      return { ok: true, data: { success: true, historico, source: 'supabase' } };
    }

    if (ctx.action === 'GET_EQUIPES') {
      const rows = await fetchAllRows(
        supabase,
        ['equipes'].filter(Boolean),
        { maxRows: 5000 }
      );
      const equipes = rows.map(normalizeEquipe).filter((r) => String(r.id || r.nome || '').trim());
      return { ok: true, data: { success: true, equipes, total: equipes.length, source: 'supabase' } };
    }

    if (ctx.action === 'GET_ENCONTREIRO_EQUIPES') {
      const encontreiroId = cleanText(ctx.payload.encontreiroId || ctx.payload.encontreiro_id || ctx.payload.id);
      if (!encontreiroId) {
        return { ok: true, data: { success: false, error: 'encontreiroId é obrigatório.' } };
      }

      const { rows } = await getEncontreiroEquipeRows(supabase, encontreiroId);
      const equipeIds = rows
        .map((r: any) => String(pickFirst(r, ['equipe_id', 'equipeId']) || '').trim())
        .filter(Boolean);

      return { ok: true, data: { success: true, equipeIds, rows, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_ENCONTREIRO_EQUIPES') {
      const encontreiroId = cleanText(ctx.payload.encontreiroId || ctx.payload.encontreiro_id || ctx.payload.id);
      const equipeIds = Array.isArray(ctx.payload.equipeIds) ? ctx.payload.equipeIds.map((v: any) => cleanText(v)).filter(Boolean) : [];
      if (!encontreiroId) {
        return { ok: true, data: { success: false, error: 'encontreiroId é obrigatório.' } };
      }

      await replaceEncontreiroEquipes(supabase, encontreiroId, equipeIds);
      return { ok: true, data: { success: true, encontreiroId, equipeIds, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_ENCONTREIRO') {
      const nomeCompleto = cleanText(ctx.payload.nomeCompleto);
      if (!nomeCompleto) {
        return { ok: true, data: { success: false, error: 'Nome completo é obrigatório.' } };
      }

      const tableCandidates = getEncontreirosWriteCandidates();
      const fallbackToRpc = async () => {
        const fallback = await saveEncontreiroViaRpc(supabase, ctx.payload);
        return {
          ok: true as const,
          data: {
            success: true,
            data: fallback.savedNormalized,
            pessoa_id: fallback.pessoaId || null,
            email_confirmacao: { sent: false, reason: 'not_attempted' },
            table: 'rpc:eac_ensure_encontreiro',
            source: 'supabase-rpc',
          }
        };
      };

      const pessoaId = await upsertPessoaFromEncontreiro(supabase, ctx.payload);
      if (pessoaId) {
        try {
          await ensurePessoaPapelAtivo(supabase, pessoaId, 'ENCONTREIRO');
        } catch (papelError) {
          console.error('[SAVE_ENCONTREIRO] falha ao garantir papel ENCONTREIRO:', papelError);
        }
      }
      const payloadCamelBase = buildEncontreiroRowPayload(ctx.payload, 'camel');
      const payloadSnakeBase = buildEncontreiroRowPayload(ctx.payload, 'snake');
      const payloadCamel = pessoaId ? { ...payloadCamelBase, pessoa_id: pessoaId } : payloadCamelBase;
      const payloadSnake = pessoaId ? { ...payloadSnakeBase, pessoa_id: pessoaId } : payloadSnakeBase;
      const id = cleanText(ctx.payload.id);

      const runSave = async (table: string, body: Record<string, any>) => {
        if (id) {
          return await supabase.from(table).update(body).eq('id', id).select('*').limit(1);
        }
        return await supabase.from(table).insert(body).select('*').limit(1);
      };

      let saved: any = null;
      let saveError: any = null;
      let table = '';
      try {
        const found = await queryFirstExistingTable<any[]>(
          supabase,
          tableCandidates,
          async (tableName) => {
            let result = await runSave(tableName, payloadCamel);
            if (result.error) {
              result = await runSave(tableName, payloadSnake);
            }
            // Tabelas legadas podem não ter pessoa_id; tenta novamente sem esse campo.
            if (result.error && pessoaId) {
              result = await runSave(tableName, payloadCamelBase);
            }
            if (result.error && pessoaId) {
              result = await runSave(tableName, payloadSnakeBase);
            }
            if (result.error) {
              saveError = result.error;
            }
            saved = Array.isArray(result.data) ? result.data[0] : null;
            return { data: result.data as any, error: result.error };
          }
        );
        table = found.table;
      } catch (e: any) {
        if (String(e?.message || '').includes('Nenhuma fonte encontrada no schema')) {
          return await fallbackToRpc();
        }
        throw e;
      }

      if (saveError) throw saveError;
      const savedNormalized = normalizeEncontreiro(saved || {}, 0);
      const emailDestino = cleanText(savedNormalized.email || cleanText(ctx.payload.email));
      let emailConfirmacao: any = { sent: false, reason: 'not_attempted' };
      if (emailDestino) {
        try {
          emailConfirmacao = await enviarEmailCadastroEfetivado({
            nome: cleanText(savedNormalized.nomeCompleto || nomeCompleto),
            email: emailDestino,
            assunto: 'EAC: Cadastro de Encontreiro efetivado',
            mensagemHtml: [
              `<p style="margin:0 0 14px 0; font-size:28px; line-height:1.2; color:#0b3b69; font-weight:800;">Ola, ${cleanText(savedNormalized.nomeCompleto || nomeCompleto)}!</p>`,
              '<p style="margin:0 0 14px 0;">Seu cadastro de encontreiro foi efetivado com sucesso no sistema do EAC.</p>',
              '<p style="margin:0 0 14px 0;">Agradecemos sua disponibilidade para servir. Em breve entraremos em contato com os proximos passos.</p>',
              '<p style="margin:22px 0 0 0;">Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
            ].join(''),
          });
        } catch (mailErr: any) {
          console.error('[SAVE_ENCONTREIRO] falha ao enviar e-mail de confirmação:', mailErr?.message || mailErr);
          emailConfirmacao = { sent: false, reason: 'send_failed' };
        }
      }
      return {
        ok: true,
        data: {
          success: true,
          data: savedNormalized,
          pessoa_id: pessoaId || null,
          email_confirmacao: emailConfirmacao,
          table,
          source: 'supabase',
        }
      };
    }

    if (ctx.action === 'DELETE_ENCONTREIRO') {
      const id = cleanText(ctx.payload.id);
      const pessoaId = cleanText(ctx.payload.pessoa_id || ctx.payload.pessoaId);
      if (!id) {
        return { ok: true, data: { success: false, error: 'ID é obrigatório para excluir.' } };
      }

      const tableCandidates = getEncontreirosWriteCandidates();
      const targetColumn = isUuidLike(id) ? 'id' : (isUuidLike(pessoaId) ? 'pessoa_id' : '');
      if (!targetColumn) {
        return { ok: true, data: { success: false, error: 'Cadastro legado sem identificador persistido para exclusão. Atualize a lista e tente novamente.' } };
      }

      const targetValue = targetColumn === 'id' ? id : pessoaId;
      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).delete().eq(targetColumn, targetValue).select('id').limit(1)
      );

      return { ok: true, data: { success: true, id, pessoa_id: pessoaId || null, table, source: 'supabase', where: targetColumn } };
    }

    if (ctx.action === 'NORMALIZE_ENCONTREIRO_WHATSAPP') {
      const id = cleanText(ctx.payload.id);
      if (!id) {
        return { ok: true, data: { success: false, error: 'ID é obrigatório para normalizar WhatsApp.' } };
      }

      const tableCandidates = getEncontreirosWriteCandidates();

      const { table, data: rows } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').eq('id', id).limit(1)
      );

      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) {
        return { ok: true, data: { success: false, error: 'Cadastro não encontrado.' } };
      }

      const currentWhatsapp = pickFirst(row, ['celularWhatsapp', 'celular_whatsapp', 'whatsapp', 'telefone']);
      const normalized = normalizeDigits(currentWhatsapp);
      if (!normalized) {
        return { ok: true, data: { success: false, error: 'Não foi possível normalizar o telefone informado.' } };
      }

      const link = `https://wa.me/${normalized}`;
      const payloadCamel = { celularWhatsapp: normalized, whatsappNormalizado: normalized, whatsappLink: link };
      const payloadSnake = { celular_whatsapp: normalized, whatsapp_normalizado: normalized, whatsapp_link: link };
      let updateRes = await supabase.from(table).update(payloadCamel).eq('id', id).select('*').limit(1);
      if (updateRes.error) {
        updateRes = await supabase.from(table).update(payloadSnake).eq('id', id).select('*').limit(1);
      }
      if (updateRes.error) throw updateRes.error;

      return { ok: true, data: { success: true, id, celularWhatsapp: normalized, whatsappLink: link, source: 'supabase' } };
    }

    if (ctx.action === 'GET_PRESENCE') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_PRESENCE || '').trim(),
          'vw_presencas_historico',
          'presencas',
          'vw_presencas_detalhadas',
          'controle_presenca',
          'presence',
          'presenca',
        ].filter(Boolean),
        { maxRows: 20000 }
      );
      const presence = rows.map(normalizePresence).filter((r) => String(r.nome || r.telefone || '').trim());
      presence.sort((a: any, b: any) => String(b?.timestamp || '').localeCompare(String(a?.timestamp || '')));
      return { ok: true, data: { success: true, presence, total: presence.length, source: 'supabase' } };
    }



    if (ctx.action === 'MARK_PRESENCE') {
      const result = await markPresenceService(supabase, ctx.payload);
      if (!result?.data?.success) return result;
      const saved = result.data.saved || null;
      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          presence: saved ? normalizePresence(saved, 0) : null,
          message: result.data.message || 'Presenca registrada com sucesso.',
        }
      };
    }

    if (ctx.action === 'GET_CIRCULOS_DISTRIBUIDOS') {
      // A distribuição oficial é uma versão imutável. Propostas geradas na tela
      // não chegam a este ponto até que a coordenação confirme o salvamento.
      try {
        const officialResult = await supabase
          .from('circulos_execucoes')
          .select('id,encontro_id,criterios,total_entradas,total_distribuidas,total_excedente,status,executado_por,created_at')
          .eq('status', 'OFICIAL')
          .order('created_at', { ascending: false })
          .limit(1);

        const official = Array.isArray(officialResult.data) ? officialResult.data[0] : null;
        if (!officialResult.error && official?.id) {
          const itemsResult = await supabase
            .from('circulos_execucao_itens')
            .select('circulo_nome,payload,inscricao_id,pessoa_id,prioridade')
            .eq('execucao_id', official.id)
            .order('prioridade', { ascending: true });
          if (itemsResult.error) throw itemsResult.error;

          const grouped = createEmptyCircleGroups();
          (itemsResult.data || []).forEach((item: any) => {
            const circleName = cleanText(item?.circulo_nome) || 'Circulo Excedente';
            if (!grouped[circleName]) grouped[circleName] = [];
            grouped[circleName].push({
              ...(item?.payload && typeof item.payload === 'object' ? item.payload : {}),
              id: cleanText(item?.payload?.id || item?.inscricao_id || item?.pessoa_id),
              circulo: circleName,
            });
          });

          const criterios = official?.criterios && typeof official.criterios === 'object' ? official.criterios : {};
          return {
            ok: true,
            data: {
              success: true,
              circulos: grouped,
              source: 'supabase-oficial',
              official: {
                id: official.id,
                createdAt: official.created_at,
                operator: official.executado_por,
                total: official.total_distribuidas,
                criterios,
              },
              needsReview: false,
            },
          };
        }
      } catch (officialError) {
        // A instalação anterior continua disponível pelo fallback abaixo. O
        // salvamento oficial passa a exigir a migration US-117.
      }

      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_CIRCULOS || '').trim(),
          'vw_distribuicao_circulos',
          'circulos_distribuidos',
          'circulos',
          'circles_distribution',
        ].filter(Boolean),
        { maxRows: 20000 }
      );
      const circulos = groupCirculos(rows);
      return { ok: true, data: { success: true, circulos, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_CIRCULOS_DISTRIBUICAO_OFICIAL') {
      const circlesInput = ctx.payload?.circulos;
      if (!circlesInput || typeof circlesInput !== 'object') {
        return { ok: true, data: { success: false, error: 'A proposta de distribuição é obrigatória para salvar.' } };
      }

      const operator = cleanText(ctx.payload?.operator) || 'PAINEL_CIRCULOS';
      const criterios = ctx.payload?.criterios && typeof ctx.payload.criterios === 'object' ? ctx.payload.criterios : {};
      const entries: Array<{ circuloNome: string; item: any }> = [];
      Object.entries(circlesInput).forEach(([circuloNome, rows]) => {
        (Array.isArray(rows) ? rows : []).forEach((item: any) => entries.push({ circuloNome, item }));
      });

      const { data: execution, error: executionError } = await supabase
        .from('circulos_execucoes')
        .insert({
          encontro_id: isUuidLike(cleanText(ctx.payload?.encontroId)) ? cleanText(ctx.payload?.encontroId) : null,
          criterios: { ...criterios, versionType: 'OFICIAL' },
          total_entradas: Number(ctx.payload?.totalEntradas || entries.length),
          total_distribuidas: entries.length,
          total_excedente: entries.filter((entry) => cleanText(entry.circuloNome).toLowerCase().includes('exced')).length,
          status: 'OFICIAL',
          executado_por: operator,
        })
        .select('id,created_at')
        .single();
      if (executionError || !execution?.id) throw executionError || new Error('Não foi possível criar a versão oficial.');

      const rows = entries.map(({ circuloNome, item }, index) => ({
        execucao_id: execution.id,
        inscricao_id: isUuidLike(cleanText(item?.id || item?.inscricao_id)) ? cleanText(item?.id || item?.inscricao_id) : null,
        pessoa_id: isUuidLike(cleanText(item?.pessoa_id || item?.pessoaId)) ? cleanText(item?.pessoa_id || item?.pessoaId) : null,
        circulo_nome: cleanText(circuloNome) || 'Circulo Excedente',
        prioridade: index + 1,
        payload: item && typeof item === 'object' ? item : {},
      }));
      for (let index = 0; index < rows.length; index += 250) {
        const { error } = await supabase.from('circulos_execucao_itens').insert(rows.slice(index, index + 250));
        if (error) throw error;
      }

      await tryInsertAuditLog(supabase, {
        action: 'SAVE_CIRCULOS_DISTRIBUICAO_OFICIAL',
        entity: 'circulos_execucoes',
        entityId: execution.id,
        previousValue: '',
        newValue: `Distribuição oficial com ${entries.length} participantes.`,
        operator,
      });
      return {
        ok: true,
        data: { success: true, official: { id: execution.id, createdAt: execution.created_at, total: entries.length, criterios } },
      };
    }

    if (ctx.action === 'GET_INSCRICOES_PRIORITARIAS') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
          'inscricoes_prioritarias',
          'prioritarios',
          'inscricoes_prioritarias_view',
        ].filter(Boolean),
        { maxRows: 20000 }
      );
      const items = (Array.isArray(rows) ? rows : []).map((r, i) => ({
        ...r,
        id: pickFirst(r, ['id', 'uuid']) || `pri-${i + 1}`,
        linhaOrigem: pickFirst(r, ['linhaOrigem', 'linha_origem', 'linha_origem_nao_inscritos', 'linha_origem_origem']),
      }));
      return { ok: true, data: { success: true, inscricoesPrioritarias: items, items, total: items.length, source: 'supabase' } };
    }

    if (ctx.action === 'PRIORITIZE_NON_ENROLLED') {
      return await prioritizeNonEnrolledService(supabase, ctx.payload);

      const linhaOrigem = cleanText(ctx.payload.linhaOrigem || ctx.payload.linha_origem);
      const priorizarRaw = ctx.payload.priorizar;
      const priorizar = priorizarRaw === undefined ? true : Boolean(priorizarRaw);

      if (!linhaOrigem) {
        return { ok: true, data: { success: false, error: 'linhaOrigem é obrigatória.' } };
      }

      const nonTables = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'nao_inscritos',
        'non_enrolled',
        'nao_inscritos_raw',
      ].filter(Boolean);

      const priTables = [
        String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
        'inscricoes_prioritarias',
        'prioritarios',
        'inscricoes_prioritarias_view',
      ].filter(Boolean);

      const { table: nonTable, data: nonRows } = await queryFirstExistingTable<any[]>(
        supabase,
        nonTables,
        async (tableName) =>
          await supabase
            .from(tableName)
            .select('*')
            .or(`linha_origem.eq.${linhaOrigem},linhaOrigem.eq.${linhaOrigem},id.eq.${linhaOrigem},id_pessoa.eq.${linhaOrigem},idPessoa.eq.${linhaOrigem}`)
            .limit(1)
      );

      const sourceRow = Array.isArray(nonRows) ? nonRows[0] : null;
      if (!sourceRow) {
        return { ok: true, data: { success: false, error: 'Não inscrito não encontrado para priorização.' } };
      }

      const sourceId = cleanText(
        pickFirst(sourceRow, ['linhaOrigem', 'linha_origem', 'id_pessoa', 'idPessoa', 'id'])
      );
      const pessoaId = cleanText(pickFirst(sourceRow, ['id_pessoa', 'idPessoa', 'pessoa_id', 'pessoaId']));
      const telefone = cleanText(pickFirst(sourceRow, ['telefone', 'whatsapp', 'celular']));
      const email = cleanText(pickFirst(sourceRow, ['email']));
      const nome = cleanText(pickFirst(sourceRow, ['nome', 'nome_completo', 'nomeCompleto']));

      const { table: priTable } = await queryFirstExistingTable<any[]>(
        supabase,
        priTables,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const duplicateChecks: string[] = [];
      if (sourceId) {
        duplicateChecks.push(`linha_origem.eq.${sourceId}`, `linhaOrigem.eq.${sourceId}`);
      }
      if (pessoaId) {
        duplicateChecks.push(`id_pessoa.eq.${pessoaId}`, `idPessoa.eq.${pessoaId}`, `pessoa_id.eq.${pessoaId}`);
      }
      if (email) {
        duplicateChecks.push(`email.eq.${email}`);
      }
      if (telefone) {
        duplicateChecks.push(`telefone.eq.${telefone}`);
      }

      let existingPriority: any = null;
      if (duplicateChecks.length > 0) {
        const existingRes = await supabase
          .from(priTable)
          .select('*')
          .or(duplicateChecks.join(','))
          .limit(1);
        if (existingRes.error) throw existingRes.error;
        existingPriority = Array.isArray(existingRes.data) ? existingRes.data[0] : null;
      }

      if (priorizar) {
        if (existingPriority) {
          return {
            ok: true,
            data: {
              success: false,
              duplicate: true,
              source: 'supabase',
              error: 'Registro já priorizado. Duplicidade bloqueada.',
            },
          };
        }

        if (!existingPriority) {
          const insertAttempts = [
            {
              linha_origem: sourceId || linhaOrigem,
              id_pessoa: pessoaId || null,
              nome,
              email,
              telefone,
              origem: 'NAO_INSCRITO',
              status_priorizacao: 'PRIORIZADO',
              created_at: new Date().toISOString(),
            },
            {
              linhaOrigem: sourceId || linhaOrigem,
              idPessoa: pessoaId || null,
              nome,
              email,
              telefone,
              origem: 'NAO_INSCRITO',
              statusPriorizacao: 'PRIORIZADO',
              createdAt: new Date().toISOString(),
            },
          ];

          let inserted = false;
          let insertError: any = null;
          for (const payload of insertAttempts) {
            const res = await supabase.from(priTable).insert(payload as any).select('*').limit(1);
            if (!res.error) {
              existingPriority = Array.isArray(res.data) ? res.data[0] : null;
              inserted = true;
              insertError = null;
              break;
            }
            insertError = res.error;
          }
          if (!inserted && insertError) throw insertError;
        }

        const updateNonAttempts = [
          { statusPriorizacao: 'SIM' },
          { status_priorizacao: 'SIM' },
        ];
        for (const body of updateNonAttempts) {
          const res = await supabase
            .from(nonTable)
            .update(body as any)
            .or(`linha_origem.eq.${linhaOrigem},linhaOrigem.eq.${linhaOrigem},id.eq.${linhaOrigem},id_pessoa.eq.${linhaOrigem},idPessoa.eq.${linhaOrigem}`)
            .limit(1);
          if (!res.error) break;
        }

        return {
          ok: true,
          data: {
            success: true,
            source: 'supabase',
            priorizado: true,
            inserted: true,
            message: 'Registro priorizado com sucesso.',
          },
        };
      }

      if (existingPriority) {
        const existingId = cleanText(pickFirst(existingPriority, ['id', 'uuid']));
        if (existingId) {
          const delRes = await supabase.from(priTable).delete().eq('id', existingId);
          if (delRes.error) throw delRes.error;
        }
      }
      const updateNonAttempts = [
        { statusPriorizacao: '' },
        { status_priorizacao: '' },
      ];
      for (const body of updateNonAttempts) {
        const res = await supabase
          .from(nonTable)
          .update(body as any)
          .or(`linha_origem.eq.${linhaOrigem},linhaOrigem.eq.${linhaOrigem},id.eq.${linhaOrigem},id_pessoa.eq.${linhaOrigem},idPessoa.eq.${linhaOrigem}`)
          .limit(1);
        if (!res.error) break;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          priorizado: false,
          removed: true,
          message: 'Priorização removida com sucesso.',
        },
      };
    }

    if (ctx.action === 'EXECUTE_DISTRIBUICAO_CIRCULOS') {
      const minAge = Number(ctx.payload.minAge ?? 13);
      const maxAge = Number(ctx.payload.maxAge ?? 17);
      if (!Number.isFinite(minAge) || !Number.isFinite(maxAge) || maxAge < minAge) {
        return { ok: true, data: { success: false, error: 'Faixa etária inválida para distribuição.' } };
      }

      const payloadItems = Array.isArray(ctx.payload.items) ? ctx.payload.items : [];
      const normalizedPayloadItems = payloadItems
        .map((row: any, index: number) => ({
          id: cleanText(pickFirst(row, ['id', 'uuid', 'inscricao_id'])) || `payload-${index + 1}`,
          linhaOrigem: cleanText(pickFirst(row, ['linhaOrigem', 'linha_origem', 'inscricao_id', 'id'])) || `payload-${index + 1}`,
          nome: pickFirst(row, ['nome', 'nome_completo', 'name']),
          sexo: pickFirst(row, ['sexo', 'sexo_snapshot']),
          idade: pickFirst(row, ['idade', 'idade_snapshot', 'age']),
          bairro: pickFirst(row, ['bairro', 'bairro_snapshot']),
          status: pickFirst(row, ['status', 'status_inscricao']),
        }))
        .filter((row: any) => cleanText(row.nome || row.linhaOrigem || row.id));

      const loadRowsFromPrioritizedInscriptions = async () => {
        const { data: prioritizedInscriptions, error: prioritizedError } = await supabase
          .from('inscricoes')
          .select('id,status,adolescente_id,data_inscricao')
          .eq('status', 'PRIORIZADO')
          .limit(5000);

        if (prioritizedError || !Array.isArray(prioritizedInscriptions) || prioritizedInscriptions.length === 0) {
          return [] as any[];
        }

        const prioritizedAdolescenteIds = Array.from(
          new Set(prioritizedInscriptions.map((row: any) => cleanText(row?.adolescente_id)).filter(Boolean))
        );

        const prioritizedAdolescentes: any[] = [];
        for (let i = 0; i < prioritizedAdolescenteIds.length; i += 200) {
          const chunk = prioritizedAdolescenteIds.slice(i, i + 200);
          const { data, error } = await supabase.from('adolescentes').select('id,pessoa_id').in('id', chunk);
          if (error) continue;
          prioritizedAdolescentes.push(...(data || []));
        }

        const prioritizedPessoaIds = Array.from(
          new Set(prioritizedAdolescentes.map((row: any) => cleanText(row?.pessoa_id)).filter(Boolean))
        );
        const prioritizedPessoas: any[] = [];
        for (let i = 0; i < prioritizedPessoaIds.length; i += 200) {
          const chunk = prioritizedPessoaIds.slice(i, i + 200);
          const { data, error } = await supabase
            .from('pessoas')
            .select('id,nome_completo,data_nascimento,idade_calculada,sexo,bairro')
            .in('id', chunk);
          if (error) continue;
          prioritizedPessoas.push(...(data || []));
        }

        const adolescenteToPessoa = new Map(
          prioritizedAdolescentes.map((row: any) => [cleanText(row?.id), cleanText(row?.pessoa_id)])
        );
        const pessoaById = new Map(
          prioritizedPessoas.map((row: any) => [cleanText(row?.id), row])
        );

        return prioritizedInscriptions.map((row: any) => {
          const adolescenteId = cleanText(row?.adolescente_id);
          const pessoaId = adolescenteToPessoa.get(adolescenteId) || '';
          const pessoa = pessoaById.get(pessoaId) || {};
          return {
            id: cleanText(row?.id),
            inscricao_id: cleanText(row?.id),
            linhaOrigem: cleanText(row?.id),
            adolescente_id: adolescenteId || null,
            pessoa_id: pessoaId || null,
            nome: pickFirst(pessoa, ['nome_completo']),
            sexo: pickFirst(pessoa, ['sexo']),
            idade: pickFirst(pessoa, ['idade_calculada']),
            bairro: pickFirst(pessoa, ['bairro']),
            data_nascimento: pickFirst(pessoa, ['data_nascimento']),
            status: cleanText(row?.status || 'PRIORIZADO') || 'PRIORIZADO',
            data_inscricao: pickFirst(row, ['data_inscricao']),
          };
        });
      };

      let rows = normalizedPayloadItems;
      let rowsSource: 'payload' | 'inscricoes' | 'prioritarios' = rows.length > 0 ? 'payload' : 'inscricoes';
      if (rows.length === 0) {
        rows = await loadRowsFromPrioritizedInscriptions();
      }

      if ((!Array.isArray(rows) || rows.length === 0) && payloadItems.length === 0) {
        const priTables = [
          String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
          'inscricoes_prioritarias',
          'prioritarios',
          'inscricoes_prioritarias_view',
        ].filter(Boolean);

        rows = await fetchAllRows(supabase, priTables, { maxRows: 30000 });
        if (Array.isArray(rows) && rows.length > 0) rowsSource = 'prioritarios';
      }

      const allRows = Array.isArray(rows) ? rows : [];
      if (allRows.length === 0) {
        return {
          ok: true,
          data: {
            success: false,
            error: 'Nenhum registro prioritário disponível para distribuição.',
          },
        };
      }

      const pessoaIds = Array.from(new Set(
        allRows
          .map((row) => cleanText(pickFirst(row, ['pessoa_id', 'pessoaId', 'id_pessoa', 'idPessoa'])))
          .filter(Boolean)
      ));
      const adolescenteIds = Array.from(new Set(
        allRows
          .map((row) => cleanText(pickFirst(row, ['adolescente_id', 'adolescenteId'])))
          .filter(Boolean)
      ));

      const adolescentesById = new Map<string, any>();
      if (adolescenteIds.length > 0) {
        for (let i = 0; i < adolescenteIds.length; i += 200) {
          const chunk = adolescenteIds.slice(i, i + 200);
          const { data, error } = await supabase.from('adolescentes').select('id,pessoa_id').in('id', chunk);
          if (!error) {
            (data || []).forEach((row: any) => adolescentesById.set(cleanText(row?.id), row));
          }
        }
      }

      adolescentesById.forEach((row: any) => {
        const pessoaId = cleanText(row?.pessoa_id);
        if (pessoaId) pessoaIds.push(pessoaId);
      });

      const uniquePessoaIds = Array.from(new Set(pessoaIds.filter(Boolean)));
      const pessoasById = new Map<string, any>();
      if (uniquePessoaIds.length > 0) {
        for (let i = 0; i < uniquePessoaIds.length; i += 200) {
          const chunk = uniquePessoaIds.slice(i, i + 200);
          const { data, error } = await supabase
            .from('pessoas')
            .select('id,data_nascimento,idade_calculada,sexo,bairro,nome_completo')
            .in('id', chunk);
          if (!error) {
            (data || []).forEach((row: any) => pessoasById.set(cleanText(row?.id), row));
          }
        }
      }

      const resolvePerson = (row: any) => {
        const directPessoaId = cleanText(pickFirst(row, ['pessoa_id', 'pessoaId', 'id_pessoa', 'idPessoa']));
        if (directPessoaId && pessoasById.has(directPessoaId)) return pessoasById.get(directPessoaId);

        const adolescenteId = cleanText(pickFirst(row, ['adolescente_id', 'adolescenteId']));
        const adolescente = adolescenteId ? adolescentesById.get(adolescenteId) : null;
        const pessoaIdFromAdolescente = cleanText(adolescente?.pessoa_id);
        if (pessoaIdFromAdolescente && pessoasById.has(pessoaIdFromAdolescente)) return pessoasById.get(pessoaIdFromAdolescente);

        return null;
      };

      const resolveAge = (row: any) => {
        const person = resolvePerson(row);
        const birthDate =
          parseMemberBirthDate(pickFirst(row, ['data_nascimento', 'dataNascimento', 'nascimento'])) ||
          parseMemberBirthDate(person?.data_nascimento);

        const ageFromBirthDate = calcCurrentAgeFromBirthDate(birthDate);
        if (Number.isFinite(Number(ageFromBirthDate))) return Math.floor(Number(ageFromBirthDate));

        const persistedAge = parseLooseAge(person?.idade_calculada);
        if (Number.isFinite(persistedAge)) return Math.floor(persistedAge);

        const n = parseLooseAge(pickFirst(row, ['idade', 'idade_snapshot', 'age']));
        return Number.isFinite(n) ? Math.floor(n) : NaN;
      };

      const enrichedRows = allRows.map((row) => {
        const person = resolvePerson(row);
        const resolvedAge = resolveAge(row);
        return {
          ...row,
          idade_resolvida: Number.isFinite(resolvedAge) ? resolvedAge : null,
          data_nascimento_resolvida:
            parseMemberBirthDate(pickFirst(row, ['data_nascimento', 'dataNascimento', 'nascimento'])) ||
            parseMemberBirthDate(person?.data_nascimento),
          sexo_resolvido: pickFirst(row, ['sexo', 'sexo_snapshot']) || pickFirst(person, ['sexo']),
          bairro_resolvido: pickFirst(row, ['bairro', 'bairro_snapshot']) || pickFirst(person, ['bairro']),
          nome_resolvido: pickFirst(row, ['nome', 'nome_completo', 'name']) || pickFirst(person, ['nome_completo']),
        };
      });

      const eligible = enrichedRows.filter((row) => {
        const age = Number(row?.idade_resolvida);
        return isEligibleForCircleByAge(age, row?.data_nascimento_resolvida, minAge, maxAge);
      });
      const nonEligible = enrichedRows.filter((row) => !eligible.includes(row));

      const circles = ['Circulo 1', 'Circulo 2', 'Circulo 3', 'Circulo 4', 'Circulo 5', 'Circulo 6'];
      const grouped = createEmptyCircleGroups();
      const sexBucket = (raw: any) => {
        const s = cleanText(raw).toLowerCase();
        if (s.startsWith('m')) return 'M';
        if (s.startsWith('f')) return 'F';
        return 'O';
      };
      const maxPerCircle = Number(ctx.payload.maxPerCircle ?? 12);
      const targetPerSex = Math.max(1, Math.floor(maxPerCircle / 2));
      const mainAgeWindows = [
        { key: '13-14', ages: [13, 14] },
        { key: '14-15', ages: [14, 15] },
        { key: '15-16', ages: [15, 16] },
        { key: '16-17', ages: [16, 17] },
        { key: '12-13', ages: [12, 13] },
        { key: '13-13', ages: [13] },
        { key: '14-14', ages: [14] },
        { key: '15-15', ages: [15] },
      ].filter((window) => window.ages.some((age) => age >= minAge - 1 && age <= maxAge));
      const firstExceptionWindows = [
        { key: '15-17', ages: [15, 16, 17] },
      ].filter((window) => window.ages.some((age) => age >= minAge && age <= maxAge));
      const secondExceptionWindows = [
        { key: '14-16', ages: [14, 15, 16] },
      ].filter((window) => window.ages.some((age) => age >= minAge && age <= maxAge));

      const distributionTiers: Array<{
        regraAplicada: 'PRINCIPAL' | 'EXCECAO_1' | 'EXCECAO_2';
        windows: { key: string; ages: number[] }[];
      }> = [
        { regraAplicada: 'PRINCIPAL', windows: mainAgeWindows },
        { regraAplicada: 'EXCECAO_1', windows: firstExceptionWindows },
        { regraAplicada: 'EXCECAO_2', windows: secondExceptionWindows },
      ];

      const makeRowToken = (row: any) =>
        cleanText(pickFirst(row, ['id', 'uuid', 'linhaOrigem', 'linha_origem', 'inscricao_id'])) ||
        `${cleanText(row?.nome_resolvido || row?.nome)}-${cleanText(row?.idade_resolvida ?? row?.idade)}-${cleanText(row?.bairro_resolvido || row?.bairro)}`;

      const sortWindowRows = (rowsToSort: any[]) =>
        [...rowsToSort].sort((a, b) => {
          const ageA = Number(a?.idade_resolvida || 0);
          const ageB = Number(b?.idade_resolvida || 0);
          if (ageA !== ageB) return ageA - ageB;
          return cleanText(a?.nome_resolvido || a?.nome).localeCompare(cleanText(b?.nome_resolvido || b?.nome), 'pt-BR');
        });

      const buildCircleEntry = (row: any, circleName: string, extra: Record<string, any> = {}) => ({
        id: pickFirst(row, ['id', 'uuid']),
        linhaOrigem: pickFirst(row, ['linhaOrigem', 'linha_origem', 'linha_origem_nao_inscritos']),
        nome: row?.nome_resolvido ?? pickFirst(row, ['nome', 'nome_completo', 'name']),
        sexo: row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']),
        idade: row?.idade_resolvida ?? pickFirst(row, ['idade', 'idade_snapshot', 'age']),
        bairro: row?.bairro_resolvido ?? pickFirst(row, ['bairro', 'bairro_snapshot']),
        circulo: circleName,
        ...extra,
      });

      const pickNextRowForCircle = (bucket: any[], ageCounts: Record<string, number>) => {
        if (!Array.isArray(bucket) || bucket.length === 0) return null;
        let bestIndex = 0;
        let bestScore = Number.POSITIVE_INFINITY;
        bucket.forEach((row, index) => {
          const age = Number(row?.idade_resolvida || 0);
          const ageKey = String(age);
          const ageCount = ageCounts[ageKey] || 0;
          const score = ageCount * 10 + age;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });
        const [selected] = bucket.splice(bestIndex, 1);
        return selected || null;
      };

      const getWindowRows = (pool: any[], ages: number[]) =>
        sortWindowRows(
          pool.filter((row) => {
            const age = Number(row?.idade_resolvida);
            return Number.isFinite(age) && ages.includes(Math.floor(age));
          })
        );

      const estimateWindowFit = (pool: any[], ages: number[]) => {
        const candidates = getWindowRows(pool, ages);
        const maleCount = candidates.filter((row) => sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot'])) === 'M').length;
        const femaleCount = candidates.filter((row) => sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot'])) === 'F').length;
        const otherCount = candidates.length - maleCount - femaleCount;
        const pairCount = Math.min(maleCount, femaleCount);
        const balancedPairs = Math.min(targetPerSex, pairCount);
        const assignable = balancedPairs * 2;
        const sexGap = Math.abs(maleCount - femaleCount);
        const canFormFullCircle = maleCount >= targetPerSex && femaleCount >= targetPerSex;
        return { candidates, maleCount, femaleCount, otherCount, pairCount, balancedPairs, assignable, sexGap, canFormFullCircle };
      };

      const selectRowsForWindow = (pool: any[], ages: number[]) => {
        const candidates = getWindowRows(pool, ages);
        const male = candidates.filter((row) => sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot'])) === 'M');
        const female = candidates.filter((row) => sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot'])) === 'F');
        const fit = estimateWindowFit(pool, ages);
        if (!fit.canFormFullCircle) return [];

        const selected: any[] = [];
        const ageCounts: Record<string, number> = {};
        let maleSelected = 0;
        let femaleSelected = 0;

        while (selected.length < maxPerCircle) {
          const canTakeMale = male.length > 0 && maleSelected < targetPerSex;
          const canTakeFemale = female.length > 0 && femaleSelected < targetPerSex;
          if (!canTakeMale && !canTakeFemale) break;

          let selectedRow: any = null;
          if (canTakeMale && canTakeFemale) {
            const shouldTakeMale =
              maleSelected < femaleSelected ||
              (maleSelected === femaleSelected && male.length >= female.length);
            selectedRow = shouldTakeMale
              ? pickNextRowForCircle(male, ageCounts)
              : pickNextRowForCircle(female, ageCounts);
            if (selectedRow) {
              if (shouldTakeMale) maleSelected += 1;
              else femaleSelected += 1;
            }
          } else if (canTakeMale) {
            selectedRow = pickNextRowForCircle(male, ageCounts);
            if (selectedRow) maleSelected += 1;
          } else if (canTakeFemale) {
            selectedRow = pickNextRowForCircle(female, ageCounts);
            if (selectedRow) femaleSelected += 1;
          }

          if (!selectedRow) break;
          const ageKey = String(Number(selectedRow?.idade_resolvida || 0));
          ageCounts[ageKey] = (ageCounts[ageKey] || 0) + 1;
          selected.push(selectedRow);
        }

        if (maleSelected !== targetPerSex || femaleSelected !== targetPerSex || selected.length !== maxPerCircle) {
          return [];
        }

        return selected;
      };

      const remainingEligible = [...eligible];
      const assignedTokens = new Set<string>();
      const circleWindows: Record<string, string> = {};
      const assignTier = (ruleTier: (typeof distributionTiers)[number]) => {
        circles.forEach((circleName) => {
          if ((grouped[circleName] || []).length > 0) return;

          const bestWindow = ruleTier.windows.find((window) => {
            const fit = estimateWindowFit(
              remainingEligible.filter((row) => !assignedTokens.has(makeRowToken(row))),
              window.ages
            );
            return fit.canFormFullCircle;
          });

          if (!bestWindow) return;

          const selectedRows = selectRowsForWindow(
            remainingEligible.filter((row) => !assignedTokens.has(makeRowToken(row))),
            bestWindow.ages
          );
          if (!selectedRows.length) return;

          circleWindows[circleName] = `${ruleTier.regraAplicada}:${bestWindow.key}`;
          selectedRows.forEach((row) => {
            assignedTokens.add(makeRowToken(row));
            grouped[circleName].push(
              buildCircleEntry(row, circleName, {
                janelaEtaria: bestWindow?.key || '',
                regraAplicada: ruleTier.regraAplicada,
              })
            );
          });
        });
      };

      distributionTiers.forEach(assignTier);

      const selectedTokenBag = new Set<string>();
      circles.forEach((circleName) => {
        grouped[circleName].forEach((row: any) => {
          const token =
            cleanText(pickFirst(row, ['id', 'uuid', 'linhaOrigem', 'linha_origem'])) ||
            `${cleanText(row?.nome)}-${cleanText(row?.idade)}-${cleanText(row?.bairro)}`;
          selectedTokenBag.add(token);
        });
      });

      const leftoverEligible = eligible.filter((row) => {
        const token = makeRowToken(row);
        if (assignedTokens.has(token)) return false;
        const fallbackToken =
          cleanText(pickFirst(row, ['id', 'uuid', 'linhaOrigem', 'linha_origem'])) ||
          `${cleanText(row?.nome_resolvido || row?.nome)}-${cleanText(row?.idade_resolvida)}-${cleanText(row?.bairro_resolvido || row?.bairro)}`;
        return !selectedTokenBag.has(fallbackToken);
      });

      nonEligible.forEach((row) => {
        grouped['Circulo Excedente'].push({
          ...buildCircleEntry(row, 'Circulo Excedente'),
          motivoExcedente: 'FORA_FAIXA',
        });
      });

      const pendentesMontagem = leftoverEligible.map((row) => ({
        ...buildCircleEntry(row, 'Pendente de Montagem'),
        motivoPendente: 'NAO_ENCAIXOU_EM_NENHUMA_REGRA',
      }));
      leftoverEligible.forEach((row) => {
        grouped['Circulo Excedente'].push({
          ...buildCircleEntry(row, 'Circulo Excedente'),
          motivoExcedente: 'SEM_POSSIBILIDADE_DE_APROVEITAMENTO',
        });
      });
      const resumoPendentes = leftoverEligible.reduce((acc: Record<string, number>, row) => {
        const age = Number(row?.idade_resolvida || 0);
        const ageKey = Number.isFinite(age) ? String(Math.floor(age)) : 'SEM_IDADE';
        const sex = sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']));
        const key = `${ageKey}-${sex}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          message: 'Distribuição de círculos executada com sucesso.',
          origemDadosDistribuicao: rowsSource,
          faixa: { minAge, maxAge },
          totalPrioritarios: (Array.isArray(rows) ? rows : []).length,
          totalAptos: eligible.length,
          totalDistribuido: Object.values(grouped).reduce((acc, list) => acc + list.length, 0),
          totalPendentesMontagem: pendentesMontagem.length,
          totalPersistido: 0,
          persistencia: 'client-fallback',
          janelasAplicadas: circleWindows,
          pendentesMontagem,
          resumoPendentes,
          circulos: grouped,
        },
      };
    }

    if (ctx.action === 'MOVE_CIRCULO_PARTICIPANTE') {
      const id = cleanText(ctx.payload.id);
      const fromCirculo = cleanText(ctx.payload.fromCirculo);
      const toCirculo = cleanText(ctx.payload.toCirculo);
      const operator = cleanText(ctx.payload.operator) || 'SYSTEM';

      if (!id) {
        return { ok: true, data: { success: false, error: 'ID do participante é obrigatório.' } };
      }
      if (!toCirculo) {
        return { ok: true, data: { success: false, error: 'Círculo de destino é obrigatório.' } };
      }

      const distributionTables = [
        String(process.env.EAC_SUPABASE_TABLE_CIRCULOS || '').trim(),
        'circulos_distribuidos',
        'circulos',
        'circles_distribution',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        distributionTables,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const updateAttempts = [
        { circulo: toCirculo, grupo_sugerido: toCirculo, updated_at: new Date().toISOString() },
        { circulo: toCirculo, grupoSugerido: toCirculo, updatedAt: new Date().toISOString() },
      ];
      let updated: any = null;
      let updateError: any = null;
      for (const payload of updateAttempts) {
        const res = await supabase.from(table).update(payload as any).eq('id', id).select('*').limit(1);
        if (!res.error) {
          updated = Array.isArray(res.data) ? res.data[0] : null;
          updateError = null;
          break;
        }
        updateError = res.error;
      }
      if (updateError) throw updateError;

      const logged = await tryInsertAuditLog(supabase, {
        action: 'MOVE_CIRCULO_PARTICIPANTE',
        entity: table,
        entityId: id,
        previousValue: fromCirculo || '',
        newValue: toCirculo,
        operator,
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          table,
          updated,
          auditLogged: logged,
        },
      };
    }

    if (ctx.action === 'GET_EMAIL_STATUS_SUMMARY') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_EMAIL_STATUS || '').trim(),
          'email_status_summary',
          'email_status',
        ].filter(Boolean),
        { maxRows: 20000 }
      );
      // Esperado pelo frontend: summary como map por idPessoa/linhaOrigem
      const summary: Record<string, any> = {};
      (Array.isArray(rows) ? rows : []).forEach((r: any) => {
        const id = String(pickFirst(r, ['idPessoa', 'id_pessoa', 'linhaOrigem', 'linha_origem', 'id']) || '').trim();
        if (!id) return;
        summary[id] = r;
      });
      return { ok: true, data: { success: true, summary, source: 'supabase' } };
    }

    if (ctx.action === 'GET_EMAIL_CALLS_BY_PERSON') {
      const idPessoa = cleanText(
        ctx.payload.idPessoa ||
        ctx.payload.id_pessoa ||
        ctx.payload.linhaOrigem ||
        ctx.payload.linha_origem
      );
      if (!idPessoa) {
        return { ok: true, data: { success: false, error: 'idPessoa é obrigatório.' } };
      }

      const chamados = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_EMAIL_CHAMADOS || '').trim(),
          'email_chamados',
          'email_calls',
        ].filter(Boolean),
        { maxRows: 20000 }
      );

      const mensagens = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_EMAIL_MENSAGENS || '').trim(),
          'email_mensagens',
          'email_messages',
        ].filter(Boolean),
        { maxRows: 50000 }
      );

      const personCalls = (Array.isArray(chamados) ? chamados : []).filter((row: any) => {
        const personId = cleanText(pickFirst(row, ['id_pessoa', 'idPessoa', 'pessoa_id', 'person_id', 'linha_origem', 'linhaOrigem']));
        return personId === idPessoa;
      });

      const history = personCalls.map((row: any, index: number) => {
        const idChamado = cleanText(pickFirst(row, ['id_chamado', 'idChamado', 'chamado_id', 'call_id', 'id']));
        const token = cleanText(pickFirst(row, ['token', 'thread_token', 'threadToken']));
        const threadId = cleanText(pickFirst(row, ['thread_id', 'threadId', 'gmail_thread_id', 'gmailThreadId']));
        const sentAt = toIsoDateOrEmpty(pickFirst(row, ['data_envio', 'sent_at', 'enviado_em', 'created_at', 'createdAt', 'timestamp']));

        const linkedMessages = (Array.isArray(mensagens) ? mensagens : []).filter((m: any) => {
          const msgCallId = cleanText(pickFirst(m, ['id_chamado', 'idChamado', 'chamado_id', 'call_id']));
          const msgToken = cleanText(pickFirst(m, ['token', 'thread_token', 'threadToken']));
          const msgThreadId = cleanText(pickFirst(m, ['thread_id', 'threadId', 'gmail_thread_id', 'gmailThreadId']));
          if (idChamado && msgCallId && msgCallId === idChamado) return true;
          if (token && msgToken && msgToken === token) return true;
          if (threadId && msgThreadId && msgThreadId === threadId) return true;
          return false;
        });

        const replies = linkedMessages
          .filter((m: any) => isLikelyReplyMessage(m))
          .map((m: any) => ({
            at: toIsoDateOrEmpty(pickFirst(m, ['data_mensagem', 'message_at', 'sent_at', 'created_at', 'timestamp'])),
            from: cleanText(pickFirst(m, ['from', 'de', 'remetente', 'email_from'])),
            snippet: cleanText(pickFirst(m, ['snippet', 'resumo', 'body', 'mensagem', 'texto'])),
          }))
          .filter((m: any) => m.at || m.snippet || m.from)
          .sort((a: any, b: any) => String(a.at || '').localeCompare(String(b.at || '')));

        const lastReply = replies.length ? replies[replies.length - 1] : null;
        const status = cleanText(pickFirst(row, ['status', 'situacao', 'estado'])).toUpperCase();

        return {
          idChamado: idChamado || token || threadId || `call-${index + 1}`,
          token,
          status: status || (lastReply ? 'RESPONDIDO' : 'ENVIADO'),
          sentAt,
          lastReplyAt: lastReply?.at || '',
          lastReplyFrom: lastReply?.from || '',
          lastReplySnippet: lastReply?.snippet || '',
          subjectFinal: cleanText(pickFirst(row, ['assunto_final', 'assunto', 'subject', 'subject_final'])),
          body: cleanText(pickFirst(row, ['corpo', 'body', 'mensagem', 'texto'])),
        };
      });

      history.sort((a: any, b: any) =>
        String(b.sentAt || b.lastReplyAt || '').localeCompare(String(a.sentAt || a.lastReplyAt || ''))
      );
      return { ok: true, data: { success: true, history, source: 'supabase' } };
    }

    // Ação não suportada ainda via Supabase (mantém fallback para Google Script)
    return { ok: false, error: 'Ação não suportada no Supabase.' };
  } catch (e: any) {
    const message = String(e?.message || 'Falha ao consultar Supabase.');
    return { ok: false, error: message, details: e };
  }
}







