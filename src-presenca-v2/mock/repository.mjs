/**
 * Presença V2: repositório exclusivamente sintético para Preview/local.
 * Não importa SDKs, não usa rede e não conhece IDs ou dados reais.
 */
import { mockEacScenario } from '../../tests/fixtures/eac-presenca-v2.synthetic.mjs';
import { registerPresenceMock, sessionAudience } from '../domain/presence.mock.mjs';

const now = () => new Date().toISOString();

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createMockPresenceState() {
  return {
    version: 1,
    scenario: clone(mockEacScenario),
    records: [],
    requests: [],
    audit: [{ id: 'audit-seed', at: now(), type: 'MOCK_SEEDED', actor: 'mock-system' }],
  };
}

export function listSessions(state) {
  return state.scenario.sessions.map((session) => {
    const audience = sessionAudience(state.scenario, session);
    const confirmed = state.records.filter((record) => record.sessionId === session.id).length;
    const pending = state.requests.filter((request) => request.sessionId === session.id && request.status === 'PENDING').length;
    const pair = state.scenario.doubles.find((item) => item.id === session.doubleId);
    return {
      ...session,
      title: session.type === 'REUNIAO_DUPLA_TIOS'
        ? `Reunião de tios · ${pair?.circles.join(' + ') || 'dupla'}`
        : 'Pós-encontro geral · EAC 37',
      eligibleCount: audience.length,
      confirmedCount: confirmed,
      pendingCount: pending,
      publicToken: `mock-qr-${session.id}`,
    };
  });
}

function audit(state, type, actor, detail = {}) {
  return {
    ...state,
    audit: [...state.audit, { id: `audit-${state.audit.length + 1}`, at: now(), type, actor, ...detail }],
  };
}

export function createSession(state, input, actor = 'mock-admin') {
  const type = input?.type;
  if (!['REUNIAO_DUPLA_TIOS', 'POS_ENCONTRO_GERAL'].includes(type)) throw new Error('INVALID_SESSION_TYPE');
  const doubleId = type === 'REUNIAO_DUPLA_TIOS' ? String(input?.doubleId || '') : null;
  if (type === 'REUNIAO_DUPLA_TIOS' && !state.scenario.doubles.some((item) => item.id === doubleId)) throw new Error('UNKNOWN_DOUBLE');
  const id = `mock-session-${state.scenario.sessions.length + 1}`;
  const session = { id, type, doubleId, status: 'AGENDADA', createdAt: now() };
  const next = { ...state, scenario: { ...state.scenario, sessions: [...state.scenario.sessions, session] } };
  return { state: audit(next, 'SESSION_CREATED', actor, { sessionId: id }), session };
}

export function openSession(state, sessionId, actor = 'mock-admin') {
  const session = state.scenario.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'AGENDADA') throw new Error('SESSION_NOT_SCHEDULED');
  const scenario = { ...state.scenario, sessions: state.scenario.sessions.map((item) => item.id === sessionId ? { ...item, status: 'ABERTA', openedAt: now() } : item) };
  return { state: audit({ ...state, scenario }, 'SESSION_OPENED', actor, { sessionId }), session: scenario.sessions.find((item) => item.id === sessionId) };
}

export function closeSession(state, sessionId, actor = 'mock-admin') {
  const session = state.scenario.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'ABERTA') throw new Error('SESSION_NOT_OPEN');
  const scenario = { ...state.scenario, sessions: state.scenario.sessions.map((item) => item.id === sessionId ? { ...item, status: 'ENCERRADA', closedAt: now() } : item) };
  return { state: audit({ ...state, scenario }, 'SESSION_CLOSED', actor, { sessionId }), session: scenario.sessions.find((item) => item.id === sessionId) };
}

export function cancelSession(state, sessionId, actor = 'mock-admin') {
  const session = state.scenario.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'AGENDADA') throw new Error('SESSION_CANNOT_BE_CANCELLED');
  const scenario = { ...state.scenario, sessions: state.scenario.sessions.map((item) => item.id === sessionId ? { ...item, status: 'CANCELADA', cancelledAt: now() } : item) };
  return { state: audit({ ...state, scenario }, 'SESSION_CANCELLED', actor, { sessionId }), session: scenario.sessions.find((item) => item.id === sessionId) };
}

export function submitCheckin(state, sessionId, input) {
  const outcome = registerPresenceMock(state, state.scenario, sessionId, input);
  if (outcome.result.status === 'CONFIRMED') {
    return { state: audit(outcome.state, 'PRESENCE_CONFIRMED', 'mock-public', { sessionId, personId: outcome.result.record.personId }), result: outcome.result };
  }
  if (outcome.result.status === 'PENDING') {
    return { state: audit(outcome.state, 'PRESENCE_PENDING', 'mock-public', { sessionId, requestKey: outcome.result.request.key }), result: outcome.result };
  }
  return outcome;
}

export function resolveRequest(state, key, decision, actor = 'mock-admin') {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('INVALID_DECISION');
  const request = state.requests.find((item) => item.key === key);
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  if (request.status !== 'PENDING') throw new Error('REQUEST_ALREADY_RESOLVED');
  const session = state.scenario.sessions.find((item) => item.id === request.sessionId);
  if (!session || session.status !== 'ENCERRADA') throw new Error('REQUEST_RESOLUTION_REQUIRES_CLOSED_SESSION');

  const resolvedAt = now();
  const requests = state.requests.map((item) => item.key === key ? { ...item, status: decision, resolvedAt, resolvedBy: actor } : item);
  let records = state.records ?? [];

  if (decision === 'APPROVED') {
    const alreadyRecorded = request.personId
      ? records.some((record) => record.sessionId === request.sessionId && record.personId === request.personId)
      : records.some((record) => record.requestKey === request.key);

    if (!alreadyRecorded) {
      records = [...records, {
        sessionId: request.sessionId,
        personId: request.personId ?? null,
        requestKey: request.key,
        reportedName: request.reportedName || '',
        reportedPhone: request.reportedPhone || '',
        origin: 'MOCK_ADMIN_RECONCILIATION',
        confirmedAt: resolvedAt,
        confirmedBy: actor,
      }];
    }
  }

  const next = { ...state, requests, records };
  return {
    state: audit(next, `REQUEST_${decision}`, actor, { requestKey: key }),
    request: requests.find((item) => item.key === key),
  };
}

export function publicSession(state, publicToken) {
  const session = listSessions(state).find((item) => item.publicToken === publicToken || item.id === publicToken);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    type: session.type,
    publicToken: session.publicToken,
    // A página pública recebe somente nomes fictícios e o mínimo necessário para confirmação.
    people: sessionAudience(state.scenario, session).map((person) => ({ id: person.id, name: person.name, circle: person.circle, roles: person.roles })),
  };
}
