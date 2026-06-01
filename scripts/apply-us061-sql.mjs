#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD;

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL não configurada em .env.local');
  process.exit(1);
}

const host = new URL(SUPABASE_URL).hostname;

async function main() {
  const client = new Client({
    host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: SUPABASE_PASSWORD || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, '../docs/US-061-proteger-dados-sensiveis-rls.sql'), 'utf-8');
    await client.connect();
    await client.query(sql);
    console.log('US-061 SQL aplicado com sucesso.');
  } catch (e) {
    console.error('Falha ao aplicar SQL da US-061.');
    console.error('message:', e?.message || '(sem message)');
    console.error('code:', e?.code || '(sem code)');
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
