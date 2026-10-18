/**
 * Boundary for the isolated MOCK environment.
 *
 * The flag is intentionally opt-in at build time. When disabled, this module
 * does nothing. When enabled it intercepts every internal /api request before
 * it can reach Vercel/Supabase/Sheets or a messaging provider.
 */
declare const __EAC_MOCK_ENABLED__: boolean;

const STORAGE_KEY = 'eac.mock.presenca-v2.state.v1';
const MOCK_FLAG = 'true';
const environment = ((import.meta as any).env || {}) as Record<string, string | boolean | undefined>;
let repository: any;

async function loadRepository() {
  if (!__EAC_MOCK_ENABLED__) throw new Error('MOCK_DISABLED');
  repository ||= await import('../../src-presenca-v2/mock/repository.mjs');
  return repository;
}

export const isMockRuntime = () => __EAC_MOCK_ENABLED__;

const mockUser = {
  id: 'mock-admin-01',
  name: 'Administrador de Homologação',
  email: 'admin.mock@eac.invalid',
  role: 'ADMIN',
  status: 'Ativo',
  permissions: {
    canCreate: true,
    canEdit: true,
    canView: true,
    canDelete: true,
    allowedModules: ['dashboard', 'dispatches', 'calendar', 'comunicados', 'logs', 'users', 'settings', 'help', 'members', 'inscricoes_prioritarias', 'inscricoes_prioritarias_circulos', 'visitacao', 'encontreiros', 'presence'],
  },
};

async function state() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value) return JSON.parse(value);
  } catch {
    // Local storage is only a convenience for the isolated preview.
  }
  const seeded = (await loadRepository()).createMockPresenceState();
  save(seeded);
  return seeded;
}

function save(next: any) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function resetMockRuntime() {
  if (!isMockRuntime()) return;
  save((await loadRepository()).createMockPresenceState());
}

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function actionSuccess(data: Record<string, any> = {}) {
  return json({ success: true, ...data, mock: true });
}

function actionFailure(error: string, status = 400) {
  return json({ success: false, error, mock: true }, status);
}

async function requestPayload(init?: RequestInit) {
  if (!init?.body) return {};
  try { return JSON.parse(String(init.body)); } catch { return {}; }
}

function publicCandidates(current: any) {
  return current.scenario.people.map((person: any) => ({
    key: person.id,
    pessoaId: person.id,
    nome: person.name,
    telefone: '',
    email: '',
    circulo: person.circle || '',
    origem: person.roles.length > 1 ? 'AMBOS' : person.roles[0],
    hasPhone: Boolean(person.phone),
    hasEmail: false,
  }));
}

