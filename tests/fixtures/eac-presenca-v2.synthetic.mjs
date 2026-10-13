/**
 * Synthetic, deterministic fixtures for EAC structural validation.
 * No imports, no network, no Supabase identifiers or real personal information.
 * Keep this module server/test only; NEVER import into production UI.
 */
export const mockEacScenario = Object.freeze({
  edition: 37,
  circles: ['AZUL', 'LARANJA', 'VERDE', 'VERMELHO', 'AMARELO', 'ROXO'],
  doubles: [
    { id: 'dupla-a', circles: ['AZUL', 'LARANJA'] },
    { id: 'dupla-b', circles: ['VERDE', 'VERMELHO'] },
    { id: 'dupla-c', circles: ['AMARELO', 'ROXO'] },
  ],
  people: [
    { id: 'mock-001', name: 'Pessoa Fictícia Um', roles: ['ENCONTRISTA'], circle: 'AZUL', phone: '21999990001' },
    { id: 'mock-002', name: 'Pessoa Fictícia Dois', roles: ['ENCONTREIRO'], circle: null, phone: '21999990002' },
    { id: 'mock-003', name: 'Pessoa Fictícia Três', roles: ['ENCONTRISTA','ENCONTREIRO'], circle: 'LARANJA', phone: '21999990003' },
    { id: 'mock-004', name: 'Pessoa Fictícia Quatro', roles: ['ENCONTRISTA'], circle: 'VERDE', phone: null },
    { id: 'mock-005', name: 'Pessoa Fictícia Cinco', roles: ['ENCONTRISTA'], circle: 'VERMELHO', phone: '21999990005' },
    { id: 'mock-006', name: 'Pessoa Fictícia Seis', roles: ['ENCONTRISTA'], circle: 'ROXO', phone: '21999990005' },
    { id: 'mock-007', name: 'Pessoa Fictícia Sete', roles: ['ENCONTREIRO'], circle: null, phone: '21999990007' },
  ],
  sessions: [
    { id: 'mock-session-1', type: 'REUNIAO_DUPLA_TIOS', doubleId: 'dupla-a', status: 'ABERTA', createdAt: '2026-10-13T18:00:00.000Z', openedAt: '2026-10-13T18:05:00.000Z' },
    { id: 'mock-session-2', type: 'POS_ENCONTRO_GERAL', doubleId: null, status: 'ABERTA', createdAt: '2026-10-13T18:10:00.000Z', openedAt: '2026-10-13T18:15:00.000Z' },
    { id: 'mock-session-3', type: 'REUNIAO_DUPLA_TIOS', doubleId: 'dupla-b', status: 'ENCERRADA', createdAt: '2026-10-06T18:00:00.000Z', openedAt: '2026-10-06T18:05:00.000Z', closedAt: '2026-10-06T20:00:00.000Z' },
  ],
});
export function validateMockEacScenario(fixture = mockEacScenario) {
  const failures = [];
  const ids = new Set();
  const circles = new Set(fixture.circles);
  for (const person of fixture.people) {
    if (ids.has(person.id)) failures.push('DUPLICATE_PERSON_ID');
    ids.add(person.id);
    if (person.circle && !circles.has(person.circle)) failures.push('UNKNOWN_CIRCLE');
    if (!Array.isArray(person.roles) || person.roles.length === 0) failures.push('MISSING_ROLE');
  }
  for (const pair of fixture.doubles) {
    if (pair.circles.length !== 2 || pair.circles.some(c => !circles.has(c))) failures.push('INVALID_PAIR_CIRCLES');
  }
  for (const session of fixture.sessions) {
    if (!['REUNIAO_DUPLA_TIOS','POS_ENCONTRO_GERAL'].includes(session.type)) failures.push('INVALID_SESSION_TYPE');
    if (!['AGENDADA','ABERTA','ENCERRADA','CANCELADA'].includes(session.status)) failures.push('INVALID_SESSION_STATUS');
  }
  return { valid: failures.length === 0, failures };
}
