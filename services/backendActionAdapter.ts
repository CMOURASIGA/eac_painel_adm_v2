export type BackendActionPayload = Record<string, any>;

export type BackendActionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  raw?: any;
  sample?: string;
};

export interface BackendActionAdapter {
  readonly name: 'supabase' | 'google_sheets';
  execute<T = any>(action: string, payload?: BackendActionPayload): Promise<BackendActionResult<T>>;
}

/**
 * Adapter temporario para manter compatibilidade com Google Sheets durante a migracao.
 * O frontend passa a depender apenas desta interface e nao da origem real dos dados.
 */
export class GoogleSheetsAdapter implements BackendActionAdapter {
  readonly name = 'google_sheets' as const;

  constructor(
    private readonly executor: <T = any>(action: string, payload?: BackendActionPayload) => Promise<BackendActionResult<T>>
  ) {}

  async execute<T = any>(action: string, payload: BackendActionPayload = {}): Promise<BackendActionResult<T>> {
    return await this.executor<T>(action, payload);
  }
}

export class SupabaseAdapter implements BackendActionAdapter {
  readonly name = 'supabase' as const;

  constructor(
    private readonly executor: <T = any>(action: string, payload?: BackendActionPayload) => Promise<BackendActionResult<T>>
  ) {}

  async execute<T = any>(action: string, payload: BackendActionPayload = {}): Promise<BackendActionResult<T>> {
    return await this.executor<T>(action, payload);
  }
}

export function selectAdapter(
  preferSheets: boolean,
  adapters: { supabase: BackendActionAdapter; googleSheets: BackendActionAdapter }
): BackendActionAdapter {
  return preferSheets ? adapters.googleSheets : adapters.supabase;
}
