import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Payload inválido: JSON malformado.' },
        { status: 400 }
      );
    }

    const googleWebAppUrl = String(body?.googleWebAppUrl || '').trim();
    const minAge = body?.minAge;
    const maxAge = body?.maxAge;
    const items = Array.isArray(body?.items) ? body.items : [];

    const proxyUrl = new URL('/api/comunicados', req.url).toString();
    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'EXECUTE_DISTRIBUICAO_CIRCULOS',
        data: {
          ...(minAge !== undefined ? { minAge } : {}),
          ...(maxAge !== undefined ? { maxAge } : {}),
          ...(items.length > 0 ? { items } : {}),
        },
        ...(googleWebAppUrl ? { googleWebAppUrl } : {})
      })
    });

    const text = await proxyResponse.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Resposta inválida do backend.', sample: (text || '').slice(0, 300) },
        { status: 502 }
      );
    }

    const response = NextResponse.json(payload, { status: proxyResponse.status });
    response.headers.set('X-EAC-Endpoint', 'inscricoes-prioritarias/distribuir');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}

