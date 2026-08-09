import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../../utils/supabaseServer.js';
import { executeInscricoesAdminList } from '../../../utils/inscricoesAdmin.js';
import { executeAlterarStatusInscricao, executeAtualizarCadastroInscricao, executeExcluirInscricao, executeFechamentoLoteEncontro } from '../../../utils/inscricoesStatus.js';

// Consolida api/inscricoes/admin.ts e api/inscricoes/admin/lote.ts num
// unico Serverless Function (catch-all opcional [[...slug]]) para caber
// no teto de 12 funcoes do plano Hobby da Vercel. As URLs publicas
// continuam identicas:
//   GET/PATCH/DELETE /api/inscricoes/admin
//   POST             /api/inscricoes/admin/lote

async function handleAdminBase(req: NextApiRequest, res: NextApiResponse) {
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

async function handleAdminLote(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  }

  try {
    const result = await executeFechamentoLoteEncontro({
      supabase: getSupabaseServerClient(),
      body: req.body ?? {},
    });

    return res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/inscricoes/admin/lote] falha:', e);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slugParam = req.query?.slug;
  const slug = Array.isArray(slugParam) ? slugParam : (slugParam ? [String(slugParam)] : []);

  if (slug.length === 0) return handleAdminBase(req, res);
  if (slug.length === 1 && slug[0] === 'lote') return handleAdminLote(req, res);

  return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Rota nao encontrada.' });
}
