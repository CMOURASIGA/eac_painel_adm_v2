import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const WRITE_ALLOWED_STATUS = new Set(['PLANEJADO', 'ATIVO', 'ENCERRADO', 'CANCELADO']);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function toNullable(value: any) {
  const cleaned = toCleanString(value);
  return cleaned || null;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readTableName() {
  return toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from(readTableName())
      .select('id,numero,nome,data_inicio,data_fim,local,status,observacoes,criado_em,atualizado_em')
      .order('data_inicio', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ success: false, error: 'ERRO_LISTAR_ENCONTROS', message: 'Não foi possível carregar os encontros.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: Array.isArray(data) ? data : [] }, { status: 200 });
  } catch (e: any) {
    console.error('[api/encontros/admin][GET] falha:', e);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro ao carregar encontros.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' }, { status: 500 });
    }

    const body = await req.json();
    const nome = toCleanString(body?.nome);
    const status = toCleanString(body?.status).toUpperCase() || 'PLANEJADO';

    if (!nome) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Nome do encontro é obrigatório.' }, { status: 400 });
    }

    if (!WRITE_ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Status do encontro inválido.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const payload = {
      id: randomUUID(),
      numero: toNullable(body?.numero),
      nome,
      data_inicio: toNullable(body?.data_inicio),
      data_fim: toNullable(body?.data_fim),
      local: toNullable(body?.local),
      status,
      observacoes: toNullable(body?.observacoes),
      criado_em: nowIso,
      atualizado_em: nowIso,
    };

    const { data, error } = await supabase.from(readTableName()).insert(payload).select('*').single();
    if (error) {
      return NextResponse.json({ success: false, error: 'ERRO_CRIAR_ENCONTRO', message: 'Não foi possível criar o encontro.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (e: any) {
    console.error('[api/encontros/admin][POST] falha:', e);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro ao criar encontro.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' }, { status: 500 });
    }

    const body = await req.json();
    const id = toCleanString(body?.id);
    const nome = toCleanString(body?.nome);
    const status = toCleanString(body?.status).toUpperCase();

    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'ID do encontro inválido.' }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Nome do encontro é obrigatório.' }, { status: 400 });
    }
    if (!WRITE_ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Status do encontro inválido.' }, { status: 400 });
    }

    const payload = {
      numero: toNullable(body?.numero),
      nome,
      data_inicio: toNullable(body?.data_inicio),
      data_fim: toNullable(body?.data_fim),
      local: toNullable(body?.local),
      status,
      observacoes: toNullable(body?.observacoes),
      atualizado_em: new Date().toISOString(),
    };

    const { data, error } = await supabase.from(readTableName()).update(payload).eq('id', id).select('*').single();
    if (error) {
      return NextResponse.json({ success: false, error: 'ERRO_ATUALIZAR_ENCONTRO', message: 'Não foi possível atualizar o encontro.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (e: any) {
    console.error('[api/encontros/admin][PATCH] falha:', e);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro ao atualizar encontro.' }, { status: 500 });
  }
}
