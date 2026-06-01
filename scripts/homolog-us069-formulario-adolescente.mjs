import dotenv from 'dotenv';
import { executeInscricaoCreate } from '../.tmp-ts/inscricaoCreate.js';
import { getSupabaseServerClient } from '../.tmp-ts/supabaseServer.js';

dotenv.config({ path: '.env.local' });
const supabase = getSupabaseServerClient();
if (!supabase) throw new Error('Supabase nao configurado');

const out = { us: 'US-069', timestamp: new Date().toISOString(), success: false, steps: [] };

try {
  const encontroRes = await supabase
    .from('encontros')
    .select('id,nome,status,data_inicio')
    .in('status', ['ATIVO','PLANEJADO'])
    .not('data_inicio','is',null)
    .order('data_inicio', { ascending: false })
    .limit(1);
  const encontro = encontroRes.data?.[0];
  if (encontroRes.error || !encontro) throw new Error('Nenhum encontro valido encontrado');

  const suffix = Date.now().toString().slice(-6);
  const payload = {
    nome_adolescente: `Teste Homolog US069 ${suffix}`,
    data_nascimento: '2011-05-10',
    telefone_adolescente: `21999${suffix}`.slice(0,11),
    nome_responsavel: `Resp Homolog US069 ${suffix}`,
    telefone_responsavel: `21988${suffix}`.slice(0,11),
    bairro: 'Icarai',
    paroquia: 'Paroquia Teste',
    participou_antes: false,
    aceite_termos: true,
    id_encontro: encontro.id,
  };

  const create = await executeInscricaoCreate({ supabase, body: payload });
  const createOk = create?.status === 201 && create?.body?.success === true;
  out.steps.push({ step:'create', ok: createOk, status:create?.status });
  if (!createOk) throw new Error('Falha na criacao de inscricao');

  const dup = await executeInscricaoCreate({ supabase, body: payload });
  const dupBlocked = dup?.body?.success === true && dup?.body?.duplicate === true;
  out.steps.push({ step:'duplicate_block', ok: dupBlocked, status:dup?.status });
  if (!dupBlocked) throw new Error('Duplicidade nao tratada');

  out.success = true;
} catch (e) {
  out.error = String(e?.message || e);
}

console.log(JSON.stringify(out, null, 2));
