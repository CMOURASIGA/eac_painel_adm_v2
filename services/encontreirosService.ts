import { postComunicadosAction, emptyOk, type EacApiResult } from './eacApiClient.ts';

export const encontreirosService = {
  async listar(
    payload: { classificacao?: string; includeSensitive?: boolean } = {},
    opts: { googleWebAppUrl?: string } = {}
  ): Promise<EacApiResult<{ items: any[]; indicators?: any; bairroStats?: any[] }>> {
    const r = await postComunicadosAction<any>('GET_ENCONTREIROS', payload, opts);
    if (!r.success) return r;
    const items = Array.isArray((r.data as any)?.encontreiros) ? (r.data as any).encontreiros : [];
    return emptyOk(
      {
        items,
        indicators: (r.data as any)?.indicators || null,
        bairroStats: Array.isArray((r.data as any)?.bairroStats) ? (r.data as any).bairroStats : [],
      },
      r.raw
    );
  },

  async salvar(payload: any, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('SAVE_ENCONTREIRO', payload, opts);
  },

  async excluir(payload: { id: string; pessoa_id?: string }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('DELETE_ENCONTREIRO', payload, opts);
  },

  async normalizarWhatsapp(payload: { id: string }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('NORMALIZE_ENCONTREIRO_WHATSAPP', payload, opts);
  },

  async listarEquipes(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ equipes: any[] }>> {
    const r = await postComunicadosAction<any>('GET_EQUIPES', {}, opts);
    if (!r.success) return r;
    return emptyOk({ equipes: Array.isArray((r.data as any)?.equipes) ? (r.data as any).equipes : [] }, r.raw);
  },

  async listarEquipesDoEncontreiro(payload: { encontreiroId: string }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ equipeIds: string[] }>> {
    const r = await postComunicadosAction<any>('GET_ENCONTREIRO_EQUIPES', payload, opts);
    if (!r.success) return r;
    return emptyOk({ equipeIds: Array.isArray((r.data as any)?.equipeIds) ? (r.data as any).equipeIds : [] }, r.raw);
  },

  async salvarEquipesDoEncontreiro(payload: { encontreiroId: string; equipeIds: string[] }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('SAVE_ENCONTREIRO_EQUIPES', payload, opts);
  },,

  async listarEncontros(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ encontros: any[] }>> {
    const r = await postComunicadosAction<any>('GET_ENCONTROS_EQUIPES', {}, opts);
    if (!r.success) return r;
    return emptyOk({ encontros: Array.isArray((r.data as any)?.encontros) ? (r.data as any).encontros : [] }, r.raw);
  },

  async listarComposicaoEquipe(payload: { encontroId: string }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ equipes: any[] }>> {
    const r = await postComunicadosAction<any>('GET_ENCONTRO_EQUIPES', payload, opts);
    if (!r.success) return r;
    return emptyOk({ equipes: Array.isArray((r.data as any)?.equipes) ? (r.data as any).equipes : [] }, r.raw);
  },

  async salvarMembrosDaEquipe(payload: { encontroId: string; equipeId: string; membros: any[] }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('SAVE_ENCONTRO_EQUIPE_MEMBROS', payload, opts);
  },

  async historicoEquipesDoEncontreiro(payload: { encontreiroId: string }, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ historico: any[] }>> {
    const r = await postComunicadosAction<any>('GET_HISTORICO_ENCONTREIRO_EQUIPES', payload, opts);
    if (!r.success) return r;
    return emptyOk({ historico: Array.isArray((r.data as any)?.historico) ? (r.data as any).historico : [] }, r.raw);
  },
};
