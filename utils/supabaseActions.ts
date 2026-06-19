import type { SupabaseClient as BaseSupabaseClient } from '@supabase/supabase-js';
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
  const upsert = (row: any, origem: 'ENCONTREIRO' | 'ENCONTRISTA') => {
    const nome = toClean(row?.nomeCompleto || row?.nome || row?.nome_completo || row?.name);
    if (!nome) return;
    const telefone = toClean(row?.celularWhatsapp || row?.telefone || row?.whatsapp || row?.celular || row?.phone);
    const telKey = normalizeDigitsLocal(telefone);
    const key = telKey ? `tel:${telKey}` : `nome:${normalizeTextLocal(nome)}`;
    const prev = map.get(key);
    map.set(key, {
      key,
      nome,
      telefone: telefone || prev?.telefone || '',
      circulo: toClean(
        row?.circulo ||
        row?.grupoSugerido ||
        row?.grupo_sugerido ||
        row?.circuloInformado ||
        row?.circulo_informado ||
        prev?.circulo ||
        ''
      ),
      origem: prev && prev.origem !== origem ? 'AMBOS' : (prev?.origem || origem),
    });
  };

  encontreiros.forEach((r: any) => upsert(r, 'ENCONTREIRO'));
  encontristas.forEach((r: any) => upsert(r, 'ENCONTRISTA'));

  if (map.size === 0) {
    presence.forEach((row: any) => {
      const nome = toClean(row?.nome || row?.nome_digitado || row?.nome_completo);
      if (!nome) return;
      const telefone = toClean(row?.telefone || row?.telefone_digitado || row?.telefone_normalizado);
      const telKey = normalizeDigitsLocal(telefone);
      const key = telKey ? `tel:${telKey}` : `nome:${normalizeTextLocal(nome)}`;
      if (map.has(key)) return;
      map.set(key, {
        key,
        nome,
        telefone,
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
    timestamp: pickFirst(row, ['timestamp', 'data_presenca', 'created_at', 'createdAt', 'criado_em']),
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
    envTable,
    envTable.startsWith('vw_') ? envTable.replace(/^vw_/, '') : '',
    'vw_encontreiros',
    'vw_encontreiros',
    'encontreiros',
    tableComTr,
    tableSemTr,
    'cadastro_encontreiros',
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

async function getEncontreiroEquipeRows(supabase: SupabaseClient, encontreiroId: string) {
  const tryByColumn = async (columnName: string) => {
    const { data, error } = await supabase
      .from('encontreiro_equipes')
      .select('*')
      .eq(columnName, encontreiroId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const candidates = ['encontreiro_id', 'encontreiroId', 'pessoa_id', 'pessoaId'];
  for (const column of candidates) {
    try {
      const rows = await tryByColumn(column);
      if (rows.length > 0) return { rows, column };
    } catch {
      // tenta próxima coluna
    }
  }

  return { rows: [] as any[], column: 'encontreiro_id' };
}

async function replaceEncontreiroEquipes(
  supabase: SupabaseClient,
  encontreiroId: string,
  equipeIds: string[],
) {
  const existing = await getEncontreiroEquipeRows(supabase, encontreiroId);
  const targetColumn = existing.column || 'encontreiro_id';

  try {
    await supabase.from('encontreiro_equipes').delete().eq(targetColumn, encontreiroId);
  } catch {
    // ignora
  }

  for (const equipeId of equipeIds) {
    const attempts: Record<string, any>[] = [
      { [targetColumn]: encontreiroId, equipe_id: equipeId, ativo: true },
      { [targetColumn]: encontreiroId, equipeId, ativo: true },
      { [targetColumn]: encontreiroId, equipe_id: equipeId },
      { [targetColumn]: encontreiroId, equipeId },
    ];

    let saved = false;
    for (const payload of attempts) {
      const { error } = await supabase.from('encontreiro_equipes').insert(payload);
      if (!error) {
        saved = true;
        break;
      }
    }
    if (!saved) {
      throw new Error(`Não foi possível vincular equipe ${equipeId}.`);
    }
  }
}

function buildPessoaPayloadFromEncontreiro(payload: JsonObject) {
  const telefone = cleanText(payload.celularWhatsapp);
  const telefoneDigits = normalizeDigits(telefone);
  const telefoneNormalizado = !telefoneDigits
    ? ''
    : (telefoneDigits.startsWith('55') || telefoneDigits.length > 11 ? telefoneDigits : `55${telefoneDigits}`);

  return {
    nome_completo: cleanText(payload.nomeCompleto),
    nome_normalizado: cleanText(payload.nomeCompleto).toLowerCase(),
    data_nascimento: cleanText(payload.dataNascimento) || null,
    idade_calculada: cleanText(payload.idade) || null,
    email: cleanText(payload.email) || null,
    telefone: telefone || null,
    telefone_normalizado: telefoneNormalizado || null,
    bairro: cleanText(payload.bairro) || null,
    observacoes: cleanText(payload.classificacao) || null,
  };
}

async function upsertPessoaFromEncontreiro(supabase: SupabaseClient, payload: JsonObject) {
  const pessoaPayload = buildPessoaPayloadFromEncontreiro(payload);
  const nome = String(pessoaPayload.nome_completo || '').trim();
  if (!nome) {
    return null;
  }

  const email = String(pessoaPayload.email || '').trim().toLowerCase();
  const telNorm = String(pessoaPayload.telefone_normalizado || '').trim();

  let query = supabase.from('pessoas').select('id').limit(1);
  if (email && telNorm) {
    query = query.or(`email.eq.${email},telefone_normalizado.eq.${telNorm}`);
  } else if (email) {
    query = query.eq('email', email);
  } else if (telNorm) {
    query = query.eq('telefone_normalizado', telNorm);
  } else {
    query = query.eq('nome_normalizado', nome.toLowerCase());
  }

  const { data: existing, error: existingError } = await query;
  if (existingError) throw existingError;

  const existingId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : '';
  if (existingId) {
    const { data: updated, error: updateErr } = await supabase
      .from('pessoas')
      .update(pessoaPayload)
      .eq('id', existingId)
      .select('id')
      .limit(1);
    if (updateErr) throw updateErr;
    return Array.isArray(updated) && updated[0]?.id ? String(updated[0].id) : existingId;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('pessoas')
    .insert(pessoaPayload)
    .select('id')
    .limit(1);
  if (insertErr) throw insertErr;
  return Array.isArray(inserted) && inserted[0]?.id ? String(inserted[0].id) : null;
}

async function ensurePessoaPapelAtivo(
  supabase: SupabaseClient,
  pessoaId: string,
  papel: 'ENCONTRISTA' | 'ENCONTREIRO',
) {
  const { data: existing, error: existingError } = await supabase
    .from('pessoa_papeis')
    .select('id,ativo')
    .eq('pessoa_id', pessoaId)
    .eq('papel', papel)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    if (existing.ativo === true) return;
    const { error: updateError } = await supabase
      .from('pessoa_papeis')
      .update({ ativo: true })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from('pessoa_papeis')
    .insert({ pessoa_id: pessoaId, papel, ativo: true });
  if (insertError) throw insertError;
}

async function getLastUpdateFromTable(
  supabase: SupabaseClient,
  tableCandidates: string[],
  columnCandidates: string[]
): Promise<string | null> {
  for (const column of columnCandidates) {
    try {
      const { data } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => {
          return await supabase.from(tableName).select(column).order(column, { ascending: false }).limit(1);
        }
      );
      const first = Array.isArray(data) ? data[0] : null;
      const raw = first ? first[column] : null;
      if (raw) return String(raw);
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      const isMissingColumn = msg.includes('column') && msg.includes('does not exist');
      if (isMissingColumn) continue;
      if (isMissingRelationError(e)) continue;
      // ignora e tenta a próxima coluna/tabela, mas sem falhar o painel inteiro
      continue;
    }
  }
  return null;
}

async function tryInsertAuditLog(
  supabase: SupabaseClient,
  payload: {
    action: string;
    entity: string;
    entityId: string;
    previousValue: string;
    newValue: string;
    operator?: string;
  }
): Promise<boolean> {
  const logTables = ['audit_logs', 'logs', 'dispatch_logs', 'eac_logs'];
  const summary = `${payload.action} ${payload.entity}:${payload.entityId} ${payload.previousValue} -> ${payload.newValue}`;

  for (const table of logTables) {
    const attempts: Array<Record<string, any>> = [
      {
        dispatch_id: payload.action,
        dispatch_name: payload.action,
        operator: payload.operator || 'SYSTEM',
        timestamp: new Date().toISOString(),
        duration: 0,
        status: 'SUCCESS',
        response_summary: summary,
      },
      {
        dispatchId: payload.action,
        dispatchName: payload.action,
        operator: payload.operator || 'SYSTEM',
        timestamp: new Date().toISOString(),
        duration: 0,
        status: 'SUCCESS',
        responseSummary: summary,
      },
      {
        entidade: payload.entity,
        entidade_id: payload.entityId,
        acao: payload.action,
        valor_anterior: payload.previousValue,
        valor_novo: payload.newValue,
        operador: payload.operator || 'SYSTEM',
        criado_em: new Date().toISOString(),
      },
      {
        entity: payload.entity,
        entity_id: payload.entityId,
        action: payload.action,
        previous_value: payload.previousValue,
        new_value: payload.newValue,
        operator: payload.operator || 'SYSTEM',
        created_at: new Date().toISOString(),
      },
    ];

    for (const body of attempts) {
      try {
        const { error } = await supabase.from(table).insert(body as any);
        if (!error) return true;
        const message = String(error.message || '').toLowerCase();
        if (message.includes('relation') && message.includes('does not exist')) break;
      } catch {
        // tenta próximo formato/tabela
      }
    }
  }

  return false;
}

export async function handleSupabaseAction(action: string, payload: JsonObject = {}): Promise<SupabaseActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, error: 'Supabase não configurado (SUPABASE_URL / SUPABASE_*_KEY).' };
  }

  const ctx: SupabaseActionContext = { action, payload: payload || {} };

  try {
    if (ctx.action === 'GET_SYNC_STATUS') {
      const last =
        (await getLastUpdateFromTable(supabase, ['sync_log', 'sync_logs', 'eac_sync_log'], ['updated_at', 'created_at', 'synced_at', 'timestamp'])) ||
        (await getLastUpdateFromTable(supabase, ['cadastro_oficial', 'cadastro', 'members', 'membros', 'adolescentes'], ['updated_at', 'synced_at', 'created_at', 'timestamp'])) ||
        (await getLastUpdateFromTable(supabase, ['nao_inscritos', 'non_enrolled', 'vw_non_enrolled'], ['updated_at', 'synced_at', 'created_at', 'timestamp']));

      return { ok: true, data: { success: true, source: 'supabase', lastUpdate: last } };
    }

    if (ctx.action === 'USER_LOGIN') {
      const email = String(ctx.payload.email || '').trim().toLowerCase();
      const password = String(ctx.payload.password || '').trim();
      if (!email || !password) {
        return { ok: true, data: { success: false, error: 'E-mail e senha são obrigatórios.' } };
      }

      const tables = [
        String(process.env.EAC_SUPABASE_TABLE_USERS || '').trim(),
        'usuario',
        'usuarios',
        'users',
        'eac_users',
      ].filter(Boolean);

      const rows = await fetchAllRows(supabase, tables, { maxRows: 5000 });
      const resolved = (Array.isArray(rows) ? rows : []).find((r: any) => {
        const login = String(pickFirst(r, ['usuario', 'email']) || '').trim().toLowerCase();
        return login === email;
      });

      if (!resolved) {
        return { ok: true, data: { success: false, error: 'Credenciais inválidas.' } };
      }

      const storedPasswordRaw = String(pickFirst(resolved, ['senha', 'password', 'password_hash']) || '').trim();
      const allowLegacyPlainPassword =
        String(process.env.EAC_ALLOW_LEGACY_PLAIN_PASSWORD || '').trim().toLowerCase() === 'true';

      let validPassword = false;
      if (storedPasswordRaw.startsWith('sha256:')) {
        const storedHash = storedPasswordRaw.slice('sha256:'.length).trim().toLowerCase();
        validPassword = secureCompare(storedHash, hashSha256Hex(password).toLowerCase());
      } else if (/^[a-f0-9]{64}$/i.test(storedPasswordRaw)) {
        validPassword = secureCompare(storedPasswordRaw.toLowerCase(), hashSha256Hex(password).toLowerCase());
      } else if (isLikelyPasswordHash(storedPasswordRaw)) {
        // Hash reconhecido, porém sem verificador local (ex.: bcrypt sem lib): bloqueia por segurança.
        validPassword = false;
      } else if (allowLegacyPlainPassword) {
        validPassword = secureCompare(storedPasswordRaw, password);
      }

      if (!validPassword) {
        return { ok: true, data: { success: false, error: 'Credenciais inválidas.' } };
      }

      const user = {
        ...normalizeUserRecord(resolved),
        usuario: pickFirst(resolved, ['usuario', 'email']) || email,
        id: pickFirst(resolved, ['id', 'uuid']),
      };

      if (cleanText(user.status).toLowerCase() === 'inativo') {
        return { ok: true, data: { success: false, error: 'Usuário inativo. Acesso bloqueado.' } };
      }

      return { ok: true, data: { success: true, user, source: 'supabase' } };
    }

    if (ctx.action === 'GET_MEMBERS') {
      const members = await fetchActiveMembersFromNormalizedTables(supabase);
      return { ok: true, data: { success: true, members, total: members.length, source: 'supabase' } };
    }

    if (ctx.action === 'GET_PUBLIC_PRESENCE_DATA') {
      const [enc, mem, pre] = await Promise.all([
        handleSupabaseAction('GET_ENCONTREIROS', {}),
        handleSupabaseAction('GET_MEMBERS', {}),
        handleSupabaseAction('GET_PRESENCE', {}),
      ]);

      if (!enc.ok || !mem.ok) {
        return {
          ok: true,
          data: {
            success: false,
            error: (!enc.ok ? enc.error : '') || (!mem.ok ? mem.error : '') || 'Falha ao carregar dados de presenca.',
          },
        };
      }

      const encontreiros = Array.isArray((enc.data as any)?.encontreiros) ? (enc.data as any).encontreiros : [];
      const encontristas = Array.isArray((mem.data as any)?.members) ? (mem.data as any).members : [];
      const presence = pre.ok && Array.isArray((pre.data as any)?.presence) ? (pre.data as any).presence : [];

      return {
        ok: true,
        data: buildPublicPresenceCandidates({ encontreiros, encontristas, presence }),
      };
    }

    if (ctx.action === 'GET_USERS') {
      const profiles = await supabase
        .from('app_user_profiles')
        .select('*')
        .order('email', { ascending: true });
      if (!profiles.error) {
        const users = (Array.isArray(profiles.data) ? profiles.data : [])
          .map((row: any) => profileToLegacyUserRecord(row))
          .filter((u: any) => cleanText(u.usuario));
        return { ok: true, data: { success: true, users, total: users.length, source: 'supabase_profiles' } };
      }

      const tables = [
        String(process.env.EAC_SUPABASE_TABLE_USERS || '').trim(),
        'usuario',
        'usuarios',
        'users',
        'eac_users',
      ].filter(Boolean);

      const rows = await fetchAllRows(supabase, tables, { maxRows: 5000 });
      const users = (Array.isArray(rows) ? rows : [])
        .map((row: any) => normalizeUserRecord(row))
        .filter((u: any) => cleanText(u.usuario));
      users.sort((a: any, b: any) => cleanText(a.usuario).localeCompare(cleanText(b.usuario)));
      return { ok: true, data: { success: true, users, total: users.length, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_USER') {
      const usuarioEmail = cleanText(ctx.payload.usuario || ctx.payload.email).toLowerCase();
      const originalEmail = cleanText(ctx.payload.originalEmail).toLowerCase();
      const senhaRaw = cleanText(ctx.payload.senha);
      if (!usuarioEmail) {
        return { ok: true, data: { success: false, error: 'Usuário é obrigatório.' } };
      }

      const isAdmin = cleanText(ctx.payload.perfil).toLowerCase() === 'administrador';
      const role = isAdmin ? 'ADMIN' : 'VIEWER';
      const status = cleanText(ctx.payload.status).toLowerCase() === 'inativo' ? 'INATIVO' : 'ATIVO';
      const allowedModules = buildAllowedModulesFromLegacyPayload(ctx.payload, isAdmin);
      const metadata = {
        canCreate: isAdmin || yesNoToBool(ctx.payload.inclusao),
        canEdit: isAdmin || yesNoToBool(ctx.payload.alteracao),
        canDelete: isAdmin || yesNoToBool(ctx.payload.exclusao),
        encontreiros: {
          canCreate: isAdmin || yesNoToBool(ctx.payload.encontreiro_inclusao) || yesNoToBool(ctx.payload.inclusao),
          canEdit: isAdmin || yesNoToBool(ctx.payload.encontreiro_alteracao) || yesNoToBool(ctx.payload.alteracao),
          canDelete: isAdmin || yesNoToBool(ctx.payload.encontreiro_exclusao) || yesNoToBool(ctx.payload.exclusao),
          canViewSensitive: isAdmin || yesNoToBool(ctx.payload.encontreiro_dados_sensiveis),
        },
      };

      let authUser = await findAuthUserByEmail(supabase, usuarioEmail);
      if (!authUser && originalEmail && originalEmail !== usuarioEmail) {
        authUser = await findAuthUserByEmail(supabase, originalEmail);
      }

      if (!authUser) {
        if (!senhaRaw) {
          return { ok: true, data: { success: false, error: 'Usuário não existe no Auth. Informe senha para criar.' } };
        }
        const created = await supabase.auth.admin.createUser({
          email: usuarioEmail,
          password: senhaRaw,
          email_confirm: true,
          user_metadata: { name: usuarioEmail.split('@')[0] },
        });
        if (created.error || !created.data?.user) {
          return { ok: true, data: { success: false, error: created.error?.message || 'Falha ao criar usuário no Auth.' } };
        }
        authUser = created.data.user;
      } else if (senhaRaw) {
        const updatedAuth = await supabase.auth.admin.updateUserById(authUser.id, { password: senhaRaw });
        if (updatedAuth.error) {
          return { ok: true, data: { success: false, error: updatedAuth.error.message } };
        }
      }

      const profilePayload = {
        auth_user_id: authUser.id,
        email: usuarioEmail,
        nome: cleanText(ctx.payload.nome || ctx.payload.usuario || authUser.user_metadata?.name || usuarioEmail.split('@')[0]),
        role,
        status,
        allowed_modules: allowedModules,
        metadata,
        updated_at: new Date().toISOString(),
      };

      const upsert = await supabase
        .from('app_user_profiles')
        .upsert(profilePayload as any, { onConflict: 'auth_user_id' })
        .select('*')
        .limit(1);
      if (upsert.error) {
        return { ok: true, data: { success: false, error: upsert.error.message } };
      }

      const result = Array.isArray(upsert.data) ? upsert.data[0] : profilePayload;
      await tryInsertAuditLog(supabase, {
        action: 'UPSERT_USER_PROFILE',
        entity: 'app_user_profiles',
        entityId: usuarioEmail,
        previousValue: '',
        newValue: role,
        operator: cleanText(ctx.payload.operator || usuarioEmail || 'SYSTEM'),
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase_profiles',
          user: profileToLegacyUserRecord(result),
          message: 'Usuário salvo com sucesso.',
        },
      };
    }

    if (ctx.action === 'DELETE_USER') {
      const usuario = cleanText(ctx.payload.usuario || ctx.payload.email).toLowerCase();
      if (!usuario) {
        return { ok: true, data: { success: false, error: 'Usuário é obrigatório para inativação.' } };
      }

      const inactivate = await supabase
        .from('app_user_profiles')
        .update({ status: 'INATIVO', updated_at: new Date().toISOString() } as any)
        .eq('email', usuario)
        .select('*')
        .limit(1);

      if (!inactivate.error && Array.isArray(inactivate.data) && inactivate.data.length > 0) {
        await tryInsertAuditLog(supabase, {
          action: 'INATIVATE_USER_PROFILE',
          entity: 'app_user_profiles',
          entityId: usuario,
          previousValue: 'ATIVO',
          newValue: 'INATIVO',
          operator: cleanText(ctx.payload.operator || usuario || 'SYSTEM'),
        });
        return { ok: true, data: { success: true, source: 'supabase_profiles', usuario, message: 'Usuário inativado com sucesso.' } };
      }

      // fallback legado (delete físico)
      const tables = [
        String(process.env.EAC_SUPABASE_TABLE_USERS || '').trim(),
        'usuario',
        'usuarios',
        'users',
        'eac_users',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tables,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const del = await supabase.from(table).delete().or(`usuario.eq.${usuario},email.eq.${usuario}`);
      if (del.error) throw del.error;

      await tryInsertAuditLog(supabase, {
        action: 'DELETE_USER',
        entity: table,
        entityId: usuario,
        previousValue: 'existing_user',
        newValue: 'deleted_user',
        operator: cleanText(ctx.payload.operator || usuario || 'SYSTEM'),
      });
      return { ok: true, data: { success: true, source: 'supabase', usuario } };
    }

    if (ctx.action === 'SEARCH_MEMBERS') {
      const queryText = String(ctx.payload.query || '').trim();
      const bairro = String(ctx.payload.bairro || '').trim();
      const email = String(ctx.payload.email || '').trim();
      const telefone = String(ctx.payload.telefone || '').trim();
      const sexo = String(ctx.payload.sexo || '').trim();
      const pertence = String(ctx.payload.pertencePorciuncula || '').trim();
      const limit = Math.max(1, Math.min(200, Number(ctx.payload.limit || 30) || 30));
      const page = Math.max(1, Number(ctx.payload.page || 1) || 1);

      const tables = [
        String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
        'cadastro_oficial',
        'cadastro',
        'members',
        'membros',
        'adolescentes',
      ].filter(Boolean);

      const rows = await fetchAllRows(supabase, tables, { maxRows: 30000 });
      const normalized = rows.map(normalizeMember).filter((m) => String(m.nome || '').trim());

      const qNorm = queryText.toLowerCase();
      const bairroNorm = bairro.toLowerCase();
      const emailNorm = email.toLowerCase();
      const sexoNorm = sexo.toLowerCase();
      const pertenceNorm = pertence.toLowerCase();
      const phoneDigits = normalizeDigits(telefone);

      const filtered = normalized.filter((m: any) => {
        if (qNorm) {
          const hay = [
            String(m.nome || ''),
            String(m.email || ''),
            String(m.telefone || ''),
            String(m.whatsapp || ''),
            String(m.bairro || ''),
          ].join(' ').toLowerCase();
          if (!hay.includes(qNorm)) return false;
        }
        if (bairroNorm && !String(m.bairro || '').toLowerCase().includes(bairroNorm)) return false;
        if (emailNorm && !String(m.email || '').toLowerCase().includes(emailNorm)) return false;
        if (sexoNorm && !String(m.sexo || '').toLowerCase().includes(sexoNorm)) return false;
        if (pertenceNorm && !String(m.pertencePorciuncula || '').toLowerCase().includes(pertenceNorm)) return false;
        if (phoneDigits) {
          const mDigits = normalizeDigits(String(m.telefone || '') + ' ' + String(m.whatsapp || ''));
          if (!mDigits.includes(phoneDigits)) return false;
        }
        return true;
      });

      filtered.sort((a: any, b: any) =>
        String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
      );

      const total = filtered.length;
      const from = (page - 1) * limit;
      const items = filtered.slice(from, from + limit);
      return { ok: true, data: { success: true, items, members: items, total, source: 'supabase' } };
    }

    if (ctx.action === 'GET_NON_ENROLLED') {
      const nonTables = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'vw_non_enrolled',
        'non_enrolled',
        'nao_inscritos',
        'nao_inscritos_raw',
      ].filter(Boolean);

      const membersTables = [
        String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
        'cadastro_oficial',
        'cadastro',
        'members',
        'membros',
      ].filter(Boolean);

      const [nonRows, memberRows] = await Promise.all([
        fetchAllRows(supabase, nonTables, { maxRows: 15000 }),
        fetchAllRows(supabase, membersTables, { maxRows: 20000 }),
      ]);

      const memberPhones = new Set(
        (Array.isArray(memberRows) ? memberRows : [])
          .map((r) => normalizeDigits(pickFirst(r, ['telefone', 'whatsapp', 'celular'])))
          .filter(Boolean)
      );

      const nonEnrolled = (Array.isArray(nonRows) ? nonRows : [])
        .map(normalizeNonEnrolled)
        .filter((ne) => {
          const digits = normalizeDigits(ne.telefone);
          if (!digits) return false;
          return !memberPhones.has(digits);
        });

      return { ok: true, data: { success: true, nonEnrolled, total: nonEnrolled.length, source: 'supabase' } };
    }

    if (ctx.action === 'ATUALIZAR_NAO_INSCRITOS') {
      // No Supabase os dados já estão no banco; mantém contrato de resposta do legado.
      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          lidas: 0,
          inseridos: 0,
          message: 'Atualização via planilha não é necessária no modo Supabase.',
        },
      };
    }

    if (ctx.action === 'UPDATE_NON_ENROLLED_INTEREST') {
      const idPessoa = cleanText(ctx.payload.idPessoa);
      const interesse = cleanText(ctx.payload.interesse);
      const operator = cleanText(ctx.payload.email) || 'SYSTEM';

      if (!idPessoa) {
        return { ok: true, data: { success: false, error: 'idPessoa é obrigatório.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'nao_inscritos',
        'non_enrolled',
        'nao_inscritos_raw',
      ].filter(Boolean);

      const { table, data: currentRows } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) =>
          await supabase
            .from(tableName)
            .select('*')
            .or(`id_pessoa.eq.${idPessoa},idPessoa.eq.${idPessoa},id.eq.${idPessoa},linha_origem.eq.${idPessoa},linhaOrigem.eq.${idPessoa}`)
            .limit(1)
      );

      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) {
        return { ok: true, data: { success: false, error: 'Registro de não inscrito não encontrado.' } };
      }

      const previousInterest = cleanText(
        pickFirst(current, ['interesse_confirmado', 'interesseConfirmado', 'interesse', 'Interesse Confirmado', 'I'])
      );

      const updateAttempts: Array<Record<string, any>> = [
        { interesseConfirmado: interesse, interesse, dataResposta: new Date().toISOString() },
        { interesse_confirmado: interesse, interesse, data_resposta: new Date().toISOString() },
        { interesse, data_resposta: new Date().toISOString() },
      ];

      let updatedRow: any = null;
      let updateError: any = null;
      for (const updatePayload of updateAttempts) {
        const response = await supabase
          .from(table)
          .update(updatePayload)
          .or(`id_pessoa.eq.${idPessoa},idPessoa.eq.${idPessoa},id.eq.${idPessoa},linha_origem.eq.${idPessoa},linhaOrigem.eq.${idPessoa}`)
          .select('*')
          .limit(1);
        if (!response.error) {
          updatedRow = Array.isArray(response.data) ? response.data[0] : null;
          updateError = null;
          break;
        }
        updateError = response.error;
      }

      if (updateError) throw updateError;

      const normalizedUpdated = normalizeNonEnrolled(updatedRow || { ...current, interesseConfirmado: interesse, interesse });
      const auditLogged = await tryInsertAuditLog(supabase, {
        action: 'UPDATE_NON_ENROLLED_INTEREST',
        entity: 'nao_inscritos',
        entityId: idPessoa,
        previousValue: previousInterest || '',
        newValue: interesse || '',
        operator,
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          table,
          updatedRow: normalizedUpdated,
          auditLogged,
        },
      };
    }

    if (ctx.action === 'GET_EVENTS') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
          'eventos_agenda',
          'eventos',
          'events',
          'calendar_events',
        ].filter(Boolean)
      );
      const events = rows.map(normalizeCalendarEvent).filter((e) => String(e.atividade || '').trim());
      events.sort((a: any, b: any) => String(a?.inicio || '').localeCompare(String(b?.inicio || '')));
      return { ok: true, data: { success: true, events, total: events.length, source: 'supabase' } };
    }

    if (ctx.action === 'IMPORT_CALENDAR_2026_EXTERNOS') {
      const sourceTables = [
        String(process.env.EAC_SUPABASE_TABLE_CALENDARIO_EXTERNOS || '').trim(),
        'calendario_2026_externos',
        'externos_2026',
        'stg_calendario_externos',
        // fallback para reduzir dependência de um único nome de aba/tabela
        'calendario',
      ].filter(Boolean);

      const targetTables = [
        String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
        'eventos_agenda',
        'eventos',
        'events',
        'calendar_events',
      ].filter(Boolean);

      let sourceRows: any[] = [];
      let sourceLabel = 'supabase_staging';
      try {
        sourceRows = await fetchAllRows(supabase, sourceTables, { maxRows: 30000 });
      } catch {
        sourceRows = [];
      }

      if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
        sourceRows = await fetchPublicGoogleCalendarRows();
        sourceLabel = 'google_sheet_calendario';
      }

      const rows = Array.isArray(sourceRows) ? sourceRows : [];
      if (rows.length === 0) {
        return {
          ok: true,
          data: {
            success: false,
            source: 'supabase',
            error: 'Nenhum registro encontrado na fonte de calendário.',
          },
        };
      }

      const { table: targetTable } = await queryFirstExistingTable<any[]>(
        supabase,
        targetTables,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const existingImportedRes = await supabase
        .from(targetTable)
        .select('id,id_origem_planilha,origem_dado')
        .eq('origem_dado', 'PLANILHA');
      if (existingImportedRes.error) throw existingImportedRes.error;

      const existingImportedRows = Array.isArray(existingImportedRes.data) ? existingImportedRes.data : [];
      const existingImportedBySourceKey = new Map<string, any[]>();
      existingImportedRows.forEach((row: any) => {
        const sourceKey = cleanText(row?.id_origem_planilha || row?.idOrigemPlanilha);
        if (!sourceKey) return;
        const items = existingImportedBySourceKey.get(sourceKey) || [];
        items.push(row);
        existingImportedBySourceKey.set(sourceKey, items);
      });

      const keepImportedBySourceKey = new Map<string, any>();
      const duplicateImportedIds = new Set<string>();
      existingImportedBySourceKey.forEach((items, sourceKey) => {
        const ranked = [...items].sort((a: any, b: any) => {
          const tsA = Date.parse(String(a?.ultima_sincronizacao || a?.data_importacao || '')) || 0;
          const tsB = Date.parse(String(b?.ultima_sincronizacao || b?.data_importacao || '')) || 0;
          return tsB - tsA;
        });
        const keepRow = ranked[0];
        if (keepRow) keepImportedBySourceKey.set(sourceKey, keepRow);
        ranked.slice(1).forEach((row: any) => {
          const duplicateId = cleanText(row?.id);
          if (duplicateId) duplicateImportedIds.add(duplicateId);
        });
      });

      let imported = 0;
      let updated = 0;
      let ignored = 0;
      const sourceKeys = new Set<string>();

      for (const row of rows) {
        const atividade = cleanText(pickFirst(row, ['atividade', 'titulo', 'title', 'nome', 'evento']));
        const tipo = cleanText(pickFirst(row, ['tipo', 'categoria', 'type'])) || 'Outro';
        const status = normalizeEventStatus(pickFirst(row, ['status', 'situacao', 'situação']));
        const local = cleanText(pickFirst(row, ['local', 'location']));
        const proprietario = cleanText(pickFirst(row, ['proprietario', 'owner', 'responsavel', 'responsável']));
        const encontroId = cleanText(pickFirst(row, ['encontro_id', 'encontroId']));
        const observacoes = cleanText(pickFirst(row, ['observacoes', 'observação', 'obs', 'descricao', 'descrição']));
        const inicioRaw = pickFirst(row, ['inicio', 'data_inicio', 'start', 'data', 'dia']);
        const terminoRaw = pickFirst(row, ['termino', 'data_fim', 'end']);
        const inicioIso = parseExternalCalendarDate(inicioRaw, 19);
        const terminoIso = parseExternalCalendarDate(terminoRaw || inicioRaw, 21) || inicioIso;

        if (!atividade || !inicioIso || !terminoIso) {
          ignored += 1;
          continue;
        }

        const externalId = cleanText(pickFirst(row, ['id', 'id_externo', 'external_id', 'linha', 'row_number']));
        const nowIso = new Date().toISOString();
        const generatedSourceKey = externalId
          ? `ext-2026-${externalId}`
          : `sheet-${cleanText(atividade).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${inicioIso.slice(0, 10)}`;
        const sourceKey = (
          cleanText(pickFirst(row, ['id_origem_planilha', 'idOrigemPlanilha'])) ||
          generatedSourceKey
        ).slice(0, 120);
        sourceKeys.add(sourceKey);
        const existingImported = keepImportedBySourceKey.get(sourceKey);
        const rowId = cleanText(existingImported?.id);

        const payloadSnake = {
          atividade,
          tipo,
          inicio: inicioIso,
          termino: terminoIso,
          local: local || null,
          proprietario: proprietario || null,
          status,
          encontro_id: encontroId || null,
          observacoes: observacoes || null,
          origem_dado: sourceLabel === 'google_sheet_calendario' ? 'PLANILHA' : 'calendario_2026_externos',
          id_origem_planilha: sourceKey,
          data_importacao: nowIso,
          ultima_sincronizacao: nowIso,
          updated_at: nowIso,
        };
        const writablePayload = await pickPayloadByExistingColumns(supabase, targetTable, payloadSnake);

        if (rowId) {
          const update = await supabase.from(targetTable).update(writablePayload as any).eq('id', rowId).select('*').limit(1);
          if (update.error) throw update.error;
          updated += 1;
        } else {
          const insertSnake = {
            id: globalThis.crypto?.randomUUID?.(),
            ...writablePayload,
            created_at: nowIso,
          };
          const insertPayload = await pickPayloadByExistingColumns(supabase, targetTable, insertSnake);
          const insert = await supabase.from(targetTable).insert(insertPayload as any).select('*').limit(1);
          if (insert.error) throw insert.error;
          imported += 1;
        }
      }

      const staleIds = existingImportedRows
        .filter((row: any) => {
          const sourceKey = cleanText(row?.id_origem_planilha || row?.idOrigemPlanilha);
          return sourceKey && !sourceKeys.has(sourceKey);
        })
        .map((row: any) => cleanText(row?.id))
        .filter(Boolean);

      const cleanupIds = Array.from(new Set([...staleIds, ...Array.from(duplicateImportedIds)]));

      if (cleanupIds.length > 0) {
        const del = await supabase.from(targetTable).delete().in('id', cleanupIds);
        if (del.error) throw del.error;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          sourceLabel,
          table: targetTable,
          imported,
          updated,
          removed: cleanupIds.length,
          ignored,
          totalSource: rows.length,
          message: `Importação de calendário concluída (${sourceLabel}). Novos: ${imported}. Atualizados: ${updated}. Removidos: ${cleanupIds.length}. Ignorados: ${ignored}.`,
        },
      };
    }

    if (ctx.action === 'UPDATE_NON_ENROLLED_RECADO') {
      const idPessoa = cleanText(ctx.payload.idPessoa);
      const recado = cleanText(ctx.payload.recado);
      if (!idPessoa) {
        return { ok: true, data: { success: false, error: 'idPessoa é obrigatório.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'nao_inscritos',
        'non_enrolled',
        'nao_inscritos_raw',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const payloads = [{ recado }, { recado, Recado: recado }];
      let updatedRow: any = null;
      let updateError: any = null;
      for (const body of payloads) {
        const response = await supabase
          .from(table)
          .update(body as any)
          .or(`id_pessoa.eq.${idPessoa},idPessoa.eq.${idPessoa},id.eq.${idPessoa},linha_origem.eq.${idPessoa},linhaOrigem.eq.${idPessoa}`)
          .select('*')
          .limit(1);
        if (!response.error) {
          updatedRow = Array.isArray(response.data) ? response.data[0] : null;
          updateError = null;
          break;
        }
        updateError = response.error;
      }
      if (updateError) throw updateError;

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          updatedRow: normalizeNonEnrolled(updatedRow || { recado }),
        },
      };
    }

    if (ctx.action === 'UPDATE_NON_ENROLLED_RECORD') {
      const idPessoa = cleanText(ctx.payload.idPessoa);
      const record = (ctx.payload.record && typeof ctx.payload.record === 'object') ? ctx.payload.record : {};
      if (!idPessoa) {
        return { ok: true, data: { success: false, error: 'idPessoa é obrigatório.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'nao_inscritos',
        'non_enrolled',
        'nao_inscritos_raw',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const payloadSnake = {
        nome: cleanText(record.nome),
        email: cleanText(record.email),
        telefone: cleanText(record.telefone),
        bairro: cleanText(record.bairro),
        nascimento: cleanText(record.dataNascimento || record.nascimento),
        recado: cleanText(record.recado),
        interesse_confirmado: cleanText(record.interesseConfirmado),
        ja_fez_eac: cleanText(record.jaFezEac),
        contato_mudou: cleanText(record.contatoMudou),
        status_pre_confirmacao: cleanText(record.statusPreConfirmacao),
        status_priorizacao: cleanText(record.statusPriorizacao),
        data_resposta: cleanText(record.dataResposta),
        amigo: cleanText(record.amigo),
        nome_amigo: cleanText(record.nomeAmigo),
        updated_at: new Date().toISOString(),
      };
      const payloadCamel = {
        nome: cleanText(record.nome),
        email: cleanText(record.email),
        telefone: cleanText(record.telefone),
        bairro: cleanText(record.bairro),
        dataNascimento: cleanText(record.dataNascimento || record.nascimento),
        recado: cleanText(record.recado),
        interesseConfirmado: cleanText(record.interesseConfirmado),
        jaFezEac: cleanText(record.jaFezEac),
        contatoMudou: cleanText(record.contatoMudou),
        statusPreConfirmacao: cleanText(record.statusPreConfirmacao),
        statusPriorizacao: cleanText(record.statusPriorizacao),
        dataResposta: cleanText(record.dataResposta),
        amigo: cleanText(record.amigo),
        nomeAmigo: cleanText(record.nomeAmigo),
        updatedAt: new Date().toISOString(),
      };

      let updatedRow: any = null;
      let updateError: any = null;
      for (const body of [payloadSnake, payloadCamel]) {
        const response = await supabase
          .from(table)
          .update(body as any)
          .or(`id_pessoa.eq.${idPessoa},idPessoa.eq.${idPessoa},id.eq.${idPessoa},linha_origem.eq.${idPessoa},linhaOrigem.eq.${idPessoa}`)
          .select('*')
          .limit(1);
        if (!response.error) {
          updatedRow = Array.isArray(response.data) ? response.data[0] : null;
          updateError = null;
          break;
        }
        updateError = response.error;
      }
      if (updateError) throw updateError;

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          updatedRow: normalizeNonEnrolled(updatedRow || payloadSnake),
        },
      };
    }

    if (ctx.action === 'SAVE_MEMBER') {
      const email = cleanText(ctx.payload.email).toLowerCase();
      const originalEmail = cleanText(ctx.payload.originalEmail).toLowerCase();
      const nome = cleanText(ctx.payload.nome);
      if (!email || !nome) {
        return { ok: true, data: { success: false, error: 'Nome e e-mail são obrigatórios.' } };
      }

      const context = await resolveMemberContext(supabase, ctx.payload);
      const exists = Boolean(context.cadastro?.id || context.pessoa?.id || context.adolescente?.id);
      const nowIso = new Date().toISOString();

      if (!exists) {
        return { ok: true, data: { success: false, error: 'Cadastro oficial não encontrado para edição.' } };
      }

      if (!context.pessoa?.id || !context.adolescente?.id) {
        return { ok: true, data: { success: false, error: 'Registro incompleto: pessoa/adolescente não localizados.' } };
      }

      const telefoneInfo = normalizePhoneStorage(cleanText(ctx.payload.whatsapp || ctx.payload.telefone));
      const responsavelTelefoneInfo = normalizePhoneStorage(cleanText(ctx.payload.responsavelTel));
      const nascimentoIso = parseMemberBirthDate(ctx.payload.nascimento);

      const pessoaPayload = await pickPayloadByExistingColumns(supabase, 'pessoas', {
        nome_completo: nome,
        nome_normalizado: nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        data_nascimento: nascimentoIso,
        sexo: cleanText(ctx.payload.sexo),
        endereco: cleanText(ctx.payload.endereco),
        bairro: cleanText(ctx.payload.bairro),
        telefone: telefoneInfo.original,
        telefone_normalizado: telefoneInfo.normalized,
        email,
        email_normalizado: email,
        atualizado_em: nowIso,
        updated_at: nowIso,
        ultima_sincronizacao: nowIso,
      });
      const pessoaUpdate = await supabase.from('pessoas').update(pessoaPayload as any).eq('id', context.pessoa.id);
      if (pessoaUpdate.error) throw pessoaUpdate.error;

      const adolescentePayload = await pickPayloadByExistingColumns(supabase, 'adolescentes', {
        tempo_participacao_paroquia: cleanText(ctx.payload.tempoParoquia),
        grupo_ministerio_descricao: cleanText(ctx.payload.participaGrupo),
        participa_grupo_ministerio: cleanText(ctx.payload.participaGrupo),
        motivacao: cleanText(ctx.payload.motivacao),
        expectativas: cleanText(ctx.payload.expectativas),
        autorizacao_imagem: cleanText(ctx.payload.autorizaImagem),
        aceite_normas: cleanText(ctx.payload.concordaNormas),
        atualizado_em: nowIso,
        ultima_sincronizacao: nowIso,
      });
      const adolescenteUpdate = await supabase.from('adolescentes').update(adolescentePayload as any).eq('id', context.adolescente.id);
      if (adolescenteUpdate.error) throw adolescenteUpdate.error;

      if (context.responsavel?.id) {
        const responsavelEmail = cleanText(ctx.payload.responsavelEmail).toLowerCase();
        const responsavelPayload = await pickPayloadByExistingColumns(supabase, 'responsaveis', {
          nome: cleanText(ctx.payload.responsavelNome),
          telefone: responsavelTelefoneInfo.original,
          telefone_normalizado: responsavelTelefoneInfo.normalized,
          email: responsavelEmail,
          email_normalizado: responsavelEmail,
          atualizado_em: nowIso,
          ultima_sincronizacao: nowIso,
        });
        const responsavelUpdate = await supabase.from('responsaveis').update(responsavelPayload as any).eq('id', context.responsavel.id);
        if (responsavelUpdate.error) throw responsavelUpdate.error;

        const responsavelPessoaId = cleanText(context.responsavel?.pessoa_id);
        if (responsavelPessoaId) {
          const responsavelPessoaPayload = await pickPayloadByExistingColumns(supabase, 'pessoas', {
            nome_completo: cleanText(ctx.payload.responsavelNome),
            nome_normalizado: cleanText(ctx.payload.responsavelNome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
            telefone: responsavelTelefoneInfo.original,
            telefone_normalizado: responsavelTelefoneInfo.normalized,
            email: responsavelEmail,
            email_normalizado: responsavelEmail,
            atualizado_em: nowIso,
            updated_at: nowIso,
            ultima_sincronizacao: nowIso,
          });
          const responsavelPessoaUpdate = await supabase.from('pessoas').update(responsavelPessoaPayload as any).eq('id', responsavelPessoaId);
          if (responsavelPessoaUpdate.error) throw responsavelPessoaUpdate.error;
        }
      }

      if (context.cadastro?.id) {
        const cadastroPayload = await pickPayloadByExistingColumns(supabase, 'cadastro_oficial', {
          atualizado_em: nowIso,
          updated_at: nowIso,
          ultima_sincronizacao: nowIso,
        });
        const cadastroUpdate = await supabase.from('cadastro_oficial').update(cadastroPayload as any).eq('id', context.cadastro.id);
        if (cadastroUpdate.error) throw cadastroUpdate.error;
      }

      const refreshed = (await fetchActiveMembersFromNormalizedTables(supabase)).find((member: any) => {
        return cleanText(member?.pessoa_id) === cleanText(context.pessoa?.id);
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          member: refreshed || normalizeMember(ctx.payload),
          message: 'Cadastro atualizado com sucesso.',
        },
      };
    }

    if (ctx.action === 'DELETE_MEMBER') {
      const email = cleanText(ctx.payload.email).toLowerCase();
      if (!email) {
        return { ok: true, data: { success: false, error: 'E-mail é obrigatório.' } };
      }

      const configuredMembersTable = String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim();
      const configuredIsView = configuredMembersTable.toLowerCase().startsWith('vw_');
      const tableCandidates = [
        ...(configuredIsView ? [] : [configuredMembersTable]),
        'cadastro_oficial',
        'cadastro',
        'members',
        'membros',
        'adolescentes',
        ...(configuredIsView ? [configuredMembersTable] : []),
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const del = await supabase.from(table).delete().eq('email', email);
      if (del.error) throw del.error;

      return {
        ok: true,
        data: { success: true, source: 'supabase', message: 'Cadastro removido com sucesso.' },
      };
    }

    if (ctx.action === 'SAVE_EVENT') {
      return await saveEventService(supabase, ctx.payload);
    }

    if (ctx.action === 'DELETE_EVENT') {
      return await deleteEventService(supabase, ctx.payload);

      const id = cleanText(ctx.payload.id);
      if (!id) {
        return { ok: true, data: { success: false, error: 'ID é obrigatório para exclusão.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_EVENTS || '').trim(),
        'eventos_agenda',
        'eventos',
        'events',
        'calendar_events',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const del = await supabase.from(table).delete().eq('id', id);
      if (del.error) throw del.error;

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          id,
          message: `Evento #${id} removido.`,
        },
      };
    }

    if (ctx.action === 'GET_COMUNICADOS') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
          'comunicados',
          'announcements',
          'notificacoes',
        ].filter(Boolean)
      );
      const comunicados = rows.map(normalizeComunicado).filter((c) => String(c.titulo || c.assunto || '').trim());
      comunicados.sort((a: any, b: any) => String(b?.dataAgendada || '').localeCompare(String(a?.dataAgendada || '')));
      return { ok: true, data: { success: true, comunicados, total: comunicados.length, source: 'supabase' } };
    }

    if (ctx.action === 'SAVE_COMUNICADO') {
      return await saveComunicadoService(supabase, ctx.payload);

      const id = cleanText(ctx.payload.id);
      const titulo = cleanText(ctx.payload.titulo);
      const assunto = cleanText(ctx.payload.assunto);
      const corpo = cleanText(ctx.payload.corpo);
      const status = cleanText(ctx.payload.status) || 'Ativo';
      const dataAgendada = cleanText(ctx.payload.dataAgendada);
      const dataEventos = cleanText(ctx.payload.dataEventos);

      if (!id || !titulo) {
        return { ok: true, data: { success: false, error: 'ID e título são obrigatórios.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
        'comunicados',
        'announcements',
        'notificacoes',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const payloadSnake = {
        id,
        titulo,
        assunto,
        corpo,
        status,
        data_agendada: dataAgendada || null,
        data_eventos: dataEventos || null,
        updated_at: new Date().toISOString(),
      };
      const payloadCamel = {
        id,
        titulo,
        assunto,
        corpo,
        status,
        dataAgendada: dataAgendada || null,
        dataEventos: dataEventos || null,
        updatedAt: new Date().toISOString(),
      };

      const existing = await supabase.from(table).select('id').eq('id', id).limit(1);
      if (existing.error) throw existing.error;
      const exists = Array.isArray(existing.data) && existing.data.length > 0;

      let result: any = null;
      if (exists) {
        let update = await supabase.from(table).update(payloadSnake as any).eq('id', id).select('*').limit(1);
        if (update.error) update = await supabase.from(table).update(payloadCamel as any).eq('id', id).select('*').limit(1);
        if (update.error) throw update.error;
        result = Array.isArray(update.data) ? update.data[0] : null;
      } else {
        let insert = await supabase.from(table).insert(payloadSnake as any).select('*').limit(1);
        if (insert.error) insert = await supabase.from(table).insert(payloadCamel as any).select('*').limit(1);
        if (insert.error) throw insert.error;
        result = Array.isArray(insert.data) ? insert.data[0] : null;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          comunicado: normalizeComunicado(result || payloadSnake),
          message: exists ? 'Comunicado atualizado com sucesso.' : 'Comunicado criado com sucesso.',
        },
      };
    }

    if (ctx.action === 'DELETE_COMUNICADO') {
      return await deleteComunicadoService(supabase, ctx.payload);

      const id = cleanText(ctx.payload.id);
      if (!id) {
        return { ok: true, data: { success: false, error: 'ID é obrigatório para exclusão.' } };
      }

      const tableCandidates = [
        String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(),
        'comunicados',
        'announcements',
        'notificacoes',
      ].filter(Boolean);

      const { table } = await queryFirstExistingTable<any[]>(
        supabase,
        tableCandidates,
        async (tableName) => await supabase.from(tableName).select('*').limit(1)
      );

      const del = await supabase.from(table).delete().eq('id', id);
      if (del.error) throw del.error;

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          id,
          message: `Comunicado #${id} removido.`,
        },
      };
    }

    if (ctx.action === 'LOG_DISPATCH_EXECUTION') {
      return await logDispatchExecutionService(supabase, ctx.payload);

      const dispatchId = cleanText(ctx.payload.dispatchId);
      const dispatchName = cleanText(ctx.payload.dispatchName);
      const operator = cleanText(ctx.payload.operator) || 'Sistema';
      const status = cleanText(ctx.payload.status) || 'SUCCESS';
      const responseSummary = cleanText(ctx.payload.responseSummary);
      const duration = Number(ctx.payload.duration || 0);
      const semanaId = cleanText(ctx.payload.semanaId || ctx.payload.semana_id);

      const logTables = ['logs', 'dispatch_logs', 'audit_logs', 'eac_logs'];
      let inserted = false;
      for (const table of logTables) {
        const attempts = [
          {
            dispatch_id: dispatchId,
            dispatch_name: dispatchName,
            operator,
            timestamp: new Date().toISOString(),
            duration,
            status,
            response_summary: responseSummary,
            semana_id: semanaId || null,
          },
          {
            dispatchId,
            dispatchName,
            operator,
            timestamp: new Date().toISOString(),
            duration,
            status,
            responseSummary,
            semanaId: semanaId || null,
          },
        ];
        for (const body of attempts) {
          try {
            const res = await supabase.from(table).insert(body as any);
            if (!res.error) {
              inserted = true;
              break;
            }
          } catch {
            // tenta próximo formato/tabela
          }
        }
        if (inserted) break;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          inserted,
        },
      };
    }

    if (ctx.action === 'LOG_DISPATCH_DESTINATARIOS') {
      return await logDispatchDestinatariosService(supabase, ctx.payload);

      const dispatchId = cleanText(ctx.payload.dispatchId);
      const dispatchName = cleanText(ctx.payload.dispatchName);
      const operator = cleanText(ctx.payload.operator) || 'Sistema';
      const semanaId = cleanText(ctx.payload.semanaId || ctx.payload.semana_id);
      const itens = Array.isArray(ctx.payload.itens) ? ctx.payload.itens : [];

      if (!dispatchId || itens.length === 0) {
        return { ok: true, data: { success: true, source: 'supabase', inserted: 0 } };
      }

      const tableCandidates = ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'];
      let inserted = 0;
      for (const table of tableCandidates) {
        const rowsSnake = itens.map((it: any) => ({
          dispatch_id: dispatchId,
          dispatch_name: dispatchName,
          operator,
          destinatario: cleanText(it.destinatario || it.email || it.telefone || it.nome),
          status: cleanText(it.status) || 'IGNORADO',
          detalhe: cleanText(it.detalhe || it.message || ''),
          semana_id: semanaId || null,
          payload: typeof it === 'object' ? it : { valor: it },
          created_at: new Date().toISOString(),
        }));
        const rowsCamel = itens.map((it: any) => ({
          dispatchId,
          dispatchName,
          operator,
          destinatario: cleanText(it.destinatario || it.email || it.telefone || it.nome),
          status: cleanText(it.status) || 'IGNORADO',
          detalhe: cleanText(it.detalhe || it.message || ''),
          semanaId: semanaId || null,
          payload: typeof it === 'object' ? it : { valor: it },
          createdAt: new Date().toISOString(),
        }));

        const a = await supabase.from(table).insert(rowsSnake as any);
        if (!a.error) {
          inserted = rowsSnake.length;
          break;
        }
        const b = await supabase.from(table).insert(rowsCamel as any);
        if (!b.error) {
          inserted = rowsCamel.length;
          break;
        }
      }

      return { ok: true, data: { success: true, source: 'supabase', inserted } };
    }

    if (ctx.action === 'BUILD_NON_ENROLLED_DISPATCH_AUDIENCE') {
      return await buildNonEnrolledDispatchAudienceService(supabase, ctx.payload);

      const tipo = cleanText(ctx.payload.tipo || 'waitlist');
      const nonTables = [
        String(process.env.EAC_SUPABASE_TABLE_NON_ENROLLED || '').trim(),
        'nao_inscritos',
        'non_enrolled',
        'nao_inscritos_raw',
      ].filter(Boolean);
      const rows = await fetchAllRows(supabase, nonTables, { maxRows: 30000 });
      const list = (Array.isArray(rows) ? rows : []).map(normalizeNonEnrolled);

      const isEmailValido = (v: any) => {
        const e = cleanText(v);
        return e.includes('@') && e.includes('.');
      };
      const isBlank = (v: any) => cleanText(v) === '';
      const isPriorizado = (v: any) => ['sim', 's', 'yes', 'y', '1', 'true'].includes(cleanText(v));

      const audience = list.filter((row: any) => {
        const email = cleanText(row.email);
        const hStatusEnvio = cleanText(row.statusEnvio);
        const pPreConfirmacao = cleanText(row.statusPreConfirmacao);
        const qPriorizacao = cleanText(row.statusPriorizacao);

        const base = isBlank(hStatusEnvio) && isEmailValido(email) && isBlank(pPreConfirmacao);
        if (!base) return false;

        if (tipo === 'waitlist') return true;
        if (tipo === 'nao_participacao') return !isPriorizado(qPriorizacao);
        return true;
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          tipo,
          total: audience.length,
          recipients: audience.map((row: any) => ({
            id: row.linhaOrigem,
            nome: row.nome,
            email: row.email,
            telefone: row.telefone,
            bairro: row.bairro,
          })),
        },
      };
    }

    if (ctx.action === 'EXECUTE_CONFIRM_INSCRITOS') {
      const dispatchName = cleanText(ctx.payload.dispatchName || 'CONFIRMACAO_INSCRICAO');
      const previewOnly = String(ctx.payload.previewOnly ?? 'false').toLowerCase() === 'true';
      const executionLimit = Math.max(1, Math.min(500, Number(ctx.payload.limit || 50) || 50));
      const sourceTables = [
        String(process.env.EAC_SUPABASE_VIEW_INSCRICOES_COMPLETAS || '').trim(),
        'vw_inscricoes_completas',
      ].filter(Boolean);
      const rows = await fetchAllRows(supabase, sourceTables, { maxRows: 50000 });

      const isEmailValido = (v: any) => {
        const e = cleanText(v).toLowerCase();
        return e.includes('@') && e.includes('.') && !e.includes(' ');
      };

      const list = (Array.isArray(rows) ? rows : []).filter((row: any) =>
        cleanText(row.status_inscricao || row.status).toUpperCase() === 'INSCRITO'
      );

      const sentRows = await fetchAllRows(
        supabase,
        ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'].filter(Boolean),
        { maxRows: 100000 }
      );
      const alreadySent = new Set(
        (Array.isArray(sentRows) ? sentRows : [])
          .filter((r: any) => {
            const status = cleanText(pickFirst(r, ['status'])).toUpperCase();
            const dname = cleanText(pickFirst(r, ['dispatch_name', 'dispatchName'])).toUpperCase();
            return status === 'SUCCESS' && (dname === dispatchName.toUpperCase() || dname === 'CONFIRMACAO_INSCRICAO');
          })
          .map((r: any) => cleanText(pickFirst(r, ['destinatario', 'email'])).toLowerCase())
          .filter(Boolean)
      );

      const dedupe = new Set<string>();
      const recipients = [];
      for (const row of list) {
        const emailResponsavel = cleanText(row.email_responsavel);
        const emailAdolescente = cleanText(row.email);
        const emailDestino = emailResponsavel || emailAdolescente;
        const key = emailDestino.toLowerCase();
        if (!isEmailValido(emailDestino)) continue;
        if (alreadySent.has(key)) continue;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        recipients.push({
          inscricaoId: cleanText(row.inscricao_id || row.id),
          adolescenteId: cleanText(row.adolescente_id),
          nome: cleanText(row.nome_completo || row.nome),
          email: emailDestino,
          origemEmail: emailResponsavel ? 'responsavel' : 'adolescente',
          statusInscricao: cleanText(row.status_inscricao || row.status),
        });
      }

      const senderMode = cleanText(process.env.EAC_EMAIL_SENDER_MODE || '');
      const senderFrom = cleanText(process.env.EAC_EMAIL_FROM || '');
      const canSendNow = senderMode === 'smtp' && !!senderFrom;
      const limited = recipients.slice(0, executionLimit);

      if (previewOnly || !canSendNow) {
        return {
          ok: true,
          data: {
            success: true,
            source: 'supabase',
            action: 'EXECUTE_CONFIRM_INSCRITOS',
            dispatchName,
            previewOnly,
            sender: {
              mode: senderMode || 'not_configured',
              from: senderFrom || null,
              canSendNow,
            },
            stats: {
              totalBase: list.length,
              elegiveis: recipients.length,
              loteSelecionado: limited.length,
              jaEnviadosIgnorados: alreadySent.size,
            },
            message: canSendNow
              ? `Público preparado com ${limited.length} destinatários no lote.`
              : 'Público preparado, mas envio de e-mail no backend ainda não configurado (defina EAC_EMAIL_SENDER_MODE=smtp e EAC_EMAIL_FROM).',
            recipients: limited,
          },
        };
      }

      const smtpHost = cleanText(process.env.SMTP_HOST || 'smtp.gmail.com');
      const smtpPort = Number(process.env.SMTP_PORT || 587) || 587;
      const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
      const smtpUser = cleanText(process.env.SMTP_USER || '');
      const smtpPass = cleanText(process.env.SMTP_PASS || process.env.passwordGmail || '');
      if (!smtpUser || !smtpPass) {
        return { ok: true, data: { success: false, error: 'SMTP_USER/SMTP_PASS nao configurados.' } };
      }

      const nodemailerMod: any = await import('nodemailer');
      const nodemailer = nodemailerMod?.default || nodemailerMod;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const subjectBase = cleanText(ctx.payload.subject || 'EAC: Atualizacao sobre sua Inscricao');
      const bodyBase = cleanText(ctx.payload.htmlBody || '') || [
        '<p style="margin:0 0 14px 0; font-size:28px; line-height:1.2; color:#0b3b69; font-weight:800;">Ola, [NOME]!</p>',
        '<p style="margin:0 0 14px 0;">Recebemos sua inscricao para o EAC e gostariamos de informar que seu cadastro esta em nossa <strong>lista de verificacao</strong>.</p>',
        '<p style="margin:0 0 14px 0;">Estamos organizando as vagas para o proximo encontro e em breve entraremos em contato para confirmar sua participacao.</p>',
        '<p style="margin:0 0 14px 0;">Fique atento ao seu E-mail e WhatsApp!</p>',
        '<p style="margin:22px 0 0 0;">Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
      ].join('');

      const wrapEmailTemplate = (innerHtml: string) => `
        <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:680px;margin:0 auto;border:1px solid #dbe3ef;border-radius:24px;overflow:hidden;background:#ffffff;">
            <div style="background:#044372;padding:24px 16px;text-align:center;">
              <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" style="height:40px;display:inline-block;" />
            </div>
            <div style="padding:28px 30px;color:#334155;font-size:16px;line-height:1.65;">
              ${innerHtml}
            </div>
            <div style="padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <a href="https://www.instagram.com/eacporciunculadesantana/" style="display:inline-block;background:#044372;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Siga nosso Instagram</a>
            </div>
          </div>
        </div>
      `;

      const execStart = new Date().toISOString();
      let totalOk = 0;
      let totalErr = 0;
      const destinatariosRows: any[] = [];

      for (const rec of limited) {
        const to = cleanText(rec.email);
        const nome = cleanText(rec.nome) || 'jovem';
        const htmlBody = wrapEmailTemplate(bodyBase.replace(/\[NOME\]/g, nome));
        try {
          const info = await transporter.sendMail({
            from: senderFrom,
            to,
            subject: subjectBase,
            html: htmlBody,
            textEncoding: 'base64',
          });
          totalOk += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'SUCCESS',
            detalhe: cleanText(info?.messageId || 'sent'),
            payload: { inscricaoId: rec.inscricaoId, adolescenteId: rec.adolescenteId, nome: rec.nome },
            created_at: new Date().toISOString(),
          });
        } catch (e: any) {
          totalErr += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'ERROR',
            detalhe: cleanText(e?.message || 'send_error'),
            payload: { inscricaoId: rec.inscricaoId, adolescenteId: rec.adolescenteId, nome: rec.nome },
            created_at: new Date().toISOString(),
          });
        }
      }

      for (const table of ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo']) {
        const ins = await supabase.from(table).insert(destinatariosRows as any);
        if (!ins.error) break;
      }

      const execRowSnake = {
        tipo: dispatchName,
        semana_id: null,
        status: totalErr > 0 ? (totalOk > 0 ? 'PARCIAL' : 'ERRO') : 'CONCLUIDO',
        total_destinatarios: limited.length,
        total_enviados: totalOk,
        total_erros: totalErr,
        executado_por: cleanText(ctx.payload.executadoPor || ctx.payload.operator || ctx.payload.email) || 'Sistema',
        payload: { action: 'EXECUTE_CONFIRM_INSCRITOS', source: 'vw_inscricoes_completas', onlyStatus: 'INSCRITO' },
        created_at: execStart,
      };
      const execRowCamel = {
        tipo: dispatchName,
        semanaId: null,
        status: execRowSnake.status,
        totalDestinatarios: limited.length,
        totalEnviados: totalOk,
        totalErros: totalErr,
        executadoPor: execRowSnake.executado_por,
        payload: execRowSnake.payload,
        createdAt: execStart,
      };
      for (const table of ['disparo_execucoes', 'dispatch_executions']) {
        const a = await supabase.from(table).insert(execRowSnake as any);
        if (!a.error) break;
        const b = await supabase.from(table).insert(execRowCamel as any);
        if (!b.error) break;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          action: 'EXECUTE_CONFIRM_INSCRITOS',
          dispatchName,
          previewOnly,
          sender: {
            mode: senderMode || 'not_configured',
            from: senderFrom || null,
            canSendNow,
          },
          stats: {
            totalBase: list.length,
            elegiveis: recipients.length,
            loteSelecionado: limited.length,
            jaEnviadosIgnorados: alreadySent.size,
            enviados: totalOk,
            erros: totalErr,
          },
          message: `Disparo executado. Enviados: ${totalOk}. Erros: ${totalErr}.`,
          recipients: limited,
        },
      };
    }

    if (ctx.action === 'EXECUTE_COMUNICADO_99') {
      const dispatchName = cleanText(ctx.payload.dispatchName || 'COMUNICADO_99_CADASTRO');
      const previewOnly = String(ctx.payload.previewOnly ?? 'false').toLowerCase() === 'true';
      const executionLimit = Math.max(1, Math.min(500, Number(ctx.payload.limit || 50) || 50));
      const sourceTables = [
        String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
        'vw_cadastro_oficial',
      ].filter(Boolean);
      const rows = await fetchAllRows(supabase, sourceTables, { maxRows: 50000 });

      const senderMode = cleanText(process.env.EAC_EMAIL_SENDER_MODE || '');
      const senderFrom = cleanText(process.env.EAC_EMAIL_FROM || '');
      const canSendNow = senderMode === 'smtp' && !!senderFrom;

      const isEmailValido = (v: any) => {
        const e = cleanText(v).toLowerCase();
        return e.includes('@') && e.includes('.') && !e.includes(' ');
      };

      const sentRows = await fetchAllRows(
        supabase,
        ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'].filter(Boolean),
        { maxRows: 100000 }
      );
      const alreadySent = new Set(
        (Array.isArray(sentRows) ? sentRows : [])
          .filter((r: any) => {
            const status = cleanText(pickFirst(r, ['status'])).toUpperCase();
            const dname = cleanText(pickFirst(r, ['dispatch_name', 'dispatchName'])).toUpperCase();
            return status === 'SUCCESS' && (dname === dispatchName.toUpperCase() || dname === 'COMUNICADO_99_CADASTRO');
          })
          .map((r: any) => cleanText(pickFirst(r, ['destinatario', 'email'])).toLowerCase())
          .filter(Boolean)
      );

      const dedupe = new Set<string>();
      const recipients: any[] = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const nome = cleanText(pickFirst(row, ['nome_completo', 'nome', 'name']));
        const email = cleanText(pickFirst(row, ['email', 'e-mail'])).toLowerCase();
        if (!isEmailValido(email)) continue;
        if (alreadySent.has(email)) continue;
        if (dedupe.has(email)) continue;
        dedupe.add(email);
        recipients.push({
          pessoaId: cleanText(pickFirst(row, ['pessoa_id', 'id', 'pessoaId'])),
          nome: nome || 'amigo(a)',
          email,
        });
      }
      const limited = recipients.slice(0, executionLimit);

      const comunicadosRows = await fetchAllRows(
        supabase,
        [String(process.env.EAC_SUPABASE_TABLE_COMUNICADOS || '').trim(), 'comunicados', 'comunicados_operacionais'].filter(Boolean),
        { maxRows: 5000 }
      );
      const comunicado99 = (Array.isArray(comunicadosRows) ? comunicadosRows : []).find((c: any) => {
        const id = cleanText(pickFirst(c, ['id', 'ID']));
        return id === '99';
      });

      const subjectBase = cleanText(
        ctx.payload.subject ||
        pickFirst(comunicado99, ['assunto', 'subject', 'titulo', 'title']) ||
        'EAC: Comunicado Oficial'
      );
      const htmlBaseRaw = cleanText(
        ctx.payload.htmlBody ||
        pickFirst(comunicado99, ['corpo', 'body', 'conteudo', 'content']) ||
        '<p>Olá, [NOME]!</p><p>Temos um comunicado importante da coordenação do EAC.</p><p>Fraternalmente,<br><strong>Coordenação EAC</strong></p>'
      );

      const wrapEmailTemplate = (innerHtml: string) => `
        <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:680px;margin:0 auto;border:1px solid #dbe3ef;border-radius:24px;overflow:hidden;background:#ffffff;">
            <div style="background:#044372;padding:24px 16px;text-align:center;">
              <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" style="height:40px;display:inline-block;" />
            </div>
            <div style="padding:28px 30px;color:#334155;font-size:16px;line-height:1.65;">
              ${innerHtml}
            </div>
            <div style="padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <a href="https://www.instagram.com/eacporciunculadesantana/" style="display:inline-block;background:#044372;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Siga nosso Instagram</a>
            </div>
          </div>
        </div>
      `;

      if (previewOnly || !canSendNow) {
        return {
          ok: true,
          data: {
            success: true,
            source: 'supabase',
            action: 'EXECUTE_COMUNICADO_99',
            dispatchName,
            previewOnly,
            sender: {
              mode: senderMode || 'not_configured',
              from: senderFrom || null,
              canSendNow,
            },
            template: {
              sourceId: '99',
              subject: subjectBase,
              htmlBody: htmlBaseRaw,
            },
            stats: {
              totalBase: Array.isArray(rows) ? rows.length : 0,
              elegiveis: recipients.length,
              loteSelecionado: limited.length,
              jaEnviadosIgnorados: alreadySent.size,
            },
            message: canSendNow
              ? `Público preparado com ${limited.length} destinatários no lote.`
              : 'Público preparado, mas envio de e-mail no backend ainda não configurado (defina EAC_EMAIL_SENDER_MODE=smtp e EAC_EMAIL_FROM).',
            recipients: limited,
          },
        };
      }

      const smtpHost = cleanText(process.env.SMTP_HOST || 'smtp.gmail.com');
      const smtpPort = Number(process.env.SMTP_PORT || 587) || 587;
      const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
      const smtpUser = cleanText(process.env.SMTP_USER || '');
      const smtpPass = cleanText(process.env.SMTP_PASS || process.env.passwordGmail || '');
      if (!smtpUser || !smtpPass) {
        return { ok: true, data: { success: false, error: 'SMTP_USER/SMTP_PASS nao configurados.' } };
      }

      const nodemailerMod: any = await import('nodemailer');
      const nodemailer = nodemailerMod?.default || nodemailerMod;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const execStart = new Date().toISOString();
      let totalOk = 0;
      let totalErr = 0;
      const destinatariosRows: any[] = [];

      for (const rec of limited) {
        const to = cleanText(rec.email);
        const nome = cleanText(rec.nome) || 'amigo(a)';
        const htmlBody = wrapEmailTemplate(htmlBaseRaw.replace(/\[NOME\]/g, nome));
        try {
          const info = await transporter.sendMail({
            from: senderFrom,
            to,
            subject: subjectBase,
            html: htmlBody,
            textEncoding: 'base64',
          });
          totalOk += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'SUCCESS',
            detalhe: cleanText(info?.messageId || 'sent'),
            payload: { pessoaId: rec.pessoaId, nome: rec.nome, source: 'ID_99' },
            created_at: new Date().toISOString(),
          });
        } catch (e: any) {
          totalErr += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'ERROR',
            detalhe: cleanText(e?.message || 'send_error'),
            payload: { pessoaId: rec.pessoaId, nome: rec.nome, source: 'ID_99' },
            created_at: new Date().toISOString(),
          });
        }
      }

      for (const table of ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo']) {
        const ins = await supabase.from(table).insert(destinatariosRows as any);
        if (!ins.error) break;
      }

      const execRowSnake = {
        tipo: dispatchName,
        semana_id: null,
        status: totalErr > 0 ? (totalOk > 0 ? 'PARCIAL' : 'ERRO') : 'CONCLUIDO',
        total_destinatarios: limited.length,
        total_enviados: totalOk,
        total_erros: totalErr,
        executado_por: cleanText(ctx.payload.executadoPor || ctx.payload.operator || ctx.payload.email) || 'Sistema',
        payload: { action: 'EXECUTE_COMUNICADO_99', source: 'comunicados.id=99' },
        created_at: execStart,
      };
      const execRowCamel = {
        tipo: dispatchName,
        semanaId: null,
        status: execRowSnake.status,
        totalDestinatarios: limited.length,
        totalEnviados: totalOk,
        totalErros: totalErr,
        executadoPor: execRowSnake.executado_por,
        payload: execRowSnake.payload,
        createdAt: execStart,
      };
      for (const table of ['disparo_execucoes', 'dispatch_executions']) {
        const a = await supabase.from(table).insert(execRowSnake as any);
        if (!a.error) break;
        const b = await supabase.from(table).insert(execRowCamel as any);
        if (!b.error) break;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          action: 'EXECUTE_COMUNICADO_99',
          dispatchName,
          previewOnly,
          sender: {
            mode: senderMode || 'not_configured',
            from: senderFrom || null,
            canSendNow,
          },
          template: {
            sourceId: '99',
            subject: subjectBase,
          },
          stats: {
            totalBase: Array.isArray(rows) ? rows.length : 0,
            elegiveis: recipients.length,
            loteSelecionado: limited.length,
            jaEnviadosIgnorados: alreadySent.size,
            enviados: totalOk,
            erros: totalErr,
          },
          message: `Disparo executado. Enviados: ${totalOk}. Erros: ${totalErr}.`,
          recipients: limited,
        },
      };
    }

    if (ctx.action === 'EXECUTE_ANIVERSARIANTES') {
      const dispatchName = cleanText(ctx.payload.dispatchName || 'ANIVERSARIANTES_DIA');
      const previewOnly = String(ctx.payload.previewOnly ?? 'false').toLowerCase() === 'true';
      const executionLimit = Math.max(1, Math.min(500, Number(ctx.payload.limit || 50) || 50));
      const sourceTables = [
        String(process.env.EAC_SUPABASE_TABLE_MEMBERS || '').trim(),
        'vw_cadastro_oficial',
      ].filter(Boolean);
      const rows = await fetchAllRows(supabase, sourceTables, { maxRows: 50000 });

      const now = new Date();
      const todayDay = now.getDate();
      const todayMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const sentRows = await fetchAllRows(
        supabase,
        ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'].filter(Boolean),
        { maxRows: 100000 }
      );
      const sentThisYearByEmail = new Set(
        (Array.isArray(sentRows) ? sentRows : [])
          .filter((r: any) => {
            const status = cleanText(pickFirst(r, ['status'])).toUpperCase();
            const dname = cleanText(pickFirst(r, ['dispatch_name', 'dispatchName'])).toUpperCase();
            if (status !== 'SUCCESS') return false;
            if (dname !== dispatchName.toUpperCase() && dname !== 'ANIVERSARIANTES_DIA') return false;
            const sentAt = parseDateFlexible(pickFirst(r, ['created_at', 'createdAt', 'timestamp']));
            return !!sentAt && sentAt.getFullYear() === currentYear;
          })
          .map((r: any) => cleanText(pickFirst(r, ['destinatario', 'email'])).toLowerCase())
          .filter(Boolean)
      );

      const recipients: any[] = [];
      const dedupe = new Set<string>();
      for (const row of Array.isArray(rows) ? rows : []) {
        const nome = cleanText(pickFirst(row, ['nome_completo', 'nome', 'name']));
        const email = cleanText(pickFirst(row, ['email', 'e-mail'])).toLowerCase();
        const nascimentoRaw = pickFirst(row, ['nascimento', 'data_nascimento', 'dataNascimento']);
        const nascimento = parseDateFlexible(nascimentoRaw);

        if (!nome || !email || !email.includes('@') || !email.includes('.')) continue;
        if (!nascimento) continue;
        if (nascimento.getDate() !== todayDay || (nascimento.getMonth() + 1) !== todayMonth) continue;
        if (sentThisYearByEmail.has(email)) continue;
        if (dedupe.has(email)) continue;
        dedupe.add(email);

        recipients.push({
          pessoaId: cleanText(pickFirst(row, ['pessoa_id', 'id', 'pessoaId'])),
          nome,
          email,
          nascimento: nascimentoRaw,
        });
      }

      const senderMode = cleanText(process.env.EAC_EMAIL_SENDER_MODE || '');
      const senderFrom = cleanText(process.env.EAC_EMAIL_FROM || '');
      const canSendNow = senderMode === 'smtp' && !!senderFrom;
      const limited = recipients.slice(0, executionLimit);

      if (previewOnly || !canSendNow) {
        return {
          ok: true,
          data: {
            success: true,
            source: 'supabase',
            action: 'EXECUTE_ANIVERSARIANTES',
            dispatchName,
            previewOnly,
            sender: {
              mode: senderMode || 'not_configured',
              from: senderFrom || null,
              canSendNow,
            },
            stats: {
              totalBase: Array.isArray(rows) ? rows.length : 0,
              aniversariantesHoje: recipients.length,
              loteSelecionado: limited.length,
              jaEnviadosAnoIgnorados: sentThisYearByEmail.size,
            },
            message: canSendNow
              ? `Publico preparado com ${limited.length} aniversariantes no lote.`
              : 'Publico preparado, mas envio de e-mail no backend ainda nao configurado (defina EAC_EMAIL_SENDER_MODE=smtp e EAC_EMAIL_FROM).',
            recipients: limited,
          },
        };
      }

      const smtpHost = cleanText(process.env.SMTP_HOST || 'smtp.gmail.com');
      const smtpPort = Number(process.env.SMTP_PORT || 587) || 587;
      const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
      const smtpUser = cleanText(process.env.SMTP_USER || '');
      const smtpPass = cleanText(process.env.SMTP_PASS || process.env.passwordGmail || '');
      if (!smtpUser || !smtpPass) {
        return { ok: true, data: { success: false, error: 'SMTP_USER/SMTP_PASS nao configurados.' } };
      }

      const nodemailerMod: any = await import('nodemailer');
      const nodemailer = nodemailerMod?.default || nodemailerMod;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const subjectBase = cleanText(ctx.payload.subject || 'EAC: Feliz Aniversario!');
      const bodyBase = cleanText(ctx.payload.htmlBody || '') || [
        '<p style="margin:0 0 14px 0; font-size:28px; line-height:1.2; color:#0b3b69; font-weight:800;">Feliz Aniversario, [NOME]!</p>',
        '<p style="margin:0 0 14px 0;">Hoje e um dia muito especial e toda a familia EAC celebra sua vida com alegria.</p>',
        '<p style="margin:0 0 14px 0;">Que Deus abencoe seu novo ciclo com saude, paz e muitas gracas.</p>',
        '<p style="margin:22px 0 0 0;">Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
      ].join('');
      const wrapEmailTemplate = (innerHtml: string) => `
        <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:680px;margin:0 auto;border:1px solid #dbe3ef;border-radius:24px;overflow:hidden;background:#ffffff;">
            <div style="background:#044372;padding:24px 16px;text-align:center;">
              <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" style="height:40px;display:inline-block;" />
            </div>
            <div style="padding:28px 30px;color:#334155;font-size:16px;line-height:1.65;">
              ${innerHtml}
            </div>
            <div style="padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <a href="https://www.instagram.com/eacporciunculadesantana/" style="display:inline-block;background:#044372;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Siga nosso Instagram</a>
            </div>
          </div>
        </div>
      `;

      const execStart = new Date().toISOString();
      let totalOk = 0;
      let totalErr = 0;
      const destinatariosRows: any[] = [];

      for (const rec of limited) {
        const to = cleanText(rec.email);
        const nome = cleanText(rec.nome) || 'amigo(a)';
        const htmlBody = wrapEmailTemplate(bodyBase.replace(/\[NOME\]/g, nome));
        try {
          const info = await transporter.sendMail({
            from: senderFrom,
            to,
            subject: subjectBase,
            html: htmlBody,
            textEncoding: 'base64',
          });
          totalOk += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'SUCCESS',
            detalhe: cleanText(info?.messageId || 'sent'),
            payload: { pessoaId: rec.pessoaId, nome: rec.nome, nascimento: rec.nascimento },
            created_at: new Date().toISOString(),
          });
        } catch (e: any) {
          totalErr += 1;
          destinatariosRows.push({
            dispatch_id: dispatchName,
            dispatch_name: dispatchName,
            destinatario: to.toLowerCase(),
            status: 'ERROR',
            detalhe: cleanText(e?.message || 'send_error'),
            payload: { pessoaId: rec.pessoaId, nome: rec.nome, nascimento: rec.nascimento },
            created_at: new Date().toISOString(),
          });
        }
      }

      for (const table of ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo']) {
        const ins = await supabase.from(table).insert(destinatariosRows as any);
        if (!ins.error) break;
      }

      const execRowSnake = {
        tipo: dispatchName,
        semana_id: null,
        status: totalErr > 0 ? (totalOk > 0 ? 'PARCIAL' : 'ERRO') : 'CONCLUIDO',
        total_destinatarios: limited.length,
        total_enviados: totalOk,
        total_erros: totalErr,
        executado_por: cleanText(ctx.payload.executadoPor || ctx.payload.operator || ctx.payload.email) || 'Sistema',
        payload: { action: 'EXECUTE_ANIVERSARIANTES', source: 'vw_cadastro_oficial', filtro: 'dia/mes de nascimento = hoje' },
        created_at: execStart,
      };
      const execRowCamel = {
        tipo: dispatchName,
        semanaId: null,
        status: execRowSnake.status,
        totalDestinatarios: limited.length,
        totalEnviados: totalOk,
        totalErros: totalErr,
        executadoPor: execRowSnake.executado_por,
        payload: execRowSnake.payload,
        createdAt: execStart,
      };
      for (const table of ['disparo_execucoes', 'dispatch_executions']) {
        const a = await supabase.from(table).insert(execRowSnake as any);
        if (!a.error) break;
        const b = await supabase.from(table).insert(execRowCamel as any);
        if (!b.error) break;
      }

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          action: 'EXECUTE_ANIVERSARIANTES',
          dispatchName,
          previewOnly,
          sender: {
            mode: senderMode || 'not_configured',
            from: senderFrom || null,
            canSendNow,
          },
          stats: {
            totalBase: Array.isArray(rows) ? rows.length : 0,
            aniversariantesHoje: recipients.length,
            loteSelecionado: limited.length,
            jaEnviadosAnoIgnorados: sentThisYearByEmail.size,
            enviados: totalOk,
            erros: totalErr,
          },
          message: `Disparo executado. Enviados: ${totalOk}. Erros: ${totalErr}.`,
          recipients: limited,
        },
      };
    }

    if (ctx.action === 'GET_LOGS') {
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_LOGS || '').trim(),
          'logs',
          'audit_logs',
          'dispatch_logs',
        ].filter(Boolean),
        { maxRows: 5000 }
      );
      const logs = rows.map(normalizeLog).filter((l) => String(l.id || l.timestamp || '').trim());
      logs.sort((a: any, b: any) => String(b?.timestamp || '').localeCompare(String(a?.timestamp || '')));
      return { ok: true, data: { success: true, logs, total: logs.length, source: 'supabase' } };
    }

    if (ctx.action === 'GET_DISPARO_EXECUCOES') {
      const tipo = cleanText(ctx.payload.tipo).toUpperCase();
      const status = cleanText(ctx.payload.status).toUpperCase();
      const rows = await fetchAllRows(
        supabase,
        ['disparo_execucoes', 'dispatch_executions'].filter(Boolean),
        { maxRows: 5000, orderBy: 'created_at', ascending: false }
      );
      let items = rows.map(normalizeDispatchExecucao);
      if (tipo) items = items.filter((x: any) => cleanText(x.tipo).toUpperCase() === tipo);
      if (status) items = items.filter((x: any) => cleanText(x.status).toUpperCase() === status);
      return { ok: true, data: { success: true, source: 'supabase', execucoes: items, total: items.length } };
    }

    if (ctx.action === 'START_DISPARO_EXECUCAO') {
      const tipo = cleanText(ctx.payload.tipo).toUpperCase();
      if (!tipo) return { ok: true, data: { success: false, error: 'tipo e obrigatorio.' } };
      const semanaId = cleanText(ctx.payload.semanaId || ctx.payload.semana_id) || null;
      const executadoPor = cleanText(ctx.payload.executadoPor || ctx.payload.operator || ctx.payload.email) || 'Sistema';
      const payload = ctx.payload?.payload && typeof ctx.payload.payload === 'object' ? ctx.payload.payload : {};
      const totalDestinatarios = Number(ctx.payload.totalDestinatarios || ctx.payload.total_destinatarios || 0);

      const attempts = [
        {
          tipo,
          semana_id: semanaId,
          status: 'PENDENTE',
          total_destinatarios: totalDestinatarios,
          total_enviados: 0,
          total_erros: 0,
          executado_por: executadoPor,
          payload,
          created_at: new Date().toISOString(),
        },
        {
          tipo,
          semanaId,
          status: 'PENDENTE',
          totalDestinatarios,
          totalEnviados: 0,
          totalErros: 0,
          executadoPor,
          payload,
          createdAt: new Date().toISOString(),
        },
      ];

      let inserted: any = null;
      let lastErr: any = null;
      for (const table of ['disparo_execucoes', 'dispatch_executions']) {
        for (const body of attempts) {
          const res = await supabase.from(table).insert(body as any).select('*').limit(1);
          if (!res.error) {
            inserted = Array.isArray(res.data) ? res.data[0] : null;
            lastErr = null;
            break;
          }
          lastErr = res.error;
        }
        if (inserted) break;
      }
      if (!inserted && lastErr) throw lastErr;
      return { ok: true, data: { success: true, source: 'supabase', execucao: normalizeDispatchExecucao(inserted || {}) } };
    }

    if (ctx.action === 'UPDATE_DISPARO_EXECUCAO_STATUS') {
      const id = cleanText(ctx.payload.id);
      if (!id) return { ok: true, data: { success: false, error: 'id e obrigatorio.' } };
      const status = cleanText(ctx.payload.status).toUpperCase() || 'PROCESSANDO';
      const totalEnviados = Number(ctx.payload.totalEnviados ?? ctx.payload.total_enviados ?? 0);
      const totalErros = Number(ctx.payload.totalErros ?? ctx.payload.total_erros ?? 0);
      const totalDestinatarios = Number(ctx.payload.totalDestinatarios ?? ctx.payload.total_destinatarios ?? (totalEnviados + totalErros));

      let updated: any = null;
      let lastErr: any = null;
      for (const table of ['disparo_execucoes', 'dispatch_executions']) {
        for (const body of [
          { status, total_enviados: totalEnviados, total_erros: totalErros, total_destinatarios: totalDestinatarios },
          { status, totalEnviados, totalErros, totalDestinatarios },
        ]) {
          const res = await supabase.from(table).update(body as any).eq('id', id).select('*').limit(1);
          if (!res.error) {
            updated = Array.isArray(res.data) ? res.data[0] : null;
            lastErr = null;
            break;
          }
          lastErr = res.error;
        }
        if (updated) break;
      }
      if (!updated && lastErr) throw lastErr;
      return { ok: true, data: { success: true, source: 'supabase', execucao: normalizeDispatchExecucao(updated || {}) } };
    }

    if (ctx.action === 'RETRY_DISPARO_FALHAS') {
      const dispatchId = cleanText(ctx.payload.dispatchId || ctx.payload.dispatch_id);
      if (!dispatchId) return { ok: true, data: { success: false, error: 'dispatchId e obrigatorio.' } };

      const destinatariosRows = await fetchAllRows(
        supabase,
        ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'].filter(Boolean),
        { maxRows: 50000 }
      );

      const normalized = destinatariosRows.map((r: any) => ({
        dispatchId: cleanText(pickFirst(r, ['dispatch_id', 'dispatchId'])),
        destinatario: cleanText(pickFirst(r, ['destinatario', 'email', 'telefone'])).toLowerCase(),
        status: cleanText(pickFirst(r, ['status'])).toUpperCase(),
        payload: r?.payload ?? null,
      })).filter((r: any) => r.dispatchId === dispatchId && r.destinatario);

      const successSet = new Set(
        normalized
          .filter((r: any) => r.status === 'SUCCESS' || r.status === 'SUCESSO' || r.status === 'ENVIADO')
          .map((r: any) => r.destinatario)
      );

      const retryTargetsMap = new Map<string, any>();
      for (const row of normalized) {
        const isFailure = row.status.includes('FAIL') || row.status.includes('ERRO') || row.status.includes('FALHA');
        if (!isFailure) continue;
        if (successSet.has(row.destinatario)) continue;
        retryTargetsMap.set(row.destinatario, row);
      }
      const retryTargets = Array.from(retryTargetsMap.values());

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          dispatchId,
          totalRetry: retryTargets.length,
          recipients: retryTargets,
        },
      };
    }

    if (ctx.action === 'GET_OPERATIONAL_LOGS') {
      const modulo = cleanText(ctx.payload.modulo || ctx.payload.module).toLowerCase();
      const operador = cleanText(ctx.payload.operador || ctx.payload.operator).toLowerCase();
      const status = cleanText(ctx.payload.status).toUpperCase();
      const dispatchIdFilter = cleanText(ctx.payload.dispatchId || ctx.payload.dispatch_id);
      const de = toIsoDateOrEmpty(ctx.payload.de || ctx.payload.from);
      const ate = toIsoDateOrEmpty(ctx.payload.ate || ctx.payload.to);

      const baseRows = await fetchAllRows(
        supabase,
        [String(process.env.EAC_SUPABASE_TABLE_LOGS || '').trim(), 'logs', 'audit_logs', 'dispatch_logs'].filter(Boolean),
        { maxRows: 10000 }
      );
      const dispatchRows = await fetchAllRows(
        supabase,
        ['disparo_destinatarios', 'dispatch_recipients', 'destinatarios_disparo'].filter(Boolean),
        { maxRows: 30000 }
      );

      const logsBase = baseRows.map((l: any) => {
        const n = normalizeLog(l);
        return {
          ...n,
          modulo: cleanText((l as any).modulo || (l as any).module || 'geral').toLowerCase() || 'geral',
          tipo: 'execucao',
        };
      });

      const logsDispatch = dispatchRows.map((l: any, idx: number) => ({
        id: cleanText(pickFirst(l, ['id', 'uuid'])) || `dest-${idx + 1}`,
        dispatchId: pickFirst(l, ['dispatch_id', 'dispatchId']),
        dispatchName: pickFirst(l, ['dispatch_name', 'dispatchName']),
        operator: pickFirst(l, ['operator', 'operador', 'usuario']),
        timestamp: pickFirst(l, ['created_at', 'createdAt', 'timestamp']),
        duration: 0,
        status: pickFirst(l, ['status']) || 'UNKNOWN',
        responseSummary: pickFirst(l, ['detalhe', 'message', 'resumo']),
        modulo: 'dispatches',
        tipo: 'destinatario',
      }));

      let merged = [...logsBase, ...logsDispatch];
      merged = merged.filter((x: any) => String(x.timestamp || '').trim());
      if (modulo) merged = merged.filter((x: any) => cleanText(x.modulo).toLowerCase() === modulo);
      if (operador) merged = merged.filter((x: any) => cleanText(x.operator).toLowerCase().includes(operador));
      if (status) merged = merged.filter((x: any) => cleanText(x.status).toUpperCase().includes(status));
      if (dispatchIdFilter) merged = merged.filter((x: any) => cleanText(x.dispatchId) === dispatchIdFilter);
      if (de) merged = merged.filter((x: any) => toIsoDateOrEmpty(x.timestamp) >= de);
      if (ate) merged = merged.filter((x: any) => toIsoDateOrEmpty(x.timestamp) <= ate);

      merged.sort((a: any, b: any) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      return { ok: true, data: { success: true, source: 'supabase', logs: merged, total: merged.length } };
    }

    if (ctx.action === 'GET_SAFE_SETTINGS') {
      return { ok: true, data: { success: true, source: 'runtime', settings: safeOperationalSettings() } };
    }

    if (ctx.action === 'GET_CONTEXT_HELP') {
      const moduleName = cleanText(ctx.payload.module || ctx.payload.modulo).toLowerCase();
      if (!moduleName) {
        return {
          ok: true,
          data: {
            success: true,
            source: 'runtime',
            modules: HELP_CONTENT_BY_MODULE,
          },
        };
      }
      return {
        ok: true,
        data: {
          success: true,
          source: 'runtime',
          module: moduleName,
          help: HELP_CONTENT_BY_MODULE[moduleName] || null,
        },
      };
    }

    if (ctx.action === 'GET_ENCONTREIROS') {
      const classificacaoFilter = cleanText(ctx.payload.classificacao).toLowerCase();
      const includeSensitive = String(ctx.payload.includeSensitive ?? '').toLowerCase() === 'true' || ctx.payload.includeSensitive === true;
      const tableCandidates = getEncontreirosReadCandidates();

      let rows: any[] = [];
      try {
        rows = await fetchAllRows(supabase, tableCandidates);
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
              warning: `Não foi possível ler as fontes de encontreiros. Fontes tentadas: ${tableCandidates.join(', ')}. Detalhe: ${msg}`,
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
      const rows = await fetchAllRows(
        supabase,
        [
          String(process.env.EAC_SUPABASE_TABLE_CIRCULOS || '').trim(),
          'circulos_distribuidos',
          'circulos',
          'circles_distribution',
        ].filter(Boolean),
        { maxRows: 20000 }
      );
      const circulos = groupCirculos(rows);
      return { ok: true, data: { success: true, circulos, source: 'supabase' } };
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

      let rows = normalizedPayloadItems;
      if (rows.length === 0) {
        const priTables = [
          String(process.env.EAC_SUPABASE_TABLE_PRIORITARIOS || '').trim(),
          'inscricoes_prioritarias',
          'prioritarios',
          'inscricoes_prioritarias_view',
        ].filter(Boolean);

        rows = await fetchAllRows(supabase, priTables, { maxRows: 30000 });
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
        const birthDate =
          parseMemberBirthDate(pickFirst(row, ['data_nascimento', 'dataNascimento', 'nascimento'])) ||
          parseMemberBirthDate(resolvePerson(row)?.data_nascimento);

        const ageFromBirthDate = calcCurrentAgeFromBirthDate(birthDate);
        if (Number.isFinite(Number(ageFromBirthDate))) return Math.floor(Number(ageFromBirthDate));

        const persistedAge = Number(resolvePerson(row)?.idade_calculada);
        if (Number.isFinite(persistedAge)) return Math.floor(persistedAge);

        const raw = cleanText(pickFirst(row, ['idade', 'idade_snapshot', 'age'])).replace(',', '.');
        const n = Number(raw);
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
        return Number.isFinite(age) && age >= minAge && age <= maxAge;
      });
      const nonEligible = enrichedRows.filter((row) => !eligible.includes(row));

      const circles = ['Circulo 1', 'Circulo 2', 'Circulo 3', 'Circulo 4', 'Circulo 5', 'Circulo 6'];
      const grouped = createEmptyCircleGroups();
      const sexBucket = (raw: any) => {
        const s = cleanText(raw);
        if (s.startsWith('m')) return 'M';
        if (s.startsWith('f')) return 'F';
        return 'O';
      };
      const ageBucket = (raw: any) => {
        const n = Number(String(raw ?? '').replace(',', '.'));
        if (!Number.isFinite(n)) return 'OUTROS';
        const age = Math.floor(n);
        if (age >= 13 && age <= 17) return String(age);
        return 'OUTROS';
      };
      const circleStats: Record<string, { total: number; sexo: Record<string, number>; idade: Record<string, number> }> =
        Object.fromEntries(
          circles.map((c) => [
            c,
            { total: 0, sexo: { M: 0, F: 0, O: 0 }, idade: { '13': 0, '14': 0, '15': 0, '16': 0, '17': 0, OUTROS: 0 } },
          ])
        );

      const orderedEligible = [...eligible].sort((a, b) => {
        const ageA = Number(a?.idade_resolvida || 0);
        const ageB = Number(b?.idade_resolvida || 0);
        return ageB - ageA;
      });

      const maxPerCircle = Number(ctx.payload.maxPerCircle ?? 12);
      orderedEligible.forEach((row) => {
        const sBucket = sexBucket(row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']));
        const iBucket = ageBucket(row?.idade_resolvida);
        let bestCircle = circles[0];
        let bestScore = Number.POSITIVE_INFINITY;

        circles.forEach((circle) => {
          const stats = circleStats[circle];
          const score =
            stats.total * 100 +
            (stats.sexo[sBucket] || 0) * 10 +
            (stats.idade[iBucket] || 0) * 10 +
            ((stats.sexo.M || 0) - (stats.sexo.F || 0)) ** 2;
          if (score < bestScore) {
            bestScore = score;
            bestCircle = circle;
          }
        });

        if (circleStats[bestCircle].total >= maxPerCircle) {
          grouped['Circulo Excedente'].push({
            id: pickFirst(row, ['id', 'uuid']),
            linhaOrigem: pickFirst(row, ['linhaOrigem', 'linha_origem', 'linha_origem_nao_inscritos']),
            nome: row?.nome_resolvido ?? pickFirst(row, ['nome', 'nome_completo', 'name']),
            sexo: row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']),
            idade: row?.idade_resolvida ?? pickFirst(row, ['idade', 'idade_snapshot', 'age']),
            bairro: row?.bairro_resolvido ?? pickFirst(row, ['bairro', 'bairro_snapshot']),
            circulo: 'Circulo Excedente',
            motivoExcedente: 'CAPACIDADE',
          });
          return;
        }

        grouped[bestCircle].push({
          id: pickFirst(row, ['id', 'uuid']),
          linhaOrigem: pickFirst(row, ['linhaOrigem', 'linha_origem', 'linha_origem_nao_inscritos']),
          nome: row?.nome_resolvido ?? pickFirst(row, ['nome', 'nome_completo', 'name']),
          sexo: row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']),
          idade: row?.idade_resolvida ?? pickFirst(row, ['idade', 'idade_snapshot', 'age']),
          bairro: row?.bairro_resolvido ?? pickFirst(row, ['bairro', 'bairro_snapshot']),
          circulo: bestCircle,
        });

        circleStats[bestCircle].total += 1;
        circleStats[bestCircle].sexo[sBucket] = (circleStats[bestCircle].sexo[sBucket] || 0) + 1;
        circleStats[bestCircle].idade[iBucket] = (circleStats[bestCircle].idade[iBucket] || 0) + 1;
      });

      nonEligible.forEach((row) => {
        grouped['Circulo Excedente'].push({
          id: pickFirst(row, ['id', 'uuid']),
          linhaOrigem: pickFirst(row, ['linhaOrigem', 'linha_origem', 'linha_origem_nao_inscritos']),
          nome: row?.nome_resolvido ?? pickFirst(row, ['nome', 'nome_completo', 'name']),
          sexo: row?.sexo_resolvido ?? pickFirst(row, ['sexo', 'sexo_snapshot']),
          idade: row?.idade_resolvida ?? pickFirst(row, ['idade', 'idade_snapshot', 'age']),
          bairro: row?.bairro_resolvido ?? pickFirst(row, ['bairro', 'bairro_snapshot']),
          circulo: 'Circulo Excedente',
          motivoExcedente: 'FORA_FAIXA',
        });
      });

      return {
        ok: true,
        data: {
          success: true,
          source: 'supabase',
          message: 'Distribuição de círculos executada com sucesso.',
          faixa: { minAge, maxAge },
          totalPrioritarios: (Array.isArray(rows) ? rows : []).length,
          totalAptos: eligible.length,
          totalDistribuido: Object.values(grouped).reduce((acc, list) => acc + list.length, 0),
          totalPersistido: 0,
          persistencia: 'client-fallback',
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








