import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mock runtime intercepts internal APIs and blocks known external integrations', async () => {
  const source = await readFile(new URL('../services/mock/mockRuntime.ts', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /MOCK_NETWORK_BLOCKED/);
  assert.match(source, /supabase\|googleapis\|sheets\|whatsapp\|resend/i);
  assert.match(source, /MOCK_PREVIEW_NOT_EXPLICITLY_ALLOWED/);
});

test('synthetic fixtures are loaded dynamically, not from the production entry bundle', async () => {
  const source = await readFile(new URL('../services/mock/mockRuntime.ts', import.meta.url), 'utf8');
  assert.match(source, /await import\('\.\.\/\.\.\/src-presenca-v2\/mock\/repository\.mjs'\)/);
  assert.doesNotMatch(source, /^import\s+.*repository\.mjs/m);
});
