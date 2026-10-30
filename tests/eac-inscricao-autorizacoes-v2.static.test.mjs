import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('Participation authorization is required and versioned independently of image authorization', () => {
 const s = read('utils/inscricaoTerms.ts');
 assert.match(s,/AUTORIZACAO_PARTICIPACAO/);
 assert.match(s,/2026\.10-v0\.2/);
 assert.match(s,/USO_IMAGEM_VOZ/);
 assert.match(s,/tipo_resposta: 'SIM_NAO'/);
});
test('Previously issued links validate against original term snapshots', () => {
 const s=read('utils/inscricaoConfirm.ts');
 assert.match(s,/ctx\.inscricao\.termos_snapshot/);
 assert.match(s,/termsForThisInscricao/);
});
test('Consent details are read behind authenticated member permissions', () => {
 const api=read('utils/inscricaoTermosAdmin.ts');
 const view=read('components/MembersPage.tsx');
 assert.match(api,/auth\.getUser\(accessToken\)/);
 assert.match(api,/modules\.includes\('members'\)/);
 assert.match(view,/\/api\/inscricoes\/termos\?nome=/);
 assert.match(view,/registro\.respostas/);
});
