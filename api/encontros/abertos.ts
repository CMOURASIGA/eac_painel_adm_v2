import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';

const ALLOWED_STATUS = new Set(['ATIVO', 'PLANEJADO']);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return sendError(res, 500, 'Supabase nao configurado.');
    }

    const table = toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';

    const { data, error } = await supabase
      .from(table)
      .select('id,nome,numero,data_inicio,data_fim,status')
      .in('status', Array.from(ALLOWED_STATUS))
      .order('data_inicio', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[api/encontros/abertos] erro supabase:', error);
      return sendError(res, 502, 'ERRO_LISTAR_ENCONTROS', 'Nao foi possivel carregar os encontros disponiveis.');
    }

    const encontros = Array.isArray(data) ? data : [];
    res.setHeader('X-EAC-Source', 'supabase');
    return res.status(200).json({ success: true, message: 'Encontros carregados com sucesso.', data: encontros, encontros });
  } catch (e: any) {
    console.error('[api/encontros/abertos] falha:', e);
    return sendError(res, 500, 'Erro interno.');
  }
}
