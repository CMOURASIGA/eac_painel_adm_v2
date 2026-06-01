import type { NextApiRequest, NextApiResponse } from 'next';

function sendError(res: NextApiResponse, status: number, error: string, extra?: Record<string, any>) {
  return res.status(status).json({ success: false, error, message: error, ...(extra || {}) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const googleWebAppUrl = String(req.query?.googleWebAppUrl || '').trim();
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = req.headers.host || 'localhost:3000';
    const proxyUrl = `${protocol}://${host}/api/comunicados`;

    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'GET_CIRCULOS_DISTRIBUIDOS',
        data: {},
        ...(googleWebAppUrl ? { googleWebAppUrl } : {}),
      }),
    });

    const text = await proxyResponse.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      return sendError(res, 502, 'Resposta invalida do backend.', { sample: (text || '').slice(0, 300) });
    }

    res.setHeader('X-EAC-Endpoint', 'circulos-distribuidos');
    return res.status(proxyResponse.status).json(payload);
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Erro interno.');
  }
}
