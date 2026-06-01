import dotenv from 'dotenv';
import { executeInscricaoCreate } from '../.tmp-ts/inscricaoCreate.js';
import { getSupabaseServerClient } from '../.tmp-ts/supabaseServer.js';
import pg from 'pg';
dotenv.config({ path: '.env.local' });

const out = {
  timestamp: new Date().toISOString(),
  encontros_get: null,
  index_check: null,
  valid_payload_result: null,
  valid_join_result: null,
  invalid_cases: [],
  invalid_partial_checks: null,
  duplicate_test: null,
  cleanup: null,
};

function maskError(e) {
  return { message: e?.message || String(e), code: e?.code || null };
}

const supabase = getSupabaseServerClient();
if (!supabase) throw new Error('Supabase não configurado');

const url = new URL(process.env.SUPABASE_URL);
const sql = new pg.Client({
  host: `db.${url.host}`,
  port: 5432,
  user: 'postgres',
  password: process.env.SUPABASE_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await sql.connect();

try {
  const encontrosQuery = await supabase
    .from('encontros')
    .select('id,nome,numero,data_inicio,data_fim,status')
    .in('status', ['ATIVO', 'PLANEJADO'])
    .order('data_inicio', { ascending: false })
    .limit(50);

  out.encontros_get = {
    success: !encontrosQuery.error,
    status: encontrosQuery.error ? 502 : 200,
    error: encontrosQuery.error ? 'ERRO_LISTAR_ENCONTROS' : null,
    message: encontrosQuery.error ? 'Não foi possível carregar os encontros disponíveis.' : null,
    total: (encontrosQuery.data || []).length,
    first: (encontrosQuery.data || [])[0] || null,
  };

  const encontroId = (encontrosQuery.data || [])[0]?.id || '6781a087-6a98-43fb-b7cb-6f5a13aee21e';

  const indexRs = await sql.query(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'inscricoes'
      and indexname = 'uq_inscricoes_adolescente_encontro'
  `);
  out.index_check = indexRs.rows;

  const validPayload = {
    nome_adolescente: 'Teste US020 Valido',
    data_nascimento: '2011-05-10',
    telefone_adolescente: '21999990020',
    nome_responsavel: 'Responsável US020 Valido',
    telefone_responsavel: '21988880020',
    bairro: 'Bairro Teste',
    paroquia: 'Paróquia Teste',
    participou_antes: false,
    aceite_termos: true,
    id_encontro: encontroId,
  };

  const first = await executeInscricaoCreate({ supabase, body: validPayload });
  out.valid_payload_result = first;

  const joinRs = await sql.query(`
    select
      i.id as inscricao_id,
      a.id as adolescente_id,
      p.id as pessoa_adolescente_id,
      p.nome_completo as nome_adolescente,
      r.id as responsavel_id,
      r.nome as nome_responsavel,
      pr.id as pessoa_responsavel_id,
      ar.id as vinculo_id
    from public.inscricoes i
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    left join public.adolescente_responsaveis ar on ar.adolescente_id = a.id
    left join public.responsaveis r on r.id = ar.responsavel_id
    left join public.pessoas pr on pr.id = r.pessoa_id
    where p.nome_completo ilike '%Teste US020 Valido%'
       or p.telefone_normalizado like '%21999990020%'
  `);
  out.valid_join_result = joinRs.rows;

  const invalidBase = {
    nome_adolescente: 'Teste US020 Invalido',
    data_nascimento: '2011-05-10',
    telefone_adolescente: '21999990021',
    nome_responsavel: 'Responsável US020 Invalido',
    telefone_responsavel: '21988880021',
    bairro: 'Bairro Teste',
    paroquia: 'Paróquia Teste',
    participou_antes: false,
    aceite_termos: true,
    id_encontro: encontroId,
  };

  const invalidCases = [
    ['sem_nome_adolescente', { ...invalidBase, nome_adolescente: '' }],
    ['nome_adolescente_numerico', { ...invalidBase, nome_adolescente: '123' }],
    ['nome_adolescente_simbolos', { ...invalidBase, nome_adolescente: '@@@' }],
    ['sem_data_nascimento', { ...invalidBase, data_nascimento: '' }],
    ['data_nascimento_futura', { ...invalidBase, data_nascimento: '2099-01-01' }],
    ['data_nascimento_invalida', { ...invalidBase, data_nascimento: 'data-invalida' }],
    ['sem_telefone_adolescente', { ...invalidBase, telefone_adolescente: '' }],
    ['telefone_adolescente_invalido', { ...invalidBase, telefone_adolescente: '000000' }],
    ['sem_nome_responsavel', { ...invalidBase, nome_responsavel: '' }],
    ['nome_responsavel_numerico', { ...invalidBase, nome_responsavel: '123' }],
    ['sem_telefone_responsavel', { ...invalidBase, telefone_responsavel: '' }],
    ['telefone_responsavel_invalido', { ...invalidBase, telefone_responsavel: '000000' }],
    ['aceite_termos_false', { ...invalidBase, aceite_termos: false }],
    ['sem_aceite_termos', (() => { const p = { ...invalidBase }; delete p.aceite_termos; return p; })()],
    ['sem_id_encontro', { ...invalidBase, id_encontro: '' }],
    ['id_encontro_invalido', { ...invalidBase, id_encontro: 'abc' }],
    ['id_encontro_zero_uuid', { ...invalidBase, id_encontro: '00000000-0000-0000-0000-000000000000' }],
  ];

  const closedEncontro = await supabase.from('encontros').select('id,status').in('status', ['ENCERRADO', 'CANCELADO']).limit(1);
  if (closedEncontro.data?.[0]?.id) {
    invalidCases.push(['id_encontro_status_bloqueado', { ...invalidBase, id_encontro: closedEncontro.data[0].id }]);
  }

  for (const [name, payload] of invalidCases) {
    const r = await executeInscricaoCreate({ supabase, body: payload });
    out.invalid_cases.push({ name, status: r.status, error: r.body?.error, fields: r.body?.fields || null });
  }

  const partialPessoas = await sql.query(`
    select p.id, p.nome_completo, p.telefone_normalizado, p.criado_em
    from public.pessoas p
    where p.nome_completo ilike '%Teste US020 Invalido%'
       or p.telefone_normalizado like '%21999990021%'
  `);
  const partialResp = await sql.query(`
    select r.id, r.nome, r.telefone_normalizado, r.criado_em
    from public.responsaveis r
    where r.nome ilike '%Responsável US020 Invalido%'
       or r.telefone_normalizado like '%21988880021%'
  `);
  const partialInsc = await sql.query(`
    select i.id, i.status, i.origem_dado, i.criado_em
    from public.inscricoes i
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    where p.nome_completo ilike '%Teste US020 Invalido%'
       or p.telefone_normalizado like '%21999990021%'
  `);

  out.invalid_partial_checks = {
    pessoas: partialPessoas.rows,
    responsaveis: partialResp.rows,
    inscricoes: partialInsc.rows,
  };

  const second = await executeInscricaoCreate({ supabase, body: validPayload });

  const duplicateCount = await sql.query(`
    select i.encontro_id, p.telefone_normalizado, count(*) as total
    from public.inscricoes i
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    where p.telefone_normalizado like '%21999990020%'
    group by i.encontro_id, p.telefone_normalizado
    having count(*) > 1
  `);

  const duplicateByPair = await sql.query(`
    select i.adolescente_id, i.encontro_id, count(*) as total
    from public.inscricoes i
    group by i.adolescente_id, i.encontro_id
    having count(*) > 1
  `);

  out.duplicate_test = {
    first,
    second,
    duplicate_counts_by_phone: duplicateCount.rows,
    duplicate_counts_by_pair: duplicateByPair.rows,
  };

  const beforeCleanup = await sql.query(`
    select
      i.id as inscricao_id,
      a.id as adolescente_id,
      p.id as pessoa_adolescente_id,
      p.nome_completo as nome_adolescente,
      r.id as responsavel_id,
      r.nome as nome_responsavel,
      pr.id as pessoa_responsavel_id,
      ar.id as vinculo_id
    from public.inscricoes i
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    left join public.adolescente_responsaveis ar on ar.adolescente_id = a.id
    left join public.responsaveis r on r.id = ar.responsavel_id
    left join public.pessoas pr on pr.id = r.pessoa_id
    where p.nome_completo ilike '%Teste US020%'
       or r.nome ilike '%Responsável US020%'
       or p.telefone_normalizado like '%21999990020%'
       or p.telefone_normalizado like '%21999990021%'
       or r.telefone_normalizado like '%21988880020%'
       or r.telefone_normalizado like '%21988880021%'
  `);

  await sql.query('begin');
  await sql.query(`
    delete from public.adolescente_responsaveis ar
    using public.adolescentes a
    join public.pessoas p on p.id = a.pessoa_id
    where ar.adolescente_id = a.id
      and (
        p.nome_completo ilike '%Teste US020%'
        or p.telefone_normalizado like '%21999990020%'
        or p.telefone_normalizado like '%21999990021%'
      )
  `);
  await sql.query(`
    delete from public.adolescente_responsaveis ar
    using public.responsaveis r
    where ar.responsavel_id = r.id
      and (
        r.nome ilike '%Responsável US020%'
        or r.telefone_normalizado like '%21988880020%'
        or r.telefone_normalizado like '%21988880021%'
      )
  `);
  await sql.query(`
    delete from public.inscricoes i
    using public.adolescentes a
    join public.pessoas p on p.id = a.pessoa_id
    where i.adolescente_id = a.id
      and (
        p.nome_completo ilike '%Teste US020%'
        or p.telefone_normalizado like '%21999990020%'
        or p.telefone_normalizado like '%21999990021%'
      )
  `);
  await sql.query(`
    delete from public.adolescentes a
    using public.pessoas p
    where a.pessoa_id = p.id
      and (
        p.nome_completo ilike '%Teste US020%'
        or p.telefone_normalizado like '%21999990020%'
        or p.telefone_normalizado like '%21999990021%'
      )
  `);
  await sql.query(`
    delete from public.responsaveis r
    where r.nome ilike '%Responsável US020%'
       or r.telefone_normalizado like '%21988880020%'
       or r.telefone_normalizado like '%21988880021%'
  `);
  await sql.query(`
    delete from public.pessoas p
    where p.nome_completo ilike '%Teste US020%'
       or p.telefone_normalizado like '%21999990020%'
       or p.telefone_normalizado like '%21999990021%'
  `);
  await sql.query(`
    delete from public.pessoas p
    where p.nome_completo ilike '%Responsável US020%'
       or p.telefone_normalizado like '%21988880020%'
       or p.telefone_normalizado like '%21988880021%'
  `);
  await sql.query('commit');

  const afterCleanup = await sql.query(`
    select count(*) as total_pessoas_teste
    from public.pessoas
    where nome_completo ilike '%Teste US020%'
       or nome_completo ilike '%Responsável US020%'
       or telefone_normalizado like '%21999990020%'
       or telefone_normalizado like '%21999990021%'
       or telefone_normalizado like '%21988880020%'
       or telefone_normalizado like '%21988880021%'
  `);

  out.cleanup = {
    before: beforeCleanup.rows,
    after: afterCleanup.rows,
  };
} catch (e) {
  out.fatal = maskError(e);
} finally {
  await sql.end();
}

console.log(JSON.stringify(out, null, 2));


