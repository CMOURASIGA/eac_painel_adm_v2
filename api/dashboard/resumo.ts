import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.ts';
import { isSupabaseConfigured } from '../../utils/supabaseServer.ts';

const clean = (v: any) => String(v ?? '').trim().toLowerCase();
const isYes = (v: any) => ['sim', 's', 'yes', 'y', 'true', '1', 'verdadeiro', 'x'].includes(clean(v));
const isNo = (v: any) => ['nao', 'não', 'n', 'no', 'false', '0', 'falso'].includes(clean(v));

const pick = (row: any, keys: string[]) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

function buildNonEnrolledIndicators(list: any[]) {
  let interesseCount = 0;
  let interesseNoCount = 0;
  let preConfirmadasCount = 0;

  for (const row of list) {
    const interesse = pick(row, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
    const preConfirmacao = pick(row, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']);

    if (isYes(interesse)) interesseCount += 1;
    if (isNo(interesse)) interesseNoCount += 1;
    if (clean(interesse) === 'sim' && String(preConfirmacao ?? '').trim() !== '') preConfirmadasCount += 1;
  }

  return { preConfirmadasCount, interesseCount, interesseNoCount };
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const [membersRes, nonRes, eventsRes, logsRes, comRes] = await Promise.all([
      handleSupabaseAction('GET_MEMBERS', {}),
      handleSupabaseAction('GET_NON_ENROLLED', {}),
      handleSupabaseAction('GET_EVENTS', {}),
      handleSupabaseAction('GET_LOGS', {}),
      handleSupabaseAction('GET_COMUNICADOS', {}),
    ]);

    if (!membersRes.ok || !nonRes.ok || !eventsRes.ok || !logsRes.ok || !comRes.ok) {
      const firstError = (!membersRes.ok && membersRes.error)
        || (!nonRes.ok && nonRes.error)
        || (!eventsRes.ok && eventsRes.error)
        || (!logsRes.ok && logsRes.error)
        || (!comRes.ok && comRes.error)
        || 'Falha ao montar resumo do dashboard.';
      return sendError(res, isSupabaseConfigured() ? 502 : 500, String(firstError));
    }

    const members = Array.isArray((membersRes.data as any)?.members) ? (membersRes.data as any).members : [];
    const nonEnrolled = Array.isArray((nonRes.data as any)?.nonEnrolled) ? (nonRes.data as any).nonEnrolled : [];
    const events = Array.isArray((eventsRes.data as any)?.events) ? (eventsRes.data as any).events : [];
    const logs = Array.isArray((logsRes.data as any)?.logs) ? (logsRes.data as any).logs : [];
    const comunicados = Array.isArray((comRes.data as any)?.comunicados) ? (comRes.data as any).comunicados : [];

    const indicators = buildNonEnrolledIndicators(nonEnrolled);

    res.setHeader('X-EAC-Backend', 'supabase');
    res.setHeader('X-EAC-Endpoint', 'dashboard/resumo');
    return res.status(200).json({
      success: true,
      source: 'supabase',
      message: 'Resumo do dashboard carregado com sucesso.',
      summary: {
        membersCount: members.length,
        nonEnrolledCount: nonEnrolled.length,
        nonEnrolledIndicators: indicators,
        eventsCount: events.length,
        logsCount: logs.length,
        comunicadosCount: comunicados.length,
      },
    });
  } catch (e: any) {
    console.error('[api/dashboard/resumo] falha:', e);
    return sendError(res, 500, e?.message || 'Erro interno.');
  }
}
