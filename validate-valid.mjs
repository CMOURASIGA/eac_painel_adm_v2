import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.niagdoowqmngxjcrmstd:E@Cporiuncula2024@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
});

async function run() {
  try {
    await client.connect();

    const res = await client.query(`
select
  i.id as inscricao_id,
  i.status as status_inscricao,
  i.origem_dado as origem_inscricao,
  i.criado_via_sistema as inscricao_criada_via_sistema,
  i.data_inscricao,

  e.id as encontro_id,
  e.nome as encontro_nome,
  e.status as status_encontro,

  a.id as adolescente_id,
  a.aceite_normas,

  p.id as pessoa_adolescente_id,
  p.nome_completo as nome_adolescente,
  p.data_nascimento,
  p.idade_calculada,
  p.telefone,
  p.telefone_normalizado,

  r.id as responsavel_id,
  r.nome as nome_responsavel,
  r.telefone as telefone_responsavel,
  r.telefone_normalizado as telefone_responsavel_normalizado,

  ar.id as vinculo_id,
  ar.principal,
  ar.origem_dado as origem_vinculo,
  ar.criado_via_sistema as vinculo_criado_via_sistema

from public.inscricoes i
join public.encontros e
  on e.id = i.encontro_id
join public.adolescentes a
  on a.id = i.adolescente_id
join public.pessoas p
  on p.id = a.pessoa_id
left join public.adolescente_responsaveis ar
  on ar.adolescente_id = a.id
left join public.responsaveis r
  on r.id = ar.responsavel_id
where p.nome_completo ilike '%Teste US020 Valido%'
order by i.criado_em desc;
    `);

    console.log('Resultado da validação no banco:');
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();