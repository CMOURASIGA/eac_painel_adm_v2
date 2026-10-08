import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { getInscricaoTermsSnapshot } from './inscricaoTerms.js';

type AnyObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

type ValidationResult = {
  normalized: AnyObject;
  fields: Record<string, string>;
};

type ExecResult = {
  status: number;
  body: AnyObject;
};

const ENCONTRO_ALLOWED_STATUS = new Set(['ATIVO', 'PLANEJADO']);
const IDADE_MAX_TRIAGEM = 17;
const INSCRICAO_DUPLICATE_BLOCK_STATUSES = new Set([
  'INSCRITO',
  'FILA',
  'CONFIRMADO',
  'NAO_SELECIONADO',
  'EM_ANALISE',
  'AGUARDANDO_RESPONSAVEL',
]);

const REQUIRED_MESSAGES = {
  nome_adolescente: 'Informe o nome completo do adolescente.',
  data_nascimento: 'Informe uma data de nascimento válida.',
  sexo: 'Informe o sexo do adolescente.',
  tamanho_camisa: 'Selecione o tamanho da camisa.',
  escola: 'Informe onde você estuda.',
  telefone_adolescente: 'Informe um telefone válido do adolescente.',
  nome_responsavel: 'Informe o nome do responsável.',
  telefone_responsavel: 'Informe um telefone válido do responsável.',
  email_responsavel: 'Informe um e-mail válido do responsável. A confirmação da inscrição será enviada para esse endereço.',
};

