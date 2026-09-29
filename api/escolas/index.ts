import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  }

  const busca = clean(req.query.busca).slice(0, 100);
  if (busca.length < 2) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' });
    }

    const { data, error } = await supabase
      .from('escolas')
      .select('id,nome,rede,bairro')
      .eq('ativo', true)
      .eq('municipio', 'Niterói')
      .eq('uf', 'RJ')
      .ilike('nome', `%${busca}%`)
      .order('nome', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[api/escolas] falha ao pesquisar:', error);
      return res.status(502).json({ success: false, error: 'SCHOOLS_LOOKUP_FAILED', message: 'Não foi possível pesquisar as escolas agora.' });
    }

    return res.status(200).json({ success: true, data: data ?? [] });
  } catch (e: any) {
    console.error('[api/escolas] falha:', e);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}
