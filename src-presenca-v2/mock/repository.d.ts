export function createMockPresenceState(): any;
export function listSessions(state: any): any[];
export function createSession(state: any, input: any, actor?: string): any;
export function openSession(state: any, sessionId: string, actor?: string): any;
export function closeSession(state: any, sessionId: string, actor?: string): any;
export function cancelSession(state: any, sessionId: string, actor?: string): any;
export function publicSession(state: any, token: string): any;
export function resolveRequest(state: any, key: string, decision: string, actor?: string): any;
export function submitCheckin(state: any, sessionId: string, input: any): any;
