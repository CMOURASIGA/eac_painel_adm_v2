import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../utils/supabaseServer.js';

type ApiResult = Record<string, any> & { success?: boolean; error?: string };
const LATIN1_CHARSET_REGEX = /(charset\s*=\s*(iso-8859-1|latin1|windows-1252))/i;
const MOJIBAKE_SEQUENCE_REGEX = /(Ã[^A-Za-z0-9\s]|Â[^A-Za-z0-9\s]|â[^A-Za-z0-9\s]|ï¿½)/g;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/g;
const WINDOWS_1252_REVERSE_MAP: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

const hasLikelyMojibakeSequence = (value: string) => {
  MOJIBAKE_SEQUENCE_REGEX.lastIndex = 0;
  return MOJIBAKE_SEQUENCE_REGEX.test(value);
};

const countMatches = (value: string, regex: RegExp) => {
  regex.lastIndex = 0;
  const matches = value.match(regex);
  return matches ? matches.length : 0;
};

const getMojibakeScore = (value: string) => {
  if (!value) return 0;
  const replacementCount = countMatches(value, REPLACEMENT_CHAR_REGEX);
  const sequenceCount = countMatches(value, MOJIBAKE_SEQUENCE_REGEX);
  return (replacementCount * 6) + (sequenceCount * 3);
};

const decodeLatin1AsUtf8 = (value: string) => {
  if (!value) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const mapped = WINDOWS_1252_REVERSE_MAP[ch];
    bytes[i] = mapped !== undefined ? mapped : (value.charCodeAt(i) & 0xff);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

const fixMojibake = (value: string) => {
  if (!value) return value;

  let current = value;
  for (let i = 0; i < 2; i += 1) {
    if (!hasLikelyMojibakeSequence(current)) break;

    const decoded = decodeLatin1AsUtf8(current);
    if (!decoded || decoded === current) break;

    const currentScore = getMojibakeScore(current);
    const decodedScore = getMojibakeScore(decoded);
    if (decodedScore > currentScore) break;

    current = decoded;
  }

  return current;
};

const sanitizeTextDeep = <T>(value: T): T => {
  if (typeof value === 'string') {
    return fixMojibake(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTextDeep(item)) as T;
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const sanitized: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      sanitized[key] = sanitizeTextDeep((value as Record<string, unknown>)[key]);
    });
    return sanitized as T;
  }

  return value;
};

async function readJsonWithEncodingFallback(response: globalThis.Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const latin1Text = new TextDecoder('iso-8859-1', { fatal: false }).decode(bytes);
  const contentType = String(response.headers.get('content-type') || '');
  const preferLatin1 = LATIN1_CHARSET_REGEX.test(contentType);
  const candidates = preferLatin1
    ? [{ encoding: 'latin1', text: latin1Text }, { encoding: 'utf8', text: utf8Text }]
    : [{ encoding: 'utf8', text: utf8Text }, { encoding: 'latin1', text: latin1Text }];

  const parsedCandidates: Array<{ encoding: string; score: number; payload: any; text: string }> = [];
  for (const candidate of candidates) {
    if (!candidate.text) continue;
    try {
      parsedCandidates.push({
        encoding: candidate.encoding,
        score: getMojibakeScore(candidate.text),
        payload: JSON.parse(candidate.text),
        text: candidate.text,
      });
    } catch {
      // continua tentando outra codificação
    }
  }

  if (parsedCandidates.length === 0) {
    const sample = (candidates[0]?.text || '').slice(0, 400);
    throw new Error(sample ? `JSON inválido. Amostra: ${sample}` : 'JSON inválido.');
  }

  parsedCandidates.sort((a, b) => a.score - b.score);
  const best = parsedCandidates[0];
  return {
    result: sanitizeTextDeep(best.payload),
    encoding: best.encoding,
    sample: best.text.slice(0, 400),
  };
}

function normalizeUrl(url?: string | null) {
  if (!url) return '';
  return String(url).trim();
}

function isValidGoogleWebAppUrl(url: string) {
  return url.startsWith('https://script.google.com/');
}

function getActionTimeoutMs(action: string) {
  const heavyActions = new Set([
    'ATUALIZAR_NAO_INSCRITOS',
    'ATUALIZAR_NAO_INSCRITOS_FULL',
    'GET_NON_ENROLLED',
    'EXECUTE_COMUNICADO_99',
    'EXECUTE_ANIVERSARIANTES',
    'EXECUTE_EVENTOS',
    'EXECUTE_WAITLIST_NON_ENROLLED',
    'EXECUTE_CONFIRM_NAO_INSCRITOS',
    'EXECUTE_INTEREST_CONFIRMATION',
    'EXECUTE_EMERGENCIA_NOV2025',
  ]);

  return heavyActions.has(action) ? 120000 : 30000;
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string, extra?: Record<string, any>) {
  return res.status(status).json({
    success: false,
    error,
    message: message || error,
    ...(extra || {}),
  });
}

