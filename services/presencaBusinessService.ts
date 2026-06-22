import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, any>;
type AnySupabaseClient = SupabaseClient<any, 'public', string, any, any>;

type ServiceResult = { ok: true; data: JsonObject };

const cleanText = (value: any) => String(value ?? '').trim();
const normalizeDigits = (value: any) => String(value || '').replace(/\D/g, '');
const normalizeName = (value: any) =>
  cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

async function resolveEncontreirosTable(supabase: AnySupabaseClient) {
  const envTable = String(process.env.EAC_SUPABASE_TABLE_ENCONTREIROS || '').trim();
  const candidates = [envTable, 'cadastro_encontreiros', 'encontreiros', 'cadastro_encontreiro'].filter(Boolean);

  for (const table of candidates) {
    const probe = await supabase.from(table).select('id').limit(1);
    if (!probe.error) return table;
  }

  return '';
}

async function updateEncontreiroPhoneIfPossible(
  supabase: AnySupabaseClient,
  params: { pessoaId?: string | null; nome?: string | null; telefoneOriginal: string; telefoneNormalizado: string }
) {
  const table = await resolveEncontreirosTable(supabase);
  if (!table) return;

  let query = supabase.from(table).select('id,pessoa_id,nomeCompleto,nome_completo').limit(10);
  if (cleanText(params.pessoaId)) {
    query = query.eq('pessoa_id', cleanText(params.pessoaId));
  } else if (cleanText(params.nome)) {
    const nome = cleanText(params.nome);
    query = query.or(`nomeCompleto.eq.${nome},nome_completo.eq.${nome}`);
  } else {
    return;
  }

  const found = await query;
  if (found.error || !Array.isArray(found.data) || found.data.length === 0) return;

  for (const row of found.data) {
    const rowName = cleanText((row as any)?.nomeCompleto || (row as any)?.nome_completo);
    if (!cleanText(params.pessoaId) && rowName && normalizeName(rowName) !== normalizeName(params.nome)) continue;

    await supabase
      .from(table)
      .update({
        telefone: params.telefoneOriginal,
        telefone_normalizado: params.telefoneNormalizado,
        celular_whatsapp: params.telefoneOriginal,
        celularWhatsapp: params.telefoneOriginal,
        whatsapp_normalizado: params.telefoneNormalizado,
        whatsappNormalizado: params.telefoneNormalizado,
        atualizado_em: new Date().toISOString(),
      } as any)
      .eq('id', row.id);
  }
}

async function updateEncontreiroEmailIfPossible(
  supabase: AnySupabaseClient,
  params: { pessoaId?: string | null; nome?: string | null; email: string }
) {
  const table = await resolveEncontreirosTable(supabase);
  if (!table || !cleanText(params.email)) return;

  let query = supabase.from(table).select('id,pessoa_id,nomeCompleto,nome_completo').limit(10);
  if (cleanText(params.pessoaId)) {
    query = query.eq('pessoa_id', cleanText(params.pessoaId));
  } else if (cleanText(params.nome)) {
    const nome = cleanText(params.nome);
    query = query.or(`nomeCompleto.eq.${nome},nome_completo.eq.${nome}`);
  } else {
    return;
  }

  const found = await query;
  if (found.error || !Array.isArray(found.data) || found.data.length === 0) return;

  for (const row of found.data) {
    const rowName = cleanText((row as any)?.nomeCompleto || (row as any)?.nome_completo);
    if (!cleanText(params.pessoaId) && rowName && normalizeName(rowName) !== normalizeName(params.nome)) continue;

    await supabase
      .from(table)
      .update({
        email: cleanText(params.email).toLowerCase(),
        email_normalizado: cleanText(params.email).toLowerCase(),
        atualizado_em: new Date().toISOString(),
      } as any)
      .eq('id', row.id);
  }
}

