import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';
import { executeInscricoesAdminList } from '../../../../utils/inscricoesAdmin';
import { executeAlterarStatusInscricao, executeAtualizarCadastroInscricao, executeExcluirInscricao } from '../../../../utils/inscricoesStatus';
import { authorizeRequest } from '../../../../utils/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'inscricoes_review', action: 'view' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const url = new URL(req.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const result = await executeInscricoesAdminList({
      supabase: getSupabaseServerClient(),
      query,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (e: any) {
    console.error('[app/api/inscricoes/admin] falha:', e);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'inscricoes_review', action: 'edit' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const raw = await req.text();
    let body: any = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Payload invalido: JSON malformado.' },
        { status: 400 },
      );
    }

    const result = String(body?.action || '').trim().toUpperCase() === 'UPDATE_RECORD'
      ? await executeAtualizarCadastroInscricao({
          supabase: getSupabaseServerClient(),
          body,
        })
      : await executeAlterarStatusInscricao({
          supabase: getSupabaseServerClient(),
          body,
        });

    return NextResponse.json(result.body, { status: result.status });
  } catch (e: any) {
    console.error('[app/api/inscricoes/admin/status] falha:', e);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'inscricoes_review', action: 'delete' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const raw = await req.text();
    let body: any = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Payload invalido: JSON malformado.' },
        { status: 400 },
      );
    }

    const result = await executeExcluirInscricao({
      supabase: getSupabaseServerClient(),
      body,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (e: any) {
    console.error('[app/api/inscricoes/admin/delete] falha:', e);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' },
      { status: 500 },
    );
  }
}
