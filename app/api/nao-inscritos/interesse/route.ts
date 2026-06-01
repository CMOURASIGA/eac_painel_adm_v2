import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  try {
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'Payload inválido: JSON malformado.' },
        { status: 400 }
      );
    }

    const idPessoa = String(body?.idPessoa || '').trim();
    const interesse = String(body?.interesse ?? '').trim();
    const email = String(body?.email ?? '').trim();

    if (!idPessoa) {
      return NextResponse.json(
        { success: false, error: 'idPessoa é obrigatório.' },
        { status: 400 }
      );
    }

    const supa = await handleSupabaseAction('UPDATE_NON_ENROLLED_INTEREST', { idPessoa, interesse, email });
    if (!supa.ok) {
      return NextResponse.json(
        { success: false, error: supa.error || 'Falha ao atualizar interesse.' },
        { status: isSupabaseConfigured() ? 502 : 500 }
      );
    }

    const response = NextResponse.json(supa.data, { status: 200 });
    response.headers.set('X-EAC-Backend', 'supabase');
    response.headers.set('X-EAC-Endpoint', 'nao-inscritos/interesse');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}

