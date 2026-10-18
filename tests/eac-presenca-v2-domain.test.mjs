import test from 'node:test';
import assert from 'node:assert/strict';
import { mockEacScenario as fixture } from './fixtures/eac-presenca-v2.synthetic.mjs';
import { sessionAudience, checkIdentityMock, registerPresenceMock, closeSessionMock } from '../src-presenca-v2/domain/presence.mock.mjs';

test('dupla sees two circles only; general sees encontreiro without EAC origin', () => {
  assert.deepEqual(sessionAudience(fixture, fixture.sessions[0]).map(p => p.id), ['mock-001','mock-003']);
  assert.ok(sessionAudience(fixture, fixture.sessions[1]).some(p => p.id === 'mock-002'));
});
test('shared phone and absent phone must not confirm automatically', () => {
  assert.equal(checkIdentityMock(fixture, fixture.sessions[1], { personId:'mock-005',phone:'21999990005' }).reason,'PHONE_SHARED');
  assert.equal(checkIdentityMock(fixture, fixture.sessions[1], { personId:'mock-004',phone:'' }).reason,'MISSING_PHONE');
});
test('confirmed presence is idempotent per person and session', () => {
  const first = registerPresenceMock({},fixture,'mock-session-1',{personId:'mock-001',phone:'21999990001'});
  assert.equal(first.result.status,'CONFIRMED');
  assert.equal(registerPresenceMock(first.state,fixture,'mock-session-1',{personId:'mock-001',phone:'21999990001'}).result.status,'ALREADY_PRESENT');
  const secondSession = registerPresenceMock(first.state,fixture,'mock-session-2',{personId:'mock-001',phone:'21999990001'});
  assert.equal(secondSession.result.status,'CONFIRMED');
});
test('pending requests dedupe; closed sessions block new check-in', () => {
  const pending = registerPresenceMock({},fixture,'mock-session-2',{personId:'mock-004',phone:''});
  assert.equal(pending.result.status,'PENDING');
  assert.equal(registerPresenceMock(pending.state,fixture,'mock-session-2',{personId:'mock-004',phone:''}).result.status,'ALREADY_PENDING');
  assert.equal(registerPresenceMock({},fixture,'mock-session-3',{personId:'mock-005',phone:'21999990005'}).result.status,'BLOCKED_CLOSED');
});
test('closed session cannot be reopened by closing again', () => {
  const closed = closeSessionMock(fixture,'mock-session-1');
  assert.throws(()=>closeSessionMock(closed,'mock-session-1'),/SESSION_NOT_OPEN/);
});
