/**
 * PRESENÇA V2 — first mock-only domain slice.
 * Pure functions; no browser, database, network, secrets or real identities.
 * Deliberately NOT connected to production routes.
 */
const ALLOWED = new Set(['AGENDADA', 'ABERTA', 'ENCERRADA', 'CANCELADA']);
export function sessionAudience(fixture, session) {
  if (!ALLOWED.has(session.status)) throw new Error('INVALID_STATE');
  if (session.type === 'POS_ENCONTRO_GERAL') return fixture.people.filter(p => p.roles.some(r => r === 'ENCONTRISTA' || r === 'ENCONTREIRO'));
  if (session.type === 'REUNIAO_DUPLA_TIOS') {
    const pair = fixture.doubles.find(p => p.id === session.doubleId);
    if (!pair) throw new Error('UNKNOWN_DOUBLE');
    return fixture.people.filter(p => p.roles.includes('ENCONTRISTA') && pair.circles.includes(p.circle));
  }
  throw new Error('INVALID_TYPE');
}
export function checkIdentityMock(fixture, session, { personId, phone }) {
  if (session.status !== 'ABERTA') return { status: 'BLOCKED_CLOSED' };
  const candidates = sessionAudience(fixture, session);
  const person = candidates.find(p => p.id === personId);
  if (!person) return { status: 'PENDING', reason: 'NO_ELIGIBLE_MATCH' };
  const normalized = String(phone ?? '').replace(/\D/g, '');
  if (!normalized || !person.phone) return { status: 'PENDING', reason: 'MISSING_PHONE' };
  if (normalized !== person.phone) return { status: 'PENDING', reason: 'PHONE_MISMATCH' };
  const collisions = fixture.people.filter(p => p.phone === normalized);
  if (collisions.length !== 1) return { status: 'PENDING', reason: 'PHONE_SHARED' };
  return { status: 'MATCH', personId: person.id };
}
export function registerPresenceMock(state, fixture, sessionId, input) {
  const session = fixture.sessions.find(s => s.id === sessionId);
  if (!session) return { state, result: { status: 'SESSION_NOT_FOUND' } };
  const verdict = checkIdentityMock(fixture, session, input);
  if (verdict.status === 'BLOCKED_CLOSED') return { state, result: verdict };
  const records = state.records ?? [];
  const requests = state.requests ?? [];
  if (verdict.status === 'MATCH') {
    if (records.some(r => r.sessionId === sessionId && r.personId === verdict.personId))
      return { state, result: { status: 'ALREADY_PRESENT' } };
    const record = { sessionId, personId: verdict.personId, origin: 'MOCK_QR' };
    return { state: { ...state, records: [...records, record], requests }, result: { status: 'CONFIRMED', record } };
  }
  // Idempotency is scoped to the same session + synthetic input; production will use a DB unique key.
  const key = [sessionId, String(input.personId ?? ''), String(input.phone ?? '').replace(/\D/g, '')].join(':');
  if (requests.some(r => r.key === key)) return { state, result: { status: 'ALREADY_PENDING' } };
  const request = { key, sessionId, personId: input.personId ?? null, reason: verdict.reason, status: 'PENDING' };
  return { state: { ...state, records, requests: [...requests, request] }, result: { status: 'PENDING', request } };
}
export function closeSessionMock(fixture, sessionId) {
  const session = fixture.sessions.find(s => s.id === sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'ABERTA') throw new Error('SESSION_NOT_OPEN');
  return { ...fixture, sessions: fixture.sessions.map(s => s.id === sessionId ? { ...s, status: 'ENCERRADA' } : s) };
}
