import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });

const sqlFile = path.join(root, 'docs', 'US-080-083-foundation.sql');
const sql = fs.readFileSync(sqlFile, 'utf-8').replace(/^\uFEFF/, '');

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabasePassword = String(process.env.SUPABASE_PASSWORD || '').trim();

if (!supabaseUrl) {
  console.error('SUPABASE_URL ausente no .env.local');
  process.exit(1);
}
if (!supabasePassword) {
  console.error('SUPABASE_PASSWORD ausente no .env.local (necessario para conexao pg)');
  process.exit(1);
}

const urlObj = new URL(supabaseUrl);
const host = `db.${urlObj.host}`;

const client = new Client({
  host,
  port: 5432,
  user: 'postgres',
  password: supabasePassword,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  console.log(`[sql] conectando em ${host}:5432 ...`);
  await client.connect();
  console.log('[sql] conexao ok, aplicando script US-080-083...');
  await client.query(sql);
  console.log('[sql] script aplicado com sucesso.');

  const checks = await client.query(`
    select
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='cadastro_oficial') as has_cadastro_oficial,
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='pessoa_papeis') as has_pessoa_papeis,
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='inscricoes_duplicidade_historico') as has_dup_hist,
      exists(select 1 from information_schema.views where table_schema='public' and table_name='vw_inscricoes_sem_duplicidade') as has_view
  `);
  console.log('[sql] verificacao:', checks.rows?.[0] || {});
} catch (e) {
  console.error('[sql] falha:', e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

