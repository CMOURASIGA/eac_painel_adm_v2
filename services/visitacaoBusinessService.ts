import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

export const VISITACAO_STATUS_VALUES = [
  'NENHUMA_ACAO',
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
] as const;

export type VisitacaoStatus = typeof VISITACAO_STATUS_VALUES[number];

const STATUS_SET = new Set<string>(VISITACAO_STATUS_VALUES);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function normalizeStatusList(rawValue: string) {
  return Array.from(
    new Set(
      toCleanString(rawValue)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => STATUS_SET.has(item))
    )
  ) as VisitacaoStatus[];
}

function resolveActionType(status: VisitacaoStatus, observacao: string, currentStatus: string) {
  if (status === 'CONTATO_INICIAL_FEITO') return 'CONTATO_INICIAL';
  if (status === 'VISITACAO_REALIZADA') return 'VISITA_REALIZADA';
  if (status === 'NAO_CONSEGUIU_CONTATO') return 'TENTATIVA_CONTATO';
  if (observacao && status === currentStatus) return 'OBSERVACAO';
  return 'STATUS_ALTERADO';
}

function buildIndicadores(items: any[]) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    total: safeItems.length,
    nenhumaAcao: safeItems.filter((item) => item?.status_visitacao === 'NENHUMA_ACAO').length,
    contatoInicialFeito: safeItems.filter((item) => item?.status_visitacao === 'CONTATO_INICIAL_FEITO').length,
    visitacaoRealizada: safeItems.filter((item) => item?.status_visitacao === 'VISITACAO_REALIZADA').length,
    pendentesVisitacao: safeItems.filter((item) => ['CONTATO_INICIAL_FEITO', 'AGUARDANDO_RETORNO'].includes(String(item?.status_visitacao || ''))).length,
    naoConseguiuContato: safeItems.filter((item) => item?.status_visitacao === 'NAO_CONSEGUIU_CONTATO').length,
    aguardandoRetorno: safeItems.filter((item) => item?.status_visitacao === 'AGUARDANDO_RETORNO').length,
    naoDesejaVisita: safeItems.filter((item) => item?.status_visitacao === 'NAO_DESEJA_VISITA').length,
  };
}

export function getVisitacaoFormToken() {
  return toCleanString(process.env.VISITACAO_FORM_TOKEN || process.env.CHAVE_MESTRA);
}

export function validateVisitacaoFormToken(token: string) {
  const expected = getVisitacaoFormToken();
  if (!expected) return { ok: false, error: 'Token do formulário de visitação não configurado.' };
  if (!toCleanString(token)) return { ok: false, error: 'Token de acesso obrigatório.' };
  if (toCleanString(token) !== expected) return { ok: false, error: 'Token de acesso inválido.' };
  return { ok: true as const };
}

export async function listVisitacoes(
  supabase: AnySupabaseClient,
  query: Record<string, any> = {}
) {
  const statuses = normalizeStatusList(toCleanString(query.status));
  let request = supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .order('nome', { ascending: true, nullsFirst: false });

  if (statuses.length === 1) {
    request = request.eq('status_visitacao', statuses[0]);
  } else if (statuses.length > 1) {
    request = request.in('status_visitacao', statuses);
  }

  const { data, error } = await request;
  if (error) throw error;

  const items = Array.isArray(data) ? data : [];
  return { items, indicadores: buildIndicadores(items) };
}

export async function getVisitacaoHistorico(
  supabase: AnySupabaseClient,
  inscricaoId: string
) {
  const id = toCleanString(inscricaoId);
  if (!id) return { status: 400, body: { success: false, error: 'Inscrição obrigatória.' } };

  const { data, error } = await supabase
    .from('visitacoes_historico')
    .select('*')
    .eq('inscricao_id', id)
    .order('criado_em', { ascending: false });

  if (error) {
    return { status: 500, body: { success: false, error: error.message } };
  }

  return { status: 200, body: { success: true, items: Array.isArray(data) ? data : [] } };
}

