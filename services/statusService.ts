import { postComunicadosAction, type EacApiResult } from './eacApiClient.ts';

export const statusService = {
  async atualizarNaoInscritosIncremental(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('ATUALIZAR_NAO_INSCRITOS', {}, opts);
  },

  async atualizarNaoInscritosFull(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('ATUALIZAR_NAO_INSCRITOS_FULL', {}, opts);
  },

  async atualizarInteresseNaoInscrito(payload: any, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('UPDATE_NON_ENROLLED_INTEREST', payload, opts);
  },

  async atualizarRecadoNaoInscrito(payload: any, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('UPDATE_NON_ENROLLED_RECADO', payload, opts);
  },

  async atualizarRegistroNaoInscrito(payload: any, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('UPDATE_NON_ENROLLED_RECORD', payload, opts);
  },
};

