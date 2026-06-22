import { NextResponse } from 'next/server';
import { getMojibakeScore, sanitizeTextDeep } from '../../../utils/textEncoding';
import { handleSupabaseAction } from '../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../utils/supabaseServer';
import { authorizeRequest } from '../../../utils/apiAuth';

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
    'EXECUTE_COMUNICACAO_NAO_PARTICIPACAO_EAC',
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
    const actionStr = String(action || '').trim();

    const protectedActions: Record<string, { module: string; action: 'view' | 'create' | 'edit' | 'delete' }> = {
      GET_USERS: { module: 'users', action: 'view' },
      SAVE_USER: { module: 'users', action: 'edit' },
      DELETE_USER: { module: 'users', action: 'delete' },
      GET_MEMBERS: { module: 'members', action: 'view' },
      SEARCH_MEMBERS: { module: 'members', action: 'view' },
      SAVE_MEMBER: { module: 'members', action: 'edit' },
      DELETE_MEMBER: { module: 'members', action: 'delete' },
      GET_NON_ENROLLED: { module: 'inscricoes_prioritarias', action: 'view' },
      ATUALIZAR_NAO_INSCRITOS: { module: 'inscricoes_prioritarias', action: 'edit' },
      UPDATE_NON_ENROLLED_RECADO: { module: 'inscricoes_prioritarias', action: 'edit' },
      UPDATE_NON_ENROLLED_RECORD: { module: 'inscricoes_prioritarias', action: 'edit' },
      UPDATE_NON_ENROLLED_INTEREST: { module: 'inscricoes_prioritarias', action: 'edit' },
      PRIORITIZE_NON_ENROLLED: { module: 'inscricoes_prioritarias', action: 'edit' },
      GET_EVENTS: { module: 'calendar', action: 'view' },
      SAVE_EVENT: { module: 'calendar', action: 'edit' },
      DELETE_EVENT: { module: 'calendar', action: 'delete' },
      GET_COMUNICADOS: { module: 'comunicados', action: 'view' },
      SAVE_COMUNICADO: { module: 'comunicados', action: 'edit' },
      DELETE_COMUNICADO: { module: 'comunicados', action: 'delete' },
      GET_LOGS: { module: 'logs', action: 'view' },
      GET_OPERATIONAL_LOGS: { module: 'logs', action: 'view' },
      GET_DISPARO_EXECUCOES: { module: 'dispatches', action: 'view' },
      START_DISPARO_EXECUCAO: { module: 'dispatches', action: 'edit' },
      UPDATE_DISPARO_EXECUCAO_STATUS: { module: 'dispatches', action: 'edit' },
      RETRY_DISPARO_FALHAS: { module: 'dispatches', action: 'edit' },
      GET_SAFE_SETTINGS: { module: 'settings', action: 'view' },
      GET_CONTEXT_HELP: { module: 'help', action: 'view' },
      GET_ENCONTREIROS: { module: 'encontreiros', action: 'view' },
      SAVE_ENCONTREIRO: { module: 'encontreiros', action: 'edit' },
      DELETE_ENCONTREIRO: { module: 'encontreiros', action: 'delete' },
      GET_PRESENCE: { module: 'presence', action: 'view' },
      GET_CIRCULOS_DISTRIBUIDOS: { module: 'inscricoes_prioritarias_circulos', action: 'view' },
      GET_INSCRICOES_PRIORITARIAS: { module: 'inscricoes_prioritarias', action: 'view' },
      EXECUTE_DISTRIBUICAO_CIRCULOS: { module: 'inscricoes_prioritarias_circulos', action: 'edit' },
      MOVE_CIRCULO_PARTICIPANTE: { module: 'inscricoes_prioritarias_circulos', action: 'edit' },
      EXECUTE_COMUNICADO_99: { module: 'dispatches', action: 'edit' },
      EXECUTE_ANIVERSARIANTES: { module: 'dispatches', action: 'edit' },
      EXECUTE_EVENTOS: { module: 'dispatches', action: 'edit' },
      EXECUTE_WAITLIST_NON_ENROLLED: { module: 'dispatches', action: 'edit' },
      EXECUTE_CONFIRM_NAO_INSCRITOS: { module: 'dispatches', action: 'edit' },
      EXECUTE_CONFIRM_INSCRITOS: { module: 'dispatches', action: 'edit' },
      EXECUTE_INTEREST_CONFIRMATION: { module: 'dispatches', action: 'edit' },
    };

    if (actionStr && protectedActions[actionStr]) {
      const auth = await authorizeRequest(req, protectedActions[actionStr]);
      if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
    }

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
      'MARK_PRESENCE',
      'GET_PUBLIC_PRESENCE_DATA',
      'GET_CIRCULOS_DISTRIBUIDOS',
      'GET_INSCRICOES_PRIORITARIAS',
      'GET_EMAIL_STATUS_SUMMARY',
      'GET_EMAIL_CALLS_BY_PERSON',
      'SAVE_ENCONTREIRO',
      'DELETE_ENCONTREIRO',
      'NORMALIZE_ENCONTREIRO_WHATSAPP',
      'GET_EQUIPES',
      'GET_ENCONTREIRO_EQUIPES',
      'SAVE_ENCONTREIRO_EQUIPES',
      'UPDATE_NON_ENROLLED_INTEREST',
      'PRIORITIZE_NON_ENROLLED',
      'EXECUTE_DISTRIBUICAO_CIRCULOS',
      'MOVE_CIRCULO_PARTICIPANTE',
      'EXECUTE_CONFIRM_INSCRITOS',
      'EXECUTE_ANIVERSARIANTES',
      'EXECUTE_COMUNICADO_99',
    ]);

    const allowSheetsFallbackForReads =
      String(process.env.EAC_ALLOW_SHEETS_FALLBACK_READ || '').trim().toLowerCase() === 'true';

    if (action && typeof action === 'string' && supabasePreferredActions.has(action)) {
      const supa = await handleSupabaseAction(action, data || {});
      if (supa.ok) {
        const r = NextResponse.json(supa.data, { status: 200 });
        r.headers.set('X-EAC-Backend', 'supabase');
        r.headers.set('X-EAC-Action', action);
        return r;
      }

      if (!allowSheetsFallbackForReads) {
        console.error('[api/comunicados] Falha Supabase:', { action, error: supa.error, details: supa.details });
        const status = isSupabaseConfigured() ? 502 : 500;
        const r = NextResponse.json(
          { success: false, error: supa.error || 'Falha ao consultar Supabase.' },
          { status }
        );
        r.headers.set('X-EAC-Backend', 'supabase');
        r.headers.set('X-EAC-Action', action);
        return r;
      }
      // fallback explicitamente permitido: continua legado
    }

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



