import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../../utils/supabaseServer.js';

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const telefone = String(body?.telefone || '').trim();
    const nome = String(body?.nome || '').trim();
    const circulo = String(body?.circulo || '').trim();
    const tipoEvento = String(body?.tipoEvento || '').trim();
    const origemPublico = String(body?.origemPublico || '').trim();

    if (!telefone) {
      return send(res, 400, { success: false, error: 'Telefone e obrigatorio.' });
    }

    const supa = await handleSupabaseAction('MARK_PRESENCE', {
      telefone,
      nome,
      circulo,
      tipoEvento,
      origemPublico,
    });
    if (!supa.ok) {
      return send(res, isSupabaseConfigured() ? 502 : 500, {
        success: false,
        error: supa.error || 'Falha ao registrar presenca.',
      });
    }

    return send(res, 200, {
      ...(supa.data || {}),
      success: true,
      message: (supa.data as any)?.message || 'Presenca registrada com sucesso.',
    });
  } catch (error: any) {
    return send(res, 500, { success: false, error: error?.message || 'Erro interno.' });
  }
}
