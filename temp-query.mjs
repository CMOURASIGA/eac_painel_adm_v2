import { getSupabaseServerClient } from './utils/supabaseServer.ts';

const supabase = getSupabaseServerClient();

if (!supabase) {
  console.error('Supabase not configured');
  process.exit(1);
}

const { data, error } = await supabase
  .from('encontros')
  .select('id, nome, numero, data_inicio, data_fim, status')
  .in('status', ['ATIVO', 'PLANEJADO'])
  .order('data_inicio', { ascending: false });

if (error) {
  console.error('Error:', error);
} else {
  console.log('Encontros encontrados:');
  console.log(JSON.stringify(data, null, 2));
}