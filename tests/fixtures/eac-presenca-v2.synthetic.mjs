/**
 * Ambiente MOCK isolado para validação do operacional de responsáveis.
 * Usa nomes dos responsáveis para facilitar a distribuição dos links,
 * mas todas as pessoas, presenças e reuniões deste ambiente são sintéticas.
 */
export const mockEacScenario = Object.freeze({
  edition: 37,
  circles: [
    'EAC 35 · AZUL','EAC 35 · AMARELO','EAC 35 · ROXO','EAC 35 · LARANJA','EAC 35 · VERMELHO','EAC 35 · VERDE',
    'EAC 36 · AZUL','EAC 36 · AMARELO','EAC 36 · ROXO','EAC 36 · LARANJA','EAC 36 · VERMELHO','EAC 36 · VERDE',
    'EAC 37 · AZUL','EAC 37 · AMARELO','EAC 37 · ROXO','EAC 37 · LARANJA','EAC 37 · VERMELHO','EAC 37 · VERDE'
  ],
  doubles: [
    { id:'eac35-azul-amarelo', circles:['EAC 35 · AZUL','EAC 35 · AMARELO'] },
    { id:'eac35-roxo-laranja', circles:['EAC 35 · ROXO','EAC 35 · LARANJA'] },
    { id:'eac35-vermelho-verde', circles:['EAC 35 · VERMELHO','EAC 35 · VERDE'] },
    { id:'eac36-amarelo-roxo', circles:['EAC 36 · AMARELO','EAC 36 · ROXO'] },
    { id:'eac36-verde-vermelho', circles:['EAC 36 · VERDE','EAC 36 · VERMELHO'] },
    { id:'eac36-azul-laranja', circles:['EAC 36 · AZUL','EAC 36 · LARANJA'] },
    { id:'eac37-verde-vermelho', circles:['EAC 37 · VERDE','EAC 37 · VERMELHO'] },
    { id:'eac37-azul-laranja', circles:['EAC 37 · AZUL','EAC 37 · LARANJA'] },
    { id:'eac37-amarelo-roxo', circles:['EAC 37 · AMARELO','EAC 37 · ROXO'] }
  ],
  responsibleGroups: [
    { id:'eac35-paloma-vinicius', label:'Tios Paloma e Vinícius', doubleId:'eac35-azul-amarelo', kind:'TIOS' },
    { id:'eac35-ana-gustavo', label:'Tios Ana Paula e Gustavo', doubleId:'eac35-roxo-laranja', kind:'TIOS' },
    { id:'eac35-cynthia-adriano', label:'Tios Cynthia e Adriano', doubleId:'eac35-vermelho-verde', kind:'TIOS' },
    { id:'eac36-cesar-lara', label:'Tios César e Lara', doubleId:'eac36-amarelo-roxo', kind:'TIOS' },
    { id:'eac36-claudio-paula', label:'Tios Cláudio e Paula', doubleId:'eac36-verde-vermelho', kind:'TIOS' },
    { id:'eac36-gustavo-marcelle', label:'Tios Gustavo e Marcelle', doubleId:'eac36-azul-laranja', kind:'TIOS' },
    { id:'eac37-cristiano-renata', label:'Tios Cristiano e Renata', doubleId:'eac37-verde-vermelho', kind:'TIOS' },
    { id:'eac37-leonardo-joana', label:'Tios Leonardo e Joana', doubleId:'eac37-azul-laranja', kind:'TIOS' },
    { id:'eac37-simplicio-patricia', label:'Tios Simplício e Patrícia', doubleId:'eac37-amarelo-roxo', kind:'TIOS' },
    { id:'pos-responsavel', label:'Responsável do Pós', doubleId:null, kind:'POS' }
  ],
  people: [
    { id:'mock-01', name:'Adolescente Teste Azul 35', roles:['ENCONTRISTA'], circle:'EAC 35 · AZUL', phone:'21999990001' },
    { id:'mock-02', name:'Adolescente Teste Amarelo 35', roles:['ENCONTRISTA'], circle:'EAC 35 · AMARELO', phone:'21999990002' },
    { id:'mock-03', name:'Adolescente Teste Roxo 35', roles:['ENCONTRISTA'], circle:'EAC 35 · ROXO', phone:'21999990003' },
    { id:'mock-04', name:'Adolescente Teste Laranja 35', roles:['ENCONTRISTA'], circle:'EAC 35 · LARANJA', phone:'21999990004' },
    { id:'mock-05', name:'Adolescente Teste Vermelho 35', roles:['ENCONTRISTA'], circle:'EAC 35 · VERMELHO', phone:'21999990005' },
    { id:'mock-06', name:'Adolescente Teste Verde 35', roles:['ENCONTRISTA'], circle:'EAC 35 · VERDE', phone:'21999990006' },
    { id:'mock-07', name:'Adolescente Teste Azul 36', roles:['ENCONTRISTA'], circle:'EAC 36 · AZUL', phone:'21999990007' },
    { id:'mock-08', name:'Adolescente Teste Amarelo 36', roles:['ENCONTRISTA'], circle:'EAC 36 · AMARELO', phone:'21999990008' },
    { id:'mock-09', name:'Adolescente Teste Roxo 36', roles:['ENCONTRISTA'], circle:'EAC 36 · ROXO', phone:'21999990009' },
    { id:'mock-10', name:'Adolescente Teste Laranja 36', roles:['ENCONTRISTA'], circle:'EAC 36 · LARANJA', phone:'21999990010' },
    { id:'mock-11', name:'Adolescente Teste Vermelho 36', roles:['ENCONTRISTA'], circle:'EAC 36 · VERMELHO', phone:'21999990011' },
    { id:'mock-12', name:'Adolescente Teste Verde 36', roles:['ENCONTRISTA'], circle:'EAC 36 · VERDE', phone:'21999990012' },
    { id:'mock-13', name:'Adolescente Teste Azul 37', roles:['ENCONTRISTA'], circle:'EAC 37 · AZUL', phone:'21999990013' },
    { id:'mock-14', name:'Adolescente Teste Amarelo 37', roles:['ENCONTRISTA'], circle:'EAC 37 · AMARELO', phone:'21999990014' },
    { id:'mock-15', name:'Adolescente Teste Roxo 37', roles:['ENCONTRISTA'], circle:'EAC 37 · ROXO', phone:'21999990015' },
    { id:'mock-16', name:'Adolescente Teste Laranja 37', roles:['ENCONTRISTA'], circle:'EAC 37 · LARANJA', phone:'21999990016' },
    { id:'mock-17', name:'Adolescente Teste Vermelho 37', roles:['ENCONTRISTA'], circle:'EAC 37 · VERMELHO', phone:'21999990017' },
    { id:'mock-18', name:'Adolescente Teste Verde 37', roles:['ENCONTRISTA'], circle:'EAC 37 · VERDE', phone:'21999990018' },
    { id:'mock-19', name:'Encontreiro Adolescente Teste', roles:['ENCONTREIRO'], circle:null, phone:'21999990019' }
  ],
  sessions: [
    ...[
      ['mock-s35-1','eac35-paloma-vinicius','eac35-azul-amarelo'],
      ['mock-s35-2','eac35-ana-gustavo','eac35-roxo-laranja'],
      ['mock-s35-3','eac35-cynthia-adriano','eac35-vermelho-verde'],
      ['mock-s36-1','eac36-cesar-lara','eac36-amarelo-roxo'],
      ['mock-s36-2','eac36-claudio-paula','eac36-verde-vermelho'],
      ['mock-s36-3','eac36-gustavo-marcelle','eac36-azul-laranja'],
      ['mock-s37-1','eac37-cristiano-renata','eac37-verde-vermelho'],
      ['mock-s37-2','eac37-leonardo-joana','eac37-azul-laranja'],
      ['mock-s37-3','eac37-simplicio-patricia','eac37-amarelo-roxo']
    ].map(([id,responsibleId,doubleId],idx)=>({
      id, type:'REUNIAO_DUPLA_TIOS', doubleId, responsibleId,
      scheduledAt:new Date(Date.UTC(2026,9,20+idx,22,0,0)).toISOString(),
      status:'AGENDADA', createdAt:'2026-10-18T00:00:00.000Z'
    })),
    { id:'mock-pos-1', type:'POS_ENCONTRO_GERAL', doubleId:null, responsibleId:'pos-responsavel', scheduledAt:'2026-10-25T19:00:00.000Z', status:'AGENDADA', createdAt:'2026-10-18T00:00:00.000Z' }
  ]
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
  const responsibleIds = new Set((fixture.responsibleGroups || []).map(r => r.id));
  for (const responsible of fixture.responsibleGroups || []) {
    if (responsible.kind === 'TIOS' && !fixture.doubles.some(pair => pair.id === responsible.doubleId)) failures.push('INVALID_RESPONSIBLE_DOUBLE');
  }
  for (const session of fixture.sessions) {
    if (!['REUNIAO_DUPLA_TIOS','POS_ENCONTRO_GERAL'].includes(session.type)) failures.push('INVALID_SESSION_TYPE');
    if (!responsibleIds.has(session.responsibleId)) failures.push('UNKNOWN_RESPONSIBLE');
    if (!['AGENDADA','ABERTA','ENCERRADA','CANCELADA'].includes(session.status)) failures.push('INVALID_SESSION_STATUS');
  }
  return { valid: failures.length === 0, failures };
}
