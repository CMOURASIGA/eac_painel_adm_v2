import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeVisitacaoQuestionario, summarizeVisitacaoQuestionario } from '../utils/visitacaoQuestionario.js';

type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

export const VISITACAO_STATUS_VALUES = [
  'NENHUMA_ACAO',
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
] as const;

export type VisitacaoStatus = typeof VISITACAO_STATUS_VALUES[number];

const STATUS_SET = new Set<string>(VISITACAO_STATUS_VALUES);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function calculateAgeFromBirthDate(value: any): number | null {
  const raw = toCleanString(value);
  if (!raw) return null;

  let year = 0;
  let month = 0;
  let day = 0;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (br) {
    day = Number(br[1]);
    month = Number(br[2]);
    year = Number(br[3]);
  } else {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getFullYear();
    month = parsed.getMonth() + 1;
    day = parsed.getDate();
  }

  const now = new Date();
  let age = now.getFullYear() - year;
  const currentMonth = now.getMonth() + 1;
  if (currentMonth < month || (currentMonth === month && now.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function normalizeStatusList(rawValue: string) {
  return Array.from(
    new Set(
      toCleanString(rawValue)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => STATUS_SET.has(item))
    )
  ) as VisitacaoStatus[];
}

function resolveActionType(status: VisitacaoStatus, observacao: string, currentStatus: string) {
  if (status === 'CONTATO_INICIAL_FEITO') return 'CONTATO_INICIAL';
  if (status === 'VISITACAO_REALIZADA') return 'VISITA_REALIZADA';
  if (status === 'NAO_CONSEGUIU_CONTATO') return 'TENTATIVA_CONTATO';
  if (observacao && status === currentStatus) return 'OBSERVACAO';
  return 'STATUS_ALTERADO';
}

function buildIndicadores(items: any[]) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    total: safeItems.length,
    nenhumaAcao: safeItems.filter((item) => item?.status_visitacao === 'NENHUMA_ACAO').length,
    contatoInicialFeito: safeItems.filter((item) => item?.status_visitacao === 'CONTATO_INICIAL_FEITO').length,
    visitacaoRealizada: safeItems.filter((item) => item?.status_visitacao === 'VISITACAO_REALIZADA').length,
    pendentesVisitacao: safeItems.filter((item) => ['CONTATO_INICIAL_FEITO', 'AGUARDANDO_RETORNO'].includes(String(item?.status_visitacao || ''))).length,
    naoConseguiuContato: safeItems.filter((item) => item?.status_visitacao === 'NAO_CONSEGUIU_CONTATO').length,
    aguardandoRetorno: safeItems.filter((item) => item?.status_visitacao === 'AGUARDANDO_RETORNO').length,
    naoDesejaVisita: safeItems.filter((item) => item?.status_visitacao === 'NAO_DESEJA_VISITA').length,
  };
}

function hasQuestionarioColumn(payload: Record<string, any>) {
  return Object.prototype.hasOwnProperty.call(payload, 'respostas_questionario');
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
  return filtered;
}

