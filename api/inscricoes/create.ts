import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import { executeInscricaoCreate } from '../../utils/inscricaoCreate.js';

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      // Mantemos cada unidade para que o usuário escolha pelo bairro.
      // Quando o bairro não estiver disponível, o código INEP serve como
      // identificador complementar da unidade.
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
