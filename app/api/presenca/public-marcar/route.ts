import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'Payload inválido: JSON malformado.' }, { status: 400 });
    }

    const telefone = String(body?.telefone || '').trim();
    const pessoaId = String(body?.pessoaId || body?.pessoa_id || '').trim();
    const telefoneAtualizado = String(body?.telefoneAtualizado || body?.telefone_atualizado || '').trim();
    const emailAtualizado = String(body?.emailAtualizado || body?.email_atualizado || '').trim();
    const nome = String(body?.nome || '').trim();
    const circulo = String(body?.circulo || '').trim();
    const tipoEvento = String(body?.tipoEvento || '').trim();
    const origemPublico = String(body?.origemPublico || '').trim();

    if (!telefone && !telefoneAtualizado && !pessoaId) {
      return NextResponse.json({ success: false, error: 'Telefone é obrigatório.' }, { status: 400 });
    }

    const supa = await handleSupabaseAction('MARK_PRESENCE', {
      telefone,
      pessoaId,
      telefoneAtualizado,
      emailAtualizado,
      nome,
      circulo,
      tipoEvento,
      origemPublico,
    });
    if (!supa.ok) {
      return NextResponse.json(
        { success: false, error: supa.error || 'Falha ao registrar presença.' },
        { status: isSupabaseConfigured() ? 502 : 500 }
      );
    }

    return NextResponse.json(
      {
        ...(supa.data || {}),
        success: true,
        message: (supa.data as any)?.message || 'Presença registrada com sucesso.',
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}
