import type { NextApiRequest, NextApiResponse } from 'next';

function normalizeOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  }

  try {
    const googleWebAppUrl = String(req.body?.googleWebAppUrl || '').trim();
    const minAge = normalizeOptionalInt(req.body?.minAge);
    const maxAge = normalizeOptionalInt(req.body?.maxAge);
    const data: Record<string, unknown> = {};
    if (minAge !== null) data.minAge = minAge;
    if (maxAge !== null) data.maxAge = maxAge;

    const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = req.headers.host || 'localhost:3000';
    const proxyUrl = `${protocol}://${host}/api/comunicados`;

    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'EXECUTE_DISTRIBUICAO_CIRCULOS',
        data,
        ...(googleWebAppUrl ? { googleWebAppUrl } : {})
      })
    });

    const text = await proxyResponse.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (e) {
      return res.status(502).json({
        success: false,
        error: 'Resposta inválida do backend.',
        sample: (text || '').slice(0, 300)
      });
    }

    res.setHeader('X-EAC-Endpoint', 'inscricoes-prioritarias/distribuir');
    return res.status(proxyResponse.status).json(payload);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno.'
    });
  }
}
