import type { NextApiRequest, NextApiResponse } from 'next';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { action, data, googleWebAppUrl: clientUrl } = req.body ?? {};

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
      return res.status(400).json({ success: false, error: 'URL do Google Script não configurada.' });
    }

    if (!isValidGoogleWebAppUrl(webAppUrl)) {
      return res.status(400).json({
        success: false,
        error: 'URL do Google Script inválida. Use o link do Web App publicado.'
      });
    }

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ success: false, error: 'Ação inválida.' });
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

      return res.status(502).json({ success: false, error: 'Resposta inválida do servidor Google.' });
    }

    if (!response.ok) {
      console.error('[pages/api/comunicados] Erro HTTP do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        result
      });

      return res.status(response.status).json({
        success: false,
        error: result?.error || `Erro Google: ${response.status}`,
        ...result
      });
    }

    const success = Boolean(result?.success ?? result?.ok ?? false);
    res.setHeader('X-EAC-Action', action);
    if (Array.isArray((result as any)?.nonEnrolled)) {
      res.setHeader('X-EAC-NonEnrolled-Count', String((result as any).nonEnrolled.length));
    }
    return res.status(200).json({ success, ...result });
  } catch (error: any) {
    const msg =
      error?.name === 'AbortError'
        ? 'Timeout ao chamar o Google Script.'
        : (error?.message || 'Erro interno.');

    console.error('[pages/api/comunicados] Falha:', error);
    return res.status(500).json({ success: false, error: msg });
  }
}

function errorToSample(error: unknown) {
  const message = (error as any)?.message || '';
  const marker = 'Amostra: ';
  const idx = message.indexOf(marker);
  if (idx === -1) return '';
  return message.slice(idx + marker.length).slice(0, 400);
}
