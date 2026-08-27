import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';
import {
  handleSupabaseAction,
  loadEncontreirosForScreen,
  normalizeEncontreiro,
} from '../../utils/supabaseActions.js';
import { executeInscricoesAdminList } from '../../utils/inscricoesAdmin.js';
import { listVisitacoes } from '../../services/visitacaoBusinessService.js';

// =========================================================================
// Regras de negócio fixas do Painel Geral (ver docs "Reconstrução da Home").
// Não são configuráveis pela UI: fazem parte do critério de aceite do EAC.
// =========================================================================
const PRIORIZADOS_CAPACIDADE_TOTAL = 72;
const PRIORIZADOS_CAPACIDADE_POR_SEXO = 36;
const ADOLESCENTES_STATUS_EXCLUIDOS = ['PRIORIZADO', 'CONFIRMADO'];
const VISITACAO_STATUS_VALUES = [
  'NENHUMA_ACAO',
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
] as const;

function cleanText(value: any) {
  return String(value ?? '').trim();
}

// Critério fixo do indicador: idade = ano atual - ano de nascimento (não idade "exata").
function anoAtualMenosNascimento(dataNascimento: any): number | null {
  const raw = cleanText(dataNascimento);
  if (!raw) return null;
  const anoNascimento = Number(raw.slice(0, 4));
  if (!Number.isFinite(anoNascimento) || anoNascimento < 1900) return null;
  return new Date().getFullYear() - anoNascimento;
}

type SexoBucket = 'masculino' | 'feminino' | null;
function normalizeSexoBucket(raw: any): SexoBucket {
  const v = cleanText(raw).toLowerCase();
  if (['m', 'masc', 'masculino'].includes(v)) return 'masculino';
  if (['f', 'fem', 'feminino'].includes(v)) return 'feminino';
  return null;
}

async function fetchAllInscricoesAdminRows(supabase: any, extraQuery: Record<string, string> = {}) {
  const allRows: any[] = [];
  const pageSize = 100;
  let page = 1;

  for (;;) {
    const result = await executeInscricoesAdminList({
      supabase,
      query: { apply_triagem_rule: 'true', page: String(page), page_size: String(pageSize), ...extraQuery },
    });
    if (result.status !== 200) break;
    const rows = Array.isArray((result.body as any)?.data) ? (result.body as any).data : [];
    allRows.push(...rows);
    const totalPages = Number((result.body as any)?.pagination?.total_pages || 1);
    // Trava de segurança: nunca varre mais que 2000 registros.
    if (page >= totalPages || page >= 20) break;
    page += 1;
  }

  return allRows;
}

// =========================================================================
// Aba 1 - Adolescentes (GLOBAL, não depende de encontro selecionado)
// =========================================================================
async function buildAdolescentesIndicadores(supabase: any) {
  // apply_triagem_rule=true já: (a) exclui quem está classificado como ENCONTREIRO
  // (via pessoa_papeis) e (b) restringe idade a até 17 anos — a mesma regra usada
  // pela tela de Revisão de Inscrições (mesma fonte, mesmo critério).
  const rows = await fetchAllInscricoesAdminRows(supabase);
  const excluidos = new Set(ADOLESCENTES_STATUS_EXCLUIDOS);
  const relevantes = rows.filter((row: any) => !excluidos.has(cleanText(row?.status_inscricao).toUpperCase()));

  let masculino = 0;
  let feminino = 0;
  let cadastrosIncompletos = 0;
  const porIdadeMap = new Map<number, { idade: number; masculino: number; feminino: number; total: number }>();

  relevantes.forEach((row: any) => {
    const sexoBucket = normalizeSexoBucket(row?.sexo);
    if (sexoBucket === 'masculino') masculino += 1;
    if (sexoBucket === 'feminino') feminino += 1;

    if (!cleanText(row?.telefone_adolescente) || !cleanText(row?.data_nascimento) || !cleanText(row?.sexo)) {
      cadastrosIncompletos += 1;
    }

    const idade = anoAtualMenosNascimento(row?.data_nascimento);
    if (idade === null) return;
    const bucket = porIdadeMap.get(idade) || { idade, masculino: 0, feminino: 0, total: 0 };
    if (sexoBucket === 'masculino') bucket.masculino += 1;
    if (sexoBucket === 'feminino') bucket.feminino += 1;
    bucket.total += 1;
    porIdadeMap.set(idade, bucket);
  });

  const distribuicaoPorIdade = Array.from(porIdadeMap.values()).sort((a, b) => a.idade - b.idade);

  return {
    total: relevantes.length,
    masculino,
    feminino,
    distribuicaoPorIdade,
    cadastrosIncompletos,
    criterios:
      'Adolescentes inscritos existentes na base. A idade é calculada utilizando o ano atual menos o ano de nascimento. ' +
      'Não são considerados registros classificados como Priorizado, Confirmado ou Encontreiro.',
  };
}

