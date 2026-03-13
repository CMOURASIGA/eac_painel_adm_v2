import { NextResponse } from 'next/server';
import { getMojibakeScore, sanitizeTextDeep } from '../../../utils/textEncoding.ts';

export const dynamic = 'force-dynamic';

const LATIN1_CHARSET_REGEX = /(charset\s*=\s*(iso-8859-1|latin1|windows-1252))/i;

async function readJsonWithEncodingFallback(response: Response) {
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
  return (url || '').toString().trim();
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
  ]);

  return heavyActions.has(action) ? 120000 : 30000;
}

export async function POST(req: Request) {
  let webAppSource = 'unknown';
  let webAppId = 'unknown';
  let actionName = 'unknown';

  try {
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: 'Payload inválido: JSON malformado.' },
        { status: 400 }
      );
    }

    const { action, data, googleWebAppUrl: clientUrl } = body ?? {};

    const envUrl =
      normalizeUrl(process.env.GOOGLE_WEBAPP_URL) ||
      normalizeUrl(process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL) ||
      normalizeUrl(process.env.VITE_GOOGLE_WEBAPP_URL);
    const bodyUrl = normalizeUrl(clientUrl);

    // Regra determinística: prioriza ENV sempre que existir.
    // O payload (body) só entra como fallback quando ENV não estiver configurada.
    const webAppUrl = envUrl || bodyUrl;
    webAppSource = envUrl ? 'env' : (bodyUrl ? 'body' : 'unknown');

    const masterKey =
      normalizeUrl(process.env.CHAVE_MESTRA) || "EAC-Admin-Secure-778899";

    if (!webAppUrl) {
      const r = NextResponse.json(
        { success: false, error: 'URL do Google Script não configurada.' },
        { status: 400 }
      );
      r.headers.set('X-EAC-WebApp-Source', webAppSource);
      r.headers.set('X-EAC-WebApp-Id', 'unknown');
      return r;
    }

    if (!isValidGoogleWebAppUrl(webAppUrl)) {
      const r = NextResponse.json(
        { success: false, error: 'URL do Google Script inválida. Use o link do Web App publicado.' },
        { status: 400 }
      );
      r.headers.set('X-EAC-WebApp-Source', webAppSource);
      r.headers.set('X-EAC-WebApp-Id', 'invalid');
      return r;
    }

    if (!action || typeof action !== 'string') {
      const r = NextResponse.json(
        { success: false, error: 'Ação inválida.' },
        { status: 400 }
      );
      r.headers.set('X-EAC-WebApp-Source', webAppSource);
      r.headers.set('X-EAC-WebApp-Id', 'unknown');
      return r;
    }
    actionName = action;

    const idMatch = webAppUrl.match(/\/s\/([^/]+)\/exec/);
    webAppId = idMatch?.[1] ? idMatch[1].slice(0, 10) : 'unknown';

    // ========= AJUSTE AQUI (mínimo, sem mexer em componente) =========
    // O Google Script exige payload.appUrl em EXECUTE_INTEREST_CONFIRMATION
    const payload = { ...(data || {}) };

    if (action === 'EXECUTE_INTEREST_CONFIRMATION') {
      const origin = normalizeUrl(req.headers.get('origin'));
      const inferredAppUrl =
        normalizeUrl(process.env.APP_URL) ||
        origin ||
        'http://localhost:3000';

      if (!payload.appUrl) {
        payload.appUrl = inferredAppUrl;
      }
    }
    // ================================================================

    const scriptPayload = {
      key: masterKey,
      action,
      payload
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getActionTimeoutMs(action));

    let response: Response;
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

    let result: any;
    try {
      const parsed = await readJsonWithEncodingFallback(response);
      result = parsed.result;
      // Header útil para diagnosticar respostas que chegam em latin1.
      webAppSource = `${webAppSource}|decode:${parsed.encoding}`;
    } catch (e) {
      const sample = errorToSample(e);
      console.error('[api/comunicados] Resposta não-JSON do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        sample
      });

      const r = NextResponse.json(
        { success: false, error: 'Resposta inválida do servidor Google.', sample },
        { status: 502 }
      );
      r.headers.set('X-EAC-WebApp-Source', webAppSource);
      r.headers.set('X-EAC-WebApp-Id', webAppId);
      r.headers.set('X-EAC-Action', action);
      return r;
    }

    if (!response.ok) {
      console.error('[api/comunicados] Erro HTTP do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        result
      });

      const r = NextResponse.json(
        { success: false, error: result?.error || `Erro Google: ${response.status}`, ...result },
        { status: response.status }
      );
      r.headers.set('X-EAC-WebApp-Source', webAppSource);
      r.headers.set('X-EAC-WebApp-Id', webAppId);
      r.headers.set('X-EAC-Action', action);
      return r;
    }

    const success = Boolean(result?.ok || result?.success || false);

    const okRes = NextResponse.json(
      { success, ...result },
      { status: 200 }
    );
    okRes.headers.set('X-EAC-Action', action);
    okRes.headers.set('X-EAC-WebApp-Source', webAppSource);
    okRes.headers.set('X-EAC-WebApp-Id', webAppId);
    if (Array.isArray(result?.nonEnrolled)) {
      okRes.headers.set('X-EAC-NonEnrolled-Count', String(result.nonEnrolled.length));
    }
    return okRes;

  } catch (error: any) {
    const msg =
      error?.name === 'AbortError'
        ? 'Timeout ao chamar o Google Script.'
        : (error?.message || 'Erro interno.');

    console.error('[api/comunicados] Falha:', error);

    const r = NextResponse.json(
      { success: false, error: msg, action: actionName, webAppSource, webAppId },
      { status: 500 }
    );
    r.headers.set('X-EAC-WebApp-Source', webAppSource);
    r.headers.set('X-EAC-WebApp-Id', webAppId);
    r.headers.set('X-EAC-Action', actionName);
    return r;
  }
}

function errorToSample(error: unknown) {
  const message = (error as any)?.message || '';
  const marker = 'Amostra: ';
  const idx = message.indexOf(marker);
  if (idx === -1) return '';
  return message.slice(idx + marker.length).slice(0, 400);
}
