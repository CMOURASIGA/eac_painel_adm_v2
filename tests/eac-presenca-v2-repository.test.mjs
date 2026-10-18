import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelSession,
  closeSession,
  createMockPresenceState,
  createSession,
  listSessions,
  listResponsibleSessions,
  presenceAnalytics,
  openSession,
  resolveRequest,
  submitCheckin,
} from '../src-presenca-v2/mock/repository.mjs';

test('session state machine prevents reopening and permits a new session', () => {
  let state = createMockPresenceState();
  const created = createSession(state, { type: 'REUNIAO_DUPLA_TIOS', responsibleId: 'tios-isabela-joao', scheduledAt: '2026-10-20T19:00:00-03:00' });
  state = created.state;
  state = openSession(state, created.session.id).state;
  state = closeSession(state, created.session.id).state;
  assert.throws(() => openSession(state, created.session.id), /SESSION_NOT_SCHEDULED/);
  const replacement = createSession(state, { type: 'REUNIAO_DUPLA_TIOS', responsibleId: 'tios-isabela-joao', scheduledAt: '2026-10-20T19:00:00-03:00' });
  assert.equal(replacement.session.status, 'AGENDADA');
});

test('check-in is unique by person and session, but allowed in another session', () => {
  let state = createMockPresenceState();
  let first = submitCheckin(state, 'mock-session-1', { personId: 'mock-001', phone: '21999990001' });
  assert.equal(first.result.status, 'CONFIRMED');
  state = first.state;
  first = submitCheckin(state, 'mock-session-1', { personId: 'mock-001', phone: '21999990001' });
  assert.equal(first.result.status, 'ALREADY_PRESENT');
  const second = submitCheckin(state, 'mock-session-2', { personId: 'mock-001', phone: '21999990001' });
  assert.equal(second.result.status, 'CONFIRMED');
});

test('ambiguous identity becomes an idempotent pending request and only ADM resolves after closure', () => {
  let state = createMockPresenceState();
  let result = submitCheckin(state, 'mock-session-2', { personId: 'mock-005', phone: '21999990005' });
  assert.equal(result.result.status, 'PENDING');
  state = result.state;
  assert.equal(submitCheckin(state, 'mock-session-2', { personId: 'mock-005', phone: '21999990005' }).result.status, 'ALREADY_PENDING');
  assert.throws(() => resolveRequest(state, state.requests[0].key, 'APPROVED'), /REQUIRES_CLOSED_SESSION/);
  state = closeSession(state, 'mock-session-2').state;
  const resolved = resolveRequest(state, state.requests[0].key, 'APPROVED');
  assert.equal(resolved.request.status, 'APPROVED');
  assert.equal(resolved.state.records.length, 1);
  assert.equal(resolved.state.records[0].origin, 'MOCK_ADMIN_RECONCILIATION');
});

test('unknown public name is retained as a pending request without automatic identity creation', () => {
  const state = createMockPresenceState();
  const outcome = submitCheckin(state, 'mock-session-2', { name: 'Visitante Fictício', phone: '21999990123' });
  assert.equal(outcome.result.status, 'PENDING');
  assert.equal(outcome.state.requests[0].reason, 'NO_ELIGIBLE_MATCH');
  assert.equal(outcome.state.requests[0].reportedName, 'Visitante Fictício');
  assert.equal(outcome.state.scenario.people.length, 7);
});

test('only scheduled sessions can be cancelled and summaries preserve audience boundaries', () => {
  const state = createMockPresenceState();
  assert.throws(() => cancelSession(state, 'mock-session-1'), /CANNOT_BE_CANCELLED/);
  const sessions = listSessions(state);
  assert.equal(sessions.find((item) => item.id === 'mock-session-1').eligibleCount, 2);
  assert.equal(sessions.find((item) => item.id === 'mock-session-2').eligibleCount, 7);
});


test('responsible access shows only open and closed sessions within scope', () => {
  const state = createMockPresenceState();
  const pair = listResponsibleSessions(state, 'tios-ana-bruno');
  assert.ok(pair.every((session) => session.responsibleId === 'tios-ana-bruno'));
  assert.ok(pair.every((session) => ['ABERTA', 'ENCERRADA'].includes(session.status)));
  assert.equal(pair[0].status, 'ABERTA');

  const post = listResponsibleSessions(state, 'pos-responsavel');
  assert.ok(post.every((session) => session.type === 'POS_ENCONTRO_GERAL'));
  assert.ok(post.every((session) => ['ABERTA', 'ENCERRADA'].includes(session.status)));
});

test('analytics separates operational confirmations from individual frequency', () => {
  let state = createMockPresenceState();
  let pending = submitCheckin(state, 'mock-session-2', { name: 'Visitante Fictício', phone: '21999990123' });
  state = pending.state;
  state = closeSession(state, 'mock-session-2').state;
  state = resolveRequest(state, state.requests[0].key, 'APPROVED').state;

  const analytics = presenceAnalytics(state);
  assert.equal(analytics.summary.unlinkedConfirmedCount, 1);
  assert.ok(analytics.summary.closedSessions >= 2);
  assert.ok(Array.isArray(analytics.groups));
  assert.ok(Array.isArray(analytics.people));
});


test('analytics groups closed sessions by responsible couple instead of color pair', () => {
  const state = createMockPresenceState();
  const analytics = presenceAnalytics(state);
  const group = analytics.groups.find((item) => item.key === 'tios-elisa-felipe');
  assert.equal(group.label, 'Tios Elisa e Felipe');
  assert.equal(group.sessions, 1);
  assert.equal(analytics.groups.some((item) => item.label === 'VERDE + VERMELHO'), false);
});
