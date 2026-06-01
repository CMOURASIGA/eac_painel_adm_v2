import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
const supabase = createClient(url, key, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false } });

async function run() {
  const nome = 'Teste US020 Frontend';
  const telefone = '21999990022';

  const { data: pessoas, error: pessoasError } = await supabase
    .from('pessoas')
    .select('id,nome_completo,telefone_normalizado')
    .ilike('nome_completo', `%${nome}%`)
    .or(`telefone_normalizado.ilike.%${telefone}%`)
    .limit(50);

  if (pessoasError) {
    console.error('Erro query pessoas:', pessoasError);
    return;
  }

  console.log('pessoas', JSON.stringify(pessoas, null, 2));

  const adolescenteIds = (pessoas || []).map((p) => p.id).filter(Boolean);
  if (!adolescenteIds.length) {
    console.log('Nenhuma pessoa encontrada para o teste frontend.');
    return;
  }

  const { data: adolescentes, error: adolescentesError } = await supabase
    .from('adolescentes')
    .select('id,pessoa_id,aceite_normas')
    .in('pessoa_id', adolescenteIds);

  if (adolescentesError) {
    console.error('Erro query adolescentes:', adolescentesError);
    return;
  }

  console.log('adolescentes', JSON.stringify(adolescentes, null, 2));

  const adolescenteIdsFound = (adolescentes || []).map((a) => a.id).filter(Boolean);
  if (!adolescenteIdsFound.length) {
    console.log('Nenhum adolescente encontrado para as pessoas de teste.');
    return;
  }

  const { data: inscricoes, error: inscricoesError } = await supabase
    .from('inscricoes')
    .select('id,encontro_id,status,origem_dado,criado_via_sistema,data_inscricao,adolescente_id')
    .in('adolescente_id', adolescenteIdsFound)
    .order('data_inscricao', { ascending: false })
    .limit(50);

  if (inscricoesError) {
    console.error('Erro query inscricoes:', inscricoesError);
    return;
  }

  console.log('inscricoes', JSON.stringify(inscricoes, null, 2));

  const duplicateCounts = (inscricoes || []).reduce((acc, item) => {
    const key = `${item.encontro_id}:${item.adolescente_id}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const duplicates = Object.entries(duplicateCounts)
    .filter(([_, count]) => count > 1)
    .map(([key, count]) => ({ encontro_adolescente: key, count }));

  console.log('duplicate_check', JSON.stringify(duplicates, null, 2));

  const { data: responsaveis, error: responsaveisError } = await supabase
    .from('responsaveis')
    .select('id,nome,telefone_normalizado')
    .ilike('nome', '%Responsável US020 Frontend%')
    .or(`telefone_normalizado.ilike.%21988880022%`)
    .limit(50);

  if (responsaveisError) {
    console.error('Erro query responsaveis:', responsaveisError);
  } else {
    console.log('responsaveis', JSON.stringify(responsaveis, null, 2));
  }
}

run().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});