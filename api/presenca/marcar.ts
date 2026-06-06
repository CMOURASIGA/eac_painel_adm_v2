import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../../utils/supabaseServer.js';
import { authorizeRequest } from '../../utils/apiAuth.js';

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

function toRequest(req: NextApiRequest) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, String(item)));
      return;
    }
    if (value !== undefined) headers.set(key, String(value));
  });
  return new Request('http://localhost/api/presenca/marcar', {
    method: req.method || 'POST',
    headers,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  try {
    const auth = await authorizeRequest(toRequest(req), { module: 'presence', action: 'edit' });
    if (!auth.ok) return send(res, auth.status, auth.body);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const telefone = String(body?.telefone || '').trim();
    const nome = String(body?.nome || '').trim();
    const circulo = String(body?.circulo || '').trim();

    if (!telefone) {
      return send(res, 400, { success: false, error: 'Telefone e obrigatorio.' });
    }

    const supa = await handleSupabaseAction('MARK_PRESENCE', { telefone, nome, circulo });
    if (!supa.ok) {
      return send(res, isSupabaseConfigured() ? 502 : 500, {
        success: false,
        error: supa.error || 'Falha ao registrar presenca.',
      });
    }

    res.setHeader('X-EAC-Backend', 'supabase');
    res.setHeader('X-EAC-Endpoint', 'presenca/marcar');
    return send(res, 200, supa.data);
  } catch (error: any) {
    return send(res, 500, { success: false, error: error?.message || 'Erro interno.' });
  }
}
