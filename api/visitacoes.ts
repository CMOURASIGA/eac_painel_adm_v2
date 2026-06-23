import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../utils/supabaseServer.js';
import { listVisitacoes, validateVisitacaoFormToken } from '../services/visitacaoBusinessService.ts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido.' });
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase nao configurado.' });

    const publicMode = String(req.query?.public || '').trim() === '1';
    if (publicMode) {
      const validation = validateVisitacaoFormToken(String(req.query?.token || ''));
      if (!validation.ok) {
        return res.status(401).json({ success: false, error: validation.error });
      }
    }

    const result = await listVisitacoes(supabase, req.query as Record<string, any>);
    return res.status(200).json({ success: true, ...result });
  } catch (e: any) {
    console.error('[api/visitacoes] falha:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno.' });
  }
}
