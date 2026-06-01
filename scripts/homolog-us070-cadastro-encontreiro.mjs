import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = { us: 'US-070', timestamp: new Date().toISOString(), success: false, steps: [] };
const suffix = Date.now().toString().slice(-6);

try {
  const pessoaPayload = {
    nome_completo: `Teste Homolog US070 ${suffix}`,
    nome_normalizado: `teste homolog us070 ${suffix}`,
    telefone: `21977${suffix}`.slice(0,11),
    telefone_normalizado: `55${`21977${suffix}`.slice(0,11)}`,
    email: `us070_${suffix}@teste.local`,
    bairro: 'Icarai',
  };

  const pIns = await supabase.from('pessoas').insert(pessoaPayload).select('id').limit(1);
  if (pIns.error) throw pIns.error;
  const pessoaId = pIns.data?.[0]?.id;
  out.steps.push({ step: 'create_pessoa', ok: !!pessoaId, pessoaId });

  const eIns = await supabase
    .from('encontreiros')
    .insert({
      pessoa_id: pessoaId,
      classificacao: 'ADOLESCENTE',
      status: 'DISPONIVEL',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      frequenta_missas: true,
      participa_movimento: false,
    })
    .select('id,pessoa_id,classificacao,status,frequenta_missas,participa_movimento')
    .limit(1);
  if (eIns.error) throw eIns.error;
  const encId = eIns.data?.[0]?.id;
  out.steps.push({ step: 'create_encontreiro', ok: !!encId, encId, row: eIns.data?.[0] || null });

  const eUpd = await supabase
    .from('encontreiros')
    .update({ classificacao: 'OUTRO', participa_movimento: true })
    .eq('id', encId)
    .select('id,classificacao,participa_movimento')
    .limit(1);
  if (eUpd.error) throw eUpd.error;
  const updatedOk = eUpd.data?.[0]?.classificacao === 'OUTRO' && eUpd.data?.[0]?.participa_movimento === true;
  out.steps.push({ step: 'update_encontreiro', ok: updatedOk, row: eUpd.data?.[0] || null });

  const eDel = await supabase.from('encontreiros').delete().eq('id', encId).select('id').limit(1);
  if (eDel.error) throw eDel.error;
  const pDel = await supabase.from('pessoas').delete().eq('id', pessoaId).select('id').limit(1);
  if (pDel.error) throw pDel.error;
  out.steps.push({ step: 'delete_encontreiro_pessoa', ok: true });

  out.success = out.steps.every((s) => s.ok !== false);
} catch (e) {
  out.error = String(e?.message || e);
}

console.log(JSON.stringify(out, null, 2));
