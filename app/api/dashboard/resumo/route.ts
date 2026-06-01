import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../../utils/supabaseServer';
import { executeInscricoesAdminList } from '../../../../utils/inscricoesAdmin';

export const dynamic = 'force-dynamic';

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

async function fetchInscricoesByStatus(status: 'INSCRITO' | 'PRIORIZADO' | 'CONFIRMADO') {
  const supabase = getSupabaseServerClient();
  const first = await executeInscricoesAdminList({ supabase, query: { status, page: 1, page_size: 100 } });
  if (first.status !== 200 || !first.body?.success) return { rows: [] as any[], total: 0 };

  const rows = Array.isArray(first.body.data) ? [...first.body.data] : [];
  const totalPages = Number(first.body?.pagination?.total_pages) || 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await executeInscricoesAdminList({ supabase, query: { status, page, page_size: 100 } });
    if (next.status !== 200 || !next.body?.success) break;
    rows.push(...(Array.isArray(next.body.data) ? next.body.data : []));
  }
  return { rows, total: rows.length };
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
    const raw = String(row?.data_inscricao || row?.criado_em || '').trim();
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

export async function GET() {
  const [membersRes, nonRes, eventsRes, logsRes, comRes, encontreirosRes, inscritosRes, priorizadosRes, confirmadosRes] = await Promise.all([
    handleSupabaseAction('GET_MEMBERS', {}),
    handleSupabaseAction('GET_NON_ENROLLED', {}),
    handleSupabaseAction('GET_EVENTS', {}),
    handleSupabaseAction('GET_LOGS', {}),
    handleSupabaseAction('GET_COMUNICADOS', {}),
    handleSupabaseAction('GET_ENCONTREIROS', {}),
    fetchInscricoesByStatus('INSCRITO'),
    fetchInscricoesByStatus('PRIORIZADO'),
    fetchInscricoesByStatus('CONFIRMADO'),
  ]);

  if (!membersRes.ok || !nonRes.ok || !eventsRes.ok || !logsRes.ok || !comRes.ok || !encontreirosRes.ok) {
    const firstError =
      (!membersRes.ok && membersRes.error) ||
      (!nonRes.ok && nonRes.error) ||
      (!eventsRes.ok && eventsRes.error) ||
      (!logsRes.ok && logsRes.error) ||
      (!comRes.ok && comRes.error) ||
      (!encontreirosRes.ok && encontreirosRes.error) ||
      'Falha ao montar resumo do dashboard.';

    return NextResponse.json(
      { success: false, error: String(firstError), message: String(firstError) },
      { status: isSupabaseConfigured() ? 502 : 500 }
    );
  }

  const members = Array.isArray((membersRes.data as any)?.members) ? (membersRes.data as any).members : [];
  const nonEnrolled = Array.isArray((nonRes.data as any)?.nonEnrolled) ? (nonRes.data as any).nonEnrolled : [];
  const events = Array.isArray((eventsRes.data as any)?.events) ? (eventsRes.data as any).events : [];
  const logs = Array.isArray((logsRes.data as any)?.logs) ? (logsRes.data as any).logs : [];
  const comunicados = Array.isArray((comRes.data as any)?.comunicados) ? (comRes.data as any).comunicados : [];
  const encontreiros = Array.isArray((encontreirosRes.data as any)?.encontreiros) ? (encontreirosRes.data as any).encontreiros : [];

  const triagemRowsByStatus = {
    INSCRITO: inscritosRes.rows,
    PRIORIZADO: priorizadosRes.rows,
    CONFIRMADO: confirmadosRes.rows,
  } as const;

  const response = NextResponse.json(
    {
      success: true,
      source: 'supabase',
      message: 'Resumo do dashboard carregado com sucesso.',
      summary: {
        membersCount: members.length,
        nonEnrolledCount: nonEnrolled.length,
        nonEnrolledIndicators: buildNonEnrolledIndicators(nonEnrolled),
        eventsCount: events.length,
        logsCount: logs.length,
        comunicadosCount: comunicados.length,
        encontreirosCount: encontreiros.length,
        triagemStatusCounts: {
          inscrito: inscritosRes.total,
          priorizado: priorizadosRes.total,
          confirmado: confirmadosRes.total,
        },
        ageDistributionByStatus: buildAgeDistributionByStatus(triagemRowsByStatus),
        monthlyInscricoesCurrentYear: buildMonthlyCurrentYear(triagemRowsByStatus),
      },
    },
    { status: 200 }
  );

  response.headers.set('X-EAC-Backend', 'supabase');
  response.headers.set('X-EAC-Endpoint', 'dashboard/resumo');
  return response;
}
