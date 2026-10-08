import type { SupabaseClient } from '@supabase/supabase-js';

type AnyObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

type ExecResult = {
  status: number;
  body: AnyObject;
};

const STATUS_ALLOWED = new Set([
  'INSCRITO',
  'EM_ANALISE',
  'PRIORIZADO',
  'FILA',
  'CONFIRMADO',
  'NAO_SELECIONADO',
  'DESISTENTE',
  'CANCELADO',
  'AGUARDANDO_RESPONSAVEL',
]);

const ORIGEM_ALLOWED = new Set(['SISTEMA', 'PLANILHA']);
const TRIAGEM_IDADE_MAXIMA = 17;
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

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function normalizeTriagemStatusAlias(value: any) {
  const normalized = toCleanString(value).toUpperCase();
  return normalized === 'ENCONTREIRO' ? 'CONFIRMADO' : normalized;
}

function normalizeSearchText(value: any) {
  return toCleanString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: any) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizarTelefoneBusca(value: string): string | null {
  const digits = normalizeDigits(value);
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function parseIntSafe(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function addOneDayIso(dateYmd: string) {
  const m = String(dateYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString();
}

function extractDateYmd(value: any) {
  const raw = toCleanString(value);
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function getSaoPauloTodayYmd() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function saoPauloDayStartIso(dateYmd: string) {
  return dateYmd ? `${dateYmd}T03:00:00.000Z` : '';
}

function formatEncontroCycleName(encontro: any) {
  const numero = toCleanString(encontro?.numero);
  if (numero) return `EAC${numero}`;
  return toCleanString(encontro?.nome) || 'EAC';
}

async function getCicloNovasInscricoes(supabase: AnySupabaseClient) {
  const { data, error } = await supabase
    .from('encontros')
    .select('id,nome,numero,data_inicio,data_fim,status')
    .order('data_inicio', { ascending: true });

  if (error) throw error;

  const todayYmd = getSaoPauloTodayYmd();
  const encontros = (Array.isArray(data) ? data : [])
    .map((encontro: any) => ({
      ...encontro,
      inicioYmd: extractDateYmd(encontro?.data_inicio),
      fimYmd: extractDateYmd(encontro?.data_fim) || extractDateYmd(encontro?.data_inicio),
    }))
    .filter((encontro: any) => encontro.inicioYmd);

  const realizados = encontros.filter((encontro: any) => encontro.fimYmd && encontro.fimYmd < todayYmd);
  const ultimo = realizados.length
    ? realizados.reduce((best: any, atual: any) => (!best || atual.fimYmd > best.fimYmd ? atual : best), null)
    : null;

  if (!ultimo) {
    return {
      disponivel: false,
      inicio_iso: '',
      fim_iso_exclusivo: '',
      ultimo_encontro_id: null,
      ultimo_encontro_nome: null,
      proximo_encontro_id: null,
      proximo_encontro_nome: null,
      label: 'Ciclo indisponível',
    };
  }

  const proximo = encontros
    .filter((encontro: any) => encontro.inicioYmd > todayYmd)
    .sort((a: any, b: any) => a.inicioYmd.localeCompare(b.inicioYmd))[0] || null;

  const inicioDia = addOneDayIso(ultimo.fimYmd)?.slice(0, 10) || '';
  const inicioIso = saoPauloDayStartIso(inicioDia);
  const fimIsoExclusivo = proximo ? saoPauloDayStartIso(proximo.inicioYmd) : '';

  return {
    disponivel: Boolean(inicioIso),
    inicio_iso: inicioIso,
    fim_iso_exclusivo: fimIsoExclusivo,
    ultimo_encontro_id: ultimo.id ?? null,
    ultimo_encontro_nome: formatEncontroCycleName(ultimo),
    proximo_encontro_id: proximo?.id ?? null,
    proximo_encontro_nome: proximo ? formatEncontroCycleName(proximo) : null,
    label: proximo
      ? `${formatEncontroCycleName(ultimo)} → ${formatEncontroCycleName(proximo)}`
      : `Desde ${formatEncontroCycleName(ultimo)}`,
  };
}

function isInscricaoNoCiclo(row: any, ciclo: any) {
  if (!ciclo?.disponivel || !ciclo?.inicio_iso) return false;
  const dt = new Date(toCleanString(row?.data_inscricao));
  if (Number.isNaN(dt.getTime())) return false;
  const time = dt.getTime();
  const inicio = new Date(ciclo.inicio_iso).getTime();
  if (time < inicio) return false;
  if (ciclo.fim_iso_exclusivo) {
    const fim = new Date(ciclo.fim_iso_exclusivo).getTime();
    if (time >= fim) return false;
  }
  return true;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getStatusPriority(status: any) {
  const key = toCleanString(status).toUpperCase();
  return STATUS_PRIORITY[key] ?? -1;
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

function consolidarInscricoesPorAdolescente(rows: any[]) {
  const bestByAdolescente = new Map<string, any>();

  for (const row of rows) {
    const adolescenteId = toCleanString(row?.adolescente_id);
    const key = adolescenteId || `inscricao:${toCleanString(row?.id)}`;
    bestByAdolescente.set(key, pickBestInscricaoRow(bestByAdolescente.get(key), row));
  }

  return Array.from(bestByAdolescente.values());
}

function intersectIfNeeded(base: string[] | null, target: string[] | null) {
  if (base === null) return target;
  if (target === null) return base;
  const targetSet = new Set(target);
  return base.filter((id) => targetSet.has(id));
}

async function adolescentesByPessoaIds(supabase: AnySupabaseClient, pessoaIds: string[]) {
  if (pessoaIds.length === 0) return [] as Array<{ id: string; pessoa_id: string }>;
  const batchSize = 150;
  const rows: Array<{ id: string; pessoa_id: string }> = [];

  for (let i = 0; i < pessoaIds.length; i += batchSize) {
    const chunk = pessoaIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('adolescentes')
      .select('id,pessoa_id')
      .in('pessoa_id', chunk);
    if (error) throw error;
    if (Array.isArray(data)) rows.push(...data);
  }

  return rows;
}

async function excluirAdolescentesJaEncontreiros(
  supabase: AnySupabaseClient,
  adolescenteIds: string[]
) {
  try {
    const baseIds = uniq(adolescenteIds.map((x) => String(x || '')).filter(Boolean));
    if (baseIds.length === 0) return [] as string[];

    const { data: adolescentes, error: adolescentesError } = await supabase
      .from('adolescentes')
      .select('id,pessoa_id')
      .in('id', baseIds);
    if (adolescentesError) throw adolescentesError;

    const pessoaIds = uniq((adolescentes ?? []).map((a: any) => String(a.pessoa_id || '')).filter(Boolean));
    if (pessoaIds.length === 0) return baseIds;

    const { data: papeis, error: papeisError } = await supabase
      .from('pessoa_papeis')
      .select('pessoa_id,papel,ativo')
      .in('pessoa_id', pessoaIds);
    if (papeisError) throw papeisError;

    const pessoasEncontreiros = new Set(
      (papeis ?? [])
        .filter((p: any) => String(p?.papel || '').trim().toUpperCase() === 'ENCONTREIRO' && p?.ativo !== false)
        .map((p: any) => String(p?.pessoa_id || ''))
        .filter(Boolean)
    );

    if (pessoasEncontreiros.size === 0) return baseIds;

    const adolescentesExcluidos = new Set(
      (adolescentes ?? [])
        .filter((a: any) => pessoasEncontreiros.has(String(a?.pessoa_id || '')))
        .map((a: any) => String(a?.id || ''))
        .filter(Boolean)
    );

    return baseIds.filter((id) => !adolescentesExcluidos.has(id));
  } catch (e: any) {
    console.error('[inscricoes/admin] falha ao excluir ENCONTREIRO da triagem:', e?.message || e);
    return uniq(adolescenteIds.map((x) => String(x || '')).filter(Boolean));
  }
}

async function adolescenteIdsByResponsavelBusca(supabase: AnySupabaseClient, buscaText: string, buscaDigits: string) {
  if (!buscaText && !buscaDigits) return [] as string[];

  let q = supabase.from('responsaveis').select('id');
  if (buscaDigits) {
    q = q.ilike('telefone_normalizado', `%${buscaDigits}%`);
  }
  if (buscaText) {
    const nameOnly = normalizeSearchText(buscaText);
    const hasOnlyDigits = /^\d+$/.test(buscaText);
    if (!hasOnlyDigits && nameOnly) {
      q = q.ilike('nome', `%${nameOnly}%`);
    }
  }

  const { data: responsaveis, error: responsaveisError } = await q;
  console.log('[responsavelBusca] query result:', { count: responsaveis?.length }, 'error:', responsaveisError?.message);
  if (responsaveisError) throw responsaveisError;

  const responsavelIds = uniq((responsaveis ?? []).map((r: any) => String(r.id || '')));
  if (responsavelIds.length === 0) return [];

  const { data: vinculos, error: vinculosError } = await supabase
    .from('adolescente_responsaveis')
    .select('adolescente_id')
    .in('responsavel_id', responsavelIds);
  if (vinculosError) throw vinculosError;

  return uniq((vinculos ?? []).map((v: any) => String(v.adolescente_id || '')));
}

async function adolescenteIdsByPessoaFiltros(
  supabase: AnySupabaseClient,
  opts: {
    idadeMin?: number | null;
    idadeMax?: number | null;
    bairro?: string;
    sexo?: string;
    sexoNaoInformado?: boolean;
    buscaText?: string;
    buscaDigits?: string;
  }
) {
  const { idadeMin, idadeMax, bairro, sexo, sexoNaoInformado, buscaText, buscaDigits } = opts;

  console.log('[pessoaFiltros] buscaText:', buscaText, 'buscaDigits:', buscaDigits);

  const pessoas: any[] = [];
  const pageSize = 500;
  let from = 0;

  while (true) {
    let pessoasQuery = supabase
      .from('pessoas')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    // A Home e a triagem usam o critério funcional "ano atual - ano de nascimento".
    // Filtrar pela idade_calculada (idade exata) criava divergência perto do aniversário:
    // a Home exibia 18 anos, mas o drill-down não conseguia reproduzir o registro.
    const anoAtual = new Date().getFullYear();
    if (typeof idadeMax === 'number') {
      pessoasQuery = pessoasQuery.gte('data_nascimento', `${anoAtual - idadeMax}-01-01`);
    }
    if (typeof idadeMin === 'number') {
      pessoasQuery = pessoasQuery.lte('data_nascimento', `${anoAtual - idadeMin}-12-31`);
    }
    if (bairro) pessoasQuery = pessoasQuery.ilike('bairro', `%${bairro}%`);
    if (sexo) pessoasQuery = pessoasQuery.ilike('sexo', sexo);
    if (sexoNaoInformado) pessoasQuery = pessoasQuery.or('sexo.is.null,sexo.eq.');

  if (buscaDigits) {
    console.log('[pessoaFiltros] searching telefone_normalizado with:', buscaDigits);
    pessoasQuery = pessoasQuery.ilike('telefone_normalizado', `%${buscaDigits}%`);
  }
  if (buscaText) {
    const nameOnly = normalizeSearchText(buscaText);
    console.log('[pessoaFiltros] nameOnly:', nameOnly);
    if (nameOnly) {
      pessoasQuery = pessoasQuery.or(`nome_completo.ilike.%${nameOnly}%,nome_normalizado.ilike.%${nameOnly}%`);
    }
  }

    const { data, error: pessoasError } = await pessoasQuery;
    console.log('[pessoaFiltros] query result:', { count: data?.length, first: data?.[0], from }, 'error:', pessoasError?.message);
    if (pessoasError) throw pessoasError;

    const chunk = Array.isArray(data) ? data : [];
    pessoas.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const pessoaIds = uniq((pessoas ?? []).map((p: any) => String(p.id || '')));
  const adolescentes = await adolescentesByPessoaIds(supabase, pessoaIds);
  return uniq(adolescentes.map((a: any) => String(a.id || '')));
}

function buildInscricoesQuery(
  supabase: AnySupabaseClient,
  opts: {
    encontroId?: string;
    status?: string;
    origemDado?: string;
    dataInicio?: string;
    dataFim?: string;
    adolescenteIds?: string[] | null;
    withCount?: boolean;
    onlyStatus?: boolean;
  }
) {
  const { encontroId, status, origemDado, dataInicio, dataFim, adolescenteIds, withCount, onlyStatus } = opts;

  let q = supabase
    .from('inscricoes')
    .select(
      onlyStatus
        ? 'status'
        : 'id,status,origem_dado,criado_via_sistema,data_inscricao,criado_em,encontro_id,adolescente_id,tamanho_camisa,escola_id,escola_nome_outro,confirmacao_responsavel_enviada_em,confirmacao_responsavel_confirmada_em,confirmacao_responsavel_expira_em,termos_versao_snapshot,termos_respostas',
      withCount ? { count: 'exact' } : undefined
    );

  if (encontroId) q = q.eq('encontro_id', encontroId);
  if (status) q = q.eq('status', status);
  if (origemDado) q = q.eq('origem_dado', origemDado);
  if (dataInicio) q = q.gte('data_inscricao', dataInicio);

  if (dataFim) {
    const nextDay = addOneDayIso(dataFim);
    if (nextDay) q = q.lt('data_inscricao', nextDay);
  }

  if (Array.isArray(adolescenteIds)) {
    if (adolescenteIds.length === 0) {
      q = q.in('adolescente_id', ['__none__']);
    } else {
      q = q.in('adolescente_id', adolescenteIds);
    }
  }

  return q;
}

export async function executeInscricoesAdminList(params: {
  supabase: AnySupabaseClient | null;
  query: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, query } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const encontroId = toCleanString(query.encontro_id);
  const status = normalizeTriagemStatusAlias(query.status);
  const statusExcluir = uniq(
    toCleanString(query.status_excluir)
      .split(',')
      .map((s) => normalizeTriagemStatusAlias(s))
      .filter(Boolean)
  );
  const sexo = toCleanString(query.sexo).toUpperCase();
  const sexoNaoInformado = toCleanString(query.sexo_nao_informado).toLowerCase() === 'true';
  const origemDado = toCleanString(query.origem_dado).toUpperCase();
  const bairro = toCleanString(query.bairro);
  const dataInicio = toCleanString(query.data_inicio);
  const dataFim = toCleanString(query.data_fim);
  const busca = toCleanString(query.busca);
  const buscaDigits = normalizarTelefoneBusca(busca);
  const buscaText = busca;
  const applyTriagemRule = toCleanString(query.apply_triagem_rule).toLowerCase() === 'true';
  const novasInscricoesOnly = toCleanString(query.novas_inscricoes).toLowerCase() === 'true';
  console.log('[executeInscricoesAdminList] busca:', busca, 'buscaDigits:', buscaDigits);

  const page = Math.max(1, parseIntSafe(query.page, 1));
  const pageSize = Math.min(100, Math.max(1, parseIntSafe(query.page_size, 25)));
  const offset = (page - 1) * pageSize;

  const idadeMinRaw = toCleanString(query.idade_min);
  const idadeMaxRaw = toCleanString(query.idade_max);
  const idadeMin = idadeMinRaw ? parseIntSafe(idadeMinRaw, NaN) : null;
  const idadeMax = idadeMaxRaw ? parseIntSafe(idadeMaxRaw, NaN) : null;
  const idadeMaxTriagem = Number.isFinite(idadeMax as number)
    ? (applyTriagemRule ? Math.min(idadeMax as number, TRIAGEM_IDADE_MAXIMA) : (idadeMax as number))
    : (applyTriagemRule ? TRIAGEM_IDADE_MAXIMA : null);

  const fields: Record<string, string> = {};
  if (status && !STATUS_ALLOWED.has(status)) fields.status = 'Status de inscrição inválido.';
  if (origemDado && !ORIGEM_ALLOWED.has(origemDado)) fields.origem_dado = 'Origem inválida.';
  if (idadeMinRaw && !Number.isFinite(idadeMin)) fields.idade_min = 'Idade mínima inválida.';
  if (idadeMaxRaw && !Number.isFinite(idadeMax)) fields.idade_max = 'Idade máxima inválida.';
  if (Number.isFinite(idadeMin as number) && Number.isFinite(idadeMax as number) && (idadeMin as number) > (idadeMax as number)) {
    fields.idade_min = 'Idade mínima não pode ser maior que a idade máxima.';
  }

  if (Object.keys(fields).length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Filtros inválidos.',
        fields,
      },
    };
  }

  try {
    const cicloNovasInscricoes = await getCicloNovasInscricoes(supabase);
    let adolescenteIdsBase: string[] | null = null;
    try {
      const hasBasePessoaFilters =
        applyTriagemRule
        || Boolean(idadeMinRaw)
        || Boolean(idadeMaxRaw)
        || Boolean(bairro)
        || Boolean(sexo)
        || sexoNaoInformado;

      adolescenteIdsBase = hasBasePessoaFilters
        ? await adolescenteIdsByPessoaFiltros(supabase, {
            idadeMin: Number.isFinite(idadeMin as number) ? (idadeMin as number) : null,
            idadeMax: idadeMaxTriagem,
            bairro,
            sexo,
            sexoNaoInformado,
          })
        : null;
    } catch (e: any) {
      console.error('[inscricoes/admin] falha no filtro base de triagem (idade/bairro):', e?.message || e);
      return {
        status: 502,
        body: {
          success: false,
          error: 'ERRO_FILTRO_TRIAGEM',
          message: 'Nao foi possivel aplicar o filtro base de triagem.',
        },
      };
    }

    let adolescenteIdsBusca: string[] | null = null;
    if (busca) {
      const [fromAdolescentePessoa, fromResponsavel] = await Promise.all([
        adolescenteIdsByPessoaFiltros(supabase, { buscaText: busca, buscaDigits }),
        adolescenteIdsByResponsavelBusca(supabase, busca, buscaDigits),
      ]);
      adolescenteIdsBusca = uniq([...fromAdolescentePessoa, ...fromResponsavel]);
    }

    let adolescenteIdsFiltroFinal = intersectIfNeeded(adolescenteIdsBase, adolescenteIdsBusca);
    if (applyTriagemRule && Array.isArray(adolescenteIdsFiltroFinal)) {
      adolescenteIdsFiltroFinal = await excluirAdolescentesJaEncontreiros(supabase, adolescenteIdsFiltroFinal);
    }

    if (Array.isArray(adolescenteIdsFiltroFinal) && adolescenteIdsFiltroFinal.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          data: [],
          summary: {
            total: 0,
            por_status: {},
            novas_inscricoes: 0,
            ciclo_novas_inscricoes: cicloNovasInscricoes,
          },
          pagination: {
            page,
            page_size: pageSize,
            total: 0,
            total_pages: 1,
          },
        },
      };
    }

    const { data: baseRows, error: baseError } = await buildInscricoesQuery(supabase, {
      encontroId,
      status: '',
      origemDado,
      dataInicio,
      dataFim,
      adolescenteIds: adolescenteIdsFiltroFinal,
      withCount: false,
    })
      .order('data_inscricao', { ascending: false });

    if (baseError) {
      console.error('[inscricoes/admin] erro listagem:', baseError);
      return { status: 502, body: { success: false, error: 'ERRO_LISTAR_INSCRICOES', message: 'Não foi possível carregar as inscrições.' } };
    }

    const rawRows = Array.isArray(baseRows) ? baseRows : [];
    const consolidatedRows = consolidarInscricoesPorAdolescente(rawRows);
    // O indicador mede entradas no ciclo, não o status histórico escolhido pela consolidação geral.
    // Primeiro recortamos as inscrições pela janela entre EACs e só então consolidamos por adolescente.
    const novasRows = consolidarInscricoesPorAdolescente(
      rawRows.filter((row: any) => isInscricaoNoCiclo(row, cicloNovasInscricoes))
    );
    const rowsDoCicloAplicado = novasInscricoesOnly ? novasRows : consolidatedRows;
    const statusExcluirSet = new Set(statusExcluir);
    const filteredRows = rowsDoCicloAplicado
      .filter((row: any) => (status ? toCleanString(row?.status).toUpperCase() === status : true))
      .filter((row: any) => (statusExcluirSet.size > 0 ? !statusExcluirSet.has(toCleanString(row?.status).toUpperCase()) : true));
    const total = filteredRows.length;
    const allRows = filteredRows.slice(offset, offset + pageSize);

    const adolescenteIds = uniq(allRows.map((r: any) => String(r.adolescente_id || '')));
    const encontroIds = uniq(allRows.map((r: any) => String(r.encontro_id || '')));
    const escolaIds = uniq(allRows.map((r: any) => String(r.escola_id || '')).filter(Boolean));

    const [encontrosRes, adolescentesRes, escolasRes] = await Promise.all([
      encontroIds.length
        ? supabase.from('encontros').select('id,nome,numero,status,data_inicio,data_fim').in('id', encontroIds)
        : Promise.resolve({ data: [], error: null } as any),
      adolescenteIds.length
        ? supabase.from('adolescentes').select('id,pessoa_id,aceite_normas,ja_fez_eac').in('id', adolescenteIds)
        : Promise.resolve({ data: [], error: null } as any),
      escolaIds.length
        ? supabase.from('escolas').select('id,nome').in('id', escolaIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (encontrosRes.error || adolescentesRes.error || escolasRes.error) {
      console.error('[inscricoes/admin] erro relacionados etapa 1:', encontrosRes.error || adolescentesRes.error || escolasRes.error);
      return { status: 502, body: { success: false, error: 'ERRO_LISTAR_INSCRICOES', message: 'Não foi possível carregar as inscrições.' } };
    }

    const adolescentes = Array.isArray(adolescentesRes.data) ? adolescentesRes.data : [];
    const pessoaIds = uniq(adolescentes.map((a: any) => String(a.pessoa_id || '')));

    const [pessoasRes, vinculosRes] = await Promise.all([
      pessoaIds.length
        ? supabase
            .from('pessoas')
            .select('id,nome_completo,nome_normalizado,data_nascimento,idade_calculada,sexo,email,telefone,telefone_normalizado,endereco,bairro,observacoes')
            .in('id', pessoaIds)
        : Promise.resolve({ data: [], error: null } as any),
      adolescenteIds.length
        ? supabase
            .from('adolescente_responsaveis')
            .select('id,adolescente_id,responsavel_id,principal,grau_parentesco')
            .in('adolescente_id', adolescenteIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (pessoasRes.error || vinculosRes.error) {
      console.error('[inscricoes/admin] erro relacionados etapa 2:', pessoasRes.error || vinculosRes.error);
      return { status: 502, body: { success: false, error: 'ERRO_LISTAR_INSCRICOES', message: 'Não foi possível carregar as inscrições.' } };
    }

    const vinculos = Array.isArray(vinculosRes.data) ? vinculosRes.data : [];
    const responsavelIds = uniq(vinculos.map((v: any) => String(v.responsavel_id || '')));

    const responsaveisRes = responsavelIds.length
      ? await supabase.from('responsaveis').select('id,pessoa_id,nome,telefone,telefone_normalizado,email').in('id', responsavelIds)
      : ({ data: [], error: null } as any);

    if (responsaveisRes.error) {
      console.error('[inscricoes/admin] erro relacionados etapa 3:', responsaveisRes.error);
      return { status: 502, body: { success: false, error: 'ERRO_LISTAR_INSCRICOES', message: 'Não foi possível carregar as inscrições.' } };
    }

    const encontrosMap = new Map<string, any>(((encontrosRes.data ?? []) as any[]).map((e: any) => [String(e.id), e]));
    const escolasMap = new Map<string, any>(((escolasRes.data ?? []) as any[]).map((e: any) => [String(e.id), e]));
    const adolescentesMap = new Map<string, any>(adolescentes.map((a: any) => [String(a.id), a]));
    const pessoasMap = new Map<string, any>(((pessoasRes.data ?? []) as any[]).map((p: any) => [String(p.id), p]));
    const responsaveisMap = new Map<string, any>(((responsaveisRes.data ?? []) as any[]).map((r: any) => [String(r.id), r]));

    const vinculosByAdolescente = new Map<string, any[]>();
    vinculos.forEach((v: any) => {
      const key = String(v.adolescente_id || '');
      const arr = vinculosByAdolescente.get(key) ?? [];
      arr.push(v);
      vinculosByAdolescente.set(key, arr);
    });

    const rows = allRows.map((i: any) => {
      const adolescente = adolescentesMap.get(String(i.adolescente_id || ''));
      const pessoa = adolescente ? pessoasMap.get(String(adolescente.pessoa_id || '')) : null;
      const encontro = encontrosMap.get(String(i.encontro_id || ''));

      const vinculosA = vinculosByAdolescente.get(String(i.adolescente_id || '')) ?? [];
      const vinculoPrincipal = vinculosA.find((v: any) => v.principal === true) ?? vinculosA[0] ?? null;
      const responsavel = vinculoPrincipal ? responsaveisMap.get(String(vinculoPrincipal.responsavel_id || '')) : null;

      return {
        inscricao_id: i.id,
        status_inscricao: i.status,
        origem_inscricao: i.origem_dado,
        criado_via_sistema: i.criado_via_sistema,
        data_inscricao: i.data_inscricao,
        criado_em: i.criado_em,
        tamanho_camisa: i.tamanho_camisa ?? null,
        escola_id: i.escola_id ?? null,
        escola_nome_outro: i.escola_nome_outro ?? null,
        escola_nome: i.escola_id ? (escolasMap.get(String(i.escola_id))?.nome ?? null) : (i.escola_nome_outro ?? null),
        confirmacao_responsavel_enviada_em: i.confirmacao_responsavel_enviada_em ?? null,
        confirmacao_responsavel_confirmada_em: i.confirmacao_responsavel_confirmada_em ?? null,
        confirmacao_responsavel_expira_em: i.confirmacao_responsavel_expira_em ?? null,
        termos_versao_snapshot: i.termos_versao_snapshot ?? null,
        termos_respostas: i.termos_respostas ?? null,

        encontro_id: encontro?.id ?? i.encontro_id,
        encontro_nome: encontro?.nome ?? null,
        encontro_numero: encontro?.numero ?? null,
        encontro_status: encontro?.status ?? null,
        data_inicio_encontro: encontro?.data_inicio ?? null,
        data_fim_encontro: encontro?.data_fim ?? null,

        adolescente_id: adolescente?.id ?? i.adolescente_id,
        aceite_normas: adolescente?.aceite_normas ?? null,
        ja_fez_eac: adolescente?.ja_fez_eac ?? null,

        pessoa_adolescente_id: pessoa?.id ?? null,
        nome_adolescente: pessoa?.nome_completo ?? null,
        nome_adolescente_normalizado: pessoa?.nome_normalizado ?? null,
        data_nascimento: pessoa?.data_nascimento ?? null,
        sexo: pessoa?.sexo ?? null,
        email_adolescente: pessoa?.email ?? null,
        idade_calculada: pessoa?.idade_calculada ?? null,
        telefone_adolescente: pessoa?.telefone ?? null,
        telefone_adolescente_normalizado: pessoa?.telefone_normalizado ?? null,
        endereco: pessoa?.endereco ?? null,
        bairro: pessoa?.bairro ?? null,
        observacoes: pessoa?.observacoes ?? null,

        vinculo_responsavel_id: vinculoPrincipal?.id ?? null,
        responsavel_principal: vinculoPrincipal?.principal ?? null,
        grau_parentesco: vinculoPrincipal?.grau_parentesco ?? null,

        responsavel_id: responsavel?.id ?? null,
        nome_responsavel: responsavel?.nome ?? null,
        telefone_responsavel: responsavel?.telefone ?? null,
        telefone_responsavel_normalizado: responsavel?.telefone_normalizado ?? null,
        email_responsavel: responsavel?.email ?? null,
      };
    });

    const porStatus: Record<string, number> = {};
    filteredRows.forEach((r: any) => {
      const s = toCleanString(r.status).toUpperCase() || 'SEM_STATUS';
      porStatus[s] = (porStatus[s] || 0) + 1;
    });

    return {
      status: 200,
      body: {
        success: true,
        data: rows,
        summary: {
          total,
          por_status: porStatus,
          novas_inscricoes: novasRows.length,
          ciclo_novas_inscricoes: cicloNovasInscricoes,
        },
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    };
  } catch (e: any) {
    console.error('[inscricoes/admin] falha:', e);
    return { status: 500, body: { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao listar inscrições.' } };
  }
}