function toSortableTime(value: any) {
  const raw = toCleanString(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickPreferredVisitacaoRow(current: any, candidate: any) {
  if (!current) return candidate;

  const candidateScore = Math.max(
    toSortableTime(candidate?.data_visitacao),
    toSortableTime(candidate?.data_contato_inicial),
    toSortableTime(candidate?.atualizado_em),
    toSortableTime(candidate?.data_cadastro),
  );
  const currentScore = Math.max(
    toSortableTime(current?.data_visitacao),
    toSortableTime(current?.data_contato_inicial),
    toSortableTime(current?.atualizado_em),
    toSortableTime(current?.data_cadastro),
  );

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  return String(candidate?.inscricao_id || '').localeCompare(String(current?.inscricao_id || ''), 'pt-BR') > 0
    ? candidate
    : current;
}

function consolidateVisitacaoItems(rows: any[]) {
  const grouped = new Map<string, any>();

  for (const row of Array.isArray(rows) ? rows : []) {
    const adolescenteId = toCleanString(row?.adolescente_id);
    const key = adolescenteId || toCleanString(row?.inscricao_id);
    if (!key) continue;
    grouped.set(key, pickPreferredVisitacaoRow(grouped.get(key), row));
  }

  return Array.from(grouped.values()).sort((a, b) =>
    toCleanString(a?.nome).localeCompare(toCleanString(b?.nome), 'pt-BR', { sensitivity: 'base' })
  );
}

const normalizeYesNo = (value: any) => {
  if (value === true) return 'SIM';
  if (value === false) return 'NAO';
  const raw = toCleanString(value).toUpperCase();
  if (raw === 'SIM' || raw === 'NAO') return raw;
  return 'NAO_INFORMADO';
};

const normalizePhone = (value: any) => toCleanString(value).replace(/\D/g, '');

function cleanNonEmptyPayload(payload: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

async function enrichVisitacaoItems(supabase: AnySupabaseClient, rows: any[]) {
  const items = consolidateVisitacaoItems(rows);
  if (!items.length) return items;

  const pessoaIds = Array.from(new Set(items.map((item) => toCleanString(item?.pessoa_adolescente_id)).filter(Boolean)));
  const adolescenteIds = Array.from(new Set(items.map((item) => toCleanString(item?.adolescente_id)).filter(Boolean)));
  const inscricaoIds = Array.from(new Set(items.map((item) => toCleanString(item?.inscricao_id)).filter(Boolean)));

  const [pessoasRes, adolescentesRes, inscricoesRes] = await Promise.all([
    pessoaIds.length ? supabase.from('pessoas').select('*').in('id', pessoaIds) : Promise.resolve({ data: [], error: null } as any),
    adolescenteIds.length ? supabase.from('adolescentes').select('*').in('id', adolescenteIds) : Promise.resolve({ data: [], error: null } as any),
    inscricaoIds.length ? supabase.from('inscricoes').select('*').in('id', inscricaoIds) : Promise.resolve({ data: [], error: null } as any),
  ]);

  const pessoas = new Map((Array.isArray(pessoasRes.data) ? pessoasRes.data : []).map((row: any) => [toCleanString(row?.id), row]));
  const adolescentes = new Map((Array.isArray(adolescentesRes.data) ? adolescentesRes.data : []).map((row: any) => [toCleanString(row?.id), row]));
  const inscricoes = new Map((Array.isArray(inscricoesRes.data) ? inscricoesRes.data : []).map((row: any) => [toCleanString(row?.id), row]));

  const vinculosRes = adolescenteIds.length
    ? await supabase.from('adolescente_responsaveis').select('*').in('adolescente_id', adolescenteIds)
    : ({ data: [], error: null } as any);
  const vinculos = Array.isArray(vinculosRes.data) ? vinculosRes.data : [];
  const responsavelIds = Array.from(new Set(vinculos.map((row: any) => toCleanString(row?.responsavel_id)).filter(Boolean)));
  const responsaveisRes = responsavelIds.length
    ? await supabase.from('responsaveis').select('*').in('id', responsavelIds)
    : ({ data: [], error: null } as any);
  const responsaveis = new Map((Array.isArray(responsaveisRes.data) ? responsaveisRes.data : []).map((row: any) => [toCleanString(row?.id), row]));

  const familiaPorAdolescente = new Map<string, { pai_nome?: string | null; mae_nome?: string | null }>();
  for (const vinculo of vinculos) {
    const adolescenteId = toCleanString(vinculo?.adolescente_id);
    const responsavel = responsaveis.get(toCleanString(vinculo?.responsavel_id)) || {};
    const grau = toCleanString(vinculo?.grau_parentesco).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const familia = familiaPorAdolescente.get(adolescenteId) || {};
    if (grau === 'pai' || grau.includes('pai/paterno')) familia.pai_nome = responsavel?.nome || null;
    if (grau === 'mae' || grau.includes('mae/materno')) familia.mae_nome = responsavel?.nome || null;
    familiaPorAdolescente.set(adolescenteId, familia);
  }

  const escolaIds = Array.from(new Set(
    Array.from(inscricoes.values()).map((row: any) => toCleanString(row?.escola_id)).filter(Boolean)
  ));
  const escolasRes = escolaIds.length
    ? await supabase.from('escolas').select('*').in('id', escolaIds)
    : ({ data: [], error: null } as any);
  const escolas = new Map((Array.isArray(escolasRes.data) ? escolasRes.data : []).map((row: any) => [toCleanString(row?.id), row]));

  return items.map((item) => {
    const pessoa = pessoas.get(toCleanString(item?.pessoa_adolescente_id)) || {};
    const adolescente = adolescentes.get(toCleanString(item?.adolescente_id)) || {};
    const inscricao = inscricoes.get(toCleanString(item?.inscricao_id)) || {};
    const escola = escolas.get(toCleanString(inscricao?.escola_id)) || {};
    const familia = familiaPorAdolescente.get(toCleanString(item?.adolescente_id)) || {};

    const dataNascimento = pessoa?.data_nascimento || item?.data_nascimento || null;
    const idade = calculateAgeFromBirthDate(dataNascimento) ?? item?.idade ?? null;

    return {
      ...item,
      idade,
      cadastro: {
        nome_completo: pessoa?.nome_completo || item?.nome || null,
        nome_social: pessoa?.nome_social || null,
        data_nascimento: dataNascimento,
        idade,
        sexo: pessoa?.sexo || item?.sexo || null,
        telefone: pessoa?.telefone || item?.telefone || null,
        email: pessoa?.email || item?.email || null,
        endereco: pessoa?.endereco || null,
        bairro: pessoa?.bairro || item?.bairro || null,
        cidade: pessoa?.cidade || null,
        estado: pessoa?.estado || pessoa?.uf || 'RJ',
        pai_nome: familia.pai_nome || null,
        mae_nome: familia.mae_nome || null,
        responsavel_nome: item?.responsavel_nome || null,
        responsavel_telefone: item?.responsavel_telefone || null,
        responsavel_email: item?.responsavel_email || null,
        tamanho_camisa: inscricao?.tamanho_camisa || null,
        escola_id: inscricao?.escola_id || null,
        escola_nome: escola?.nome || null,
        escola_nome_outro: inscricao?.escola_nome_outro || null,
        turno_escolar: adolescente?.turno_escolar || null,
        serie_escolar: adolescente?.serie_escolar || null,
        grau_escolar: adolescente?.grau_escolar || null,
        encontro_anterior: adolescente?.encontro_anterior || null,
        convidado_por: adolescente?.convidado_por || null,
        pais_fizeram_ecc: normalizeYesNo(adolescente?.pais_fizeram_ecc),
        primeira_comunhao: normalizeYesNo(adolescente?.primeira_comunhao),
        paroquia: adolescente?.paroquia || null,
        toca_instrumento: normalizeYesNo(adolescente?.toca_instrumento),
        instrumento: adolescente?.instrumento || null,
        gosta_cantar: normalizeYesNo(adolescente?.gosta_cantar),
        motivacao: adolescente?.motivacao || null,
        outra_doutrina_familia: normalizeYesNo(adolescente?.outra_doutrina_familia),
        outra_doutrina_descricao: adolescente?.outra_doutrina_descricao || null,
        restricao_alimentar: normalizeYesNo(adolescente?.restricao_alimentar),
        restricao_alimentar_descricao: adolescente?.restricao_alimentar_descricao || null,
      },
    };
  });
}

function displayValue(value: any) {
  if (value === true) return 'SIM';
  if (value === false) return 'NAO';
  return toCleanString(value);
}

async function updateCadastroOficialFromVisitacao(
  supabase: AnySupabaseClient,
  prioritized: any,
  cadastroInput: Record<string, any>,
) {
  const cadastro = cadastroInput && typeof cadastroInput === 'object' ? cadastroInput : {};
  if (!Object.keys(cadastro).length) return [] as Array<{ campo: string; anterior: string | null; novo: string | null }>;

  const pessoaId = toCleanString(prioritized?.pessoa_adolescente_id);
  const adolescenteId = toCleanString(prioritized?.adolescente_id);
  const inscricaoId = toCleanString(prioritized?.inscricao_id);
  if (!pessoaId || !adolescenteId || !inscricaoId) {
    throw new Error('Não foi possível resolver pessoa, adolescente e inscrição para atualizar o cadastro.');
  }

  const [pessoaRes, adolescenteRes, inscricaoRes] = await Promise.all([
    supabase.from('pessoas').select('*').eq('id', pessoaId).maybeSingle(),
    supabase.from('adolescentes').select('*').eq('id', adolescenteId).maybeSingle(),
    supabase.from('inscricoes').select('*').eq('id', inscricaoId).maybeSingle(),
  ]);
  if (pessoaRes.error) throw pessoaRes.error;
  if (adolescenteRes.error) throw adolescenteRes.error;
  if (inscricaoRes.error) throw inscricaoRes.error;

  const pessoa = pessoaRes.data || {};
  const adolescente = adolescenteRes.data || {};
  const inscricao = inscricaoRes.data || {};
  const changes: Array<{ campo: string; anterior: string | null; novo: string | null }> = [];

  const recordChanges = (source: any, payload: Record<string, any>, prefix: string) => {
    for (const [key, value] of Object.entries(payload)) {
      const before = displayValue(source?.[key]);
      const after = displayValue(value);
      if (after && before !== after) {
        changes.push({ campo: `${prefix}.${key}`, anterior: before || null, novo: after || null });
      }
    }
  };

  const nascimento = toCleanString(cadastro.data_nascimento);
  const pessoaPayloadRaw = cleanNonEmptyPayload({
    nome_completo: cadastro.nome_completo,
    nome_social: cadastro.nome_social,
    data_nascimento: nascimento,
    idade_calculada: nascimento ? calculateAgeFromBirthDate(nascimento) : undefined,
    sexo: cadastro.sexo,
    telefone: cadastro.telefone,
    telefone_normalizado: cadastro.telefone ? normalizePhone(cadastro.telefone) : undefined,
    email: cadastro.email,
    endereco: cadastro.endereco,
    bairro: cadastro.bairro,
    cidade: cadastro.cidade,
    estado: cadastro.estado,
  });
  const pessoaPayload = await pickPayloadByExistingColumns(supabase, 'pessoas', pessoaPayloadRaw);
  recordChanges(pessoa, pessoaPayload, 'pessoas');
  if (Object.keys(pessoaPayload).length) {
    const update = await supabase.from('pessoas').update(pessoaPayload).eq('id', pessoaId);
    if (update.error) throw update.error;
  }

  const toNullableBool = (value: any) => {
    const normalized = normalizeYesNo(value);
    if (normalized === 'SIM') return true;
    if (normalized === 'NAO') return false;
    return undefined;
  };
  const adolescentePayloadRaw = cleanNonEmptyPayload({
    turno_escolar: cadastro.turno_escolar,
    serie_escolar: cadastro.serie_escolar,
    grau_escolar: cadastro.grau_escolar,
    encontro_anterior: cadastro.encontro_anterior,
    convidado_por: cadastro.convidado_por,
    pais_fizeram_ecc: toNullableBool(cadastro.pais_fizeram_ecc),
    primeira_comunhao: toNullableBool(cadastro.primeira_comunhao),
    paroquia: cadastro.paroquia,
    toca_instrumento: toNullableBool(cadastro.toca_instrumento),
    instrumento: cadastro.instrumento,
    gosta_cantar: toNullableBool(cadastro.gosta_cantar),
    motivacao: cadastro.motivacao,
    outra_doutrina_familia: toNullableBool(cadastro.outra_doutrina_familia),
    outra_doutrina_descricao: cadastro.outra_doutrina_descricao,
    restricao_alimentar: toNullableBool(cadastro.restricao_alimentar),
    restricao_alimentar_descricao: cadastro.restricao_alimentar_descricao,
  });
  const adolescentePayload = await pickPayloadByExistingColumns(supabase, 'adolescentes', adolescentePayloadRaw);
  recordChanges(adolescente, adolescentePayload, 'adolescentes');
  if (Object.keys(adolescentePayload).length) {
    const update = await supabase.from('adolescentes').update(adolescentePayload).eq('id', adolescenteId);
    if (update.error) throw update.error;
  }

  const inscricaoPayloadRaw = cleanNonEmptyPayload({
    tamanho_camisa: cadastro.tamanho_camisa,
    escola_id: cadastro.escola_id,
    escola_nome_outro: cadastro.escola_id ? undefined : cadastro.escola_nome_outro,
  });
  const inscricaoPayload = await pickPayloadByExistingColumns(supabase, 'inscricoes', inscricaoPayloadRaw);
  recordChanges(inscricao, inscricaoPayload, 'inscricoes');
  if (Object.keys(inscricaoPayload).length) {
    const update = await supabase.from('inscricoes').update(inscricaoPayload).eq('id', inscricaoId);
    if (update.error) throw update.error;
  }

  const responsavelNome = toCleanString(cadastro.responsavel_nome);
  const responsavelTelefone = toCleanString(cadastro.responsavel_telefone);
  const responsavelEmail = toCleanString(cadastro.responsavel_email);
  if (responsavelNome || responsavelTelefone || responsavelEmail) {
    const vinculoRes = await supabase
      .from('adolescente_responsaveis')
      .select('*')
      .eq('adolescente_id', adolescenteId)
      .order('principal', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!vinculoRes.error && vinculoRes.data?.responsavel_id) {
      const responsavelRes = await supabase.from('responsaveis').select('*').eq('id', vinculoRes.data.responsavel_id).maybeSingle();
      if (responsavelRes.error) throw responsavelRes.error;
      const responsavel = responsavelRes.data || {};
      const responsavelPayloadRaw = cleanNonEmptyPayload({
        nome: responsavelNome,
        telefone: responsavelTelefone,
        telefone_normalizado: responsavelTelefone ? normalizePhone(responsavelTelefone) : undefined,
        email: responsavelEmail,
        email_normalizado: responsavelEmail ? responsavelEmail.toLowerCase() : undefined,
      });
      const responsavelPayload = await pickPayloadByExistingColumns(supabase, 'responsaveis', responsavelPayloadRaw);
      recordChanges(responsavel, responsavelPayload, 'responsaveis');
      if (Object.keys(responsavelPayload).length) {
        const update = await supabase.from('responsaveis').update(responsavelPayload).eq('id', vinculoRes.data.responsavel_id);
        if (update.error) throw update.error;
      }
    }
  }

  return changes;
}

export function getVisitacaoFormToken() {
  return toCleanString(process.env.VISITACAO_FORM_TOKEN || process.env.CHAVE_MESTRA);
}

export function validateVisitacaoFormToken(token: string) {
  const expected = getVisitacaoFormToken();
  if (!expected) return { ok: false, error: 'Token do formulário de visitação não configurado.' };
  if (!toCleanString(token)) return { ok: false, error: 'Token de acesso obrigatório.' };
  if (toCleanString(token) !== expected) return { ok: false, error: 'Token de acesso inválido.' };
  return { ok: true as const };
}

export async function listVisitacoes(
  supabase: AnySupabaseClient,
  query: Record<string, any> = {}
) {
  const statuses = normalizeStatusList(toCleanString(query.status));
  let request = supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .order('nome', { ascending: true, nullsFirst: false });

  if (statuses.length === 1) {
    request = request.eq('status_visitacao', statuses[0]);
  } else if (statuses.length > 1) {
    request = request.in('status_visitacao', statuses);
  }

  const { data, error } = await request;
  if (error) throw error;

  const items = await enrichVisitacaoItems(supabase, Array.isArray(data) ? data : []);
  return { items, indicadores: buildIndicadores(items) };
}

export async function getVisitacaoHistorico(
  supabase: AnySupabaseClient,
  inscricaoId: string
) {
  const id = toCleanString(inscricaoId);
  if (!id) return { status: 400, body: { success: false, error: 'Inscrição obrigatória.' } };

  const { data, error } = await supabase
    .from('visitacoes_historico')
    .select('*')
    .eq('inscricao_id', id)
    .order('criado_em', { ascending: false });

  if (error) {
    return { status: 500, body: { success: false, error: error.message } };
  }

  return { status: 200, body: { success: true, items: Array.isArray(data) ? data : [] } };
}

export async function registerVisitacao(
  supabase: AnySupabaseClient,
  inscricaoId: string,
  body: Record<string, any>
) {
  const id = toCleanString(inscricaoId);
  if (!id) return { status: 400, body: { success: false, error: 'Inscrição obrigatória.' } };

  const status = toCleanString(body?.status_visitacao).toUpperCase();
  const responsavel = toCleanString(body?.responsavel_acao || body?.responsavel);
  const observacao = toCleanString(body?.observacao);
  const respostasQuestionario = normalizeVisitacaoQuestionario(body?.respostas_questionario);
  const origem = toCleanString(body?.origem_registro || 'PAINEL');
  const dataAcao = toCleanString(body?.data_acao) || new Date().toISOString();

  if (!STATUS_SET.has(status)) {
    return { status: 400, body: { success: false, error: 'Status de visitação inválido.' } };
  }
  if (!responsavel) {
    return { status: 400, body: { success: false, error: 'Informe o responsável pela ação.' } };
  }

  const { data: prioritized, error: prioritizedError } = await supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (prioritizedError) {
    return { status: 500, body: { success: false, error: prioritizedError.message } };
  }
  if (!prioritized) {
    return { status: 404, body: { success: false, error: 'Inscrição priorizada não encontrada para visitação.' } };
  }

  const { data: current, error: currentError } = await supabase
    .from('visitacoes')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (currentError) {
    return { status: 500, body: { success: false, error: currentError.message } };
  }

  const currentStatus = toCleanString(current?.status_visitacao || 'NENHUMA_ACAO').toUpperCase();
  let alteracoesCadastrais: Array<{ campo: string; anterior: string | null; novo: string | null }> = [];
  try {
    alteracoesCadastrais = await updateCadastroOficialFromVisitacao(
      supabase,
      prioritized,
      body?.cadastro && typeof body.cadastro === 'object' ? body.cadastro : {},
    );
  } catch (cadastroError: any) {
    return { status: 500, body: { success: false, error: cadastroError?.message || 'Falha ao atualizar cadastro oficial.' } };
  }

  const payload: Record<string, any> = {
    inscricao_id: id,
    status_visitacao: status,
    responsavel_acao: responsavel,
    observacao: observacao || null,
    respostas_questionario: respostasQuestionario,
    origem_registro: origem || 'PAINEL',
  };

  if (status === 'NENHUMA_ACAO') {
    payload.contato_inicial_realizado = false;
    payload.data_contato_inicial = null;
    payload.visitacao_realizada = false;
    payload.data_visitacao = null;
  }

  if (status === 'CONTATO_INICIAL_FEITO') {
    payload.contato_inicial_realizado = true;
    payload.data_contato_inicial = current?.data_contato_inicial || dataAcao;
    payload.visitacao_realizada = false;
    payload.data_visitacao = null;
  }

  if (status === 'VISITACAO_REALIZADA') {
    payload.contato_inicial_realizado = true;
    payload.data_contato_inicial = current?.data_contato_inicial || dataAcao;
    payload.visitacao_realizada = true;
    payload.data_visitacao = dataAcao;
  }

  if (status === 'NAO_CONSEGUIU_CONTATO' || status === 'AGUARDANDO_RETORNO' || status === 'NAO_DESEJA_VISITA') {
    payload.contato_inicial_realizado = current?.contato_inicial_realizado || false;
    payload.data_contato_inicial = current?.data_contato_inicial || null;
    payload.visitacao_realizada = false;
    if (status === 'NAO_DESEJA_VISITA') payload.data_visitacao = null;
  }

  const safeVisitacoesPayload = await pickPayloadByExistingColumns(supabase, 'visitacoes', payload);
  const { data: saved, error: saveError } = await supabase
    .from('visitacoes')
    .upsert(safeVisitacoesPayload, { onConflict: 'inscricao_id' })
    .select('*')
    .single();

  if (saveError) {
    return { status: 500, body: { success: false, error: saveError.message } };
  }

  if (!hasQuestionarioColumn(saved || {})) {
    const fallbackSummary = summarizeVisitacaoQuestionario(respostasQuestionario);
    if (fallbackSummary) {
      const safeUpdate = await pickPayloadByExistingColumns(supabase, 'visitacoes', {
        observacao: [observacao, fallbackSummary].filter(Boolean).join(' | '),
      });
      await supabase
        .from('visitacoes')
        .update(safeUpdate)
        .eq('id', saved.id);
    }
  }

  const auditSummary = alteracoesCadastrais.length
    ? `Cadastro atualizado: ${alteracoesCadastrais.map((item) => `${item.campo}: ${item.anterior || 'não informado'} -> ${item.novo || 'não informado'}`).join(' | ')}`
    : '';
  const historyPayload = {
    visitacao_id: saved.id,
    inscricao_id: id,
    tipo_acao: resolveActionType(status as VisitacaoStatus, observacao, currentStatus),
    status_anterior: currentStatus,
    status_novo: status,
    descricao: [observacao, summarizeVisitacaoQuestionario(respostasQuestionario), auditSummary].filter(Boolean).join(' | ') || null,
    responsavel_acao: responsavel,
    respostas_questionario: respostasQuestionario,
    alteracoes_cadastrais: alteracoesCadastrais,
    origem_registro: origem || 'PAINEL',
  };

  const safeHistoryPayload = await pickPayloadByExistingColumns(supabase, 'visitacoes_historico', historyPayload);
  const { error: historyError } = await supabase
    .from('visitacoes_historico')
    .insert(safeHistoryPayload);

  if (historyError) {
    return { status: 500, body: { success: false, error: historyError.message } };
  }

  const { data: updatedItem, error: updatedItemError } = await supabase
    .from('vw_visitacao_priorizados')
    .select('*')
    .eq('inscricao_id', id)
    .maybeSingle();

  if (updatedItemError) {
    return { status: 500, body: { success: false, error: updatedItemError.message } };
  }

  const enriched = updatedItem ? await enrichVisitacaoItems(supabase, [updatedItem]) : [];
  return {
    status: 200,
    body: {
      success: true,
      item: enriched[0] || updatedItem || saved,
      alteracoes_cadastrais: alteracoesCadastrais,
    },
  };
}
