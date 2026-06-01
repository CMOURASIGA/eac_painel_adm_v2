import { NextResponse } from 'next/server';
import { authorizeRequest } from '../../../../utils/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req, { module: 'inscricoes_prioritarias', action: 'edit' });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Payload invalido: JSON malformado.' },
        { status: 400 }
      );
    }

    const linhaOrigem = String(body?.linhaOrigem || body?.linha_origem || '').trim();
    const id = String(body?.id || body?.prioritarioId || body?.inscricao_prioritaria_id || '').trim();
    const priorizar = body?.priorizar;

    if (!linhaOrigem && !id) {
      return NextResponse.json(
        { success: false, error: 'linhaOrigem ou id e obrigatorio.' },
        { status: 400 }
      );
    }

    const proxyUrl = new URL('/api/comunicados', req.url).toString();
    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PRIORITIZE_NON_ENROLLED',
        data: priorizar === undefined ? { linhaOrigem, id } : { linhaOrigem, id, priorizar }
      })
    });

    const text = await proxyResponse.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Resposta invalida do backend.', sample: (text || '').slice(0, 300) },
        { status: 502 }
      );
    }

    const response = NextResponse.json(payload, { status: proxyResponse.status });
    response.headers.set('X-EAC-Endpoint', 'nao-inscritos/priorizar');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}