export async function registerVisitacao(
  supabase: AnySupabaseClient,
  inscricaoId: string,
  body: Record<string, any>
) {
  const id = toCleanString(inscricaoId);
  if (!id) return { status: 400, body: { success: false, error: 'Inscrição obrigatória.' } };

  const status = toCleanString(body?.status_visitacao).toUpperCase();
  const responsavel = toCleanString(body?.responsavel_acao || body?.responsavel);
  const observacao = toCleanString(body?.observacao);
  const origem = toCleanString(body?.origem_registro || 'PAINEL');
  const dataAcao = toCleanString(body?.data_acao) || new Date().toISOString();

  if (!STATUS_SET.has(status)) {
    return { status: 400, body: { success: false, error: 'Status de visitação inválido.' } };
  }
  if (!responsavel) {
    return { status: 400, body: { success: false, error: 'Informe o responsável pela ação.' } };
  }

  const { data: prioritized, error: prioritizedError } = await supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (prioritizedError) {
    return { status: 500, body: { success: false, error: prioritizedError.message } };
  }
  if (!prioritized) {
    return { status: 404, body: { success: false, error: 'Inscrição priorizada não encontrada para visitação.' } };
  }

  const { data: current, error: currentError } = await supabase
    .from('visitacoes')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (currentError) {
    return { status: 500, body: { success: false, error: currentError.message } };
  }

  const currentStatus = toCleanString(current?.status_visitacao || 'NENHUMA_ACAO').toUpperCase();
  const payload: Record<string, any> = {
    inscricao_id: id,
    status_visitacao: status,
    responsavel_acao: responsavel,
    observacao: observacao || null,
    origem_registro: origem || 'PAINEL',
  };

  if (status === 'NENHUMA_ACAO') {
    payload.contato_inicial_realizado = false;
    payload.data_contato_inicial = null;
    payload.visitacao_realizada = false;
    payload.data_visitacao = null;
  }

  if (status === 'CONTATO_INICIAL_FEITO') {
    payload.contato_inicial_realizado = true;
    payload.data_contato_inicial = current?.data_contato_inicial || dataAcao;
    payload.visitacao_realizada = false;
    payload.data_visitacao = null;
  }

  if (status === 'VISITACAO_REALIZADA') {
    payload.contato_inicial_realizado = true;
    payload.data_contato_inicial = current?.data_contato_inicial || dataAcao;
    payload.visitacao_realizada = true;
    payload.data_visitacao = dataAcao;
  }

  if (status === 'NAO_CONSEGUIU_CONTATO' || status === 'AGUARDANDO_RETORNO' || status === 'NAO_DESEJA_VISITA') {
    payload.contato_inicial_realizado = current?.contato_inicial_realizado || false;
    payload.data_contato_inicial = current?.data_contato_inicial || null;
    payload.visitacao_realizada = false;
    if (status === 'NAO_DESEJA_VISITA') payload.data_visitacao = null;
  }

  const { data: saved, error: saveError } = await supabase
    .from('visitacoes')
    .upsert(payload, { onConflict: 'inscricao_id' })
    .select('*')
    .single();

  if (saveError) {
    return { status: 500, body: { success: false, error: saveError.message } };
  }

  const historyPayload = {
    visitacao_id: saved.id,
    inscricao_id: id,
    tipo_acao: resolveActionType(status as VisitacaoStatus, observacao, currentStatus),
    status_anterior: currentStatus,
    status_novo: status,
    descricao: observacao || null,
    responsavel_acao: responsavel,
    origem_registro: origem || 'PAINEL',
  };

  const { error: historyError } = await supabase
    .from('visitacoes_historico')
    .insert(historyPayload);

  if (historyError) {
    return { status: 500, body: { success: false, error: historyError.message } };
  }

  const { data: updatedItem, error: updatedItemError } = await supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (updatedItemError) {
    return { status: 500, body: { success: false, error: updatedItemError.message } };
  }

  return { status: 200, body: { success: true, item: updatedItem || saved } };
}
