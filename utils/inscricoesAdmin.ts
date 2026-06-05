import type { SupabaseClient } from '@supabase/supabase-js';

type AnyObject = Record<string, any>;

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

async function adolescentesByPessoaIds(supabase: SupabaseClient, pessoaIds: string[]) {
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
  supabase: SupabaseClient,
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

async function adolescenteIdsByResponsavelBusca(supabase: SupabaseClient, buscaText: string, buscaDigits: string) {
  if (!buscaText && !buscaDigits) return [] as string[];

  let q = supabase.from('responsaveis').select('id');
  if (buscaDigits) {
    q = q.ilike('telefone_normalizado', `%${buscaDigits}%`);
  }
  if (buscaText) {
    const hasOnlyDigits = /^\d+$/.test(buscaText);
    if (!hasOnlyDigits) {
      if (buscaDigits) {
        q = q.or(`nome.ilike.%${buscaText}%`);
      } else {
        q = q.ilike('nome', `%${buscaText}%`);
      }
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
  supabase: SupabaseClient,
  opts: {
    idadeMin?: number | null;
    idadeMax?: number | null;
    bairro?: string;
    buscaText?: string;
    buscaDigits?: string;
  }
) {
  const { idadeMin, idadeMax, bairro, buscaText, buscaDigits } = opts;

  console.log('[pessoaFiltros] buscaText:', buscaText, 'buscaDigits:', buscaDigits);

  let pessoasQuery = supabase.from('pessoas').select('id');
  if (typeof idadeMin === 'number') pessoasQuery = pessoasQuery.gte('idade_calculada', idadeMin);
  if (typeof idadeMax === 'number') pessoasQuery = pessoasQuery.lte('idade_calculada', idadeMax);
  if (bairro) pessoasQuery = pessoasQuery.ilike('bairro', `%${bairro}%`);

  if (buscaDigits) {
    console.log('[pessoaFiltros] searching telefone_normalizado with:', buscaDigits);
    pessoasQuery = pessoasQuery.ilike('telefone_normalizado', `%${buscaDigits}%`);
  }
  if (buscaText) {
    // Extract only alphabetic characters for name search
    const nameOnly = buscaText.replace(/[^a-zA-Z\s]/g, '').trim();
    console.log('[pessoaFiltros] nameOnly:', nameOnly);
    if (nameOnly) {
      if (buscaDigits) {
        pessoasQuery = pessoasQuery.or(`nome_completo.ilike.%${nameOnly}%`);
      } else {
        pessoasQuery = pessoasQuery.ilike('nome_completo', `%${nameOnly}%`);
      }
    }
  }

  const { data: pessoas, error: pessoasError } = await pessoasQuery;
  console.log('[pessoaFiltros] query result:', { count: pessoas?.length, first: pessoas?.[0] }, 'error:', pessoasError?.message);
  if (pessoasError) throw pessoasError;

  const pessoaIds = uniq((pessoas ?? []).map((p: any) => String(p.id || '')));
  const adolescentes = await adolescentesByPessoaIds(supabase, pessoaIds);
  return uniq(adolescentes.map((a: any) => String(a.id || '')));
}

function buildInscricoesQuery(
  supabase: SupabaseClient,
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
        : 'id,status,origem_dado,criado_via_sistema,data_inscricao,criado_em,encontro_id,adolescente_id',
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
  supabase: SupabaseClient | null;
  query: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, query } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const encontroId = toCleanString(query.encontro_id);
  const status = toCleanString(query.status).toUpperCase();
  const origemDado = toCleanString(query.origem_dado).toUpperCase();
  const bairro = toCleanString(query.bairro);
  const dataInicio = toCleanString(query.data_inicio);
  const dataFim = toCleanString(query.data_fim);
  const busca = toCleanString(query.busca);
  const buscaDigits = normalizarTelefoneBusca(busca);
  const buscaText = busca;
  const applyTriagemRule = toCleanString(query.apply_triagem_rule).toLowerCase() === 'true';
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
    let adolescenteIdsBase: string[] | null = null;
    try {
      adolescenteIdsBase = await adolescenteIdsByPessoaFiltros(supabase, {
        idadeMin: Number.isFinite(idadeMin as number) ? (idadeMin as number) : null,
        idadeMax: idadeMaxTriagem,
        bairro,
      });
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

    const consolidatedRows = consolidarInscricoesPorAdolescente(Array.isArray(baseRows) ? baseRows : []);
    const filteredRows = status
      ? consolidatedRows.filter((row: any) => toCleanString(row?.status).toUpperCase() === status)
      : consolidatedRows;
    const total = filteredRows.length;
    const allRows = filteredRows.slice(offset, offset + pageSize);

    const adolescenteIds = uniq(allRows.map((r: any) => String(r.adolescente_id || '')));
    const encontroIds = uniq(allRows.map((r: any) => String(r.encontro_id || '')));

    const [encontrosRes, adolescentesRes] = await Promise.all([
      encontroIds.length
        ? supabase.from('encontros').select('id,nome,numero,status,data_inicio,data_fim').in('id', encontroIds)
        : Promise.resolve({ data: [], error: null } as any),
      adolescenteIds.length
        ? supabase.from('adolescentes').select('id,pessoa_id,aceite_normas,ja_fez_eac').in('id', adolescenteIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (encontrosRes.error || adolescentesRes.error) {
      console.error('[inscricoes/admin] erro relacionados etapa 1:', encontrosRes.error || adolescentesRes.error);
      return { status: 502, body: { success: false, error: 'ERRO_LISTAR_INSCRICOES', message: 'Não foi possível carregar as inscrições.' } };
    }

    const adolescentes = Array.isArray(adolescentesRes.data) ? adolescentesRes.data : [];
    const pessoaIds = uniq(adolescentes.map((a: any) => String(a.pessoa_id || '')));

    const [pessoasRes, vinculosRes] = await Promise.all([
      pessoaIds.length
        ? supabase
            .from('pessoas')
            .select('id,nome_completo,nome_normalizado,data_nascimento,idade_calculada,telefone,telefone_normalizado,bairro,observacoes')
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

    const encontrosMap = new Map((encontrosRes.data ?? []).map((e: any) => [String(e.id), e]));
    const adolescentesMap = new Map(adolescentes.map((a: any) => [String(a.id), a]));
    const pessoasMap = new Map((pessoasRes.data ?? []).map((p: any) => [String(p.id), p]));
    const responsaveisMap = new Map((responsaveisRes.data ?? []).map((r: any) => [String(r.id), r]));

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
        idade_calculada: pessoa?.idade_calculada ?? null,
        telefone_adolescente: pessoa?.telefone ?? null,
        telefone_adolescente_normalizado: pessoa?.telefone_normalizado ?? null,
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
    consolidatedRows.forEach((r: any) => {
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