function sendSuccess(res: NextApiResponse, status: number, payload: Record<string, any>) {
  const fallbackMessage = 'Operacao concluida com sucesso.';
  return res.status(status).json({
    success: true,
    message: String(payload?.message || fallbackMessage),
    ...payload,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const { action, data, googleWebAppUrl: clientUrl } = req.body ?? {};

    const supabasePreferredActions = new Set([
      'GET_SYNC_STATUS',
      'USER_LOGIN',
      'GET_USERS',
      'SAVE_USER',
      'DELETE_USER',
      'GET_MEMBERS',
      'SEARCH_MEMBERS',
      'DELETE_MEMBER',
      'GET_NON_ENROLLED',
      'ATUALIZAR_NAO_INSCRITOS',
      'UPDATE_NON_ENROLLED_RECADO',
      'UPDATE_NON_ENROLLED_RECORD',
      'GET_EVENTS',
      'IMPORT_CALENDAR_2026_EXTERNOS',
      'SAVE_EVENT',
      'DELETE_EVENT',
      'GET_COMUNICADOS',
      'SAVE_COMUNICADO',
      'DELETE_COMUNICADO',
      'LOG_DISPATCH_EXECUTION',
      'LOG_DISPATCH_DESTINATARIOS',
      'BUILD_NON_ENROLLED_DISPATCH_AUDIENCE',
      'GET_DISPARO_EXECUCOES',
      'START_DISPARO_EXECUCAO',
      'UPDATE_DISPARO_EXECUCAO_STATUS',
      'RETRY_DISPARO_FALHAS',
      'GET_LOGS',
      'GET_OPERATIONAL_LOGS',
      'GET_SAFE_SETTINGS',
      'GET_CONTEXT_HELP',
      'GET_ENCONTREIROS',
      'GET_PRESENCE',
      'GET_PUBLIC_PRESENCE_DATA',
      'GET_CIRCULOS_DISTRIBUIDOS',
      'GET_INSCRICOES_PRIORITARIAS',
      'PRIORITIZE_NON_ENROLLED',
      'EXECUTE_DISTRIBUICAO_CIRCULOS',
      'MOVE_CIRCULO_PARTICIPANTE',
      'GET_EMAIL_STATUS_SUMMARY',
      'GET_EMAIL_CALLS_BY_PERSON',
      'SAVE_ENCONTREIRO',
      'DELETE_ENCONTREIRO',
      'NORMALIZE_ENCONTREIRO_WHATSAPP',
      'GET_EQUIPES',
      'GET_ENCONTREIRO_EQUIPES',
      'SAVE_ENCONTREIRO_EQUIPES',
      'EXECUTE_ANIVERSARIANTES',
      'EXECUTE_COMUNICADO_99',
    ]);

    const allowSheetsFallbackForReads =
      String(process.env.EAC_ALLOW_SHEETS_FALLBACK_READ || '').trim().toLowerCase() === 'true';

    if (action && typeof action === 'string' && supabasePreferredActions.has(action)) {
      const supa = await handleSupabaseAction(action, data || {});
      if (supa.ok) {
        res.setHeader('X-EAC-Backend', 'supabase');
        res.setHeader('X-EAC-Action', action);
        const payload = (supa.data && typeof supa.data === 'object')
          ? (supa.data as Record<string, any>)
          : { data: supa.data };
        const ok = Boolean(payload?.success ?? true);
        if (!ok) {
          const err = String(payload?.error || 'Falha na operacao.');
          return sendError(res, 400, err, String(payload?.message || err), payload);
        }
        return sendSuccess(res, 200, payload);
      }

      if (!allowSheetsFallbackForReads) {
        console.error('[pages/api/comunicados] Falha Supabase:', { action, error: supa.error, details: supa.details });
        res.setHeader('X-EAC-Backend', 'supabase');
        res.setHeader('X-EAC-Action', action);
        const status = isSupabaseConfigured() ? 502 : 500;
        const err = String(supa.error || 'Falha ao consultar Supabase.');
        return sendError(res, status, err, err, { details: supa.details });
      }

      // Fallback explicitamente permitido: segue fluxo legado (Google Apps Script).
    }

    /*const webAppUrl =
      normalizeUrl(process.env.GOOGLE_WEBAPP_URL) ||
      normalizeUrl(process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL) ||
      normalizeUrl(clientUrl);*/

    const envUrl =
      normalizeUrl(process.env.GOOGLE_WEBAPP_URL) ||
      normalizeUrl(process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL) ||
      normalizeUrl(process.env.VITE_GOOGLE_WEBAPP_URL);

    const bodyUrl = normalizeUrl(clientUrl);

    // Regra determinística: prioriza ENV sempre que existir.
    // body/localStorage só é usado como fallback se ENV não estiver definida.
    const webAppUrl = envUrl || bodyUrl;
    const webAppSource = envUrl ? 'env' : (bodyUrl ? 'body' : 'unknown');

    // Headers de diagnóstico (não expõe a URL completa)
    const idMatch = webAppUrl ? webAppUrl.match(/\/s\/([^/]+)\/exec/) : null;
    const webAppId = idMatch?.[1] ? idMatch[1].slice(0, 10) : 'unknown';
    res.setHeader('X-EAC-WebApp-Source', webAppSource);
    res.setHeader('X-EAC-WebApp-Id', webAppId);
    const masterKey = normalizeUrl(process.env.CHAVE_MESTRA) || 'EAC-Admin-Secure-778899';

    if (!webAppUrl) {
      return sendError(res, 400, 'URL do Google Script nao configurada.');
    }

    if (!isValidGoogleWebAppUrl(webAppUrl)) {
      return sendError(res, 400, 'URL do Google Script invalida. Use o link do Web App publicado.');
    }

    if (!action || typeof action !== 'string') {
      return sendError(res, 400, 'Acao invalida.');
    }

    // ========= AJUSTE: garantir payload.appUrl na action que precisa =========
    const payload: Record<string, any> = { ...(data || {}) };

    if (action === 'EXECUTE_INTEREST_CONFIRMATION') {
      // 1) APP_URL (env) -> 2) origin do request -> 3) fallback
      const origin = normalizeUrl(req.headers?.origin as string | undefined);
      const forwardedHost = normalizeUrl((req.headers?.['x-forwarded-host'] as string | undefined) || (req.headers?.host as string | undefined));
      const forwardedProto = normalizeUrl(req.headers?.['x-forwarded-proto'] as string | undefined) || 'https';
      const inferredByHeaders = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
      const inferredAppUrl =
        normalizeUrl(process.env.APP_URL) ||
        origin ||
        inferredByHeaders ||
        'http://localhost:3000';

      if (!payload.appUrl) {
        payload.appUrl = inferredAppUrl;
      }
    }
    // =======================================================================

    const scriptPayload = {
      key: masterKey,
      action,
      payload
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getActionTimeoutMs(action));

    let response: globalThis.Response;
    try {
      response = await fetch(webAppUrl, {
        method: 'POST',
        body: JSON.stringify(scriptPayload),
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    let result: ApiResult;

    try {
      const parsed = await readJsonWithEncodingFallback(response);
      result = parsed.result as ApiResult;
    } catch (e) {
      const sample = errorToSample(e);
      console.error('[pages/api/comunicados] Resposta não-JSON do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        sample
      });

      return sendError(res, 502, 'Resposta invalida do servidor Google.');
    }

    if (!response.ok) {
      console.error('[pages/api/comunicados] Erro HTTP do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        result
      });

      const err = String(result?.error || `Erro Google: ${response.status}`);
      return sendError(res, response.status, err, String(result?.message || err), result || {});
    }

    const success = Boolean(result?.success ?? result?.ok ?? false);
    res.setHeader('X-EAC-Action', action);
    if (Array.isArray((result as any)?.nonEnrolled)) {
      res.setHeader('X-EAC-NonEnrolled-Count', String((result as any).nonEnrolled.length));
    }
    if (!success) {
      const err = String(result?.error || 'Falha ao executar acao.');
      return sendError(res, 400, err, String(result?.message || err), result || {});
    }
    return sendSuccess(res, 200, result || {});
  } catch (error: any) {
    const msg =
      error?.name === 'AbortError'
        ? 'Timeout ao chamar o Google Script.'
        : (error?.message || 'Erro interno.');

    console.error('[pages/api/comunicados] Falha:', error);
    return sendError(res, 500, msg);
  }
}

function errorToSample(error: unknown) {
  const message = (error as any)?.message || '';
  const marker = 'Amostra: ';
  const idx = message.indexOf(marker);
  if (idx === -1) return '';
  return message.slice(idx + marker.length).slice(0, 400);
}