async function handlePresenceAction(action: string, data: any) {
  const current = await state();
  const repo = await loadRepository();
  try {
    if (action === 'PRESENCA_V2_LIST_SESSIONS') return actionSuccess({ sessions: repo.listSessions(current), audit: current.audit });
    if (action === 'PRESENCA_V2_LIST_RESPONSIBLE_GROUPS') return actionSuccess({ responsibleGroups: repo.listResponsibleGroups(current) });
    if (action === 'PRESENCA_V2_LIST_RESPONSIBLE_SESSIONS') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token || data?.scope || ''));
      const responsible=current.scenario.responsibleGroups.find((item:any)=>item.id===responsibleId);
      return actionSuccess({ responsible: responsible ? {id:responsible.id,label:responsible.label} : null, sessions: repo.listResponsibleSessions(current, String(data?.token || data?.scope || '')) });
    }
    if (action === 'PRESENCA_V2_GET_ANALYTICS') return actionSuccess({ analytics: repo.presenceAnalytics(current) });
    if (action === 'PRESENCA_V2_GET_PUBLIC_SESSION') return actionSuccess({ session: repo.publicSession(current, String(data?.token || data?.sessionId || '')) });
    if (action === 'PRESENCA_V2_RESPONSIBLE_CREATE_SESSION') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const responsible=current.scenario.responsibleGroups.find((item:any)=>item.id===responsibleId);
      if(!responsible) throw new Error('INVALID_RESPONSIBLE_SCOPE');
      const result=repo.createSession(current,{
        type:responsible.kind==='POS'?'POS_ENCONTRO_GERAL':'REUNIAO_DUPLA_TIOS',
        responsibleId,
        scheduledAt:data?.scheduledAt
      },responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_RESPONSIBLE_UPDATE_SESSION') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.updateSession(current,session.id,data?.scheduledAt,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_RESPONSIBLE_OPEN_SESSION') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.openSession(current,session.id,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_RESPONSIBLE_CANCEL_SESSION') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.cancelSession(current,session.id,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_REQUEST_CLOSE') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.requestClose(current,session.id,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_CANCEL_CLOSE') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.cancelClose(current,session.id,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_REOPEN_SESSION') {
      const responsibleId=repo.responsibleIdFromToken(current,String(data?.token||''));
      const session=current.scenario.sessions.find((x:any)=>x.id===String(data?.sessionId||''));
      if(!session||session.responsibleId!==responsibleId) throw new Error('SESSION_OUT_OF_SCOPE');
      const result=repo.reopenSession(current,session.id,responsibleId);
      save(result.state); return actionSuccess({session:result.session});
    }
    if (action === 'PRESENCA_V2_CREATE_SESSION') {
      const result = repo.createSession(current, data);
      save(result.state);
      return actionSuccess({ session: result.session });
    }
    if (action === 'PRESENCA_V2_OPEN_SESSION') {
      const result = repo.openSession(current, String(data?.sessionId || ''));
      save(result.state);
      return actionSuccess({ session: result.session });
    }
    if (action === 'PRESENCA_V2_CANCEL_SESSION') {
      const result = repo.cancelSession(current, String(data?.sessionId || ''));
      save(result.state);
      return actionSuccess({ session: result.session });
    }
    if (action === 'PRESENCA_V2_CLOSE_SESSION') {
      const result = repo.closeSession(current, String(data?.sessionId || ''));
      save(result.state);
      return actionSuccess({ session: result.session });
    }
    if (action === 'PRESENCA_V2_PUBLIC_CHECKIN') {
      const result = repo.submitCheckin(current, String(data?.sessionId || ''), { personId: data?.personId, name: data?.name, phone: data?.phone });
      save(result.state);
      return actionSuccess({ result: result.result });
    }
    if (action === 'PRESENCA_V2_LIST_PENDING') return actionSuccess({ requests: current.requests, records: current.records });
    if (action === 'PRESENCA_V2_RESOLVE_PENDING') {
      const result = repo.resolveRequest(current, String(data?.key || ''), String(data?.decision || ''));
      save(result.state);
      return actionSuccess({ request: result.request });
    }
  } catch (error: any) {
    return actionFailure(error?.message || 'MOCK_ACTION_FAILED');
  }
  return null;
}

