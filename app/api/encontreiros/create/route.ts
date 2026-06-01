import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Payload inválido: JSON malformado.' },
        { status: 400 }
      );
    }

    const nomeCompleto = String(body?.nomeCompleto || '').trim();
    const celularWhatsapp = String(body?.celularWhatsapp || '').trim();
    const bairro = String(body?.bairro || '').trim();
    const aceiteTermos = Boolean(body?.aceite_termos);

    const fieldErrors: Record<string, string> = {};
    if (!nomeCompleto) fieldErrors.nomeCompleto = 'Nome completo é obrigatório.';
    if (!celularWhatsapp) fieldErrors.celularWhatsapp = 'Celular / WhatsApp é obrigatório.';
    if (!bairro) fieldErrors.bairro = 'Bairro é obrigatório.';
    if (!aceiteTermos) fieldErrors.aceite_termos = 'Aceite dos termos é obrigatório.';

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Dados obrigatórios não informados.', fields: fieldErrors },
        { status: 400 }
      );
    }

    const result = await handleSupabaseAction('SAVE_ENCONTREIRO', body);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: 'INTERNAL_ERROR', message: result.error || 'Erro ao salvar cadastro.' },
        { status: 500 }
      );
    }

    if (!result.data?.success) {
      return NextResponse.json(
        { success: false, error: 'SAVE_FAILED', message: String(result.data?.error || 'Não foi possível salvar cadastro.') },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cadastro recebido com sucesso! Em breve a coordenação entrará em contato.',
      data: result.data?.data || null,
      email_confirmacao: result.data?.email_confirmacao || null,
    });
  } catch (e: any) {
    console.error('[app/api/encontreiros/create] falha:', e);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' },
      { status: 500 }
    );
  }
}
