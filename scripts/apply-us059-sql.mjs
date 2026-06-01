#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD;

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL não configurada em .env.local');
  process.exit(1);
}

const urlObj = new URL(SUPABASE_URL);
const host = urlObj.hostname;

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
    const sqlFile = path.join(__dirname, '../docs/US-059-bloquear-usuario-inativo.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    await client.connect();
    await client.query(sql);
    console.log('US-059 SQL aplicado com sucesso.');
  } catch (e) {
    console.error('Falha ao aplicar SQL da US-059.');
    console.error('message:', e?.message || '(sem message)');
    console.error('code:', e?.code || '(sem code)');
    console.error('detail:', e?.detail || '(sem detail)');
    console.error('hint:', e?.hint || '(sem hint)');
    console.error('stack:', e?.stack || '(sem stack)');
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

applySql();
