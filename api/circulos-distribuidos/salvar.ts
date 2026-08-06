import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido.' });
  try {
    const result = await handleSupabaseAction('SAVE_CIRCULOS_DISTRIBUICAO_OFICIAL', req.body || {});
    if (!result.ok || !(result.data as any)?.success) {
      return res.status(422).json({ success: false, error: result.ok ? (result.data as any)?.error || 'Não foi possível salvar a distribuição oficial.' : result.error || 'Não foi possível salvar a distribuição oficial.', details: result.details });
    }
    res.setHeader('X-EAC-Endpoint', 'circulos-distribuidos/salvar');
    res.setHeader('X-EAC-Backend', 'supabase');
    return res.status(200).json(result.data);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno ao salvar a distribuição oficial.' });
  }
}
