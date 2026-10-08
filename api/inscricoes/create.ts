import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import { executeInscricaoCreate } from '../../utils/inscricaoCreate.js';
import { getInscricaoConfirmation, confirmInscricaoByResponsavel } from '../../utils/inscricaoConfirm.js';

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET' && clean(req.query.resource).toLowerCase() === 'confirmacao') {
    const token = clean(req.query.token);
    if (!token) {
      return res.status(400).json({ success: false, error: 'TOKEN_OBRIGATORIO', message: 'Link de confirmação inválido.' });
    }
    const supabase = getSupabaseServerClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' });
    const result = await getInscricaoConfirmation(supabase, token);
    return res.status(result.status).json(result.body);
  }

  if (req.method === 'GET' && clean(req.query.resource).toLowerCase() === 'escolas') {
    const busca = clean(req.query.busca).slice(0, 100);
    if (busca.length < 2) return res.status(200).json({ success: true, data: [] });

    try {
      const supabase = getSupabaseServerClient();
      if (!supabase) return res.status(500).json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' });

      const { data, error } = await supabase
        .from('escolas')
        .select('id,codigo_inep,nome,rede,bairro')
        .eq('ativo', true)
        .eq('municipio', 'Niterói')
        .eq('uf', 'RJ')
        .ilike('nome', `%${busca}%`)
        .order('nome', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[api/inscricoes/create] falha ao pesquisar escolas:', error);
        return res.status(502).json({ success: false, error: 'SCHOOLS_LOOKUP_FAILED', message: 'Não foi possível pesquisar as escolas agora.' });
      }
      // Unidades distintas podem ter o mesmo nome comercial.
      // Mantemos cada id separado mesmo quando nome e bairro coincidirem.
      const escolasOrdenadas = [...(data ?? [])]
        .sort((a: any, b: any) => {
          const nomeCmp = clean(a?.nome).localeCompare(clean(b?.nome), 'pt-BR');
          if (nomeCmp !== 0) return nomeCmp;
          return clean(a?.bairro).localeCompare(clean(b?.bairro), 'pt-BR');
        })
        .slice(0, 30);

      return res.status(200).json({ success: true, data: escolasOrdenadas });
    } catch (e: any) {
      console.error('[api/inscricoes/create] falha ao pesquisar escolas:', e);
      return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  }

  try {
    const body = req.body ?? {};
    if (clean(body?.action).toLowerCase() === 'confirmar_responsavel') {
      const token = clean(body?.token);
      if (!token) {
        return res.status(400).json({ success: false, error: 'TOKEN_OBRIGATORIO', message: 'Link de confirmação inválido.' });
      }
      const supabase = getSupabaseServerClient();
      if (!supabase) return res.status(500).json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' });
      const result = await confirmInscricaoByResponsavel(
        supabase,
        token,
        body?.respostas && typeof body.respostas === 'object' ? body.respostas : {},
      );
      return res.status(result.status).json(result.body);
    }

    const result = await executeInscricaoCreate({
      supabase: getSupabaseServerClient(),
      body,
    });

    return res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[api/inscricoes/create] falha:', e);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}
