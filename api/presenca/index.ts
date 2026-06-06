import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../../utils/supabaseServer.js';

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  const supa = await handleSupabaseAction('GET_PRESENCE', {});
  if (!supa.ok) {
    return send(res, isSupabaseConfigured() ? 502 : 500, {
      success: false,
      error: supa.error || 'Falha ao consultar presenca.',
    });
  }

  res.setHeader('X-EAC-Backend', 'supabase');
  res.setHeader('X-EAC-Endpoint', 'presenca');
  return send(res, 200, supa.data);
}
