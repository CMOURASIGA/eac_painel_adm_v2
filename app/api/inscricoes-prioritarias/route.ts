import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const googleWebAppUrl = String(url.searchParams.get('googleWebAppUrl') || '').trim();

    const proxyUrl = new URL('/api/comunicados', req.url).toString();
    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'GET_INSCRICOES_PRIORITARIAS',
        data: {},
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
    response.headers.set('X-EAC-Endpoint', 'inscricoes-prioritarias');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno.' },
      { status: 500 }
    );
  }
}


