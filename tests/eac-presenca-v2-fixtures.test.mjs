import test from 'node:test';
import assert from 'node:assert/strict';
import { mockEacScenario, validateMockEacScenario } from './fixtures/eac-presenca-v2.synthetic.mjs';

test('fixture is internally valid', () => {
  assert.deepEqual(validateMockEacScenario(), { valid: true, failures: [] });
});
test('synthetic fixture has an encontreiro with no EAC origin', () => {
  assert.ok(mockEacScenario.people.some(p => p.roles.length === 1 && p.roles[0] === 'ENCONTREIRO'));
});
test('one person may have both roles with one person ID', () => {
  const both = mockEacScenario.people.filter(p => p.roles.includes('ENCONTRISTA') && p.roles.includes('ENCONTREIRO'));
  assert.ok(both.length > 0);
  assert.equal(new Set(mockEacScenario.people.map(p => p.id)).size, mockEacScenario.people.length);
});
test('absent and shared phone are represented', () => {
  assert.ok(mockEacScenario.people.some(p => p.phone == null));
  const counts = Object.values(mockEacScenario.people.reduce((a,p) => {
    if (p.phone) a[p.phone] = (a[p.phone] ?? 0) + 1;
    return a;
  }, {}));
  assert.ok(counts.some(n => n > 1));
});
test('a session can be closed and must be treated as closed by future domain logic', () => {
  assert.ok(mockEacScenario.sessions.some(s => s.status === 'ENCERRADA'));
});
test('a malformed pair is rejected', () => {
  const invalid = structuredClone(mockEacScenario);
  invalid.doubles[0].circles = ['AZUL'];
  assert.ok(validateMockEacScenario(invalid).failures.includes('INVALID_PAIR_CIRCLES'));
});
