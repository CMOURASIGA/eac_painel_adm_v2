import { deleteJson, emptyOk, getJson, patchJson, postComunicadosAction, postJson, type EacApiResult } from './eacApiClient.ts';

export type InscricoesPrioritariasResponse = {
  inscricoesPrioritarias?: any[];
  items?: any[];
  total?: number;
};

export type CirculosDistribuidosResponse = {
  circulos?: Record<string, any[]>;
};

export type EncontroItem = {
  id: string;
  nome?: string;
  numero?: string | number;
  data_inicio?: string;
  data_fim?: string;
  status?: string;
};

export type InscricaoAdminItem = {
  inscricao_id: string;
  status_inscricao: string;
  origem_inscricao?: string | null;
  criado_via_sistema?: boolean | null;
  data_inscricao?: string | null;
  criado_em?: string | null;
  encontro_id?: string | null;
  encontro_nome?: string | null;
  encontro_numero?: string | number | null;
  encontro_status?: string | null;
  data_inicio_encontro?: string | null;
  adolescente_id?: string | null;
  pessoa_adolescente_id?: string | null;
  nome_adolescente?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  endereco?: string | null;
  idade_calculada?: number | null;
  telefone_adolescente?: string | null;
  telefone_adolescente_normalizado?: string | null;
  bairro?: string | null;
  responsavel_id?: string | null;
  nome_responsavel?: string | null;
  telefone_responsavel?: string | null;
  telefone_responsavel_normalizado?: string | null;
  grau_parentesco?: string | null;
  email_responsavel?: string | null;
  aceite_normas?: boolean | null;
  ja_fez_eac?: boolean | null;
  observacoes?: string | null;
};

export type InscricoesAdminFilters = {
  encontro_id?: string;
  status?: string;
  idade_min?: number | string;
  idade_max?: number | string;
  bairro?: string;
  data_inicio?: string;
  data_fim?: string;
  busca?: string;
  origem_dado?: string;
  page?: number;
  page_size?: number;
};




export type AlterarStatusInscricaoPayload = {
  inscricao_id: string;
  status_novo: string;
  justificativa?: string;
  alterado_por?: string;
  alterado_por_nome?: string;
};

export type AtualizarCadastroInscricaoPayload = {
  inscricao_id: string;
  nome_adolescente?: string;
  data_nascimento?: string;
  sexo?: string;
  endereco?: string;
  email_adolescente?: string;
  telefone_adolescente?: string;
  bairro?: string;
  nome_responsavel?: string;
  email_responsavel?: string;
  telefone_responsavel?: string;
};

export const inscricoesService = {
  async listarEncontrosAbertos(): Promise<EacApiResult<{ encontros: EncontroItem[] }>> {
    const r = await getJson<any>('/api/encontros/abertos');
    if (!r.success) return r as any;
    const encontros = Array.isArray((r.data as any)?.encontros) ? (r.data as any).encontros : [];
    return emptyOk({ encontros }, r.raw);
  },

  async createInscricao(payload: any): Promise<EacApiResult<{ data: any; message?: string; duplicate?: boolean }>> {
    const r = await postJson<any>('/api/inscricoes/create', payload);
    if (!r.success) return r as any;
    return emptyOk({ data: (r.data as any)?.data ?? (r.data as any), message: (r.data as any)?.message, duplicate: (r.data as any)?.duplicate }, r.raw);
  },

  async listarPrioritarias(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<{ items: any[]; total: number }>> {
    const r = await postComunicadosAction<InscricoesPrioritariasResponse>('GET_INSCRICOES_PRIORITARIAS', {}, opts);
    if (!r.success) return r as any;
    const payload = r.data as any;
    const list = Array.isArray(payload?.inscricoesPrioritarias)
      ? payload.inscricoesPrioritarias
      : (Array.isArray(payload?.items) ? payload.items : []);
    const total = typeof payload?.total === 'number' ? payload.total : list.length;
    return emptyOk({ items: list, total }, r.raw);
  },

  async listarCirculosDistribuidos(opts: { googleWebAppUrl?: string } = {}): Promise<EacApiResult<Record<string, any[]>>> {
    const r = await postComunicadosAction<CirculosDistribuidosResponse>('GET_CIRCULOS_DISTRIBUIDOS', {}, opts);
    if (!r.success) return r as any;
    const grouped = (r.data as any)?.circulos;
    return emptyOk(grouped && typeof grouped === 'object' ? grouped : {}, r.raw);
  },

  async executarDistribuicaoCirculos(
    payload: { minAge?: number | null; maxAge?: number | null } = {},
    opts: { googleWebAppUrl?: string } = {}
  ): Promise<EacApiResult<any>> {
    // Endpoint dedicado (hoje proxy do /api/comunicados), para permitir evoluir a implementação sem mudar o frontend.
    return await postJson('/api/inscricoes-prioritarias/distribuir', { ...payload, ...(opts.googleWebAppUrl ? { googleWebAppUrl: opts.googleWebAppUrl } : {}) });
  },

  async priorizarNaoInscrito(
    payload: { linhaOrigem?: string | number; id?: string | number; priorizar?: boolean },
  ): Promise<EacApiResult<any>> {
    // endpoint dedicado existente no projeto
    return await postJson('/api/nao-inscritos/priorizar', payload);
  },

  async listarInscricoesAdmin(
    filters: InscricoesAdminFilters = {}
  ): Promise<
    EacApiResult<{
      data: InscricaoAdminItem[];
      summary: { total: number; por_status: Record<string, number> };
      pagination: { page: number; page_size: number; total: number; total_pages: number };
    }>
  > {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === null || String(v).trim() === '') return;
      params.set(k, String(v));
    });

    const suffix = params.toString();
    const url = suffix ? `/api/inscricoes/admin?${suffix}` : '/api/inscricoes/admin';
    return await getJson<any>(url);
  },

  async alterarStatusInscricao(payload: AlterarStatusInscricaoPayload): Promise<EacApiResult<any>> {
    return await patchJson<any>('/api/inscricoes/admin', payload);
  },

    async atualizarCadastroInscricao(payload: AtualizarCadastroInscricaoPayload): Promise<EacApiResult<any>> {
    return await patchJson<any>('/api/inscricoes/admin', { action: 'UPDATE_RECORD', ...payload });
  },

async excluirInscricao(payload: { inscricao_id: string }): Promise<EacApiResult<any>> {
    return await deleteJson<any>('/api/inscricoes/admin', payload);
  },

  async fecharLoteEncontro(payload: { encontro_id: string; alterado_por?: string; alterado_por_nome?: string; justificativa_nao_selecionado?: string }): Promise<EacApiResult<any>> {
    return await postJson<any>('/api/inscricoes/admin/lote', payload);
  },
};


