import type { NextApiRequest, NextApiResponse } from 'next';

function sendError(res: NextApiResponse, status: number, error: string, extra?: Record<string, any>) {
  return res.status(status).json({ success: false, error, message: error, ...(extra || {}) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = req.headers.host || 'localhost:3000';
    const proxyUrl = `${protocol}://${host}/api/comunicados`;

    if (req.method === 'GET') {
      const googleWebAppUrl = String(req.query?.googleWebAppUrl || '').trim();
      const proxyResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GET_INSCRICOES_PRIORITARIAS',
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

      res.setHeader('X-EAC-Endpoint', 'inscricoes-prioritarias');
      return res.status(proxyResponse.status).json(payload);
    }

    if (req.method === 'POST') {
      const googleWebAppUrl = String(req.body?.googleWebAppUrl || '').trim();
      const data: Record<string, unknown> = {};
      const minAgeRaw = req.body?.minAge;
      const maxAgeRaw = req.body?.maxAge;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (minAgeRaw !== undefined && minAgeRaw !== null && String(minAgeRaw).trim() !== '') {
        const minAge = Number(minAgeRaw);
        if (Number.isFinite(minAge)) data.minAge = Math.floor(minAge);
      }
      if (maxAgeRaw !== undefined && maxAgeRaw !== null && String(maxAgeRaw).trim() !== '') {
        const maxAge = Number(maxAgeRaw);
        if (Number.isFinite(maxAge)) data.maxAge = Math.floor(maxAge);
      }
      if (items.length > 0) data.items = items;

      const proxyResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'EXECUTE_DISTRIBUICAO_CIRCULOS',
          data,
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

      res.setHeader('X-EAC-Endpoint', 'inscricoes-prioritarias/distribuir');
      return res.status(proxyResponse.status).json(payload);
    }

    return sendError(res, 405, 'Metodo nao permitido.');
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Erro interno.');
  }
}
