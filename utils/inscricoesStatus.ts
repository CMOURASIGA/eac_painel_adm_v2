import type { SupabaseClient } from '@supabase/supabase-js';

type AnyObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

type ExecResult = {
  status: number;
  body: AnyObject;
};

const STATUS_ALLOWED = new Set([
  'INSCRITO',
  'EM_ANALISE',
  'PRIORIZADO',
  'FILA',
  'CONFIRMADO',
  'NAO_SELECIONADO',
  'DESISTENTE',
  'CANCELADO',
]);

const JUSTIFICATIVA_OBRIGATORIA = new Set(['NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']);
const STATUS_TRANSITIONS_ALLOWED: Record<string, Set<string>> = {
  INSCRITO: new Set(['EM_ANALISE', 'PRIORIZADO', 'FILA', 'NAO_SELECIONADO', 'CANCELADO']),
  EM_ANALISE: new Set(['PRIORIZADO', 'FILA', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']),
  PRIORIZADO: new Set(['EM_ANALISE', 'FILA', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']),
  FILA: new Set(['EM_ANALISE', 'PRIORIZADO', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']),
  CONFIRMADO: new Set(['FILA', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']),
  NAO_SELECIONADO: new Set(['EM_ANALISE', 'FILA', 'DESISTENTE', 'CANCELADO']),
  DESISTENTE: new Set(['EM_ANALISE', 'FILA']),
  CANCELADO: new Set(['EM_ANALISE', 'FILA']),
};

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function normalizeStatus(value: any) {
  return toCleanString(value).toUpperCase();
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isForeignKeyViolation(error: any) {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code === '23503' || msg.includes('foreign key') || msg.includes('violates foreign key constraint');
}

function mapDomainError(code: string) {
  switch (code) {
    case 'INSCRICAO_NAO_ENCONTRADA':
      return { status: 404, message: 'Inscrição não encontrada.' };
    case 'STATUS_INVALIDO':
      return { status: 400, message: 'Status informado não é permitido.' };
    case 'JUSTIFICATIVA_OBRIGATORIA':
      return { status: 400, message: 'Informe uma justificativa para este status.' };
    case 'STATUS_SEM_ALTERACAO':
      return { status: 400, message: 'O status informado já é o status atual da inscrição.' };
    case 'STATUS_TRANSICAO_INVALIDA':
      return { status: 400, message: 'Transição de status não permitida para o status atual da inscrição.' };
    default:
      return null;
  }
}

function isTransitionAllowed(statusAtual: string, statusNovo: string) {
  const allowed = STATUS_TRANSITIONS_ALLOWED[statusAtual];
  if (!allowed) return false;
  return allowed.has(statusNovo);
}

function normalizePhoneDigits(value: any) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeNome(value: any) {
  return toCleanString(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseFlexibleDate(value: any) {
  const raw = toCleanString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

async function resolveEncontreirosTable(supabase: AnySupabaseClient) {
  const envTable = String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim();
  const candidates = [
    envTable,
    'cadastro_encontreiros',
    'encontreiros',
    'cadastro_encontreiro',
  ].filter(Boolean);

  for (const table of candidates) {
    const probe = await supabase.from(table).select('*').limit(1);
    if (!probe.error) return table;
  }
  return '';
}

async function pickPayloadByExistingColumns(
  supabase: AnySupabaseClient,
  table: string,
  payload: Record<string, any>
) {
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    const probe = await supabase.from(table).select(key).limit(1);
    if (!probe.error) filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : payload;
}

async function upsertEncontreiroFromEncontrista(
  supabase: AnySupabaseClient,
  params: {
    pessoaId: string;
    nome: string;
    email: string;
    telefone: string;
    bairro: string;
    dataNascimento: string;
    idade: string | number;
  }
) {
  const table = await resolveEncontreirosTable(supabase);
  if (!table) return;

  const nowIso = new Date().toISOString();
  const payloadCamel = {
    pessoa_id: params.pessoaId,
    nomeCompleto: params.nome,
    nome_completo: params.nome,
    email: params.email || null,
    celularWhatsapp: params.telefone || null,
    celular_whatsapp: params.telefone || null,
    bairro: params.bairro || null,
    dataNascimento: params.dataNascimento || null,
    data_nascimento: params.dataNascimento || null,
    idade: params.idade || null,
    classificacao: 'VINDO_DE_CONFIRMACAO_ENCONTRISTA',
    origem_cadastro: 'CONFIRMACAO_ENCONTRISTA',
    origemCadastro: 'CONFIRMACAO_ENCONTRISTA',
    referencia_encontrista: true,
    referenciaEncontrista: true,
    criado_via_sistema: true,
    created_at: nowIso,
    updated_at: nowIso,
    timestamp: nowIso,
  };

  const payload = await pickPayloadByExistingColumns(supabase, table, payloadCamel);

  const byPessoa = await supabase.from(table).select('id').eq('pessoa_id', params.pessoaId).limit(1);
  const existingByPessoa = Array.isArray(byPessoa.data) && byPessoa.data[0]?.id ? byPessoa.data[0] : null;

  if (existingByPessoa?.id) {
    const updatePayload = { ...payload, updated_at: nowIso };
    const safeUpdate = await pickPayloadByExistingColumns(supabase, table, updatePayload);
    await supabase.from(table).update(safeUpdate as any).eq('id', existingByPessoa.id);
    return;
  }

  const byEmail = params.email
    ? await supabase.from(table).select('id').eq('email', params.email).limit(1)
    : ({ data: [], error: null } as any);
  const existingByEmail = Array.isArray(byEmail.data) && byEmail.data[0]?.id ? byEmail.data[0] : null;
  if (existingByEmail?.id) {
    const safeUpdate = await pickPayloadByExistingColumns(supabase, table, { ...payload, updated_at: nowIso });
    await supabase.from(table).update(safeUpdate as any).eq('id', existingByEmail.id);
    return;
  }

  const safeInsert = await pickPayloadByExistingColumns(supabase, table, payload);
  await supabase.from(table).insert(safeInsert as any);
}

async function ensureCadastroOficialAtivo(
  supabase: AnySupabaseClient,
  params: {
    pessoaId: string;
    encontroId: string;
    origem?: string;
    observacoes?: string;
  }
) {
  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from('cadastro_oficial')
    .select('*')
    .eq('pessoa_id', params.pessoaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const origem = toCleanString(params.origem) || 'SISTEMA';
  const observacoes = toCleanString(params.observacoes);

  if (existing?.id) {
    const updatePayload = await pickPayloadByExistingColumns(supabase, 'cadastro_oficial', {
      encontro_id: existing.encontro_id || params.encontroId || null,
      origem,
      status: 'ATIVO',
      elegivel_encontreiro: true,
      observacoes: observacoes || existing.observacoes || null,
      ativo: true,
      updated_at: nowIso,
      atualizado_em: nowIso,
      ultima_sincronizacao: nowIso,
    });
    const { error: updateError } = await supabase
      .from('cadastro_oficial')
      .update(updatePayload as any)
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return existing.id as string;
  }

  const insertPayload = await pickPayloadByExistingColumns(supabase, 'cadastro_oficial', {
    pessoa_id: params.pessoaId,
    encontro_id: params.encontroId || null,
    origem,
    status: 'ATIVO',
    elegivel_encontreiro: true,
    observacoes: observacoes || null,
    ativo: true,
    created_at: nowIso,
    updated_at: nowIso,
    criado_em: nowIso,
    atualizado_em: nowIso,
    ultima_sincronizacao: nowIso,
  });
  const { data: inserted, error: insertError } = await supabase
    .from('cadastro_oficial')
    .insert(insertPayload as any)
    .select('id')
    .limit(1)
    .maybeSingle();
  if (insertError) throw insertError;
  return toCleanString(inserted?.id);
}

async function ensurePessoaPapelAtivo(
  supabase: AnySupabaseClient,
  pessoaId: string,
  papel: 'ENCONTRISTA' | 'ENCONTREIRO',
) {
  const { data: existing, error: existingError } = await supabase
    .from('pessoa_papeis')
    .select('id,ativo')
    .eq('pessoa_id', pessoaId)
    .eq('papel', papel)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    if (existing.ativo === true) return;
    const { error: updateError } = await supabase
      .from('pessoa_papeis')
      .update({ ativo: true })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from('pessoa_papeis')
    .insert({ pessoa_id: pessoaId, papel, ativo: true });
  if (insertError) throw insertError;
}

async function promoverInscricaoConfirmadaParaEncontrista(
  supabase: AnySupabaseClient,
  inscricaoId: string,
) {
  const { data: inscricao, error: inscricaoError } = await supabase
    .from('inscricoes')
    .select('adolescente_id,encontro_id')
    .eq('id', inscricaoId)
    .limit(1)
    .maybeSingle();
  if (inscricaoError) throw inscricaoError;

  const adolescenteId = toCleanString(inscricao?.adolescente_id);
  const encontroId = toCleanString(inscricao?.encontro_id);
  if (!adolescenteId) return;

  const { data: adolescente, error: adolescenteError } = await supabase
    .from('adolescentes')
    .select('pessoa_id')
    .eq('id', adolescenteId)
    .limit(1)
    .maybeSingle();
  if (adolescenteError) throw adolescenteError;

  const pessoaId = toCleanString(adolescente?.pessoa_id);
  if (!pessoaId) return;

  // Regra de negócio: confirmado no encontro passa a ser referência de encontrista
  // e também elegível como encontreiro para composição futura de equipes.
  await ensurePessoaPapelAtivo(supabase, pessoaId, 'ENCONTRISTA');
  await ensurePessoaPapelAtivo(supabase, pessoaId, 'ENCONTREIRO');
  await ensureCadastroOficialAtivo(supabase, {
    pessoaId,
    encontroId,
    origem: 'SISTEMA',
    observacoes: `Promovido da inscrição confirmada ${inscricaoId}`,
  });

  try {
    const { data: pessoa, error: pessoaError } = await supabase
      .from('pessoas')
      .select('nome_completo,email,telefone,bairro,data_nascimento,idade_calculada')
      .eq('id', pessoaId)
      .limit(1)
      .maybeSingle();
    if (pessoaError) throw pessoaError;

    await upsertEncontreiroFromEncontrista(supabase, {
      pessoaId,
      nome: toCleanString(pessoa?.nome_completo),
      email: toCleanString(pessoa?.email),
      telefone: toCleanString(pessoa?.telefone),
      bairro: toCleanString(pessoa?.bairro),
      dataNascimento: toCleanString(pessoa?.data_nascimento),
      idade: toCleanString(pessoa?.idade_calculada),
    });
  } catch (e) {
    console.error('[promoverInscricaoConfirmadaParaEncontrista] falha ao sincronizar cadastro de encontreiro:', e);
  }
}

export async function executeAlterarStatusInscricao(params: {
  supabase: AnySupabaseClient | null;
  body: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, body } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const inscricaoId = toCleanString(body.inscricao_id);
  const statusNovo = normalizeStatus(body.status_novo);
  const justificativa = toCleanString(body.justificativa);
  const alteradoPor = toCleanString(body.alterado_por) || null;
  const alteradoPorNome = toCleanString(body.alterado_por_nome) || null;

  if (!inscricaoId || !isValidUuid(inscricaoId)) {
    return { status: 400, body: { success: false, error: 'VALIDATION_ERROR', message: 'inscricao_id inválido.' } };
  }

  if (!statusNovo || !STATUS_ALLOWED.has(statusNovo)) {
    return { status: 400, body: { success: false, error: 'STATUS_INVALIDO', message: 'Status informado não é permitido.' } };
  }

  if (JUSTIFICATIVA_OBRIGATORIA.has(statusNovo) && !justificativa) {
    return { status: 400, body: { success: false, error: 'JUSTIFICATIVA_OBRIGATORIA', message: 'Informe uma justificativa para este status.' } };
  }

  try {
    const { data: atualData, error: atualError } = await supabase
      .from('inscricoes')
      .select('status')
      .eq('id', inscricaoId)
      .limit(1)
      .maybeSingle();

    if (atualError) {
      console.error('[executeAlterarStatusInscricao] erro ao carregar status atual:', atualError);
      return { status: 502, body: { success: false, error: 'ERRO_ALTERAR_STATUS', message: 'Não foi possível atualizar o status da inscrição.' } };
    }

    const statusAtual = normalizeStatus(atualData?.status);
    if (!statusAtual) {
      return { status: 404, body: { success: false, error: 'INSCRICAO_NAO_ENCONTRADA', message: 'Inscrição não encontrada.' } };
    }

    if (statusAtual !== statusNovo && !isTransitionAllowed(statusAtual, statusNovo)) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'STATUS_TRANSICAO_INVALIDA',
          message: `Transição inválida: ${statusAtual} -> ${statusNovo}.`,
        },
      };
    }

    const { data, error } = await supabase.rpc('fn_alterar_status_inscricao', {
      p_inscricao_id: inscricaoId,
      p_status_novo: statusNovo,
      p_justificativa: justificativa || null,
      p_alterado_por: alteradoPor,
      p_alterado_por_nome: alteradoPorNome,
    });

    if (error) {
      const errorCode = String(error.message || '').trim();
      if (errorCode === 'STATUS_SEM_ALTERACAO' && statusNovo === 'CONFIRMADO') {
        try {
          await promoverInscricaoConfirmadaParaEncontrista(supabase, inscricaoId);
          return {
            status: 200,
            body: {
              success: true,
              data: {
                inscricao_id: inscricaoId,
                status_anterior: 'CONFIRMADO',
                status_novo: 'CONFIRMADO',
                historico_id: null,
                status_alterado_em: null,
              },
              message: 'Inscrição já confirmada. Promoção para cadastro oficial validada.',
            },
          };
        } catch (promoteError) {
          console.error('[executeAlterarStatusInscricao] falha ao promover confirmado já existente para ENCONTRISTA:', promoteError);
        }
      }

      const mapped = mapDomainError(errorCode);
      if (mapped) {
        return { status: mapped.status, body: { success: false, error: errorCode, message: mapped.message } };
      }

      console.error('[executeAlterarStatusInscricao] rpc error:', error);
      return { status: 502, body: { success: false, error: 'ERRO_ALTERAR_STATUS', message: 'Não foi possível atualizar o status da inscrição.' } };
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return { status: 502, body: { success: false, error: 'ERRO_ALTERAR_STATUS', message: 'Não foi possível atualizar o status da inscrição.' } };
    }

    if (statusNovo === 'CONFIRMADO') {
      try {
        await promoverInscricaoConfirmadaParaEncontrista(supabase, inscricaoId);
      } catch (promoteError) {
        console.error('[executeAlterarStatusInscricao] falha ao promover confirmado para ENCONTRISTA:', promoteError);
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        data: {
          inscricao_id: row.inscricao_id,
          status_anterior: row.status_anterior,
          status_novo: row.status_novo,
          historico_id: row.historico_id,
          status_alterado_em: row.status_alterado_em,
        },
        message: 'Status da inscrição atualizado com sucesso.',
      },
    };
  } catch (e: any) {
    const msg = String(e?.message || '').trim();
    const mapped = mapDomainError(msg);
    if (mapped) {
      return { status: mapped.status, body: { success: false, error: msg, message: mapped.message } };
    }

    console.error('[executeAlterarStatusInscricao] falha:', e);
    return { status: 500, body: { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao alterar status da inscrição.' } };
  }
}


export async function executeExcluirInscricao(params: {
  supabase: AnySupabaseClient | null;
  body: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, body } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase n?o configurado.' } };
  }

  const inscricaoId = toCleanString(body.inscricao_id);
  if (!inscricaoId || !isValidUuid(inscricaoId)) {
    return { status: 400, body: { success: false, error: 'VALIDATION_ERROR', message: 'inscricao_id inválido.' } };
  }

  try {
    const { error: historicoError } = await supabase
      .from('inscricoes_status_historico')
      .delete()
      .eq('inscricao_id', inscricaoId);

    if (historicoError) {
      console.error('[executeExcluirInscricao] erro ao excluir hist?rico:', historicoError);
      return { status: 502, body: { success: false, error: 'ERRO_EXCLUIR_INSCRICAO', message: 'Não foi possível excluir a inscrição.' } };
    }

    const { data, error } = await supabase
      .from('inscricoes')
      .delete()
      .eq('id', inscricaoId)
      .select('id')
      .limit(1);

    if (error) {
      if (isForeignKeyViolation(error)) {
        const fallback = await supabase
          .from('inscricoes')
          .update({
            status: 'CANCELADO',
            status_inscricao: 'CANCELADO',
            observacoes: 'Cancelado automaticamente: exclusao bloqueada por vinculos relacionais.',
          } as any)
          .eq('id', inscricaoId)
          .select('id')
          .limit(1);

        if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0) {
          return {
            status: 200,
            body: {
              success: true,
              soft_deleted: true,
              message: 'Inscrição possui vínculos e foi cancelada logicamente.',
              data: { inscricao_id: inscricaoId },
            },
          };
        }
      }
      console.error('[executeExcluirInscricao] erro ao excluir inscrição:', error);
      return { status: 502, body: { success: false, error: 'ERRO_EXCLUIR_INSCRICAO', message: 'Não foi possível excluir a inscrição.' } };
    }

    if (!Array.isArray(data) || data.length === 0) {
    return { status: 404, body: { success: false, error: 'INSCRICAO_NAO_ENCONTRADA', message: 'Inscrição não encontrada.' } };
    }

    return { status: 200, body: { success: true, message: 'Inscrição excluída com sucesso.', data: { inscricao_id: inscricaoId } } };
  } catch (e) {
    console.error('[executeExcluirInscricao] falha:', e);
    return { status: 500, body: { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao excluir inscrição.' } };
  }
}

export async function executeAtualizarCadastroInscricao(params: {
  supabase: AnySupabaseClient | null;
  body: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, body } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const inscricaoId = toCleanString(body.inscricao_id);
  if (!inscricaoId || !isValidUuid(inscricaoId)) {
    return { status: 400, body: { success: false, error: 'VALIDATION_ERROR', message: 'inscricao_id inválido.' } };
  }

  const emailAdolescente = toCleanString(body.email_adolescente);
  const nomeAdolescente = toCleanString(body.nome_adolescente);
  const dataNascimento = parseFlexibleDate(body.data_nascimento);
  const sexo = toCleanString(body.sexo);
  const endereco = toCleanString(body.endereco);
  const telefoneAdolescente = toCleanString(body.telefone_adolescente);
  const bairro = toCleanString(body.bairro);
  const nomeResponsavel = toCleanString(body.nome_responsavel);
  const emailResponsavel = toCleanString(body.email_responsavel);
  const telefoneResponsavel = toCleanString(body.telefone_responsavel);

  try {
    const { data: inscricao, error: inscricaoError } = await supabase
      .from('inscricoes')
      .select('adolescente_id')
      .eq('id', inscricaoId)
      .limit(1)
      .maybeSingle();
    if (inscricaoError) throw inscricaoError;
    if (!inscricao?.adolescente_id) {
      return { status: 404, body: { success: false, error: 'INSCRICAO_NAO_ENCONTRADA', message: 'Inscrição não encontrada.' } };
    }

    const { data: adolescente, error: adolescenteError } = await supabase
      .from('adolescentes')
      .select('id,pessoa_id')
      .eq('id', inscricao.adolescente_id)
      .limit(1)
      .maybeSingle();
    if (adolescenteError) throw adolescenteError;
    if (!adolescente?.pessoa_id) {
      return { status: 404, body: { success: false, error: 'ADOLESCENTE_NAO_ENCONTRADO', message: 'Adolescente da inscrição não encontrado.' } };
    }

    const pessoaPatch: Record<string, any> = { atualizado_em: new Date().toISOString() };
    if (nomeAdolescente) {
      pessoaPatch.nome_completo = nomeAdolescente;
      pessoaPatch.nome_normalizado = normalizeNome(nomeAdolescente);
    }
    if (dataNascimento) pessoaPatch.data_nascimento = dataNascimento;
    if (sexo) pessoaPatch.sexo = sexo;
    if (endereco) pessoaPatch.endereco = endereco;
    if (emailAdolescente) {
      pessoaPatch.email = emailAdolescente;
      pessoaPatch.email_normalizado = emailAdolescente.toLowerCase();
    }
    if (telefoneAdolescente) {
      pessoaPatch.telefone = telefoneAdolescente;
      pessoaPatch.telefone_normalizado = normalizePhoneDigits(telefoneAdolescente);
    }
    if (bairro) pessoaPatch.bairro = bairro;

    if (Object.keys(pessoaPatch).length > 1) {
      const { error: pessoaError } = await supabase.from('pessoas').update(pessoaPatch).eq('id', adolescente.pessoa_id);
      if (pessoaError) throw pessoaError;
    }

    if (nomeResponsavel || emailResponsavel || telefoneResponsavel) {
      const { data: vinculos, error: vinculosError } = await supabase
        .from('adolescente_responsaveis')
        .select('responsavel_id,principal')
        .eq('adolescente_id', adolescente.id)
        .order('principal', { ascending: false })
        .limit(1);
      if (vinculosError) throw vinculosError;
      const responsavelId = Array.isArray(vinculos) && vinculos[0]?.responsavel_id ? String(vinculos[0].responsavel_id) : '';

      if (responsavelId) {
        const { data: responsavelAtual, error: responsavelAtualError } = await supabase
          .from('responsaveis')
          .select('id,pessoa_id')
          .eq('id', responsavelId)
          .limit(1)
          .maybeSingle();
        if (responsavelAtualError) throw responsavelAtualError;

        const respPatch: Record<string, any> = { atualizado_em: new Date().toISOString() };
        if (nomeResponsavel) respPatch.nome = nomeResponsavel;
        if (emailResponsavel) {
          respPatch.email = emailResponsavel;
          respPatch.email_normalizado = emailResponsavel.toLowerCase();
        }
        if (telefoneResponsavel) {
          respPatch.telefone = telefoneResponsavel;
          respPatch.telefone_normalizado = normalizePhoneDigits(telefoneResponsavel);
        }
        const { error: respError } = await supabase.from('responsaveis').update(respPatch).eq('id', responsavelId);
        if (respError) throw respError;

        if (responsavelAtual?.pessoa_id) {
          const pessoaResponsavelPatch: Record<string, any> = { atualizado_em: new Date().toISOString() };
          if (nomeResponsavel) {
            pessoaResponsavelPatch.nome_completo = nomeResponsavel;
            pessoaResponsavelPatch.nome_normalizado = normalizeNome(nomeResponsavel);
          }
          if (emailResponsavel) {
            pessoaResponsavelPatch.email = emailResponsavel;
            pessoaResponsavelPatch.email_normalizado = emailResponsavel.toLowerCase();
          }
          if (telefoneResponsavel) {
            pessoaResponsavelPatch.telefone = telefoneResponsavel;
            pessoaResponsavelPatch.telefone_normalizado = normalizePhoneDigits(telefoneResponsavel);
          }
          if (Object.keys(pessoaResponsavelPatch).length > 1) {
            const { error: pessoaResponsavelError } = await supabase
              .from('pessoas')
              .update(pessoaResponsavelPatch)
              .eq('id', responsavelAtual.pessoa_id);
            if (pessoaResponsavelError) throw pessoaResponsavelError;
          }
        }
      }
    }

    const inscricaoPatch: Record<string, any> = { ultima_sincronizacao: new Date().toISOString() };
    if (emailAdolescente) inscricaoPatch.email_adolescente_snapshot = emailAdolescente;
    if (emailResponsavel) inscricaoPatch.email_responsavel_snapshot = emailResponsavel;
    if (emailResponsavel || emailAdolescente) inscricaoPatch.email_destino_snapshot = emailResponsavel || emailAdolescente;
    if (Object.keys(inscricaoPatch).length > 1) {
      const { error: inscricaoPatchError } = await supabase.from('inscricoes').update(inscricaoPatch).eq('id', inscricaoId);
      if (inscricaoPatchError) throw inscricaoPatchError;
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Cadastro atualizado com sucesso.',
        data: {
          inscricao_id: inscricaoId,
          status_inscricao_atual: toCleanString((inscricao as any)?.status || ''),
        },
      },
    };
  } catch (e) {
    console.error('[executeAtualizarCadastroInscricao] falha:', e);
    return { status: 500, body: { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao atualizar cadastro da inscrição.' } };
  }
}

export async function executeFechamentoLoteEncontro(params: {
  supabase: AnySupabaseClient | null;
  body: Record<string, any>;
}): Promise<ExecResult> {
  const { supabase, body } = params;

  if (!supabase) {
    return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
  }

  const encontroId = toCleanString(body.encontro_id);
  const alteradoPor = toCleanString(body.alterado_por) || null;
  const alteradoPorNome = toCleanString(body.alterado_por_nome) || null;
  const justificativaNaoSelecionado = toCleanString(body.justificativa_nao_selecionado) || 'Fechamento de ciclo do encontro.';

  if (!encontroId || !isValidUuid(encontroId)) {
    return { status: 400, body: { success: false, error: 'VALIDATION_ERROR', message: 'encontro_id inválido.' } };
  }

  try {
    // 1) PRIORIZADO -> CONFIRMADO
    const { data: priorizados, error: priorizadosError } = await supabase
      .from('inscricoes')
      .select('id,status')
      .eq('encontro_id', encontroId)
      .eq('status', 'PRIORIZADO');

    if (priorizadosError) {
      console.error('[executeFechamentoLoteEncontro] erro ao listar priorizados:', priorizadosError);
      return { status: 502, body: { success: false, error: 'ERRO_FECHAMENTO_LOTE', message: 'Não foi possível executar o fechamento em lote.' } };
    }

    const confirmados: string[] = [];
    const falhasConfirmar: string[] = [];

    for (const item of priorizados || []) {
      const { error } = await supabase.rpc('fn_alterar_status_inscricao', {
        p_inscricao_id: item.id,
        p_status_novo: 'CONFIRMADO',
        p_justificativa: null,
        p_alterado_por: alteradoPor,
        p_alterado_por_nome: alteradoPorNome,
      });
      if (error) {
        falhasConfirmar.push(String(item.id));
      } else {
        confirmados.push(String(item.id));
        try {
          await promoverInscricaoConfirmadaParaEncontrista(supabase, String(item.id));
        } catch (promoteError) {
          console.error('[executeFechamentoLoteEncontro] falha ao promover confirmado para ENCONTRISTA:', promoteError);
        }
      }
    }

    // 2) Restantes ativos -> NAO_SELECIONADO (exceto CONFIRMADO/CANCELADO/DESISTENTE)
    const { data: aposConfirmacao, error: aposError } = await supabase
      .from('inscricoes')
      .select('id,status')
      .eq('encontro_id', encontroId);

    if (aposError) {
      console.error('[executeFechamentoLoteEncontro] erro ao listar inscrições após confirmação:', aposError);
      return { status: 502, body: { success: false, error: 'ERRO_FECHAMENTO_LOTE', message: 'Não foi possível executar o fechamento em lote.' } };
    }

    const naoSelecionar = (aposConfirmacao || []).filter((r: any) => !['CONFIRMADO', 'CANCELADO', 'DESISTENTE'].includes(String(r.status || '').toUpperCase()));
    const naoSelecionados: string[] = [];
    const falhasNaoSelecionar: string[] = [];

    for (const item of naoSelecionar) {
      const { error } = await supabase.rpc('fn_alterar_status_inscricao', {
        p_inscricao_id: item.id,
        p_status_novo: 'NAO_SELECIONADO',
        p_justificativa: justificativaNaoSelecionado,
        p_alterado_por: alteradoPor,
        p_alterado_por_nome: alteradoPorNome,
      });
      if (error) falhasNaoSelecionar.push(String(item.id));
      else naoSelecionados.push(String(item.id));
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Fechamento em lote concluído.',
        data: {
          encontro_id: encontroId,
          confirmados_total: confirmados.length,
          nao_selecionados_total: naoSelecionados.length,
          falhas_confirmar_total: falhasConfirmar.length,
          falhas_nao_selecionar_total: falhasNaoSelecionar.length,
        },
      },
    };
  } catch (e) {
    console.error('[executeFechamentoLoteEncontro] falha:', e);
    return { status: 500, body: { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao executar fechamento em lote.' } };
  }
}

