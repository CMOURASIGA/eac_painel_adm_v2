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
  console.log('=== Verificação de registros de teste ===\n');

  // Get all test pessoas
  const { data: pessoasTest } = await supabase
    .from('pessoas')
    .select('id,nome_completo,telefone_normalizado')
    .or(`nome_completo.ilike.%Teste US020 Frontend%,nome_completo.ilike.%Responsável US020 Frontend%,telefone_normalizado.like.%21999990022%,telefone_normalizado.like.%21988880022%`)
    .limit(100);

  console.log(`Pessoas encontradas: ${pessoasTest?.length || 0}`);
  if (pessoasTest?.length) {
    pessoasTest.forEach((p) => console.log(`  - ${p.nome_completo} (${p.telefone_normalizado})`));
  }

  // Get test responsaveis
  const { data: responsaveisTest } = await supabase
    .from('responsaveis')
    .select('id,nome,telefone_normalizado')
    .or(`nome.ilike.%Responsável US020 Frontend%,telefone_normalizado.like.%21988880022%`)
    .limit(100);

  console.log(`\nResponsáveis encontrados: ${responsaveisTest?.length || 0}`);
  if (responsaveisTest?.length) {
    responsaveisTest.forEach((r) => console.log(`  - ${r.nome} (${r.telefone_normalizado})`));
  }

  // Get test adolescentes via pessoas
  const pessoaIds = (pessoasTest || []).map((p) => p.id);
  let adolescenteIds = [];
  if (pessoaIds.length > 0) {
    const { data: ads } = await supabase
      .from('adolescentes')
      .select('id,pessoa_id')
      .in('pessoa_id', pessoaIds);
    adolescenteIds = (ads || []).map((a) => a.id);
  }

  const totalRecords = (pessoasTest?.length || 0) + (responsaveisTest?.length || 0) + adolescenteIds.length;

  if (totalRecords === 0) {
    console.log('\n✓ Nenhum registro de teste encontrado. Nada a limpar.');
    return;
  }

  console.log(`\n⚠ Total de registros a apagar: ${totalRecords}`);
  console.log('\nProcedendo com limpeza segura...\n');

  // Delete em ordem: vinculos -> inscricoes -> adolescentes -> responsaveis -> pessoas

  // 1. Delete adolescente_responsaveis vinculados aos adolescentes de teste
  if (adolescenteIds.length > 0) {
    const { error: err1 } = await supabase
      .from('adolescente_responsaveis')
      .delete()
      .in('adolescente_id', adolescenteIds);
    console.log(`${err1 ? '✗' : '✓'} adolescente_responsaveis (adolescentes) ${err1 ? 'ERRO: ' + err1.message : 'deletados'}`);
  }

  // 2. Delete adolescente_responsaveis vinculados aos responsáveis de teste
  if ((responsaveisTest?.length || 0) > 0) {
    const { error: err2 } = await supabase
      .from('adolescente_responsaveis')
      .delete()
      .in('responsavel_id', responsaveisTest.map((r) => r.id));
    console.log(`${err2 ? '✗' : '✓'} adolescente_responsaveis (responsaveis) ${err2 ? 'ERRO: ' + err2.message : 'deletados'}`);
  }

  // 3. Delete inscricoes
  if (adolescenteIds.length > 0) {
    const { error: err3 } = await supabase
      .from('inscricoes')
      .delete()
      .in('adolescente_id', adolescenteIds);
    console.log(`${err3 ? '✗' : '✓'} inscricoes ${err3 ? 'ERRO: ' + err3.message : 'deletadas'}`);
  }

  // 4. Delete adolescentes
  if (adolescenteIds.length > 0) {
    const { error: err4 } = await supabase
      .from('adolescentes')
      .delete()
      .in('id', adolescenteIds);
    console.log(`${err4 ? '✗' : '✓'} adolescentes ${err4 ? 'ERRO: ' + err4.message : 'deletados'}`);
  }

  // 5. Delete responsaveis
  if ((responsaveisTest?.length || 0) > 0) {
    const { error: err5 } = await supabase
      .from('responsaveis')
      .delete()
      .in('id', responsaveisTest.map((r) => r.id));
    console.log(`${err5 ? '✗' : '✓'} responsaveis ${err5 ? 'ERRO: ' + err5.message : 'deletados'}`);
  }

  // 6. Delete pessoas
  if ((pessoasTest?.length || 0) > 0) {
    const { error: err6 } = await supabase
      .from('pessoas')
      .delete()
      .in('id', pessoasTest.map((p) => p.id));
    console.log(`${err6 ? '✗' : '✓'} pessoas ${err6 ? 'ERRO: ' + err6.message : 'deletadas'}`);
  }

  console.log('\n=== Validação de limpeza ===\n');

  // Validate cleanup
  const { data: pessoasCheck } = await supabase
    .from('pessoas')
    .select('id')
    .or(`nome_completo.ilike.%Teste US020 Frontend%,nome_completo.ilike.%Responsável US020 Frontend%,telefone_normalizado.like.%21999990022%,telefone_normalizado.like.%21988880022%`);

  const { data: responsaveisCheck } = await supabase
    .from('responsaveis')
    .select('id')
    .or(`nome.ilike.%Responsável US020 Frontend%,telefone_normalizado.like.%21988880022%`);

  const { data: inscricoesCheck } = await supabase
    .from('inscricoes')
    .select('id');

  const pessoasRemaining = pessoasCheck?.length || 0;
  const responsaveisRemaining = responsaveisCheck?.length || 0;

  console.log(`Pessoas restantes: ${pessoasRemaining}`);
  console.log(`Responsáveis restantes: ${responsaveisRemaining}`);

  if (pessoasRemaining === 0 && responsaveisRemaining === 0) {
    console.log('\n✓ LIMPEZA CONCLUÍDA COM SUCESSO');
    console.log('\n═══════════════════════════════════════');
    console.log('  US-020 - HOMOLOGADA E FECHADA ✓');
    console.log('═══════════════════════════════════════\n');
  } else {
    console.log('\n⚠ Alguns registros ainda permanecem.');
  }
}

run().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
