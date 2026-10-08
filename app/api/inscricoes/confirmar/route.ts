import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';
import { INSCRICAO_TERMS, requiredTermsAccepted } from '../../../../utils/inscricaoTerms';

export const dynamic = 'force-dynamic';

function clean(value: any) {
  return String(value ?? '').trim();
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function loadContext(token: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED', status: 500 } as const;

  const tokenHash = hashToken(token);
  const { data: inscricao, error } = await supabase
    .from('inscricoes')
    .select('id,adolescente_id,status,confirmacao_responsavel_expira_em,confirmacao_responsavel_confirmada_em,termos_snapshot,termos_versao_snapshot')
    .eq('confirmacao_responsavel_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('[confirmar-inscricao] falha ao consultar token:', error);
    return { error: 'TOKEN_LOOKUP_FAILED', status: 502 } as const;
  }
  if (!inscricao) return { error: 'TOKEN_INVALIDO', status: 404 } as const;

  const expiresAt = inscricao.confirmacao_responsavel_expira_em
    ? new Date(inscricao.confirmacao_responsavel_expira_em)
    : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
    return { error: 'TOKEN_EXPIRADO', status: 410, inscricao } as const;
  }

  const { data: adolescente } = await supabase
    .from('adolescentes')
    .select('id,pessoa_id')
    .eq('id', inscricao.adolescente_id)
    .maybeSingle();

  const { data: pessoa } = adolescente?.pessoa_id
    ? await supabase
        .from('pessoas')
        .select('id,nome_completo,data_nascimento')
        .eq('id', adolescente.pessoa_id)
        .maybeSingle()
    : ({ data: null } as any);

  const { data: vinculo } = await supabase
    .from('adolescente_responsaveis')
    .select('responsavel_id')
    .eq('adolescente_id', inscricao.adolescente_id)
    .eq('principal', true)
    .limit(1)
    .maybeSingle();

  const { data: responsavel } = vinculo?.responsavel_id
    ? await supabase
        .from('responsaveis')
        .select('id,nome,email')
        .eq('id', vinculo.responsavel_id)
        .maybeSingle()
    : ({ data: null } as any);

  return { supabase, inscricao, adolescente, pessoa, responsavel, status: 200 } as const;
}

export async function GET(req: Request) {
  const token = clean(new URL(req.url).searchParams.get('token'));
  if (!token) {
    return NextResponse.json({ success: false, error: 'TOKEN_OBRIGATORIO', message: 'Link de confirmação inválido.' }, { status: 400 });
  }

  const ctx: any = await loadContext(token);
  if (ctx.error) {
    const message =
      ctx.error === 'TOKEN_EXPIRADO'
        ? 'Este link expirou. Solicite o reenvio da confirmação à equipe do EAC.'
        : 'Este link de confirmação não é válido.';
    return NextResponse.json({ success: false, error: ctx.error, message }, { status: ctx.status });
  }

  const snapshot = Array.isArray(ctx.inscricao.termos_snapshot) && ctx.inscricao.termos_snapshot.length
    ? ctx.inscricao.termos_snapshot
    : INSCRICAO_TERMS;

  return NextResponse.json({
    success: true,
    data: {
      inscricao_id: ctx.inscricao.id,
      status: ctx.inscricao.status,
      ja_confirmada: Boolean(ctx.inscricao.confirmacao_responsavel_confirmada_em) || ctx.inscricao.status === 'INSCRITO',
      adolescente: {
        nome: ctx.pessoa?.nome_completo || '',
        data_nascimento: ctx.pessoa?.data_nascimento || null,
      },
      responsavel: {
        nome: ctx.responsavel?.nome || '',
        email_mascarado: clean(ctx.responsavel?.email).replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),
      },
      termos: snapshot,
    },
  });
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON_INVALIDO', message: 'Dados inválidos.' }, { status: 400 });
  }

  const token = clean(body?.token);
  const respostas = body?.respostas && typeof body.respostas === 'object' ? body.respostas : {};
  if (!token) {
    return NextResponse.json({ success: false, error: 'TOKEN_OBRIGATORIO', message: 'Link de confirmação inválido.' }, { status: 400 });
  }

  const ctx: any = await loadContext(token);
  if (ctx.error) {
    const message =
      ctx.error === 'TOKEN_EXPIRADO'
        ? 'Este link expirou. Solicite o reenvio da confirmação à equipe do EAC.'
        : 'Este link de confirmação não é válido.';
    return NextResponse.json({ success: false, error: ctx.error, message }, { status: ctx.status });
  }

  if (ctx.inscricao.confirmacao_responsavel_confirmada_em || ctx.inscricao.status === 'INSCRITO') {
    return NextResponse.json({ success: true, data: { already_confirmed: true }, message: 'Esta inscrição já foi confirmada.' });
  }

  const normalized: Record<string, string> = {};
  for (const term of INSCRICAO_TERMS) {
    const value = clean(respostas?.[term.codigo]).toUpperCase();
    if (term.tipo_resposta === 'SIM_NAO') {
      if (!['SIM', 'NAO'].includes(value)) {
        return NextResponse.json({
          success: false,
          error: 'TERMOS_INCOMPLETOS',
          message: 'Responda todas as autorizações antes de concluir.',
          fields: { [term.codigo]: 'Selecione Sim ou Não.' },
        }, { status: 400 });
      }
      normalized[term.codigo] = value;
    } else {
      normalized[term.codigo] = value;
    }
  }

  if (!requiredTermsAccepted(normalized)) {
    return NextResponse.json({
      success: false,
      error: 'TERMOS_OBRIGATORIOS_NAO_ACEITOS',
      message: 'Os termos obrigatórios precisam ser aceitos para concluir a inscrição.',
    }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const evidence = {
    respostas: normalized,
    confirmado_em: nowIso,
    responsavel_id: ctx.responsavel?.id || null,
    responsavel_nome_snapshot: ctx.responsavel?.nome || null,
    responsavel_email_snapshot: ctx.responsavel?.email || null,
    termo_versao: ctx.inscricao.termos_versao_snapshot || INSCRICAO_TERMS[0]?.versao || null,
  };

  const { error: updateError } = await ctx.supabase
    .from('inscricoes')
    .update({
      status: 'INSCRITO',
      termos_respostas: evidence,
      confirmacao_responsavel_confirmada_em: nowIso,
      confirmacao_responsavel_token_hash: null,
      atualizado_em: nowIso,
    })
    .eq('id', ctx.inscricao.id)
    .eq('status', 'AGUARDANDO_RESPONSAVEL');

  if (updateError) {
    console.error('[confirmar-inscricao] falha ao confirmar:', updateError);
    return NextResponse.json({ success: false, error: 'CONFIRMATION_UPDATE_FAILED', message: 'Não foi possível concluir a inscrição.' }, { status: 502 });
  }

  if (ctx.adolescente?.id) {
    const { error: adolescenteError } = await ctx.supabase
      .from('adolescentes')
      .update({ aceite_normas: true })
      .eq('id', ctx.adolescente.id);
    if (adolescenteError) {
      console.error('[confirmar-inscricao] falha ao atualizar aceite_normas:', adolescenteError);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      inscricao_id: ctx.inscricao.id,
      status: 'INSCRITO',
      autorizacao_imagem_voz: normalized.USO_IMAGEM_VOZ === 'SIM',
    },
    message: 'Termos confirmados. A inscrição foi concluída com sucesso.',
  });
}