// =========================================================================
// Aba 2 - Encontreiros (GLOBAL, não depende de encontro selecionado)
// =========================================================================
const FAIXAS_ETARIAS_ORDEM = ['Até 17 anos', '18 a 20', '21 a 25', '26 a 35', '36 a 50', 'Acima de 50', 'Não informado'];
function bucketFaixaEtaria(idade: number | null): string {
  if (idade === null) return 'Não informado';
  if (idade <= 17) return 'Até 17 anos';
  if (idade <= 20) return '18 a 20';
  if (idade <= 25) return '21 a 25';
  if (idade <= 35) return '26 a 35';
  if (idade <= 50) return '36 a 50';
  return 'Acima de 50';
}

async function buildEncontreirosIndicadores(supabase: any) {
  let rawRows: any[] = [];
  try {
    rawRows = await loadEncontreirosForScreen(supabase);
  } catch {
    rawRows = [];
  }
  const encontreiros = rawRows
    .map((row: any, i: number) => normalizeEncontreiro(row, i))
    .filter((r: any) => cleanText(r.nomeCompleto));

  let masculino = 0;
  let feminino = 0;
  const porFaixaMap = new Map<string, { faixa: string; total: number; masculino: number; feminino: number }>();
  FAIXAS_ETARIAS_ORDEM.forEach((faixa) => porFaixaMap.set(faixa, { faixa, total: 0, masculino: 0, feminino: 0 }));

  const pessoaIds: string[] = [];

  encontreiros.forEach((r: any) => {
    const sexoBucket = normalizeSexoBucket(r.sexo);
    if (sexoBucket === 'masculino') masculino += 1;
    if (sexoBucket === 'feminino') feminino += 1;

    const idade = anoAtualMenosNascimento(r.dataNascimento);
    const faixa = bucketFaixaEtaria(idade);
    const bucket = porFaixaMap.get(faixa) || { faixa, total: 0, masculino: 0, feminino: 0 };
    bucket.total += 1;
    if (sexoBucket === 'masculino') bucket.masculino += 1;
    if (sexoBucket === 'feminino') bucket.feminino += 1;
    porFaixaMap.set(faixa, bucket);

    if (cleanText(r.pessoaId)) pessoaIds.push(cleanText(r.pessoaId));
  });

  // Encontreiros que originalmente foram encontristas (passaram pela triagem/inscrições)
  // versus os que não possuem essa origem (recrutados diretamente como encontreiros).
  let comOrigemEncontrista = 0;
  if (pessoaIds.length > 0) {
    try {
      const { data: adolescentesDaBase } = await supabase
        .from('adolescentes')
        .select('pessoa_id')
        .in('pessoa_id', Array.from(new Set(pessoaIds)));
      const comOrigem = new Set((adolescentesDaBase || []).map((a: any) => cleanText(a.pessoa_id)));
      comOrigemEncontrista = pessoaIds.filter((id) => comOrigem.has(id)).length;
    } catch {
      comOrigemEncontrista = 0;
    }
  }

  return {
    total: encontreiros.length,
    masculino,
    feminino,
    porFaixaEtaria: FAIXAS_ETARIAS_ORDEM.map((f) => porFaixaMap.get(f)!).filter((b) => b.total > 0),
    origem: {
      comOrigemEncontrista,
      semOrigemEncontrista: encontreiros.length - comOrigemEncontrista,
    },
    criterios: 'Pessoas classificadas atualmente como Encontreiro. A idade é calculada utilizando o ano atual menos o ano de nascimento.',
  };
}

// =========================================================================
// Encontros (para o seletor da aba Priorizados)
// =========================================================================
async function loadEncontros(supabase: any) {
  const { data, error } = await supabase
    .from('encontros')
    .select('id,nome,numero,status,data_inicio')
    .order('data_inicio', { ascending: false })
    .limit(50);
  if (error) return { encontros: [], encontroAtivoId: '' };

  const encontros = Array.isArray(data) ? data : [];
  const ativo = encontros.find((e: any) => cleanText(e.status).toUpperCase() === 'ATIVO');
  return { encontros, encontroAtivoId: cleanText(ativo?.id || encontros[0]?.id || '') };
}

