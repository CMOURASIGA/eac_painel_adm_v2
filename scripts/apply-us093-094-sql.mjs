import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;
const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });
const sql = fs.readFileSync(path.join(root, 'docs', 'US-093-094-foundation.sql'), 'utf-8').replace(/^\uFEFF/, '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabasePassword = String(process.env.SUPABASE_PASSWORD || '').trim();
if (!supabaseUrl || !supabasePassword) { console.error('SUPABASE_URL/SUPABASE_PASSWORD ausentes'); process.exit(1); }
const host = `db.${new URL(supabaseUrl).host}`;
const client = new Client({ host, port: 5432, user: 'postgres', password: supabasePassword, database: 'postgres', ssl: { rejectUnauthorized: false } });
try {
  console.log(`[sql] conectando em ${host}:5432 ...`);
  await client.connect();
  console.log('[sql] aplicando script US-093-094...');
  await client.query(sql);
  const check = await client.query(`select
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='app_user_profiles') as has_profiles,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='public_interest_tokens') as has_tokens,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='public_interest_token_audit') as has_audit`);
  console.log('[sql] ok:', check.rows?.[0] || {});
} catch (e) {
  console.error('[sql] falha:', e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
