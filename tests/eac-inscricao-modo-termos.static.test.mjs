import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Admin controls terms requirement without changing base form fields', () => {
  const settings = read('components/SettingsPage.tsx');
  assert.match(settings, /Inscrição de adolescente - termos/);
  assert.match(settings, /inscricao_exigir_termos/);
  const publicForm = read('components/PublicInscricaoForm.tsx');
  for (const field of ['nome_adolescente', 'data_nascimento', 'nome_responsavel', 'email_responsavel']) {
    assert.match(publicForm, new RegExp(field));
  }
});

test('Server controls both the form availability and terms mode', () => {
  const server = read('utils/inscricaoCreate.ts');
  assert.match(server, /configuracoes_formularios/);
  assert.match(server, /formSettings\?\.encontrista_ativo === false/);
  assert.match(server, /formSettings\?\.inscricao_exigir_termos !== false/);
  assert.match(server, /inscricao_modalidade: exigirTermos \? 'COM_TERMOS' : 'SEM_ETAPA_TERMOS'/);
  assert.match(server, /status: exigirTermos \? 'AGUARDANDO_RESPONSAVEL' : 'INSCRITO'/);
});

test('Simplified mode skips confirmation email, token and fabricated terms', () => {
  const server = read('utils/inscricaoCreate.ts');
  const simplified = server.indexOf('if (!exigirTermos) {');
  const token = server.indexOf('const confirmation = createConfirmationToken();');
  assert.ok(simplified > 0);
  assert.ok(token > simplified);
  assert.match(server.slice(simplified, token), /email_confirmacao: \{ sent: false/);
});

test('Migration defaults to existing terms flow and retains historical status', () => {
  const migration = read('docs/migrations/20261030_inscricao_modo_termos.sql');
  assert.match(migration, /inscricao_exigir_termos boolean NOT NULL DEFAULT true/);
  assert.match(migration, /inscricao_modalidade text NOT NULL DEFAULT 'COM_TERMOS'/);
  assert.doesNotMatch(migration, /UPDATE public\.inscricoes/i);
});
