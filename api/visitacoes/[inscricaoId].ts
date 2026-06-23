import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import { registerVisitacao, validateVisitacaoFormToken } from '../../services/visitacaoBusinessService.ts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido.' });
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase nao configurado.' });

    const inscricaoId = String(req.query?.inscricaoId || '').trim();
    const body = req.body ?? {};
    const origem = String(body?.origem_registro || '').trim().toUpperCase();
    const token = String(body?.token || '').trim();
    const requiresToken = Boolean(token) || origem.includes('FORM');

    if (requiresToken) {
      const validation = validateVisitacaoFormToken(token);
      if (!validation.ok) {
        return res.status(401).json({ success: false, error: validation.error });
      }
    }

    const result = await registerVisitacao(supabase, inscricaoId, body);
    return res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/visitacoes/:inscricaoId] falha:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno.' });
  }
}
