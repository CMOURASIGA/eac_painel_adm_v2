import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import { executeInscricoesAdminList } from '../../utils/inscricoesAdmin.js';
import { executeAlterarStatusInscricao, executeAtualizarCadastroInscricao, executeExcluirInscricao } from '../../utils/inscricoesStatus.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const result = await executeInscricoesAdminList({
        supabase: getSupabaseServerClient(),
        query: req.query as Record<string, any>,
      });

      return res.status(result.status).json(result.body);
    } catch (e: any) {
      console.error('[api/inscricoes/admin] falha:', e);
      return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const body = req.body ?? {};
      const result = String(body?.action || '').trim().toUpperCase() === 'UPDATE_RECORD'
        ? await executeAtualizarCadastroInscricao({
            supabase: getSupabaseServerClient(),
            body,
          })
        : await executeAlterarStatusInscricao({
            supabase: getSupabaseServerClient(),
            body,
          });

      return res.status(result.status).json(result.body);
    } catch (e: any) {
      console.error('[api/inscricoes/admin/status] falha:', e);
      return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const result = await executeExcluirInscricao({
        supabase: getSupabaseServerClient(),
        body: req.body ?? {},
      });

      return res.status(result.status).json(result.body);
    } catch (e: any) {
      console.error('[api/inscricoes/admin/delete] falha:', e);
      return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
    }
  }

  return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
}
