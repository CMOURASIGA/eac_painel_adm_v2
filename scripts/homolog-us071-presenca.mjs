import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = { us: 'US-071', timestamp: new Date().toISOString(), success: false, steps: [] };

const normalize = (v) => String(v || '').replace(/\D/g, '');

try {
  const hist = await supabase.from('vw_presencas_historico').select('*').limit(5000);
  if (hist.error) throw hist.error;
  const list = Array.isArray(hist.data) ? hist.data : [];
  out.steps.push({ step: 'load_presence_history', ok: list.length > 0, total: list.length });

  const validRows = list.filter((r) => String(r?.nome_digitado || r?.nome || '').trim());
  const years = Array.from(new Set(validRows.map((r) => {
    const raw = String(r?.data_presenca || r?.timestamp || r?.criado_em || '');
    const m = raw.match(/^(\d{4})/);
    return m ? m[1] : '';
  }).filter(Boolean)));
  const circles = Array.from(new Set(validRows.map((r) => String(r?.circulo_informado || r?.circulo || '').trim()).filter(Boolean)));
  out.steps.push({ step: 'filters_base', ok: years.length > 0 && circles.length > 0, years: years.length, circles: circles.length });

  const sample = validRows[0];
  const telRaw = String(sample?.telefone_digitado || sample?.telefone || sample?.telefone_cadastrado || '').trim();
  const telDigits = normalize(telRaw);
  if (!telDigits) throw new Error('Sem telefone válido para teste de check-in');
  const telNorm = telDigits.startsWith('55') ? telDigits : `55${telDigits}`;

  const day = new Date();
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).toISOString();

  const cleanup = await supabase
    .from('presencas')
    .delete()
    .eq('origem', 'HOMOLOG_US071')
    .eq('telefone_normalizado', telNorm)
    .gte('data_presenca', dayStart)
    .lte('data_presenca', dayEnd)
    .select('id');
  if (cleanup.error) throw cleanup.error;

  const pessoa = await supabase.from('pessoas').select('id').in('telefone_normalizado', [telNorm, telDigits]).limit(1);
  if (pessoa.error) throw pessoa.error;
  const pessoaId = pessoa.data?.[0]?.id || null;

  let adolescenteId = null;
  if (pessoaId) {
    const ad = await supabase.from('adolescentes').select('id').eq('pessoa_id', pessoaId).limit(1);
    if (ad.error) throw ad.error;
    adolescenteId = ad.data?.[0]?.id || null;
  }

  const ins = await supabase
    .from('presencas')
    .insert({
      pessoa_id: pessoaId,
      adolescente_id: adolescenteId,
      encontro_id: null,
      circulo_id: null,
      data_presenca: new Date().toISOString(),
      mes: day.getMonth() + 1,
      telefone_digitado: telRaw || telDigits,
      telefone_normalizado: telNorm,
      nome_digitado: String(sample?.nome_digitado || sample?.nome || 'HOMOLOG US071'),
      status_conciliacao: pessoaId ? 'CONCILIADO' : 'PENDENTE',
      origem: 'HOMOLOG_US071',
      circulo_informado: String(sample?.circulo_informado || sample?.circulo || ''),
      status_presenca: 'REGISTRADA',
      criado_via_sistema: true,
      payload: { canal: 'HOMOLOG_US071' },
    })
    .select('id,telefone_normalizado,origem,status_presenca')
    .limit(1);
  if (ins.error) throw ins.error;
  const insertedId = ins.data?.[0]?.id;
  out.steps.push({ step: 'checkin_insert', ok: !!insertedId, insertedId });

  const dup = await supabase
    .from('presencas')
    .select('id')
    .eq('telefone_normalizado', telNorm)
    .eq('origem', 'HOMOLOG_US071')
    .gte('data_presenca', dayStart)
    .lte('data_presenca', dayEnd);
  if (dup.error) throw dup.error;
  const dupCount = Array.isArray(dup.data) ? dup.data.length : 0;
  out.steps.push({ step: 'duplicate_guard_reference', ok: dupCount === 1, sameDayRows: dupCount });

  const summary = await supabase.from('vw_presencas_resumo').select('*').limit(5);
  if (summary.error) throw summary.error;
  out.steps.push({ step: 'indicators_source', ok: Array.isArray(summary.data), rows: summary.data?.length || 0 });

  out.success = out.steps.every((s) => s.ok !== false);
} catch (e) {
  out.error = String(e?.message || e);
}

console.log(JSON.stringify(out, null, 2));
