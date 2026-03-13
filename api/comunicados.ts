import type { NextApiRequest, NextApiResponse } from 'next';

type ApiResult = Record<string, any> & { success?: boolean; error?: string };

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
      const inferredAppUrl =
        normalizeUrl(process.env.APP_URL) ||
        origin ||
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

    const text = await response.text();
    let result: ApiResult;

    try {
      result = JSON.parse(text) as ApiResult;
    } catch (e) {
      console.error('[pages/api/comunicados] Resposta não-JSON do Google Script:', {
        status: response.status,
        statusText: response.statusText,
        sample: (text || '').slice(0, 400)
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
