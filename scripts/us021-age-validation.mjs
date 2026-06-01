import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';
import { executeInscricaoCreate } from '../.tmp-ts/inscricaoCreate.js';
import { getSupabaseServerClient } from '../utils/supabaseServer.ts';

dotenv.config({ path: '.env.local' });
const supabase = getSupabaseServerClient();
if (!supabase) throw new Error('Supabase not configured');

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

const tempEncontro = {
  id: crypto.randomUUID(),
  nome: 'US021 TEMP Encontro de Idade',
  data_inicio: '2026-05-01',
  data_fim: '2026-05-03',
  status: 'PLANEJADO',
};

let insertedTempEncontro = false;
let validEncontroId = '';
let nullDateEncontroId = '';
let createdIds = [];

function normalizePayload(payload) {
  return {
    ...payload,
    participou_antes: Boolean(payload.participou_antes),
    aceite_termos: Boolean(payload.aceite_termos),
  };
}

async function insertTempEncontro() {
  const query = `
    insert into public.encontros(id, nome, data_inicio, data_fim, status)
    values($1, $2, $3, $4, $5)
    returning id
  `;
  const res = await sql.query(query, [tempEncontro.id, tempEncontro.nome, tempEncontro.data_inicio, tempEncontro.data_fim, tempEncontro.status]);
  return res.rows?.[0]?.id;
}

async function deleteTempEncontro() {
  await sql.query('delete from public.encontros where id = $1', [tempEncontro.id]);
}