export function normalizarTexto(valor: any): string {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizarTextoCanonico(valor: any): string {
  return normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function normalizarNome(valor: any): string {
  return normalizarTextoCanonico(valor);
}

export function normalizarSexo(valor: any): string {
  const raw = normalizarTexto(valor);
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!normalized) return '';
  if (normalized === 'm' || normalized === 'masc' || normalized === 'masculino') return 'Masculino';
  if (normalized === 'f' || normalized === 'fem' || normalized === 'feminino') return 'Feminino';
  return raw;
}

function somenteDigitos(value: any): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizarTelefoneBR(value: any): string {
  let digits = somenteDigitos(value);

  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function temSomenteZeros(digits: string): boolean {
  return !!digits && /^0+$/.test(digits);
}

export function validarTelefoneBR(valor: any): boolean {
  const normalized = normalizarTelefoneBR(valor);
  if (!/^\d+$/.test(normalized)) return false;
  if (temSomenteZeros(normalized)) return false;
  if (normalized.startsWith('55')) {
    const national = normalized.slice(2);
    return national.length === 10 || national.length === 11;
  }
  return false;
}

function parseDateOnly(value: any): Date | null {
  const raw = normalizarTexto(value);
  if (!raw) return null;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));

  if (isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;

  return dt;
}

export function validarDataNascimento(valor: any): boolean {
  const dt = parseDateOnly(valor);
  if (!dt) return false;
  const now = new Date();
  return dt.getTime() <= now.getTime();
}

export function validarUuid(valor: any): boolean {
  const raw = normalizarTexto(valor);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

function nomeValido(nome: string): boolean {
  if (!nome) return false;
  const usefulLen = nome.replace(/\s/g, '').length;
  if (usefulLen < 5) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(nome)) return false;
  if (/^[\d\s]+$/.test(nome)) return false;
  if (/^[^A-Za-zÀ-ÖØ-öø-ÿ\d]+$/.test(nome)) return false;
  return nome.split(' ').filter(Boolean).length >= 2 || usefulLen >= 5;
}

export function validarPayloadInscricao(payload: AnyObject): ValidationResult {
  const normalized: AnyObject = {
    id_encontro: normalizarTexto(payload.id_encontro),
    nome_adolescente: normalizarTexto(payload.nome_adolescente),
    nome_social: normalizarTexto(payload.nome_social) || null,
    data_nascimento: normalizarTexto(payload.data_nascimento),
    sexo: normalizarSexo(payload.sexo),
    tamanho_camisa: normalizarTexto(payload.tamanho_camisa).toUpperCase(),
    escola_id: normalizarTexto(payload.escola_id) || null,
    escola_nome_outro: normalizarTexto(payload.escola_nome_outro) || null,
    telefone_adolescente: normalizarTelefoneBR(payload.telefone_adolescente),
    nome_responsavel: normalizarTexto(payload.nome_responsavel),
    telefone_responsavel: normalizarTelefoneBR(payload.telefone_responsavel),

    bairro: normalizarTexto(payload.bairro) || null,
    paroquia: normalizarTexto(payload.paroquia) || null,
    email_adolescente: normalizarTexto(payload.email_adolescente) || null,
    email_responsavel: normalizarTexto(payload.email_responsavel) || null,
    endereco: normalizarTexto(payload.endereco) || null,
    observacoes: normalizarTexto(payload.observacoes) || null,
    motivacao: normalizarTexto(payload.motivacao) || null,
    expectativas: normalizarTexto(payload.expectativas) || null,
    grau_parentesco: normalizarTexto(payload.grau_parentesco) || null,
    participou_antes: payload.participou_antes === true,
    autorizacao_imagem: payload.autorizacao_imagem === true,
  };

  const fields: Record<string, string> = {};

  if (!nomeValido(normalized.nome_adolescente)) {
    fields.nome_adolescente = REQUIRED_MESSAGES.nome_adolescente;
  }
  if (!validarDataNascimento(normalized.data_nascimento)) {
    fields.data_nascimento = REQUIRED_MESSAGES.data_nascimento;
  }
  if (!normalized.sexo) {
    fields.sexo = REQUIRED_MESSAGES.sexo;
  }
  if (!['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'].includes(normalized.tamanho_camisa)) {
    fields.tamanho_camisa = REQUIRED_MESSAGES.tamanho_camisa;
  }
  if (normalized.escola_id && normalized.escola_nome_outro) {
    fields.escola = 'Selecione uma escola da lista ou informe outro colégio.';
  } else if (normalized.escola_id && !validarUuid(normalized.escola_id)) {
    fields.escola = 'A escola selecionada é inválida. Pesquise e selecione novamente.';
  } else if (!normalized.escola_id && !normalized.escola_nome_outro) {
    fields.escola = REQUIRED_MESSAGES.escola;
  }
  if (!validarTelefoneBR(normalized.telefone_adolescente)) {
    fields.telefone_adolescente = REQUIRED_MESSAGES.telefone_adolescente;
  }
  if (!nomeValido(normalized.nome_responsavel)) {
    fields.nome_responsavel = REQUIRED_MESSAGES.nome_responsavel;
  }
  if (!validarTelefoneBR(normalized.telefone_responsavel)) {
    fields.telefone_responsavel = REQUIRED_MESSAGES.telefone_responsavel;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarTexto(normalized.email_responsavel))) {
    fields.email_responsavel = REQUIRED_MESSAGES.email_responsavel;
  }

  return { normalized, fields };
}

async function pickPayloadByExistingColumns(
  supabase: AnySupabaseClient,
  table: string,
  payload: Record<string, any>
) {
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    const probe = await supabase.from(table).select(key).limit(1);
    if (!probe.error) filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : payload;
}

function mergeNomeSocialInObservacoes(observacoes: string | null, nomeSocial: string | null) {
  const base = normalizarTexto(observacoes);
  const social = normalizarTexto(nomeSocial);
  if (!social) return base || null;

  const withoutOldTag = base.replace(/(?:^|\n)Nome social:\s*.+$/im, '').trim();
  const tagged = `Nome social: ${social}`;
  return withoutOldTag ? `${withoutOldTag}\n${tagged}` : tagged;
}

