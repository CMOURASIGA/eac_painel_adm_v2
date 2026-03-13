import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  }

  try {
    const linhaOrigem = String(req.body?.linhaOrigem || req.body?.linha_origem || '').trim();
    const priorizar = req.body?.priorizar;
    if (!linhaOrigem) {
      return res.status(400).json({ success: false, error: 'linhaOrigem é obrigatória.' });
    }

    const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = req.headers.host || 'localhost:3000';
    const proxyUrl = `${protocol}://${host}/api/comunicados`;

    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PRIORITIZE_NON_ENROLLED',
        data: priorizar === undefined ? { linhaOrigem } : { linhaOrigem, priorizar }
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

    res.setHeader('X-EAC-Endpoint', 'nao-inscritos/priorizar');
    return res.status(proxyResponse.status).json(payload);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno.'
    });
  }
}