async function run() {
  console.log('=== US021 Age Validation Test ===\n');

  const encontroWithNull = await supabase
    .from('encontros')
    .select('id,nome,status,data_inicio')
    .is('data_inicio', null)
    .limit(1)
    .maybeSingle();
  if (encontroWithNull.error) throw encontroWithNull.error;
  if (!encontroWithNull.data) {
    throw new Error('Não foi encontrado nenhum encontro com data_inicio null para o caso 5.');
  }
  nullDateEncontroId = encontroWithNull.data.id;
  console.log('Encontrado encontro sem data_inicio:', nullDateEncontroId, encontroWithNull.data.nome);

  const encontroWithDate = await insertTempEncontro();
  if (!encontroWithDate) throw new Error('Falha ao criar encontro temporário.');
  insertedTempEncontro = true;
  validEncontroId = encontroWithDate;
  console.log('Criado encontro de teste com data_inicio 2026-05-01:', validEncontroId);

  const cases = [
    {
      name: 'Caso 1 - aniversário antes do encontro',
      payload: {
        id_encontro: validEncontroId,
        nome_adolescente: 'Teste US021 Idade 01',
        data_nascimento: '2011-04-10',
        telefone_adolescente: '21999990021',
        nome_responsavel: 'Responsável US021 Idade',
        telefone_responsavel: '21988880021',
        bairro: 'Bairro Teste',
        paroquia: 'Paróquia Teste',
        participou_antes: false,
        aceite_termos: true,
      },
      expectStatus: 201,
      expectAge: 15,
    },
    {
      name: 'Caso 2 - aniversário depois do encontro',
      payload: {
        id_encontro: validEncontroId,
        nome_adolescente: 'Teste US021 Idade 02',
        data_nascimento: '2011-05-10',
        telefone_adolescente: '21999990022',
        nome_responsavel: 'Responsável US021 Idade 02',
        telefone_responsavel: '21988880022',
        bairro: 'Bairro Teste',
        paroquia: 'Paróquia Teste',
        participou_antes: false,
        aceite_termos: true,
      },
      expectStatus: 201,
      expectAge: 14,
    },
    {
      name: 'Caso 3 - aniversário no dia do encontro',
      payload: {
        id_encontro: validEncontroId,
        nome_adolescente: 'Teste US021 Idade 03',
        data_nascimento: '2011-05-01',
        telefone_adolescente: '21999990023',
        nome_responsavel: 'Responsável US021 Idade 03',
        telefone_responsavel: '21988880023',
        bairro: 'Bairro Teste',
        paroquia: 'Paróquia Teste',
        participou_antes: false,
        aceite_termos: true,
      },
      expectStatus: 201,
      expectAge: 15,
    },
    {
      name: 'Caso 4 - nascimento posterior ao encontro',
      payload: {
        id_encontro: validEncontroId,
        nome_adolescente: 'Teste US021 Idade 04',
        data_nascimento: '2027-01-01',
        telefone_adolescente: '21999990024',
        nome_responsavel: 'Responsável US021 Idade 04',
        telefone_responsavel: '21988880024',
        bairro: 'Bairro Teste',
        paroquia: 'Paróquia Teste',
        participou_antes: false,
        aceite_termos: true,
      },
      expectStatus: 400,
      expectError: 'VALIDATION_ERROR',
      expectField: 'data_nascimento',
    },
    {
      name: 'Caso 5 - encontro sem data_inicio',
      payload: {
        id_encontro: nullDateEncontroId,
        nome_adolescente: 'Teste US021 Idade 05',
        data_nascimento: '2011-05-01',
        telefone_adolescente: '21999990025',
        nome_responsavel: 'Responsável US021 Idade 05',
        telefone_responsavel: '21988880025',
        bairro: 'Bairro Teste',
        paroquia: 'Paróquia Teste',
        participou_antes: false,
        aceite_termos: true,
      },
      expectStatus: 400,
      expectError: 'ENCONTRO_SEM_DATA_INICIO',
    },
  ];

  for (const testCase of cases) {
    console.log(`\n--- ${testCase.name} ---`);
    const result = await executeInscricaoCreate({ supabase, body: normalizePayload(testCase.payload) });
    console.log('status=', result.status, 'body=', JSON.stringify(result.body));

    if (result.status !== testCase.expectStatus) {
      throw new Error(`${testCase.name} falhou: status esperado ${testCase.expectStatus} mas recebeu ${result.status}`);
    }
    if (testCase.expectError && result.body.error !== testCase.expectError) {
      throw new Error(`${testCase.name} falhou: erro esperado ${testCase.expectError} mas recebeu ${result.body.error}`);
    }
    if (testCase.expectField) {
      if (!result.body.fields || !result.body.fields[testCase.expectField]) {
        throw new Error(`${testCase.name} falhou: campo de erro esperado ${testCase.expectField} não encontrado.`);
      }
    }
    if (testCase.expectAge && result.status === 201) {
      const pessoaId = result.body.data?.pessoa_adolescente_id || null;
      if (!pessoaId) {
        console.warn('Não foi possível ler pessoa_adolescente_id do resultado para verificar idade calculada.');
      } else {
        const check = await sql.query(`
          select p.idade_calculada, p.data_nascimento, e.data_inicio
          from public.pessoas p
          join public.adolescentes a on a.pessoa_id = p.id
          join public.inscricoes i on i.adolescente_id = a.id
          join public.encontros e on e.id = i.encontro_id
          where p.id = $1
          order by i.criado_em desc
          limit 1
        `, [pessoaId]);
        const row = check.rows[0];
        if (Number(row.idade_calculada) !== testCase.expectAge) {
          throw new Error(`${testCase.name} falhou: idade_calculada esperado ${testCase.expectAge} mas gravado ${row.idade_calculada}`);
        }
        console.log(`idade_calculada gravado corretamente = ${row.idade_calculada}`);
      }
    }
  }

  console.log('\n--- Caso 6 - payload válido e validação SQL ---');
  const validPayload = {
    id_encontro: validEncontroId,
    nome_adolescente: 'Teste US021 Idade',
    data_nascimento: '2011-05-10',
    telefone_adolescente: '21999990026',
    nome_responsavel: 'Responsável US021 Idade',
    telefone_responsavel: '21988880026',
    bairro: 'Bairro Teste',
    paroquia: 'Paróquia Teste',
    participou_antes: false,
    aceite_termos: true,
  };

  const validResult = await executeInscricaoCreate({ supabase, body: normalizePayload(validPayload) });
  console.log('status=', validResult.status, 'body=', JSON.stringify(validResult.body));
  if (validResult.status !== 201 || !validResult.body.success) {
    throw new Error('Caso 6 falhou: payload válido não criou inscrição com sucesso.');
  }

  const query = `
    select
      i.id as inscricao_id,
      e.id as encontro_id,
      e.nome as encontro_nome,
      e.data_inicio,
      p.nome_completo,
      p.data_nascimento,
      p.idade_calculada,
      date_part('year', age(e.data_inicio, p.data_nascimento))::int as idade_esperada,
      case
        when p.idade_calculada = date_part('year', age(e.data_inicio, p.data_nascimento))::int
          then 'OK'
        else 'DIVERGENTE'
      end as validacao_idade
    from public.inscricoes i
    join public.encontros e on e.id = i.encontro_id
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    where p.nome_completo ilike '%Teste US021 Idade%'
    order by i.criado_em desc
    limit 5;
  `;
  const validation = await sql.query(query);
  console.log('SQL de validação result:', JSON.stringify(validation.rows, null, 2));
  if (validation.rows.some((r) => r.validacao_idade !== 'OK')) {
    throw new Error('Validação SQL retornou divergência de idade.');
  }

  console.log('\n--- Verificação de duplicidade ---');
  const duplicateTry = await executeInscricaoCreate({ supabase, body: normalizePayload(validPayload) });
  console.log('duplicate status=', duplicateTry.status, 'body=', JSON.stringify(duplicateTry.body));
  if (duplicateTry.status !== 200 || duplicateTry.body.duplicate !== true) {
    throw new Error('Duplicidade não funcionou como esperado.');
  }

  console.log('\n--- Verificação de divergências existentes na base ---');
  const divergencias = await sql.query(`
    select
      i.id as inscricao_id,
      e.nome as encontro_nome,
      e.data_inicio,
      p.nome_completo,
      p.data_nascimento,
      p.idade_calculada,
      date_part('year', age(e.data_inicio, p.data_nascimento))::int as idade_esperada
    from public.inscricoes i
    join public.encontros e on e.id = i.encontro_id
    join public.adolescentes a on a.id = i.adolescente_id
    join public.pessoas p on p.id = a.pessoa_id
    where p.data_nascimento is not null
      and e.data_inicio is not null
      and p.idade_calculada is not null
      and p.idade_calculada <> date_part('year', age(e.data_inicio, p.data_nascimento))::int
    order by e.data_inicio desc, p.nome_completo
    limit 20;
  `);
  console.log('Divergências existentes (máx 20):', JSON.stringify(divergencias.rows, null, 2));

  createdIds = [
    validResult.body.data?.adolescente?.pessoa_id,
    validResult.body.data?.responsavel?.pessoa_id,
    validResult.body.data?.adolescente?.id,
    validResult.body.data?.responsavel?.id,
    validResult.body.data?.inscricao?.id,
  ].filter(Boolean);

  console.log('\n=== US021 tests completed successfully ===');
}

