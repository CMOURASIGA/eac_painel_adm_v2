import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import { executeInscricaoCreate } from '../../utils/inscricaoCreate.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  }

  try {
    const result = await executeInscricaoCreate({
      supabase: getSupabaseServerClient(),
      body: req.body ?? {},
    });

    return res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/inscricoes/create] falha:', e);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}
