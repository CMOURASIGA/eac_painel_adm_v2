import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { executeInscricaoCreate } from '../.tmp-ts/inscricaoCreate.js';
import { getSupabaseServerClient } from '../.tmp-ts/supabaseServer.js';
import pg from 'pg';

const supabase = getSupabaseServerClient();
const suffix = Date.now().toString().slice(-4);
const telA = `2199999${suffix}`;
const telR = `2198888${suffix}`;

const { data: encontro } = await supabase.from('encontros').select('id').in('status',['ATIVO','PLANEJADO']).limit(1).single();
const payload = {
  id_encontro: encontro.id,
  nome_adolescente: `Teste US020 Fresh ${suffix}`,
  data_nascimento: '2011-05-10',
  telefone_adolescente: telA,
  nome_responsavel: `Responsável US020 Fresh ${suffix}`,
  telefone_responsavel: telR,
  aceite_termos: true,
  participou_antes: false,
};

const first = await executeInscricaoCreate({ supabase, body: payload });
const second = await executeInscricaoCreate({ supabase, body: payload });

const url = new URL(process.env.SUPABASE_URL);
const sql = new pg.Client({ host: `db.${url.host}`, port: 5432, user: 'postgres', password: process.env.SUPABASE_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await sql.connect();
const rows = await sql.query(`
  select i.id, i.encontro_id, p.telefone_normalizado
  from public.inscricoes i
  join public.adolescentes a on a.id=i.adolescente_id
  join public.pessoas p on p.id=a.pessoa_id
  where p.telefone_normalizado = $1
`, [`55${telA}`]);

await sql.query('begin');
await sql.query(`delete from public.adolescente_responsaveis where adolescente_id in (select a.id from public.adolescentes a join public.pessoas p on p.id=a.pessoa_id where p.telefone_normalizado in ($1,$2))`, [`55${telA}`, `55${telR}`]);
await sql.query(`delete from public.inscricoes where adolescente_id in (select a.id from public.adolescentes a join public.pessoas p on p.id=a.pessoa_id where p.telefone_normalizado=$1)`, [`55${telA}`]);
await sql.query(`delete from public.adolescentes where pessoa_id in (select id from public.pessoas where telefone_normalizado=$1)`, [`55${telA}`]);
await sql.query(`delete from public.responsaveis where pessoa_id in (select id from public.pessoas where telefone_normalizado=$1) or telefone_normalizado=$1`, [`55${telR}`]);
await sql.query(`delete from public.pessoas where telefone_normalizado in ($1,$2)`, [`55${telA}`, `55${telR}`]);
await sql.query('commit');
await sql.end();

console.log(JSON.stringify({ payload, first, second, count: rows.rows.length, rows: rows.rows }, null, 2));