async function cleanup() {
  console.log('\n=== Cleanup US021 ===');

  await sql.query(`
    delete from public.adolescente_responsaveis ar
    using public.adolescentes a
    join public.pessoas p on p.id = a.pessoa_id
    where ar.adolescente_id = a.id
      and p.nome_completo ilike '%Teste US021 Idade%';
  `);
  await sql.query(`
    delete from public.inscricoes i
    using public.adolescentes a
    join public.pessoas p on p.id = a.pessoa_id
    where i.adolescente_id = a.id
      and p.nome_completo ilike '%Teste US021 Idade%';
  `);
  await sql.query(`
    delete from public.adolescentes a
    using public.pessoas p
    where a.pessoa_id = p.id
      and p.nome_completo ilike '%Teste US021 Idade%';
  `);
  await sql.query(`
    delete from public.responsaveis r
    using public.pessoas p
    where r.pessoa_id = p.id
      and p.nome_completo ilike '%Responsável US021 Idade%';
  `);
  await sql.query(`
    delete from public.pessoas p
    where p.nome_completo ilike '%Teste US021 Idade%'
       or p.nome_completo ilike '%Responsável US021 Idade%'
       or p.telefone_normalizado like '%21999990021%'
       or p.telefone_normalizado like '%21988880021%'
       or p.telefone_normalizado like '%21999990022%'
       or p.telefone_normalizado like '%21988880022%'
       or p.telefone_normalizado like '%21999990023%'
       or p.telefone_normalizado like '%21988880023%'
       or p.telefone_normalizado like '%21999990024%'
       or p.telefone_normalizado like '%21988880024%'
       or p.telefone_normalizado like '%21999990025%'
       or p.telefone_normalizado like '%21988880025%';
  `);

  if (insertedTempEncontro) await deleteTempEncontro();
  console.log('Cleanup concluído.');
}

try {
  await run();
} catch (err) {
  console.error('Erro:', err);
} finally {
  await cleanup();
  await sql.end();
}
