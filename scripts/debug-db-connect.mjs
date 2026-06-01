#!/usr/bin/env node

import { Client } from 'pg';

const client = new Client({
  host: 'niagdoowqmngxjcrmstd.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'E@Cporiuncula2024',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('CONNECTED');
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

main();
