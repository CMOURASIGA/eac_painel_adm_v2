import { emptyOk, postComunicadosAction, type EacApiResult } from './eacApiClient.ts';

export const presencaService = {
  async listar(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ items: any[] }>> {
    const r = await postComunicadosAction<any>('GET_PRESENCE', {}, opts);
    if (!r.success) return r;
    const items = Array.isArray((r.data as any)?.presence) ? (r.data as any).presence : [];
    return emptyOk({ items }, r.raw);
  },

  async marcar(payload: any, opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<any>> {
    return await postComunicadosAction<any>('MARK_PRESENCE', payload, opts);
  },

  async listarPublicoPresenca(
    opts: { googleWebAppUrl?: string } = {}
  ): Promise<EacApiResult<{ encontreiros: any[]; encontristas: any[] }>> {
    const [encRes, memRes] = await Promise.all([
      postComunicadosAction<any>('GET_ENCONTREIROS', {}, opts),
      postComunicadosAction<any>('GET_MEMBERS', {}, opts),
    ]);

    if (!encRes.success) return encRes as any;
    if (!memRes.success) return memRes as any;

    const encontreiros = Array.isArray((encRes.data as any)?.encontreiros) ? (encRes.data as any).encontreiros : [];
    const encontristas = Array.isArray((memRes.data as any)?.members) ? (memRes.data as any).members : [];
    return emptyOk({ encontreiros, encontristas }, { encRes: encRes.raw, memRes: memRes.raw });
  },
};
