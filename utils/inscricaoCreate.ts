import type { SupabaseClient } from '@supabase/supabase-js';

type AnyObject = Record<string, any>;

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

const REQUIRED_MESSAGES = {
  nome_adolescente: 'Informe o nome completo do adolescente.',
  data_nascimento: 'Informe uma data de nascimento válida.',
  telefone_adolescente: 'Informe um telefone válido do adolescente.',
  nome_responsavel: 'Informe o nome do responsável.',
  telefone_responsavel: 'Informe um telefone válido do responsável.',
  aceite_termos: 'É necessário aceitar os termos para enviar a inscrição.',
};

export function normalizarTexto(valor: any): string {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizarNome(valor: any): string {
  return normalizarTexto(valor);
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
    nome_adolescente: normalizarNome(payload.nome_adolescente),
    data_nascimento: normalizarTexto(payload.data_nascimento),
    telefone_adolescente: normalizarTelefoneBR(payload.telefone_adolescente),
    nome_responsavel: normalizarNome(payload.nome_responsavel),
    telefone_responsavel: normalizarTelefoneBR(payload.telefone_responsavel),
    aceite_termos: payload.aceite_termos === true,

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
  if (!validarTelefoneBR(normalized.telefone_adolescente)) {
    fields.telefone_adolescente = REQUIRED_MESSAGES.telefone_adolescente;
  }
  if (!nomeValido(normalized.nome_responsavel)) {
    fields.nome_responsavel = REQUIRED_MESSAGES.nome_responsavel;
  }
  if (!validarTelefoneBR(normalized.telefone_responsavel)) {
    fields.telefone_responsavel = REQUIRED_MESSAGES.telefone_responsavel;
  }
  if (!normalized.aceite_termos) {
    fields.aceite_termos = REQUIRED_MESSAGES.aceite_termos;
  }

  return { normalized, fields };
}

function calcAgeOnDate(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

async function enviarEmailConfirmacaoInscricao(opts: {
  nome: string;
  emailAdolescente?: string | null;
  emailResponsavel?: string | null;
}) {
  const senderMode = normalizarTexto(process.env.EAC_EMAIL_SENDER_MODE || '').toLowerCase();
  const senderFrom = normalizarTexto(process.env.EAC_EMAIL_FROM || '');
  if (senderMode !== 'smtp' || !senderFrom) {
    return { sent: false as const, reason: 'smtp_not_configured' };
  }

  const to = normalizarTexto(opts.emailResponsavel) || normalizarTexto(opts.emailAdolescente);
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

  const bodyBase = [
    `<p style="margin:0 0 14px 0; font-size:28px; line-height:1.2; color:#0b3b69; font-weight:800;">Ola, ${normalizarTexto(opts.nome) || 'amigo(a)'}!</p>`,
    '<p style="margin:0 0 14px 0;">Recebemos sua inscricao para o EAC e gostariamos de informar que seu cadastro esta em nossa <strong>lista de verificacao</strong>.</p>',
    '<p style="margin:0 0 14px 0;">Estamos organizando as vagas para o proximo encontro e em breve entraremos em contato para confirmar sua participacao.</p>',
    '<p style="margin:0 0 14px 0;">Fique atento ao seu E-mail e WhatsApp!</p>',
    '<p style="margin:22px 0 0 0;">Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
  ].join('');

  const htmlBody = `
    <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:680px;margin:0 auto;border:1px solid #dbe3ef;border-radius:24px;overflow:hidden;background:#ffffff;">
        <div style="background:#044372;padding:24px 16px;text-align:center;">
          <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" style="height:40px;display:inline-block;" />
        </div>
        <div style="padding:28px 30px;color:#334155;font-size:16px;line-height:1.65;">
          ${bodyBase}
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
    subject: 'EAC: Atualizacao sobre sua Inscricao',
    html: htmlBody,
    textEncoding: 'base64',
  });

  return { sent: true as const, reason: 'ok' };
}

async function findExistingInscricao(supabase: SupabaseClient, adolescenteNome: string, dataNascimento: string, telefoneNormalizado: string) {
  const nomeNormalizado = normalizarNome(adolescenteNome);

  const { data: pessoasTelefone, error: erroTelefone } = await supabase
    .from('pessoas')
    .select('id')
    .eq('telefone_normalizado', telefoneNormalizado);
  if (erroTelefone) throw erroTelefone;

  const { data: pessoasNomeNasc, error: erroNomeNasc } = await supabase
    .from('pessoas')
    .select('id')
    .eq('nome_normalizado', nomeNormalizado)
    .eq('data_nascimento', dataNascimento);
  if (erroNomeNasc) throw erroNomeNasc;

  const pessoaIds = Array.from(new Set([...(pessoasTelefone ?? []).map((p: any) => p.id), ...(pessoasNomeNasc ?? []).map((p: any) => p.id)]));

  if (pessoaIds.length === 0) return null;

  const { data: adolescentes, error: erroAdolescentes } = await supabase
    .from('adolescentes')
    .select('id')
    .in('pessoa_id', pessoaIds);
  if (erroAdolescentes) throw erroAdolescentes;

  const adolescenteIds = (adolescentes ?? []).map((a: any) => a.id);
  if (adolescenteIds.length === 0) return null;

  const { data: inscricoes, error: erroInscricoes } = await supabase
    .from('inscricoes')
    .select('id, adolescente_id, encontro_id, status, origem_dado, criado_via_sistema, data_inscricao')
    .in('adolescente_id', adolescenteIds)
    .limit(1);
  if (erroInscricoes) throw erroInscricoes;

  return Array.isArray(inscricoes) && inscricoes.length > 0 ? inscricoes[0] : null;
}

async function resolveEncontroParaInscricao(supabase: SupabaseClient, encontroIdRaw: string) {
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

export async function executeInscricaoCreate(params: { supabase: SupabaseClient | null; body: AnyObject }): Promise<ExecResult> {
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
      normalized.nome_adolescente,
      normalized.data_nascimento,
      normalized.telefone_adolescente,
    );
  } catch (e: any) {
    console.error('[inscricaoCreate] erro ao verificar duplicidade:', e);
    return { status: 502, body: { success: false, error: 'DUPLICATE_CHECK_FAILED', message: 'Não foi possível concluir a validação da inscrição.' } };
  }

  if (duplicate) {
    return {
      status: 200,
      body: {
        success: true,
        duplicate: true,
        data: duplicate,
        message: 'Inscrição já registrada. Em caso de dúvidas, aguarde o contato da equipe.',
      },
    };
  }

  const nowIso = new Date().toISOString();

  const { data: pessoaAdolescente, error: pessoaAdolescenteError } = await supabase
    .from('pessoas')
    .insert({
      nome_completo: normalized.nome_adolescente,
      nome_normalizado: normalizarNome(normalized.nome_adolescente),
      data_nascimento: normalized.data_nascimento,
      idade_calculada: idade,
      telefone: normalized.telefone_adolescente,
      telefone_normalizado: normalized.telefone_adolescente,
      bairro: normalized.bairro,
      email: normalized.email_adolescente,
      email_normalizado: normalized.email_adolescente ? normalizarTexto(normalized.email_adolescente).toLowerCase() : null,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: nowIso,
    })
    .select('id')
    .single();

  if (pessoaAdolescenteError) {
    return { status: 502, body: { success: false, error: 'CREATE_PESSOA_ADOLESCENTE_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  const { data: adolescente, error: adolescenteError } = await supabase
    .from('adolescentes')
    .insert({
      pessoa_id: pessoaAdolescente.id,
      aceite_normas: true,
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
      status: 'INSCRITO',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_inscricao: nowIso,
      criado_em: nowIso,
      atualizado_em: nowIso,
    })
    .select('*')
    .single();

  if (inscricaoError) {
    return { status: 502, body: { success: false, error: 'CREATE_INSCRICAO_FAILED', message: 'Não foi possível concluir a inscrição.' } };
  }

  let emailDispatch: { sent: boolean; reason: string } = { sent: false, reason: 'not_attempted' };
  try {
    emailDispatch = await enviarEmailConfirmacaoInscricao({
      nome: normalized.nome_adolescente,
      emailAdolescente: normalized.email_adolescente,
      emailResponsavel: normalized.email_responsavel,
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
      message: 'Inscrição recebida com sucesso! A equipe responsável irá revisar as informações e, se necessário, entrará em contato pelos telefones informados.',
    },
  };
}
