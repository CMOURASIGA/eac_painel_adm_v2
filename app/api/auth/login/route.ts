import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const toBool = (v: any) => ['1', 'true', 'sim', 'yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

function buildAllowedModules(role: string, modules: string[]) {
  if (role === 'ADMIN') {
    return [
      'dashboard', 'dispatches', 'calendar', 'comunicados', 'logs', 'users', 'settings', 'help',
      'members', 'inscricoes_prioritarias', 'inscricoes_prioritarias_circulos', 'encontreiros', 'presence', 'inscricoes_review',
    ];
  }
  const safe = new Set(['dashboard']);
  modules.forEach((m) => {
    const x = String(m || '').trim();
    if (x) safe.add(x);
  });
  return Array.from(safe);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email e senha obrigatorios.' }, { status: 400 });
    }

    const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const anon = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!url || !anon) {
      return NextResponse.json({
        success: false,
        error: 'Supabase auth nao configurado.',
        details: { hasUrl: Boolean(url), hasAnon: Boolean(anon) },
      }, { status: 500 });
    }

    const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await authClient.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data?.user) {
      return NextResponse.json({ success: false, error: 'Credenciais invalidas.' }, { status: 401 });
    }

    const authUser = signIn.data.user;
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase server nao configurado.',
        details: { hasServiceRole: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) },
      }, { status: 500 });
    }

    const profileRes = await supabase
      .from('app_user_profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .limit(1);

    if (profileRes.error) {
      return NextResponse.json({ success: false, error: profileRes.error.message }, { status: 500 });
    }
    const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Perfil de acesso nao encontrado.' }, { status: 403 });
    }
    if (String(profile.status || '').toUpperCase() !== 'ATIVO') {
      return NextResponse.json({ success: false, error: 'Usuario inativo.' }, { status: 403 });
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
      },
    };

    return NextResponse.json({ success: true, user }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Erro interno.' }, { status: 500 });
  }
}
