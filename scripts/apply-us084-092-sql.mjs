import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;
const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });
const sqlFile = path.join(root, 'docs', 'US-084-092-foundation.sql');
const sql = fs.readFileSync(sqlFile, 'utf-8').replace(/^\uFEFF/, '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabasePassword = String(process.env.SUPABASE_PASSWORD || '').trim();
if (!supabaseUrl || !supabasePassword) { console.error('SUPABASE_URL/SUPABASE_PASSWORD ausentes'); process.exit(1); }
const host = `db.${new URL(supabaseUrl).host}`;
const client = new Client({ host, port: 5432, user: 'postgres', password: supabasePassword, database: 'postgres', ssl: { rejectUnauthorized: false } });
try {
  console.log(`[sql] conectando em ${host}:5432 ...`);
  await client.connect();
  console.log('[sql] aplicando script US-084-092...');
  await client.query(sql);
  console.log('[sql] script aplicado com sucesso.');
  const checks = await client.query(`select
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='migracao_regras_inventario') as has_inventario,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='backend_service_execucoes') as has_service_exec,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='circulos_execucoes') as has_circulos_exec,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='circulos_execucao_itens') as has_circulos_itens,
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='disparo_execucoes') as has_disparo_exec`);
  console.log('[sql] verificacao:', checks.rows?.[0] || {});
} catch (e) {
  console.error('[sql] falha:', e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
