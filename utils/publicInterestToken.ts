import crypto from 'crypto';
import { getSupabaseServerClient } from './supabaseServer.ts';

const TOKEN_TTL_HOURS = Number(process.env.PUBLIC_INTEREST_TOKEN_TTL_HOURS || 72);

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function issuePublicInterestToken(input: {
  email: string;
  pessoaId?: string;
  inscricaoId?: string;
  payload?: Record<string, any>;
  createdBy?: string;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, error: 'Supabase nao configurado.' } as const;

  const email = String(input.email || '').trim().toLowerCase();
  if (!email) return { success: false, error: 'email obrigatorio.' } as const;

  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const revokeRes = await supabase
    .from('public_interest_tokens')
    .update({ revoked_at: new Date().toISOString() } as any)
    .eq('email', email)
    .is('used_at', null)
    .is('revoked_at', null);
  if (revokeRes.error) return { success: false, error: revokeRes.error.message } as const;

  const insertRes = await supabase
    .from('public_interest_tokens')
    .insert({
      token_hash: tokenHash,
      email,
      pessoa_id: input.pessoaId || null,
      inscricao_id: input.inscricaoId || null,
      origem: 'SISTEMA',
      expires_at: expiresAt,
      payload: input.payload || {},
      created_by: input.createdBy || null,
    } as any)
    .select('*')
    .limit(1);

  if (insertRes.error) return { success: false, error: insertRes.error.message } as const;
  const row = Array.isArray(insertRes.data) ? insertRes.data[0] : null;

  return { success: true, token, expiresAt, row } as const;
}

export async function validatePublicInterestToken(token: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, error: 'Supabase nao configurado.' } as const;

  const raw = String(token || '').trim();
  if (!raw) return { success: false, error: 'token obrigatorio.' } as const;

  const tokenHash = hashToken(raw);
  const res = await supabase
    .from('public_interest_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .limit(1);

  if (res.error) return { success: false, error: res.error.message } as const;
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) return { success: false, error: 'token invalido.' } as const;

  if (row.revoked_at) return { success: false, error: 'token revogado.' } as const;
  if (row.used_at) return { success: false, error: 'token ja utilizado.' } as const;
  if (new Date(row.expires_at).getTime() < Date.now()) return { success: false, error: 'token expirado.' } as const;

  return { success: true, row } as const;
}

export async function consumePublicInterestToken(token: string, audit?: { ip?: string; userAgent?: string; payload?: Record<string, any> }) {
  const validation = await validatePublicInterestToken(token);
  if (!validation.success) return validation;

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, error: 'Supabase nao configurado.' } as const;

  const row = validation.row as any;
  const tokenId = String(row.id);

  const upd = await supabase
    .from('public_interest_tokens')
    .update({ used_at: new Date().toISOString() } as any)
    .eq('id', tokenId)
    .is('used_at', null)
    .select('*')
    .limit(1);

  if (upd.error) return { success: false, error: upd.error.message } as const;

  await supabase.from('public_interest_token_audit').insert({
    token_id: tokenId,
    event: 'TOKEN_CONSUMED',
    ip: audit?.ip || null,
    user_agent: audit?.userAgent || null,
    payload: audit?.payload || {},
  } as any);

  const updated = Array.isArray(upd.data) ? upd.data[0] : null;
  if (!updated) return { success: false, error: 'token ja consumido.' } as const;

  return { success: true, row: updated } as const;
}
