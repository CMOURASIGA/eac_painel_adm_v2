import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';
import { authorizeRequest } from '../../../../utils/apiAuth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'inscricoes_prioritarias_circulos', action: 'edit' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'Payload inválido: JSON malformado.' }, { status: 400 });
    }

    const id = String(body?.id || '').trim();
    const fromCirculo = String(body?.fromCirculo || '').trim();
    const toCirculo = String(body?.toCirculo || '').trim();
    const operator = String(body?.operator || '').trim();

    if (!id || !toCirculo) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: id e toCirculo.' },
        { status: 400 }
      );
    }

    const supa = await handleSupabaseAction('MOVE_CIRCULO_PARTICIPANTE', { id, fromCirculo, toCirculo, operator });
    if (!supa.ok) {
      return NextResponse.json(
        { success: false, error: supa.error || 'Falha ao mover participante de círculo.' },
        { status: isSupabaseConfigured() ? 502 : 500 }
      );
    }

    const response = NextResponse.json(supa.data, { status: 200 });
    response.headers.set('X-EAC-Backend', 'supabase');
    response.headers.set('X-EAC-Endpoint', 'circulos-distribuidos/mover');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}

