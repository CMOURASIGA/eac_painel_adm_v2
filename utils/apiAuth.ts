import { getSupabaseServerClient } from './supabaseServer.js';

type AccessAction = 'view' | 'create' | 'edit' | 'delete';

type AuthOptions = {
  module: string;
  action: AccessAction;
};

const toBool = (v: any) => ['1', 'true', 'sim', 'yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

function getEmailFromRequest(req: Request) {
  const byHeader = String(req.headers.get('x-eac-user-email') || req.headers.get('x-user-email') || '').trim().toLowerCase();
  if (byHeader) return byHeader;
  return '';
}

function canByAction(action: AccessAction, metadata: any) {
  if (action === 'view') return true;
  if (action === 'create') return toBool(metadata?.canCreate);
  if (action === 'edit') return toBool(metadata?.canEdit);
  return toBool(metadata?.canDelete);
}

export async function authorizeRequest(req: Request, options: AuthOptions) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, status: 500, body: { success: false, error: 'AUTH_NOT_CONFIGURED' } };
  }

  const requireHeader = String(process.env.EAC_AUTH_REQUIRE_HEADER || '').trim().toLowerCase() === 'true';
  const email = getEmailFromRequest(req);

  if (!email) {
    if (requireHeader) {
      return { ok: false, status: 401, body: { success: false, error: 'AUTH_REQUIRED', message: 'Header x-eac-user-email obrigatorio.' } };
    }
    // Fallback de homologacao/local: permite se houver ao menos um ADMIN ativo.
    const adminRes = await supabase
      .from('app_user_profiles')
      .select('id')
      .eq('status', 'ATIVO')
      .eq('role', 'ADMIN')
      .limit(1);
    if (adminRes.error || !Array.isArray(adminRes.data) || adminRes.data.length === 0) {
      return { ok: false, status: 403, body: { success: false, error: 'ACCESS_DENIED' } };
    }
    return { ok: true, status: 200, body: { success: true, fallback: true } };
  }

  const profileRes = await supabase
    .from('app_user_profiles')
    .select('email, role, status, allowed_modules, metadata')
    .eq('email', email)
    .limit(1);

  if (profileRes.error) {
    return { ok: false, status: 500, body: { success: false, error: profileRes.error.message } };
  }

  const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;
  if (!profile || String(profile.status || '').toUpperCase() !== 'ATIVO') {
    return { ok: false, status: 403, body: { success: false, error: 'ACCESS_DENIED' } };
  }

  const role = String(profile.role || '').toUpperCase();
  if (role === 'ADMIN') return { ok: true, status: 200, body: { success: true, role } };

  const allowedModules = Array.isArray(profile.allowed_modules) ? profile.allowed_modules.map((x: any) => String(x)) : [];
  if (!allowedModules.includes(options.module)) {
    return { ok: false, status: 403, body: { success: false, error: 'MODULE_FORBIDDEN', module: options.module } };
  }

  const metadata = profile.metadata && typeof profile.metadata === 'object' ? profile.metadata : {};
  if (!canByAction(options.action, metadata)) {
    return { ok: false, status: 403, body: { success: false, error: 'ACTION_FORBIDDEN', action: options.action } };
  }

  return { ok: true, status: 200, body: { success: true, role } };
}