// =========================================================================
// Aba 3 - Priorizados (por encontro) + resumo operacional de Visitação
// =========================================================================
async function buildPriorizadosIndicadores(supabase: any, encontroId: string) {
  const { items } = await listVisitacoes(supabase, {});
  const escopo = encontroId ? items.filter((it: any) => cleanText(it.encontro_id) === encontroId) : items;

  let masculino = 0;
  let feminino = 0;
  const porIdadeMap = new Map<number, { idade: number; masculino: number; feminino: number; total: number }>();
  const statusVisitacaoCounts: Record<string, number> = Object.fromEntries(
    VISITACAO_STATUS_VALUES.map((s) => [s, 0])
  );

  escopo.forEach((item: any) => {
    const sexoBucket = normalizeSexoBucket(item.sexo);
    if (sexoBucket === 'masculino') masculino += 1;
    if (sexoBucket === 'feminino') feminino += 1;

    const idade = Number(item.idade);
    if (Number.isFinite(idade)) {
      const bucket = porIdadeMap.get(idade) || { idade, masculino: 0, feminino: 0, total: 0 };
      if (sexoBucket === 'masculino') bucket.masculino += 1;
      if (sexoBucket === 'feminino') bucket.feminino += 1;
      bucket.total += 1;
      porIdadeMap.set(idade, bucket);
    }

    const statusKey = cleanText(item.status_visitacao).toUpperCase() || 'NENHUMA_ACAO';
    if (statusKey in statusVisitacaoCounts) statusVisitacaoCounts[statusKey] += 1;
  });

  const distribuicaoPorIdade = Array.from(porIdadeMap.values()).sort((a, b) => a.idade - b.idade);
  const pendentes = statusVisitacaoCounts.CONTATO_INICIAL_FEITO + statusVisitacaoCounts.AGUARDANDO_RETORNO;
  const concluidas = statusVisitacaoCounts.VISITACAO_REALIZADA;

  return {
    encontroId: encontroId || null,
    total: escopo.length,
    capacidadeTotal: PRIORIZADOS_CAPACIDADE_TOTAL,
    masculino,
    capacidadeMasculino: PRIORIZADOS_CAPACIDADE_POR_SEXO,
    feminino,
    capacidadeFeminino: PRIORIZADOS_CAPACIDADE_POR_SEXO,
    distribuicaoPorIdade,
    visitacao: {
      total: escopo.length,
      porStatus: statusVisitacaoCounts,
      pendentes,
      concluidas,
      percentualConcluido: escopo.length ? Math.round((concluidas / escopo.length) * 100) : 0,
    },
  };
}

