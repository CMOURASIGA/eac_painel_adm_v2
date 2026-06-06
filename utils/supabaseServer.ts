import { createClient } from '@supabase/supabase-js';

type SupabaseEnvConfig = {
  url: string;
  key: string;
  schema: string;
};

function readSupabaseEnvConfig(): SupabaseEnvConfig | null {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const schema = String(process.env.SUPABASE_SCHEMA || 'public').trim() || 'public';

  if (!url || !key) return null;
  return { url, key, schema };
}

export function isSupabaseConfigured() {
  return Boolean(readSupabaseEnvConfig());
}

export function getSupabaseServerClient() {
  const cfg = readSupabaseEnvConfig();
  if (!cfg) return null;

  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: cfg.schema },
    global: { fetch },
  });
}

