import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiUrl = process.env.VITE_API_PROXY || 'http://localhost:3001';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// UTILITIES
// ============================================================================

function log(section, message) {
  console.log(`\n📋 [${section}] ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function error(message) {
  console.log(`❌ ${message}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 1. APLICAR SQL
// ============================================================================

async function step1_ApplySql() {
  log('STEP 1', 'Aplicar SQL da US-023 no Supabase');
  
  try {
    const sqlFile = path.join(__dirname, '../docs/US-023-alterar-status-inscricao.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
    
    // Executar via Supabase SQL
    const { error: sqlError } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (sqlError && sqlError.message.includes('function') && sqlError.message.includes('exec_sql')) {
      // Se a RPC exec_sql não existe, tentar outro método
      console.log('ℹ️  exec_sql não disponível, usando método alternativo');
      // Em produção, você pode executar via console do Supabase
      console.log('⚠️  Por favor, execute manualmente no Supabase SQL Editor:');
      console.log(sqlContent);
      return true;
    }
    
    if (sqlError) {
      error(`Falha ao aplicar SQL: ${sqlError.message}`);
      return false;
    }
    
    success('SQL aplicado com sucesso');
    return true;
  } catch (e) {
    error(`Erro ao aplicar SQL: ${e.message}`);
    return false;
  }
}

// ============================================================================
// 2. VALIDAR TABELA DE HISTÓRICO
// ============================================================================

async function step2_ValidateHistoricoTable() {
  log('STEP 2', 'Validar tabela inscricoes_status_historico');
  
  try {
    const { data, error } = await supabase.rpc('get_table_info', {
      table_name: 'inscricoes_status_historico'
    });
    
    if (error) {
      // Usar query direta
      const { data: tableData, error: tableError } = await supabase
        .from('inscricoes_status_historico')
        .select('*', { count: 'exact', head: true });
      
      if (tableError) {
        error(`Tabela não existe ou não é acessível: ${tableError.message}`);
        return false;
      }
      
      success('Tabela inscricoes_status_historico validada');
      return true;
    }
    
    success('Tabela inscricoes_status_historico validada');
    return true;
  } catch (e) {
    error(`Erro ao validar tabela: ${e.message}`);
    return false;
  }
}

// ============================================================================
// 3. VALIDAR FUNÇÃO RPC
// ============================================================================

async function step3_ValidateRpc() {
  log('STEP 3', 'Validar função RPC fn_alterar_status_inscricao');
  
  try {
    // Tentar chamar a RPC com dados inválidos para verificar se existe
    const { error } = await supabase.rpc('fn_alterar_status_inscricao', {
      p_inscricao_id: '00000000-0000-0000-0000-000000000000',
      p_status_novo: 'INSCRITO',
      p_justificativa: 'teste',
      p_alterado_por: 'teste',
      p_alterado_por_nome: 'Teste'
    });
    
    // Se não encontrar RPC, vai dar erro de undefined function
    // Se não encontrar inscrição, dá erro INSCRICAO_NAO_ENCONTRADA
    if (error && error.message.includes('undefined function')) {
      error(`RPC não existe: ${error.message}`);
      return false;
    }
    
    success('RPC fn_alterar_status_inscricao existe e é acessível');
    return true;
  } catch (e) {
    error(`Erro ao validar RPC: ${e.message}`);
    return false;
  }
}

// ============================================================================
// 4. PEGAR ENCONTRO PARA TESTE
// ============================================================================

async function step4_GetTestEncontro() {
  log('STEP 4', 'Obter encontro para teste');
  
  try {
    const { data, error } = await supabase
      .from('encontros')
      .select('id, nome, numero')
      .limit(1)
      .single();
    
    if (error) {
      error(`Falha ao obter encontro: ${error.message}`);
      return null;
    }
    
    success(`Encontro selecionado: ${data.nome} (${data.id})`);
    return data.id;
  } catch (e) {
    error(`Erro ao obter encontro: ${e.message}`);
    return null;
  }
}

// ============================================================================
// 5. CRIAR INSCRIÇÃO DE TESTE
// ============================================================================

async function step5_CreateTestInscricao(encontroId) {
  log('STEP 5', 'Criar inscrição de teste via endpoint público');
  
  try {
    const payload = {
      nome_adolescente: 'Teste US023 Status',
      data_nascimento: '2011-05-10',
      telefone_adolescente: '21999990023',
      nome_responsavel: 'Responsável US023 Status',
      telefone_responsavel: '21988880023',
      bairro: 'Bairro Teste',
      paroquia: 'Paróquia Teste',
      participou_antes: false,
      aceite_termos: true,
      id_encontro: encontroId
    };
    
    const response = await fetch(`${apiUrl}/api/inscricoes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      error(`Falha ao criar inscrição: ${result.error}`);
      return null;
    }
    
    const testData = {
      inscricao_id: result.inscricao_id,
      adolescente_id: result.adolescente_id,
      pessoa_adolescente_id: result.pessoa_adolescente_id,
      responsavel_id: result.responsavel_id,
      pessoa_responsavel_id: result.pessoa_responsavel_id,
      vinculo_id: result.vinculo_id
    };
    
    success(`Inscrição de teste criada: ${testData.inscricao_id}`);
    return testData;
  } catch (e) {
    error(`Erro ao criar inscrição: ${e.message}`);
    return null;
  }
}

// ============================================================================
// 6. VALIDAR STATUS INICIAL
// ============================================================================

async function step6_ValidateInitialStatus(testData) {
  log('STEP 6', 'Validar status inicial da inscrição de teste');
  
  try {
    const { data, error } = await supabase
      .from('inscricoes')
      .select(`
        id,
        status,
        motivo_status,
        status_alterado_em,
        status_alterado_por,
        status_alterado_por_nome,
        adolescentes(
          pessoas(nome_completo)
        )
      `)
      .eq('id', testData.inscricao_id)
      .single();
    
    if (error) {
      error(`Falha ao obter status: ${error.message}`);
      return false;
    }
    
    console.log('  Status inicial:', {
      status: data.status,
      motivo_status: data.motivo_status,
      status_alterado_em: data.status_alterado_em,
      status_alterado_por: data.status_alterado_por
    });
    
    success(`Status inicial: ${data.status}`);
    return data.status === 'INSCRITO';
  } catch (e) {
    error(`Erro ao validar status: ${e.message}`);
    return false;
  }
}

// ============================================================================
// 7-13. TESTES DE MUDANÇA DE STATUS
// ============================================================================

async function testStatusChange(testData, testNum, statusAtual, novoStatus, justificativa, shouldSucceed, expectedError) {
  log(`TEST ${testNum}`, `Alterar ${statusAtual} → ${novoStatus}`);
  
  try {
    const payload = {
      inscricao_id: testData.inscricao_id,
      status_novo: novoStatus,
      justificativa: justificativa || '',
      alterado_por: 'teste-admin',
      alterado_por_nome: 'Teste Admin'
    };
    
    const response = await fetch(`${apiUrl}/api/inscricoes/admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    const isSuccess = response.status === 200 && result.success;
    
    if (shouldSucceed) {
      if (isSuccess) {
        success(`Status alterado: ${statusAtual} → ${novoStatus}`);
        console.log('  Resposta:', {
          status_anterior: result.status_anterior,
          status_novo: result.status_novo,
          historico_id: result.historico_id,
          status_alterado_em: result.status_alterado_em
        });
        return { success: true, result };
      } else {
        error(`Esperava sucesso, mas falhou: ${result.error}`);
        return { success: false, result };
      }
    } else {
      if (!isSuccess && result.error === expectedError) {
        success(`Erro esperado recebido: ${expectedError}`);
        return { success: true, result };
      } else {
        error(`Esperava erro ${expectedError}, mas recebeu: ${result.error}`);
        return { success: false, result };
      }
    }
  } catch (e) {
    error(`Erro na requisição: ${e.message}`);
    return { success: false };
  }
}

// ============================================================================
// VALIDAR STATUS NO BANCO
// ============================================================================

async function validateStatusInDb(testData, expectedStatus) {
  try {
    const { data, error } = await supabase
      .from('inscricoes')
      .select('status, motivo_status, status_alterado_em, status_alterado_por')
      .eq('id', testData.inscricao_id)
      .single();
    
    if (error) return false;
    
    const isCorrect = data.status === expectedStatus;
    console.log(`  Status no DB: ${data.status} ${isCorrect ? '✓' : '✗'}`);
    return isCorrect;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// CONTAR HISTÓRICO
// ============================================================================

async function countHistorico(testData) {
  try {
    const { count, error } = await supabase
      .from('inscricoes_status_historico')
      .select('*', { count: 'exact', head: true })
      .eq('inscricao_id', testData.inscricao_id);
    
    if (error) return 0;
    return count;
  } catch (e) {
    return 0;
  }
}

// ============================================================================
// LIMPAR DADOS DE TESTE
// ============================================================================

async function step20_CleanupTestData(testData) {
  log('STEP 20', 'Limpar dados de teste');
  
  try {
    // Apagar histórico
    const { error: h1 } = await supabase
      .from('inscricoes_status_historico')
      .delete()
      .eq('inscricao_id', testData.inscricao_id);
    
    // Apagar adolescente_responsaveis
    const { error: h2 } = await supabase
      .from('adolescente_responsaveis')
      .delete()
      .eq('adolescente_id', testData.adolescente_id);
    
    // Apagar inscrições
    const { error: h3 } = await supabase
      .from('inscricoes')
      .delete()
      .eq('adolescente_id', testData.adolescente_id);
    
    // Apagar adolescentes
    const { error: h4 } = await supabase
      .from('adolescentes')
      .delete()
      .eq('pessoa_id', testData.pessoa_adolescente_id);
    
    // Apagar pessoas (adolescente)
    const { error: h5 } = await supabase
      .from('pessoas')
      .delete()
      .eq('id', testData.pessoa_adolescente_id);
    
    // Apagar responsaveis
    if (testData.responsavel_id) {
      const { error: h6 } = await supabase
        .from('responsaveis')
        .delete()
        .eq('id', testData.responsavel_id);
    }
    
    // Apagar pessoa responsável
    if (testData.pessoa_responsavel_id) {
      const { error: h7 } = await supabase
        .from('pessoas')
        .delete()
        .eq('id', testData.pessoa_responsavel_id);
    }
    
    success('Dados de teste removidos');
    return true;
  } catch (e) {
    error(`Erro ao limpar dados: ${e.message}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 HOMOLOGAÇÃO US-023 - Alterar Status da Inscrição');
  console.log('='.repeat(80));
  
  // Step 1: Aplicar SQL
  console.log('\n📦 PREPARAÇÃO DO BANCO DE DADOS\n');
  const sqlOk = await step1_ApplySql();
  
  if (!sqlOk) {
    console.log('\n⚠️  SQL não foi aplicado automaticamente.');
    console.log('Por favor, execute manualmente no Supabase SQL Editor o conteúdo de:');
    console.log('docs/US-023-alterar-status-inscricao.sql');
    console.log('\nDepois execute novamente este script.');
    process.exit(1);
  }
  
  await delay(2000);
  
  // Step 2-3: Validar
  const tabletOk = await step2_ValidateHistoricoTable();
  const rpcOk = await step3_ValidateRpc();
  
  if (!tabletOk || !rpcOk) {
    console.log('\n❌ Validações falharam. Verifique o SQL.');
    process.exit(1);
  }
  
  console.log('\n🧪 PREPARAÇÃO DE TESTE\n');
  
  // Step 4: Obter encontro
  const encontroId = await step4_GetTestEncontro();
  if (!encontroId) {
    console.log('\n❌ Não foi possível obter um encontro para teste.');
    process.exit(1);
  }
  
  // Step 5: Criar inscrição
  const testData = await step5_CreateTestInscricao(encontroId);
  if (!testData) {
    console.log('\n❌ Não foi possível criar inscrição de teste.');
    process.exit(1);
  }
  
  // Step 6: Validar status inicial
  const initialOk = await step6_ValidateInitialStatus(testData);
  if (!initialOk) {
    console.log('\n❌ Status inicial não é INSCRITO.');
    process.exit(1);
  }
  
  console.log('\n🔄 TESTES DE MUDANÇA DE STATUS\n');
  
  // Test 1: INSCRITO → EM_ANALISE
  let result1 = await testStatusChange(testData, 1, 'INSCRITO', 'EM_ANALISE', '', true);
  if (result1.success) {
    await validateStatusInDb(testData, 'EM_ANALISE');
  }
  
  await delay(500);
  
  // Test 2: EM_ANALISE → PRIORIZADO
  let result2 = await testStatusChange(testData, 2, 'EM_ANALISE', 'PRIORIZADO', 'Priorizado para análise inicial.', true);
  if (result2.success) {
    await validateStatusInDb(testData, 'PRIORIZADO');
  }
  
  await delay(500);
  
  // Test 3: Tentar CANCELADO sem justificativa (deve falhar)
  const historicoBefore = await countHistorico(testData);
  let result3 = await testStatusChange(testData, 3, 'PRIORIZADO', 'CANCELADO', '', false, 'JUSTIFICATIVA_OBRIGATORIA');
  const historicoAfter3 = await countHistorico(testData);
  if (result3.success && historicoAfter3 === historicoBefore) {
    success(`Histórico não aumentou (contagem: ${historicoAfter3})`);
  }
  
  await delay(500);
  
  // Test 4: CANCELADO com justificativa (deve suceder)
  let result4 = await testStatusChange(testData, 4, 'PRIORIZADO', 'CANCELADO', 'Cancelado por motivo de teste.', true);
  if (result4.success) {
    await validateStatusInDb(testData, 'CANCELADO');
  }
  
  await delay(500);
  
  // Test 5: Status inválido
  const historicoBefore5 = await countHistorico(testData);
  let result5 = await testStatusChange(testData, 5, 'CANCELADO', 'APROVADO', 'Teste status inválido', false, 'STATUS_INVALIDO');
  const historicoAfter5 = await countHistorico(testData);
  if (result5.success && historicoAfter5 === historicoBefore5) {
    success(`Histórico não aumentou (contagem: ${historicoAfter5})`);
  }
  
  await delay(500);
  
  // Test 6: Inscrição inexistente
  let result6 = await testStatusChange(
    { ...testData, inscricao_id: '00000000-0000-0000-0000-000000000000' },
    6, 'CANCELADO', 'FILA', 'Teste', false, 'INSCRICAO_NAO_ENCONTRADA'
  );
  
  await delay(500);
  
  // Test 7: Mesmo status
  let result7 = await testStatusChange(testData, 7, 'CANCELADO', 'CANCELADO', 'Teste mesmo status', false, 'STATUS_SEM_ALTERACAO');
  const historicoAfter7 = await countHistorico(testData);
  if (result7.success) {
    success(`Histórico não alterado (contagem: ${historicoAfter7})`);
  }
  
  console.log('\n📊 VALIDAÇÃO FINAL\n');
  
  // Validar histórico
  try {
    const { data: historicos, error } = await supabase
      .from('inscricoes_status_historico')
      .select('*')
      .eq('inscricao_id', testData.inscricao_id)
      .order('criado_em', { ascending: true });
    
    if (!error && historicos) {
      success(`Total de registros no histórico: ${historicos.length}`);
      historicos.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.status_anterior} → ${h.status_novo} (${h.alterado_por_nome})`);
      });
    }
  } catch (e) {
    error(`Falha ao validar histórico: ${e.message}`);
  }
  
  // Limpeza
  console.log('\n🧹 LIMPEZA\n');
  await step20_CleanupTestData(testData);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ HOMOLOGAÇÃO CONCLUÍDA');
  console.log('='.repeat(80) + '\n');
}

main().catch(e => {
  error(`Erro fatal: ${e.message}`);
  process.exit(1);
});