function calcAgeOnDate(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

async function enviarEmailConfirmacaoInscricao(opts: {
  nomeAdolescente: string;
  nomeResponsavel: string;
  emailResponsavel: string;
  confirmationUrl: string;
}) {
  const senderMode = normalizarTexto(process.env.EAC_EMAIL_SENDER_MODE || '').toLowerCase();
  const senderFrom = normalizarTexto(process.env.EAC_EMAIL_FROM || '');
  if (senderMode !== 'smtp' || !senderFrom) {
    return { sent: false as const, reason: 'smtp_not_configured' };
  }

  const to = normalizarTexto(opts.emailResponsavel);
  if (!to || !to.includes('@') || !to.includes('.')) {
    return { sent: false as const, reason: 'missing_destination_email' };
  }

  const smtpHost = normalizarTexto(process.env.SMTP_HOST || 'smtp.gmail.com');
  const smtpPort = Number(process.env.SMTP_PORT || 587) || 587;
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
  const smtpUser = normalizarTexto(process.env.SMTP_USER || '');
  const smtpPass = normalizarTexto(process.env.SMTP_PASS || process.env.passwordGmail || '');
  if (!smtpUser || !smtpPass) {
    return { sent: false as const, reason: 'smtp_credentials_missing' };
  }

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
          <p style="margin:0 0 14px 0;font-size:26px;line-height:1.2;color:#0b3b69;font-weight:800;">Confirmação do responsável</p>
          <p style="margin:0 0 14px 0;">Olá, <strong>${normalizarTexto(opts.nomeResponsavel)}</strong>.</p>
          <p style="margin:0 0 14px 0;">Recebemos um formulário de inscrição para <strong>${normalizarTexto(opts.nomeAdolescente)}</strong>.</p>
          <p style="margin:0 0 14px 0;">A inscrição <strong>ainda não está concluída</strong>. Para finalizá-la, revise os dados principais e responda aos termos e autorizações apresentados no link abaixo.</p>
          <p style="margin:22px 0;text-align:center;">
            <a href="${opts.confirmationUrl}" style="display:inline-block;background:#0a4a86;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:800;">REVISAR TERMOS E CONFIRMAR INSCRIÇÃO</a>
          </p>
          <p style="margin:0 0 10px 0;font-size:14px;color:#64748b;">O link é individual e deve ser utilizado pelo responsável legal. Ele permanece válido por 7 dias. Se você não reconhece esta solicitação, não confirme.</p>
          <p style="margin:22px 0 0 0;">Fraternalmente,<br><strong>Coordenação EAC</strong></p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: senderFrom,
    to,
    subject: `EAC: confirme a inscrição de ${normalizarTexto(opts.nomeAdolescente)}`,
    html: htmlBody,
    text: `Recebemos um formulário de inscrição para ${normalizarTexto(opts.nomeAdolescente)}. Para concluir, acesse: ${opts.confirmationUrl}`,
  });

  return { sent: true as const, reason: 'ok' };
}

