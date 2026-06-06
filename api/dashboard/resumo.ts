import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../utils/supabaseServer.js';

type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;
const STATUS_PRIORITY: Record<string, number> = {
  CONFIRMADO: 70,
  FILA: 60,
  PRIORIZADO: 50,
  EM_ANALISE: 40,
  INSCRITO: 30,
  NAO_SELECIONADO: 20,
  DESISTENTE: 10,
  CANCELADO: 0,
};

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

function getStatusPriority(status: any) {
  return STATUS_PRIORITY[String(status || '').trim().toUpperCase()] ?? -1;
}

function pickBestInscricaoRow(current: any, candidate: any) {
  if (!current) return candidate;

  const currentPriority = getStatusPriority(current?.status);
  const candidatePriority = getStatusPriority(candidate?.status);
  if (candidatePriority > currentPriority) return candidate;
  if (candidatePriority < currentPriority) return current;

  const currentDate = new Date(String(current?.data_inscricao || 0));
  const candidateDate = new Date(String(candidate?.data_inscricao || 0));
  const currentTime = Number.isNaN(currentDate.getTime()) ? 0 : currentDate.getTime();
  const candidateTime = Number.isNaN(candidateDate.getTime()) ? 0 : candidateDate.getTime();

  return candidateTime > currentTime ? candidate : current;
}

async function fetchCadastroOficialCount(supabase: AnySupabaseClient | null) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('cadastro_oficial')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true);
  if (error) return 0;
  return Number(count || 0);
}

async function fetchEncontreirosCount(supabase: AnySupabaseClient | null) {
  if (!supabase) return 0;

  const primary = await supabase.from('encontreiros').select('*', { count: 'exact', head: true });
  if (!primary.error) return Number(primary.count || 0);

  const fallback = await supabase.from('vw_encontreiros').select('*', { count: 'exact', head: true });
  if (!fallback.error) return Number(fallback.count || 0);

  return 0;
}

async function fetchTriagemRowsByStatus(supabase: AnySupabaseClient | null) {
  const empty = { INSCRITO: [] as any[], PRIORIZADO: [] as any[], CONFIRMADO: [] as any[] };
  if (!supabase) return empty;

  const { data: inscricoes, error: inscricoesError } = await supabase
    .from('inscricoes')
    .select('id,status,adolescente_id,data_inscricao,criado_em')
    .order('data_inscricao', { ascending: false });
  if (inscricoesError) return empty;

  const bestByAdolescente = new Map<string, any>();
  for (const row of inscricoes || []) {
    const adolescenteId = String(row?.adolescente_id || '').trim();
    const key = adolescenteId || `inscricao:${String(row?.id || '').trim()}`;
    bestByAdolescente.set(key, pickBestInscricaoRow(bestByAdolescente.get(key), row));
  }

  const consolidatedRows = Array.from(bestByAdolescente.values());
  const adolescenteIds = consolidatedRows.map((row: any) => String(row?.adolescente_id || '')).filter(Boolean);

  const { data: adolescentes } = adolescenteIds.length
    ? await supabase.from('adolescentes').select('id,pessoa_id').in('id', adolescenteIds)
    : ({ data: [] } as any);

  const pessoaIds = (adolescentes || []).map((row: any) => String(row?.pessoa_id || '')).filter(Boolean);
  const { data: pessoas } = pessoaIds.length
    ? await supabase.from('pessoas').select('id,idade_calculada').in('id', pessoaIds)
    : ({ data: [] } as any);

  const adolescenteToPessoa = new Map((adolescentes || []).map((row: any) => [String(row.id), String(row.pessoa_id || '')]));
  const pessoaToIdade = new Map((pessoas || []).map((row: any) => [String(row.id), Number(row.idade_calculada)]));

  consolidatedRows.forEach((row: any) => {
    const status = String(row?.status || '').trim().toUpperCase();
    if (status !== 'INSCRITO' && status !== 'PRIORIZADO' && status !== 'CONFIRMADO') return;
    const pessoaId = adolescenteToPessoa.get(String(row?.adolescente_id || '')) || '';
    empty[status as 'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO'].push({
      ...row,
      idade_calculada: pessoaToIdade.get(pessoaId) ?? null,
    });
  });

  return empty;
}

function buildAgeDistributionByStatus(data: Record<'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO', any[]>) {
  const maps: Record<'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO', Record<string, number>> = {
    INSCRITO: {},
    PRIORIZADO: {},
    CONFIRMADO: {},
  };
  (Object.keys(data) as Array<'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO'>).forEach((status) => {
    data[status].forEach((row: any) => {
      const ageNum = Number(row?.idade_calculada);
      if (!Number.isFinite(ageNum) || ageNum < 0) return;
      const age = String(Math.floor(ageNum));
      maps[status][age] = (maps[status][age] || 0) + 1;
    });
  });
  return maps;
}

function buildMonthlyCurrentYear(data: Record<'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO', any[]>) {
  const now = new Date();
  const year = now.getFullYear();
  const monthLimit = now.getMonth();
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const counts = new Array(12).fill(0);

  const allRows = [...data.INSCRITO, ...data.PRIORIZADO, ...data.CONFIRMADO];
  allRows.forEach((row: any) => {
    const raw = String(row?.data_inscricao || '').trim();
    if (!raw) return;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return;
    if (dt.getFullYear() !== year) return;
    const m = dt.getMonth();
    if (m >= 0 && m <= monthLimit) counts[m] += 1;
  });

  return months
    .map((mes, idx) => ({ mes, mesIndex: idx + 1, total: idx <= monthLimit ? counts[idx] : 0 }))
    .filter((item) => item.mesIndex - 1 <= monthLimit);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const supabase = getSupabaseServerClient();
    const [membersCount, nonRes, eventsRes, logsRes, comRes, encontreirosCount, triagemRowsByStatus] = await Promise.all([
      fetchCadastroOficialCount(supabase),
      handleSupabaseAction('GET_NON_ENROLLED', {}),
      handleSupabaseAction('GET_EVENTS', {}),
      handleSupabaseAction('GET_LOGS', {}),
      handleSupabaseAction('GET_COMUNICADOS', {}),
      fetchEncontreirosCount(supabase),
      fetchTriagemRowsByStatus(supabase),
    ]);

    if (!nonRes.ok || !eventsRes.ok || !logsRes.ok || !comRes.ok) {
      const firstError = (!nonRes.ok && nonRes.error)
        || (!eventsRes.ok && eventsRes.error)
        || (!logsRes.ok && logsRes.error)
        || (!comRes.ok && comRes.error)
        || 'Falha ao montar resumo do dashboard.';
      return sendError(res, isSupabaseConfigured() ? 502 : 500, String(firstError));
    }

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
        membersCount,
        nonEnrolledCount: nonEnrolled.length,
        nonEnrolledIndicators: indicators,
        eventsCount: events.length,
        logsCount: logs.length,
        comunicadosCount: comunicados.length,
        encontreirosCount,
        triagemStatusCounts: {
          inscrito: triagemRowsByStatus.INSCRITO.length,
          priorizado: triagemRowsByStatus.PRIORIZADO.length,
          confirmado: triagemRowsByStatus.CONFIRMADO.length,
        },
        ageDistributionByStatus: buildAgeDistributionByStatus(triagemRowsByStatus),
        monthlyInscricoesCurrentYear: buildMonthlyCurrentYear(triagemRowsByStatus),
      },
    });
  } catch (e: any) {
    console.error('[api/dashboard/resumo] falha:', e);
    return sendError(res, 500, e?.message || 'Erro interno.');
  }
}

