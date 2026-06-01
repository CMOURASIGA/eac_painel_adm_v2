import { sanitizeTextDeep } from '../utils/textEncoding.ts';

export type EacApiResult<T> =
  | { success: true; data: T; raw: any }
  | { success: false; error: string; status?: number; raw?: any; sample?: string };

type PostActionOptions = {
  googleWebAppUrl?: string;
  signal?: AbortSignal;
};

async function readJsonSafe(res: Response): Promise<{ ok: true; json: any } | { ok: false; error: string; sample: string }> {
  const raw = await res.text();
  if (!raw) return { ok: false, error: `Resposta vazia (HTTP ${res.status}).`, sample: '' };
  try {
    return { ok: true, json: sanitizeTextDeep(JSON.parse(raw)) };
  } catch {
    return { ok: false, error: `Resposta invalida (JSON malformado).`, sample: raw.slice(0, 400) };
  }
}

function normalizeLegacyApiPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload;
  const normalized: any = { ...payload };
  if (!normalized.message && typeof normalized.mensagem === 'string') normalized.message = normalized.mensagem;
  if (!normalized.error && typeof normalized.erro === 'string') normalized.error = normalized.erro;
  if (normalized.success === undefined && normalized.ok === true) normalized.success = true;
  if (normalized.success === undefined && normalized.status === 'success') normalized.success = true;
  return normalized;
}

function unwrapSuccessFlag(payload: any) {
  return Boolean(payload?.success ?? payload?.ok ?? payload?.status === 'success' ?? false);
}

async function sendJson<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: any,
  options: { signal?: AbortSignal } = {}
): Promise<EacApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: method === 'GET' ? { Accept: 'application/json' } : { 'Content-Type': 'application/json' },
      signal: options.signal,
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });

    const parsed = await readJsonSafe(res);
    if (!parsed.ok) return { success: false, error: parsed.error, status: res.status, sample: parsed.sample };

    const normalizedPayload = normalizeLegacyApiPayload(parsed.json);
    const ok = res.ok && unwrapSuccessFlag(normalizedPayload);
    if (!ok) {
      return {
        success: false,
        error: String(normalizedPayload?.error || `Falha (HTTP ${res.status}).`),
        status: res.status,
        raw: normalizedPayload,
      };
    }

    return { success: true, data: normalizedPayload as T, raw: normalizedPayload };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Requisicao cancelada.' : (e?.message || 'Erro de rede.');
    return { success: false, error: msg };
  }
}

export async function postComunicadosAction<T = any>(
  action: string,
  data: any = {},
  options: PostActionOptions = {}
): Promise<EacApiResult<T>> {
  return await postJson<T>('/api/comunicados', {
    action,
    data,
    ...(options.googleWebAppUrl ? { googleWebAppUrl: options.googleWebAppUrl } : {}),
  }, { signal: options.signal });
}

export async function postJson<T = any>(
  url: string,
  body: any,
  options: { signal?: AbortSignal } = {}
): Promise<EacApiResult<T>> {
  return await sendJson<T>('POST', url, body, options);
}

export async function patchJson<T = any>(
  url: string,
  body: any,
  options: { signal?: AbortSignal } = {}
): Promise<EacApiResult<T>> {
  return await sendJson<T>('PATCH', url, body, options);
}

export async function getJson<T = any>(
  url: string,
  options: { signal?: AbortSignal } = {}
): Promise<EacApiResult<T>> {
  return await sendJson<T>('GET', url, undefined, options);
}

export function emptyOk<T>(data: T, raw: any = {}) {
  return { success: true as const, data, raw };
}

export async function deleteJson<T = any>(
  url: string,
  body: any,
  options: { signal?: AbortSignal } = {}
): Promise<EacApiResult<T>> {
  return await sendJson<T>('DELETE', url, body, options);
}
