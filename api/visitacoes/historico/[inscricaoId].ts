import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../../utils/supabaseServer.js';
import { getVisitacaoHistorico } from '../../../services/visitacaoBusinessService.ts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido.' });
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase nao configurado.' });

    const inscricaoId = String(req.query?.inscricaoId || '').trim();
    const result = await getVisitacaoHistorico(supabase, inscricaoId);
    return res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/visitacoes/historico/:inscricaoId] falha:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno.' });
  }
}