function createConfirmationToken() {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function getPublicAppUrl() {
  const explicit = normalizarTexto(process.env.EAC_PUBLIC_APP_URL || '');
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = normalizarTexto(process.env.VERCEL_URL || '');
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;
  return 'https://eac-painel-adm-v2.vercel.app';
}

async function findExistingInscricao(
  supabase: AnySupabaseClient,
  encontroId: string,
  adolescenteNome: string,
  dataNascimento: string,
) {
  const nomeNormalizado = normalizarNome(adolescenteNome);

  const { data: pessoasNomeNasc, error: erroNomeNasc } = await supabase
    .from('pessoas')
    .select('id, nome_completo, nome_normalizado')
    .eq('data_nascimento', dataNascimento);
  if (erroNomeNasc) throw erroNomeNasc;

  const pessoaIds = (pessoasNomeNasc ?? [])
    .filter((p: any) => {
      const nomePessoa = normalizarTextoCanonico(p?.nome_completo || p?.nome_normalizado);
      return nomePessoa === nomeNormalizado;
    })
    .map((p: any) => p.id);
  if (pessoaIds.length === 0) return null;

  const { data: adolescentes, error: erroAdolescentes } = await supabase
    .from('adolescentes')
    .select('id, pessoa_id')
    .in('pessoa_id', pessoaIds);
  if (erroAdolescentes) throw erroAdolescentes;

  const adolescenteIds = (adolescentes ?? []).map((a: any) => a.id);
  if (adolescenteIds.length === 0) return null;

  const { data: inscricoes, error: erroInscricoes } = await supabase
    .from('inscricoes')
    .select('id, adolescente_id, encontro_id, status, origem_dado, criado_via_sistema, data_inscricao')
    .in('adolescente_id', adolescenteIds)
    .eq('encontro_id', encontroId)
    .in('status', Array.from(INSCRICAO_DUPLICATE_BLOCK_STATUSES))
    .order('data_inscricao', { ascending: true })
    .limit(1);
  if (erroInscricoes) throw erroInscricoes;

  return Array.isArray(inscricoes) && inscricoes.length > 0 ? inscricoes[0] : null;
}

async function resolveEncontroParaInscricao(supabase: AnySupabaseClient, encontroIdRaw: string) {
  if (encontroIdRaw && validarUuid(encontroIdRaw)) {
    const { data: encontroById, error: byIdError } = await supabase
      .from('encontros')
      .select('id, data_inicio, status')
      .eq('id', encontroIdRaw)
      .maybeSingle();
    if (!byIdError && encontroById) {
      const statusEncontro = normalizarTexto((encontroById as any).status).toUpperCase();
      if (ENCONTRO_ALLOWED_STATUS.has(statusEncontro)) return encontroById;
    }
  }

  const { data: encontros, error: encontrosError } = await supabase
    .from('encontros')
    .select('id, data_inicio, status')
    .in('status', Array.from(ENCONTRO_ALLOWED_STATUS))
    .order('data_inicio', { ascending: true })
    .limit(50);

  if (encontrosError || !Array.isArray(encontros) || encontros.length === 0) return null;

  const now = new Date();
  const futuros = encontros.filter((e: any) => {
    const dt = parseDateOnly((e as any).data_inicio);
    return dt ? dt.getTime() >= now.getTime() : false;
  });

  if (futuros.length > 0) return futuros[0];
  return encontros[0];
}

export async function executeInscricaoCreate(params: { supabase: AnySupabaseClient | null; body: AnyObject }): Promise<ExecResult> {
  const { supabase, body } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const { normalized, fields } = validarPayloadInscricao(body ?? {});

  if (Object.keys(fields).length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Existem campos obrigatórios pendentes.',
        fields,
      },
    };
  }

  const nascimento = parseDateOnly(normalized.data_nascimento);
  if (!nascimento) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Existem campos obrigatórios pendentes.',
        fields: { data_nascimento: REQUIRED_MESSAGES.data_nascimento },
      },
    };
  }

  const encontro = await resolveEncontroParaInscricao(supabase, normalized.id_encontro);
  if (!encontro) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'ENCONTRO_INDISPONIVEL',
        message: 'Nenhum encontro ativo/planejado disponível para vincular a inscrição.',
      },
    };
  }

  const idade = calcAgeOnDate(nascimento, new Date());
  if (idade > IDADE_MAX_TRIAGEM) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'IDADE_FORA_TRIAGEM',
        message: 'Inscrição não permitida na triagem: idade acima de 17 anos. Cadastre como encontreiro.',
      },
    };
  }

  let duplicate: any = null;
  try {
    duplicate = await findExistingInscricao(
      supabase,
      encontro.id,
      normalized.nome_adolescente,
      normalized.data_nascimento,
    );
  } catch (e: any) {
    console.error('[inscricaoCreate] erro ao verificar duplicidade:', e);
    return { status: 502, body: { success: false, error: 'DUPLICATE_CHECK_FAILED', message: 'Não foi possível concluir a validação da inscrição.' } };
  }

  if (duplicate) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'DUPLICATE_INSCRICAO',
        duplicate: true,
        data: {
          inscricao: duplicate,
        },
        message: 'Já identificamos uma inscrição para este encontrista neste encontro. Caso precise corrigir alguma informação, entre em contato com a equipe responsável.',
      },
    };
  }

  if (normalized.escola_id) {
    const { data: escola, error: escolaError } = await supabase
      .from('escolas')
      .select('id')
      .eq('id', normalized.escola_id)
      .eq('ativo', true)
      .eq('municipio', 'Niterói')
      .eq('uf', 'RJ')
      .maybeSingle();

    if (escolaError || !escola) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'A escola selecionada não está disponível. Pesquise e selecione novamente.',
          fields: { escola: 'A escola selecionada não está disponível. Pesquise e selecione novamente.' },
        },
      };
    }
  }

  const nowIso = new Date().toISOString();

  const pessoaAdolescentePayload = await pickPayloadByExistingColumns(supabase, 'pessoas', {
    nome_completo: normalized.nome_adolescente,
    nome_normalizado: normalizarNome(normalized.nome_adolescente),
    nome_social: normalized.nome_social,
    data_nascimento: normalized.data_nascimento,
    sexo: normalized.sexo,
    idade_calculada: idade,
    telefone: normalized.telefone_adolescente,
    telefone_normalizado: normalized.telefone_adolescente,
    endereco: normalized.endereco,
    bairro: normalized.bairro,
    email: normalized.email_adolescente,
    email_normalizado: normalized.email_adolescente ? normalizarTexto(normalized.email_adolescente).toLowerCase() : null,
    observacoes: mergeNomeSocialInObservacoes(normalized.observacoes, normalized.nome_social),
    origem_dado: 'SISTEMA',
    criado_via_sistema: true,
    data_importacao: nowIso,
  });

  const { data: pessoaAdolescente, error: pessoaAdolescenteError } = await supabase
    .from('pessoas')
    .insert(pessoaAdolescentePayload)
    .select('id')
    .single();

  if (pessoaAdolescenteError) {
    return { status: 502, body: { success: false, error: 'CREATE_PESSOA_ADOLESCENTE_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: adolescente, error: adolescenteError } = await supabase
    .from('adolescentes')
    .insert({
      pessoa_id: pessoaAdolescente.id,
      aceite_normas: false,
      ja_fez_eac: normalized.participou_antes,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: nowIso,
    })
    .select('id')
    .single();

  if (adolescenteError) {
    return { status: 502, body: { success: false, error: 'CREATE_ADOLESCENTE_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: pessoaResponsavel, error: pessoaResponsavelError } = await supabase
    .from('pessoas')
    .insert({
      nome_completo: normalized.nome_responsavel,
      nome_normalizado: normalizarNome(normalized.nome_responsavel),
      telefone: normalized.telefone_responsavel,
      telefone_normalizado: normalized.telefone_responsavel,
      email: normalized.email_responsavel,
      email_normalizado: normalized.email_responsavel ? normalizarTexto(normalized.email_responsavel).toLowerCase() : null,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: nowIso,
    })
    .select('id')
    .single();

  if (pessoaResponsavelError) {
    return { status: 502, body: { success: false, error: 'CREATE_PESSOA_RESPONSAVEL_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: responsavel, error: responsavelError } = await supabase
    .from('responsaveis')
    .insert({
      pessoa_id: pessoaResponsavel.id,
      nome: normalized.nome_responsavel,
      telefone: normalized.telefone_responsavel,
      telefone_normalizado: normalized.telefone_responsavel,
      email: normalized.email_responsavel,
      email_normalizado: normalized.email_responsavel ? normalizarTexto(normalized.email_responsavel).toLowerCase() : null,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: nowIso,
    })
    .select('id')
    .single();

  if (responsavelError) {
    return { status: 502, body: { success: false, error: 'CREATE_RESPONSAVEL_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: vinculo, error: vinculoError } = await supabase
    .from('adolescente_responsaveis')
    .insert({
      adolescente_id: adolescente.id,
      responsavel_id: responsavel.id,
      principal: true,
      grau_parentesco: normalized.grau_parentesco || 'Pai/Mãe',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: nowIso,
    })
    .select('id')
    .single();

  if (vinculoError) {
    return { status: 502, body: { success: false, error: 'CREATE_VINCULO_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: inscricao, error: inscricaoError } = await supabase
    .from('inscricoes')
    .insert({
      encontro_id: encontro.id,
      adolescente_id: adolescente.id,
      email_adolescente_snapshot: normalized.email_adolescente,
      email_responsavel_snapshot: normalized.email_responsavel,
      email_destino_snapshot: normalized.email_responsavel || normalized.email_adolescente,
      status: 'AGUARDANDO_RESPONSAVEL',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_inscricao: nowIso,
      criado_em: nowIso,
      atualizado_em: nowIso,
      tamanho_camisa: normalized.tamanho_camisa,
      escola_id: normalized.escola_id,
      escola_nome_outro: normalized.escola_id ? null : normalized.escola_nome_outro,
    })
    .select('*')
    .single();

  if (inscricaoError) {
    return { status: 502, body: { success: false, error: 'CREATE_INSCRICAO_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const confirmation = createConfirmationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const termsSnapshot = getInscricaoTermsSnapshot();

  const { error: confirmationMetaError } = await supabase
    .from('inscricoes')
    .update({
      confirmacao_responsavel_token_hash: confirmation.hash,
      confirmacao_responsavel_expira_em: expiresAt,
      confirmacao_responsavel_enviada_em: nowIso,
      termos_versao_snapshot: termsSnapshot[0]?.versao || null,
      termos_snapshot: termsSnapshot,
    })
    .eq('id', inscricao.id);

  if (confirmationMetaError) {
    console.error('[inscricaoCreate] falha ao salvar metadados de confirmação:', confirmationMetaError);
    return { status: 502, body: { success: false, error: 'CONFIRMATION_SETUP_FAILED', message: 'Não foi possível preparar a confirmação do responsável.' } };
  }

  const confirmationUrl = `${getPublicAppUrl()}/inscricao/confirmar?token=${encodeURIComponent(confirmation.token)}`;

  let emailDispatch: { sent: boolean; reason: string } = { sent: false, reason: 'not_attempted' };
  try {
    emailDispatch = await enviarEmailConfirmacaoInscricao({
      nomeAdolescente: normalized.nome_adolescente,
      nomeResponsavel: normalized.nome_responsavel,
      emailResponsavel: normalized.email_responsavel,
      confirmationUrl,
    });
  } catch (e: any) {
    console.error('[inscricaoCreate] falha ao enviar e-mail de confirmação:', e?.message || e);
    emailDispatch = { sent: false, reason: 'send_failed' };
  }

  return {
    status: 201,
    body: {
      success: true,
      data: {
        inscricao_id: inscricao.id,
        adolescente_id: adolescente.id,
        pessoa_adolescente_id: pessoaAdolescente.id,
        responsavel_id: responsavel.id,
        pessoa_responsavel_id: pessoaResponsavel.id,
        vinculo_id: vinculo.id,
        email_confirmacao: emailDispatch,
      },
      message: emailDispatch.sent
        ? 'Formulário recebido. Enviamos um e-mail ao responsável para revisar os termos e concluir a inscrição.'
        : 'Formulário recebido, mas não foi possível enviar o e-mail de confirmação. A inscrição permanece aguardando confirmação do responsável.',
    },
  };
}
