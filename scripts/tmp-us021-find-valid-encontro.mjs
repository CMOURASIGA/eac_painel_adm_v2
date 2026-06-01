import dotenv from 'dotenv';
import { getSupabaseServerClient } from '../utils/supabaseServer.ts';

dotenv.config({ path: '.env.local' });
const supabase = getSupabaseServerClient();
if (!supabase) throw new Error('Supabase not configured');

const { data, error } = await supabase
  .from('encontros')
  .select('id,nome,status,data_inicio')
  .in('status', ['ATIVO', 'PLANEJADO'])
  .not('data_inicio', 'is', null)
  .order('data_inicio', { ascending: false })
  .limit(5);

console.log(JSON.stringify({ error: error ? error.message : null, count: data?.length, rows: data }, null, 2));
