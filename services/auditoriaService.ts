import { postComunicadosAction, emptyOk, type EacApiResult } from './eacApiClient.ts';

export const auditoriaService = {
  async getSyncStatus(): Promise<EacApiResult<{ lastUpdate?: string | null }>> {
    const r = await postComunicadosAction<any>('GET_SYNC_STATUS', {});
    if (!r.success) return r;
    return emptyOk({ lastUpdate: (r.data as any)?.lastUpdate ?? null }, r.raw);
  },

  async listarLogs(): Promise<EacApiResult<{ items: any[] }>> {
    const r = await postComunicadosAction<any>('GET_LOGS', {});
    if (!r.success) return r;
    const items = Array.isArray((r.data as any)?.logs) ? (r.data as any).logs : [];
    return emptyOk({ items }, r.raw);
  },

  async getResumoEmailStatus(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ summary: Record<string, any> }>> {
    const r = await postComunicadosAction<any>('GET_EMAIL_STATUS_SUMMARY', {}, opts);
    if (!r.success) return r;
    const summary = (r.data as any)?.summary;
    return emptyOk({ summary: summary && typeof summary === 'object' ? summary : {} }, r.raw);
  },
};