// =========================================================================
// Aba 4 - Presenças (por tipo de evento e ano)
// =========================================================================
async function buildPresencasIndicadores(
  supabase: any,
  encontreirosPessoaIds: Set<string>,
  tipoEvento: 'POS_ENCONTRO' | 'REUNIAO_CIRCULO',
  ano: string
) {
  const presenceResult = await handleSupabaseAction('GET_PRESENCE', {});
  const presence: any[] = Array.isArray((presenceResult.data as any)?.presence) ? (presenceResult.data as any).presence : [];

  const anoFiltro = ano || String(new Date().getFullYear());
  const doTipo = presence.filter((r: any) => {
    if (cleanText(r.tipoEvento).toUpperCase() !== tipoEvento) return false;
    const ts = new Date(cleanText(r.timestamp));
    if (Number.isNaN(ts.getTime())) return false;
    return String(ts.getFullYear()) === anoFiltro;
  });

  const diasComEvento = new Set<string>();
  const presencasPorPessoa = new Map<string, { nome: string; presencas: number }>();
  let totalPresentes = 0;

  doTipo.forEach((r: any) => {
    const ts = new Date(cleanText(r.timestamp));
    if (!Number.isNaN(ts.getTime())) diasComEvento.add(ts.toISOString().slice(0, 10));
    if (!r.presente) return;
    totalPresentes += 1;

    const key = cleanText(r.pessoaId) || `nome:${cleanText(r.nome).toLowerCase()}`;
    const atual = presencasPorPessoa.get(key) || { nome: cleanText(r.nome) || 'Sem nome', presencas: 0 };
    atual.presencas += 1;
    presencasPorPessoa.set(key, atual);
  });

  const eventosRealizados = diasComEvento.size;
  const participantesEsperados = encontreirosPessoaIds.size;
  // Presentes distintos entre os encontreiros conhecidos (evita contar a mesma pessoa mais de uma vez).
  const presentesDistintos = Array.from(presencasPorPessoa.values()).length;
  const ausentes = Math.max(0, participantesEsperados - presentesDistintos);
  const percentualPresenca = participantesEsperados > 0 ? Math.round((presentesDistintos / participantesEsperados) * 100) : null;

  const ranking = Array.from(presencasPorPessoa.values())
    .sort((a, b) => b.presencas - a.presencas)
    .slice(0, 5)
    .map((r) => ({
      nome: r.nome,
      presencas: r.presencas,
      assiduidade: eventosRealizados > 0 ? Math.round((r.presencas / eventosRealizados) * 100) : null,
    }));

  return {
    tipoEvento,
    ano: anoFiltro,
    eventosRealizados,
    presentes: totalPresentes,
    participantesEsperados,
    ausentes,
    percentualPresenca,
    ranking,
  };
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return sendError(res, 500, 'SUPABASE_NOT_CONFIGURED', 'Supabase não configurado.');
  }

  const tipoEventoParam = cleanText(req.query.tipoEvento).toUpperCase();
  const tipoEvento: 'POS_ENCONTRO' | 'REUNIAO_CIRCULO' = tipoEventoParam === 'REUNIAO_CIRCULO' ? 'REUNIAO_CIRCULO' : 'POS_ENCONTRO';
  const ano = cleanText(req.query.ano);

  try {
    const { encontros, encontroAtivoId } = await loadEncontros(supabase);
    const encontroIdParam = cleanText(req.query.encontroId) || encontroAtivoId;

    const [adolescentes, encontreiros, priorizados] = await Promise.all([
      buildAdolescentesIndicadores(supabase),
      buildEncontreirosIndicadores(supabase),
      buildPriorizadosIndicadores(supabase, encontroIdParam),
    ]);

    // Reaproveita a lista de encontreiros já carregada para o cálculo de presença.
    let encontreirosPessoaIds = new Set<string>();
    try {
      const rows = await loadEncontreirosForScreen(supabase);
      encontreirosPessoaIds = new Set(
        rows.map((r: any) => cleanText(r?.pessoa_id || r?.pessoaId)).filter(Boolean)
      );
    } catch {
      encontreirosPessoaIds = new Set();
    }

    const presencas = await buildPresencasIndicadores(supabase, encontreirosPessoaIds, tipoEvento, ano);

    // Inscrições aguardando análise (status EM_ANALISE), calculado à parte para manter
    // o critério exato do indicador (independente da regra de exclusão da aba Adolescentes).
    const emAnaliseRows = await fetchAllInscricoesAdminRows(supabase, { status: 'EM_ANALISE' });

    const atencaoItens = [
      {
        chave: 'inscricoes_aguardando_analise',
        total: emAnaliseRows.length,
        label: 'inscrições aguardando análise',
        view: 'inscricoes_review',
        filtros: { status: 'EM_ANALISE' },
      },
      {
        chave: 'visitas_pendentes',
        total: priorizados.visitacao.pendentes,
        label: 'visitas pendentes',
        view: 'visitacao',
        filtros: { status: 'CONTATO_INICIAL_FEITO,AGUARDANDO_RETORNO', encontroId: encontroIdParam },
      },
      {
        chave: 'priorizados_aguardando_acao',
        total: priorizados.visitacao.porStatus.NENHUMA_ACAO || 0,
        label: 'priorizados aguardando ação de visitação',
        view: 'visitacao',
        filtros: { status: 'NENHUMA_ACAO', encontroId: encontroIdParam },
      },
      {
        chave: 'cadastros_incompletos',
        total: adolescentes.cadastrosIncompletos,
        label: 'cadastros incompletos',
        view: 'inscricoes_review',
        filtros: {},
      },
    ].filter((item) => item.total > 0);

    return res.status(200).json({
      success: true,
      source: 'supabase',
      encontros: encontros.map((e: any) => ({ id: e.id, nome: e.nome, numero: e.numero, status: e.status })),
      encontroSelecionadoId: encontroIdParam,
      adolescentes,
      encontreiros,
      priorizados,
      presencas,
      atencao: atencaoItens,
    });
  } catch (e: any) {
    console.error('[api/dashboard/home] falha:', e);
    return sendError(res, 500, 'INTERNAL_ERROR', e?.message || 'Erro ao montar indicadores da Home.');
  }
}