async function genericMockAction(action: string, data: any) {
  const current = await state();
  if (action.startsWith('PRESENCA_V2_')) return handlePresenceAction(action, data);
  if (action === 'GET_SYNC_STATUS') return actionSuccess({ lastUpdate: 'Ambiente MOCK · sem sincronização externa' });
  if (action === 'GET_COMUNICADOS') return actionSuccess({ comunicados: [] });
  if (action === 'GET_EVENTS') return actionSuccess({ events: [] });
  if (action === 'GET_OPERATIONAL_LOGS') return actionSuccess({ logs: current.audit });
  if (action === 'GET_LOGS') return actionSuccess({ logs: current.audit });
  if (action === 'GET_MEMBERS') return actionSuccess({ members: [], adolescentes: [], total: 0 });
  if (action === 'GET_ENCONTREIROS') return actionSuccess({ encontreiros: [], total: 0, indicators: {}, bairroStats: [] });
  if (action === 'GET_EQUIPES' || action === 'GET_ENCONTRO_EQUIPES' || action === 'GET_ENCONTROS_EQUIPES' || action === 'GET_ENCONTREIRO_EQUIPES' || action === 'GET_HISTORICO_ENCONTREIRO_EQUIPES') return actionSuccess({ equipes: [], membros: [] });
  if (action === 'GET_INSCRICOES_PRIORITARIAS') return actionSuccess({ inscricoesPrioritarias: [], items: [], total: 0 });
  if (action === 'GET_CIRCULOS_DISTRIBUIDOS') return actionSuccess({ circulos: {} });
  if (action === 'GET_CIRCULO_ATUAL_MAPA') return actionSuccess({ items: [], circulos: [] });
  if (action === 'GET_USERS') return actionSuccess({ users: [mockUser] });
  if (action === 'GET_NON_ENROLLED') return actionSuccess({ items: [], naoInscritos: [], total: 0 });
  if (action === 'GET_EMAIL_STATUS_SUMMARY') return actionSuccess({ summary: {}, items: [] });
  if (action === 'GET_EMAIL_CALLS_BY_PERSON') return actionSuccess({ calls: [], items: [] });
  if (action === 'GET_SAFE_SETTINGS') return actionSuccess({ settings: {} });
  if (action === 'GET_CONTEXT_HELP') return actionSuccess({ items: [] });
  if (action === 'GET_DISPARO_EXECUCOES') return actionSuccess({ executions: [] });
  if (action === 'GET_BANDA_PUBLIC_CONFIG') return actionSuccess({ config: { ativo: true } });
  if (action === 'GET_BANDA_RESPONSAVEIS_DASHBOARD') return actionSuccess({ items: [] });
  if (action === 'SEARCH_BANDA_CANDIDATES') return actionSuccess({ candidates: [] });
  if (action === 'GET_BANDA_CANDIDATE_DETAIL') return actionSuccess({ candidate: null });
  if (action === 'GET_FORMULARIOS_CONFIG') return actionSuccess({ config: { inscricao_ativo: true, encontreiro_ativo: true, presenca_ativo: true } });
  if (action === 'GET_PUBLIC_PRESENCE_DATA') return actionSuccess({ candidates: publicCandidates(current) });
  if (action === 'GET_PRESENCE') return actionSuccess({ items: [] });
  if (action === 'GET_PRESENCE_PUBLICO') return actionSuccess({ encontreiros: [], encontristas: [] });
  if (action === 'MARK_PRESENCE') return actionFailure('LEGACY_PRESENCE_DISABLED_IN_MOCK', 409);
  return actionSuccess({ message: `Ação ${action || 'não informada'} respondeu com dados sintéticos vazios.` });
}

async function handleMockApi(url: URL, init?: RequestInit) {
  const method = String(init?.method || 'GET').toUpperCase();
  const payload = await requestPayload(init);
  if (url.pathname === '/api/auth/login' && method === 'POST') return actionSuccess({ user: mockUser });
  if (url.pathname === '/api/comunicados' && method === 'POST') return genericMockAction(String(payload?.action || ''), payload?.data || {});
  if (url.pathname === '/api/presenca/public-data') return actionSuccess({ candidates: publicCandidates(await state()) });
  if (url.pathname === '/api/presenca' && method === 'GET') return actionSuccess({ items: [] });
  return actionFailure(`MOCK_API_ROUTE_NOT_IMPLEMENTED: ${method} ${url.pathname}`, 501);
}

export function installMockRuntime() {
  if (typeof window === 'undefined' || !isMockRuntime()) return;
  const target = window as any;
  if (target.__eacMockRuntimeInstalled) return;

  const originalFetch = window.fetch.bind(window);
  target.__eacMockRuntimeInstalled = true;
  target.__eacMockOriginalFetch = originalFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String((input as Request).url || '');
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) return handleMockApi(url, init);
    if (/supabase|googleapis|sheets|whatsapp|resend/i.test(url.hostname)) {
      throw new Error(`MOCK_NETWORK_BLOCKED: ${url.hostname}`);
    }
    return originalFetch(input, init);
  };
}

export { mockUser };
