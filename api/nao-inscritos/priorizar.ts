import type { NextApiRequest, NextApiResponse } from 'next';

function sendError(res: NextApiResponse, status: number, error: string, extra?: Record<string, any>) {
  return res.status(status).json({ success: false, error, message: error, ...(extra || {}) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const linhaOrigem = String(req.body?.linhaOrigem || req.body?.linha_origem || '').trim();
    const id = String(req.body?.id || req.body?.prioritarioId || req.body?.inscricao_prioritaria_id || '').trim();
    const priorizar = req.body?.priorizar;
    if (!linhaOrigem && !id) {
      return sendError(res, 400, 'linhaOrigem ou id e obrigatorio.');
    }

    const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = req.headers.host || 'localhost:3000';
    const proxyUrl = `${protocol}://${host}/api/comunicados`;

    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PRIORITIZE_NON_ENROLLED',
        data: priorizar === undefined
          ? { linhaOrigem, id }
          : { linhaOrigem, id, priorizar },
      }),
    });

    const text = await proxyResponse.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      return sendError(res, 502, 'Resposta invalida do backend.', { sample: (text || '').slice(0, 300) });
    }

    res.setHeader('X-EAC-Endpoint', 'nao-inscritos/priorizar');
    return res.status(proxyResponse.status).json(payload);
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Erro interno.');
  }
}
