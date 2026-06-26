import { getJson, postJson, emptyOk, type EacApiResult } from './eacApiClient.ts';
import type { VisitacaoHistoricoItem, VisitacaoIndicadores, VisitacaoPriorizado, VisitacaoQuestionarioResposta, VisitacaoStatus } from '../types.ts';

export type VisitacaoListResponse = {
  items: VisitacaoPriorizado[];
  indicadores: VisitacaoIndicadores;
};

export const visitacaoService = {
  async listar(params: {
    statuses?: VisitacaoStatus[];
    publicToken?: string;
  } = {}): Promise<EacApiResult<VisitacaoListResponse>> {
    const query = new URLSearchParams();
    if (Array.isArray(params.statuses) && params.statuses.length > 0) {
      query.set('status', params.statuses.join(','));
    }
    if (params.publicToken) {
      query.set('public', '1');
      query.set('token', params.publicToken);
    }
    const suffix = query.toString();
    const url = suffix ? `/api/visitacoes?${suffix}` : '/api/visitacoes';
    const result = await getJson<any>(url);
    if (!result.success) return result as any;
    return emptyOk({
      items: Array.isArray((result.data as any)?.items) ? (result.data as any).items : [],
      indicadores: ((result.data as any)?.indicadores || {}) as VisitacaoIndicadores,
    }, result.raw);
  },

  async registrar(
    inscricaoId: string,
    payload: {
      status_visitacao: VisitacaoStatus;
      data_acao: string;
      responsavel_acao: string;
      observacao?: string;
      respostas_questionario?: VisitacaoQuestionarioResposta;
      origem_registro?: string;
      token?: string;
    }
  ): Promise<EacApiResult<{ item: VisitacaoPriorizado }>> {
    return await postJson<any>(`/api/visitacoes?inscricaoId=${encodeURIComponent(inscricaoId)}`, payload);
  },

  async historico(inscricaoId: string): Promise<EacApiResult<{ items: VisitacaoHistoricoItem[] }>> {
    const result = await getJson<any>(`/api/visitacoes?action=history&inscricaoId=${encodeURIComponent(inscricaoId)}`);
    if (!result.success) return result as any;
    return emptyOk({
      items: Array.isArray((result.data as any)?.items) ? (result.data as any).items : [],
    }, result.raw);
  },
};
