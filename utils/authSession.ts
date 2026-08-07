import { getSupabaseServerClient } from './supabaseServer.js';

// Cookie httpOnly que carrega o access_token (JWT) da sessao do Supabase Auth.
// Substitui o antigo header "x-eac-user-email" (nao assinado, facilmente
// forjavel) como fonte de identidade para autorizacao nas rotas de API.
export const EAC_SESSION_COOKIE = 'eac_session';

const isProdEnv = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

export function buildSessionCookieHeader(accessToken: string, expiresInSeconds?: number) {
  const maxAge = Math.max(60, Math.floor(Number(expiresInSeconds) || 3600));
  const attrs = [
    `${EAC_SESSION_COOKIE}=${encodeURIComponent(accessToken)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isProdEnv()) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearSessionCookieHeader() {
  const attrs = [
    `${EAC_SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProdEnv()) attrs.push('Secure');
  return attrs.join('; ');
}

function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

export function getSessionTokenFromRequest(req: Request): string {
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  return String(cookies[EAC_SESSION_COOKIE] || '').trim();
}

// Compat: Pages Router (NextApiRequest) expoe cookies via req.headers.cookie (string).
export function getSessionTokenFromCookieString(cookieHeader: string | null | undefined): string {
  const cookies = parseCookieHeader(cookieHeader);
  return String(cookies[EAC_SESSION_COOKIE] || '').trim();
}

export type AuthenticatedIdentity = { email: string; authUserId: string };

async function resolveIdentityFromToken(token: string): Promise<AuthenticatedIdentity | null> {
  if (!token) return null;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) return null;

  return { email: String(data.user.email).trim().toLowerCase(), authUserId: String(data.user.id) };
}

// Valida o JWT da sessao (cookie httpOnly) contra o Supabase Auth — nao confia
// em nada enviado pelo client alem do proprio token assinado.
export async function getAuthenticatedIdentity(req: Request): Promise<AuthenticatedIdentity | null> {
  return resolveIdentityFromToken(getSessionTokenFromRequest(req));
}

export async function getAuthenticatedIdentityFromCookieString(
  cookieHeader: string | null | undefined
): Promise<AuthenticatedIdentity | null> {
  return resolveIdentityFromToken(getSessionTokenFromCookieString(cookieHeader));
}
