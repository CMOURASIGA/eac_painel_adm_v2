#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carregar .env.local
const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.config({ path: envPath });

if (envConfig.error) {
  console.error('❌ Erro ao carregar .env.local');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

// Parse Supabase URL para obter host
const urlObj = new URL(SUPABASE_URL);
const host = urlObj.hostname;

console.log('📋 Aplicando SQL da US-023 no Supabase...\n');
console.log(`URL: ${SUPABASE_URL}`);
console.log(`Host: ${host}`);

// ============================================================================
// Conectar e aplicar SQL
// ============================================================================

async function applySql() {
  const client = new Client({
    host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: SUPABASE_PASSWORD || 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\n📖 Lendo arquivo SQL...');
    const sqlFile = path.join(__dirname, '../docs/US-023-alterar-status-inscricao.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    
    console.log('✅ SQL lido com sucesso');
    
    console.log('\n🔗 Conectando ao Supabase...');
    await client.connect();
    console.log('✅ Conectado');
    
    console.log('\n▶️  Executando SQL...');
    
    // Executar o SQL completo
    await client.query(sql);
    
    console.log('✅ SQL executado com sucesso!');
    
    // Validar se tabela foi criada
    console.log('\n✓ Validando criação da tabela...');
    const result = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'inscricoes_status_historico'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Tabela inscricoes_status_historico foi criada com sucesso!\n');
      return true;
    } else {
      console.log('⚠️  Tabela não foi criada. Algo deu errado.\n');
      return false;
    }
    
  } catch (e) {
    console.error('❌ Erro ao aplicar SQL:');
    console.error(e.message);
    
    if (e.code === 'ECONNREFUSED') {
      console.log('\n💡 Sugestão: Verifique se a SUPABASE_PASSWORD está correta em .env.local');
    }
    
    return false;
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const success = await applySql();
  
  if (success) {
    console.log('═'.repeat(80));
    console.log('✅ SQL APLICADO COM SUCESSO!');
    console.log('═'.repeat(80));
    console.log('\n📝 Próximo passo:');
    console.log('   Execute: node scripts/homolog-us023-full.mjs\n');
    process.exit(0);
  } else {
    console.log('═'.repeat(80));
    console.log('❌ FALHA AO APLICAR SQL');
    console.log('═'.repeat(80));
    console.log('\n💡 Alternativa manual:');
    console.log('   1. Abra: https://app.supabase.com');
    console.log('   2. SQL Editor → New Query');
    console.log('   3. Cole: docs/US-023-alterar-status-inscricao.sql');
    console.log('   4. Clique Run\n');
    process.exit(1);
  }
}

main();
