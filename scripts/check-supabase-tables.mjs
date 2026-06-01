#!/usr/bin/env node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Erro ao carregar .env.local');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-from': 'check-supabase-tables-script' } }
});

const tables = [
  'inscricoes',
  'adolescente_responsaveis',
  'adolescentes',
  'encontros',
  'inscricoes',
  'pessoas',
  'responsaveis',
  'inscricoes_status_historico'
];

async function checkTable(table) {
  try {
    const { data, error, status } = await supabase
      .from(table)
      .select('id')
      .limit(1);

    if (error) {
      return { table, exists: false, error: error.message, status };
    }
    return { table, exists: true, data, status };
  } catch (e) {
    return { table, exists: false, error: String(e) };
  }
}

(async () => {
  console.log('Verificando existência de tabelas no Supabase...');

  const results = [];
  for (const table of tables) {
    const result = await checkTable(table);
    results.push(result);
    console.log(`- ${table}: ${result.exists ? 'EXISTE' : 'NÃO EXISTE'}${result.error ? ` (${result.error})` : ''}`);
  }

  const nonExistent = results.filter((r) => !r.exists);
  const existent = results.filter((r) => r.exists);

  console.log('\nResumo:');
  console.log(`- Existentes: ${existent.length}`);
  console.log(`- Não existentes: ${nonExistent.length}`);

  if (nonExistent.length > 0) {
    console.log('\nTabelas não existentes confirmadas:');
    nonExistent.forEach((r) => console.log(`  • ${r.table}`));
  }

  process.exit(nonExistent.length === tables.length ? 0 : 0);
})();
