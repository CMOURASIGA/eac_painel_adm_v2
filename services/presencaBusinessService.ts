import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, any>;

type ServiceResult = { ok: true; data: JsonObject };

const cleanText = (value: any) => String(value ?? '').trim();
const normalizeDigits = (value: any) => String(value || '').replace(/\D/g, '');

export async function markPresenceService(supabase: SupabaseClient, payload: JsonObject): Promise<ServiceResult> {
  const telefoneInput = cleanText(payload.telefone);
  const nomeInput = cleanText(payload.nome);
  const circuloInput = cleanText(payload.circulo);

  const digits = normalizeDigits(telefoneInput);
  if (!digits || digits.length < 10) {
    return { ok: true, data: { success: false, error: 'Telefone invalido para registrar presenca.' } };
  }

  const telNorm = digits.startsWith('55') ? digits : `55${digits}`;
  const now = new Date();
  const month = now.getMonth() + 1;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  const dupToday = await supabase
    .from('presencas')
    .select('id,data_presenca')
    .eq('telefone_normalizado', telNorm)
    .gte('data_presenca', dayStart)
    .lte('data_presenca', dayEnd)
    .limit(1);

  if (dupToday.error) throw dupToday.error;
  if (Array.isArray(dupToday.data) && dupToday.data.length > 0) {
    return {
      ok: true,
      data: {
        success: false,
        error: 'Presenca ja registrada para este telefone hoje.',
        duplicate: true,
      },
    };
  }

  let pessoaId: string | null = null;
  let adolescenteId: string | null = null;
  let statusConciliacao = 'PENDENTE';

  const pessoaRes = await supabase
    .from('pessoas')
    .select('id,telefone_normalizado,nome_completo')
    .in('telefone_normalizado', [telNorm, digits])
    .limit(1);
  if (pessoaRes.error) throw pessoaRes.error;
  if (Array.isArray(pessoaRes.data) && pessoaRes.data[0]?.id) {
    pessoaId = String(pessoaRes.data[0].id);
    statusConciliacao = 'CONCILIADO';

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
    telefone_digitado: telefoneInput || digits,
    telefone_normalizado: telNorm,
    nome_digitado: nomeInput || '',
    status_conciliacao: statusConciliacao,
    origem: 'SISTEMA_CHECKIN',
    circulo_informado: circuloInput || null,
    status_presenca: 'REGISTRADA',
    criado_via_sistema: true,
    payload: {
      telefone: telefoneInput || digits,
      nome: nomeInput || '',
      circulo: circuloInput || '',
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
