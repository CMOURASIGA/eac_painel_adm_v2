import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../utils/supabaseServer.js';
import { getVisitacaoHistorico, listVisitacoes, registerVisitacao, validateVisitacaoFormToken } from '../services/visitacaoBusinessService.ts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase nao configurado.' });

    if (req.method === 'GET') {
      const action = String(req.query?.action || '').trim().toLowerCase();
      if (action === 'history') {
        const inscricaoId = String(req.query?.inscricaoId || '').trim();
        const result = await getVisitacaoHistorico(supabase, inscricaoId);
        return res.status(result.status).json(result.body);
      }

      const publicMode = String(req.query?.public || '').trim() === '1';
      if (publicMode) {
        const validation = validateVisitacaoFormToken(String(req.query?.token || ''));
        if (!validation.ok) {
          return res.status(401).json({ success: false, error: validation.error });
        }
      }

      const result = await listVisitacoes(supabase, req.query as Record<string, any>);
      return res.status(200).json({ success: true, ...result });
    }

    if (req.method === 'POST') {
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
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido.' });
  } catch (e: any) {
    console.error('[api/visitacoes] falha:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno.' });
  }
}
