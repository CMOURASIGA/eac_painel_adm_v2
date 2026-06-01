import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';
import { authorizeRequest } from '../../../../utils/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'presence', action: 'edit' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'Payload inválido: JSON malformado.' }, { status: 400 });
    }

    const telefone = String(body?.telefone || '').trim();
    const nome = String(body?.nome || '').trim();
    const circulo = String(body?.circulo || '').trim();

    if (!telefone) {
      return NextResponse.json({ success: false, error: 'Telefone é obrigatório.' }, { status: 400 });
    }

    const supa = await handleSupabaseAction('MARK_PRESENCE', { telefone, nome, circulo });
    if (!supa.ok) {
      return NextResponse.json(
        { success: false, error: supa.error || 'Falha ao registrar presença.' },
        { status: isSupabaseConfigured() ? 502 : 500 }
      );
    }

    const response = NextResponse.json(supa.data, { status: 200 });
    response.headers.set('X-EAC-Backend', 'supabase');
    response.headers.set('X-EAC-Endpoint', 'presenca/marcar');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}

