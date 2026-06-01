import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';
import { executeInscricaoCreate } from '../../../../utils/inscricaoCreate';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let body: any = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Payload inválido: JSON malformado.' }, { status: 400 });
    }

    const result = await executeInscricaoCreate({
      supabase: getSupabaseServerClient(),
      body,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (e: any) {
    console.error('[app/api/inscricoes/create] falha:', e);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' }, { status: 500 });
  }
}
