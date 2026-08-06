import type { NextApiRequest, NextApiResponse } from 'next';

import { handleSupabaseAction } from '../utils/supabaseActions.js';

function sendError(res: NextApiResponse, status: number, error: string, extra?: Record<string, any>) {
  return res.status(status).json({ success: false, error, message: error, ...(extra || {}) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const result = await handleSupabaseAction('GET_CIRCULOS_DISTRIBUIDOS', {});
    if (!result.ok) return sendError(res, 502, result.error || 'Falha ao consultar a distribuição de círculos.', { details: result.details });
    const payload = result.data && typeof result.data === 'object' ? result.data as Record<string, any> : {};
    if (!(payload.success ?? true)) return sendError(res, 422, String(payload.error || 'Falha ao carregar distribuição de círculos.'));

    res.setHeader('X-EAC-Endpoint', 'circulos-distribuidos');
    res.setHeader('X-EAC-Backend', 'supabase');
    return res.status(200).json(payload);
  } catch (error: any) {
    return sendError(res, 500, error?.message || 'Erro interno.');
  }
}
