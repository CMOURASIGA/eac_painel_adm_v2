import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';

const toBool = (v: any) => ['1','true','sim','yes','y'].includes(String(v ?? '').trim().toLowerCase());

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

function buildAllowedModules(role: string, modules: string[]) {
  if (role === 'ADMIN') {
    return ['dashboard','dispatches','calendar','comunicados','logs','users','settings','help','members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','encontreiros','presence','inscricoes_review'];
  }
  const safe = new Set(['dashboard']);
  modules.forEach((m) => {
    const x = String(m || '').trim();
    if (x) safe.add(x);
  });
  return Array.from(safe);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return send(res, 400, { success: false, error: 'Email e senha obrigatorios.' });

    const url = String(process.env.SUPABASE_URL || '').trim();
    const anon = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!url || !anon) return send(res, 500, { success: false, error: 'Supabase auth nao configurado.' });

    const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await authClient.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data?.user) {
      return send(res, 401, { success: false, error: 'Credenciais invalidas.' });
    }

    const authUser = signIn.data.user;
    const supabase = getSupabaseServerClient();
    if (!supabase) return send(res, 500, { success: false, error: 'Supabase server nao configurado.' });

    const profileRes = await supabase
      .from('app_user_profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .limit(1);

    if (profileRes.error) return send(res, 500, { success: false, error: profileRes.error.message });
    const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;
    if (!profile) return send(res, 403, { success: false, error: 'Perfil de acesso nao encontrado.' });

    if (String(profile.status || '').toUpperCase() !== 'ATIVO') {
      return send(res, 403, { success: false, error: 'Usuario inativo.' });
    }

    const role = String(profile.role || 'VIEWER').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'VIEWER';
    const allowedModules = buildAllowedModules(role, Array.isArray(profile.allowed_modules) ? profile.allowed_modules : []);

    const user = {
      id: String(profile.id || authUser.id),
      name: String(profile.nome || authUser.email || 'Usuario'),
      email: String(profile.email || authUser.email || email),
      role,
      status: 'Ativo',
      permissions: {
        canCreate: role === 'ADMIN' || toBool(profile?.metadata?.canCreate),
        canEdit: role === 'ADMIN' || toBool(profile?.metadata?.canEdit),
        canView: true,
        canDelete: role === 'ADMIN' || toBool(profile?.metadata?.canDelete),
        allowedModules,
        modulePermissions: {
          encontreiros: {
            canCreate: role === 'ADMIN' || toBool(profile?.metadata?.encontreiros?.canCreate),
            canEdit: role === 'ADMIN' || toBool(profile?.metadata?.encontreiros?.canEdit),
            canView: true,
            canDelete: role === 'ADMIN' || toBool(profile?.metadata?.encontreiros?.canDelete),
            canViewSensitive: role === 'ADMIN' || toBool(profile?.metadata?.encontreiros?.canViewSensitive),
          },
        },
      },
    };

    return send(res, 200, { success: true, user });
  } catch (e: any) {
    return send(res, 500, { success: false, error: e?.message || 'Erro interno.' });
  }
}