export async function markPresenceService(supabase: AnySupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const pessoaIdInput = cleanText(payload.pessoaId || payload.pessoa_id);
  const telefoneInput = cleanText(payload.telefone);
  const telefoneAtualizadoInput = cleanText(
    payload.telefoneAtualizado || payload.telefone_atualizado || payload.telefoneCorrigido || payload.telefone_corrigido
  );
  const emailAtualizadoInput = cleanText(
    payload.emailAtualizado || payload.email_atualizado || payload.emailCorrigido || payload.email_corrigido
  ).toLowerCase();
  const nomeInput = cleanText(payload.nome);
  const circuloInput = cleanText(payload.circulo);
  const origemPublico = cleanText(payload.origemPublico || payload.origem_publico) || 'PUBLICO';

  const digits = normalizeDigits(telefoneAtualizadoInput || telefoneInput);
  if (!digits || digits.length < 10) {
    return { ok: true, data: { success: false, error: 'Telefone invalido para registrar presenca.' } };
  }

  const telNorm = digits.startsWith('55') ? digits : `55${digits}`;
  const telefonePersistido = telefoneAtualizadoInput || telefoneInput || digits;
  const now = new Date();
  const month = now.getMonth() + 1;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  const dupBase = supabase
    .from('presencas')
    .select('id,data_presenca,pessoa_id')
    .gte('data_presenca', dayStart)
    .lte('data_presenca', dayEnd)
    .limit(1);
  const dupToday = pessoaIdInput
    ? await dupBase.eq('pessoa_id', pessoaIdInput)
    : await dupBase.eq('telefone_normalizado', telNorm);

  if (dupToday.error) throw dupToday.error;
  if (Array.isArray(dupToday.data) && dupToday.data.length > 0) {
    return {
      ok: true,
      data: {
        success: false,
        error: 'Presenca ja registrada para este participante hoje.',
        duplicate: true,
      },
    };
  }

  let pessoaId: string | null = null;
  let adolescenteId: string | null = null;
  let statusConciliacao = 'PENDENTE';
  let pessoaNome = nomeInput;

  const pessoaBase = supabase
    .from('pessoas')
    .select('id,telefone,telefone_normalizado,nome_completo,email,email_normalizado')
    .limit(1);
  const pessoaRes = pessoaIdInput
    ? await pessoaBase.eq('id', pessoaIdInput)
    : await pessoaBase.in('telefone_normalizado', [telNorm, digits]);
  if (pessoaRes.error) throw pessoaRes.error;
  if (Array.isArray(pessoaRes.data) && pessoaRes.data[0]?.id) {
    const pessoa = pessoaRes.data[0];
    pessoaId = String(pessoa.id);
    pessoaNome = cleanText(pessoa.nome_completo) || pessoaNome;
    statusConciliacao = 'CONCILIADO';

    const telefoneAtualBase = normalizeDigits(pessoa.telefone_normalizado || pessoa.telefone);
    if (telefoneAtualBase !== digits) {
      const pessoaUpdate = await supabase
        .from('pessoas')
        .update({
          telefone: telefonePersistido,
          telefone_normalizado: telNorm,
          atualizado_em: now.toISOString(),
          ultima_sincronizacao: now.toISOString(),
        } as any)
        .eq('id', pessoaId);
      if (pessoaUpdate.error) throw pessoaUpdate.error;

      await updateEncontreiroPhoneIfPossible(supabase, {
        pessoaId,
        nome: pessoaNome || nomeInput,
        telefoneOriginal: telefonePersistido,
        telefoneNormalizado: telNorm,
      });
    }

    const emailAtualBase = cleanText(pessoa.email_normalizado || pessoa.email).toLowerCase();
    if (emailAtualizadoInput && emailAtualBase !== emailAtualizadoInput) {
      const pessoaEmailUpdate = await supabase
        .from('pessoas')
        .update({
          email: emailAtualizadoInput,
          email_normalizado: emailAtualizadoInput,
          atualizado_em: now.toISOString(),
          ultima_sincronizacao: now.toISOString(),
        } as any)
        .eq('id', pessoaId);
      if (pessoaEmailUpdate.error) throw pessoaEmailUpdate.error;

      await updateEncontreiroEmailIfPossible(supabase, {
        pessoaId,
        nome: pessoaNome || nomeInput,
        email: emailAtualizadoInput,
      });
    }

    const adolRes = await supabase
      .from('adolescentes')
      .select('id')
      .eq('pessoa_id', pessoaId)
      .limit(1);
    if (adolRes.error) throw adolRes.error;
    adolescenteId = Array.isArray(adolRes.data) && adolRes.data[0]?.id ? String(adolRes.data[0].id) : null;
  }

  let circuloId: string | null = null;
  if (circuloInput) {
    const circ = await supabase
      .from('circulos')
      .select('id,nome')
      .ilike('nome', circuloInput)
      .limit(1);
    if (!circ.error) {
      circuloId = Array.isArray(circ.data) && circ.data[0]?.id ? String(circ.data[0].id) : null;
    }
  }

  const insertPayload: Record<string, any> = {
    pessoa_id: pessoaId,
    adolescente_id: adolescenteId,
    encontro_id: null,
    circulo_id: circuloId,
    data_presenca: now.toISOString(),
    mes: month,
    telefone_digitado: telefonePersistido,
    telefone_normalizado: telNorm,
    nome_digitado: pessoaNome || nomeInput || '',
    status_conciliacao: statusConciliacao,
    origem: origemPublico === 'PAINEL_INTERNO' ? 'SISTEMA_CHECKIN' : 'SISTEMA_CHECKIN_PUBLICO',
    circulo_informado: circuloInput || null,
    status_presenca: 'REGISTRADA',
    criado_via_sistema: true,
    payload: {
      telefone: telefonePersistido,
      emailAtualizado: emailAtualizadoInput || null,
      nome: pessoaNome || nomeInput || '',
      circulo: circuloInput || '',
      telefoneAtualizado: Boolean(telefoneAtualizadoInput),
      pessoaId: pessoaId || null,
      canal: 'PAINEL_PRESENCA',
    },
  };

  const insertRes = await supabase
    .from('presencas')
    .insert(insertPayload)
    .select('*')
    .limit(1);
  if (insertRes.error) throw insertRes.error;

  return { ok: true, data: { success: true, source: 'supabase', saved: Array.isArray(insertRes.data) ? insertRes.data[0] : null } };
}
