import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://niagdoowqmngxjcrmstd.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = 'http://localhost:3001';

if (!SERVICE_ROLE_KEY) {
  throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY antes de executar este script.');
}

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

function info(message) {
  console.log(`ℹ️  ${message}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SUPABASE HELPERS
// ============================================================================

async function supabaseQuery(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ sql })
  });
  
  const result = await response.json();
  return { ok: response.ok, data: result };
}

async function supabaseSelect(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    }
  });
  
  const data = await response.json();
  return { ok: response.ok, data };
}

async function supabaseDelete(table, query) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    }
  });
  
  return { ok: response.ok };
}

// ============================================================================
// STEP 1: APLICAR SQL
// ============================================================================

async function step1_ApplySql() {
  log('STEP 1', 'Aplicar SQL da US-023 no Supabase');
  
  try {
    // Para aplicar SQL através do PostgREST, usaremos a abordagem de executar queries
    // Supabase não tem um endpoint direto para exec de SQL arbitrário via API REST
    // Você precisa fazer isso manualmente no Supabase Console
    
    info('⚠️  SQL deve ser aplicado manualmente no Supabase Console');
    info('URL: https://app.supabase.com');
    info('1. Selecione o projeto');
    info('2. SQL Editor → New Query');
    info('3. Cole o conteúdo de: docs/US-023-alterar-status-inscricao.sql');
    info('4. Clique Run');
    
    return true;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return false;
  }
}

// ============================================================================
// STEP 2: VALIDAR TABELA
// ============================================================================

async function step2_ValidateTable() {
  log('STEP 2', 'Validar tabela inscricoes_status_historico');
  
  try {
    const { ok, data } = await supabaseSelect('inscricoes_status_historico', {
      'limit': '1',
      'select': 'id'
    });
    
    if (!ok) {
      error(`Tabela não existe: ${JSON.stringify(data)}`);
      return false;
    }
    
    success('Tabela inscricoes_status_historico validada');
    return true;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return false;
  }
}

// ============================================================================
// STEP 3: PEGAR ENCONTRO
// ============================================================================

async function step3_GetEncontro() {
  log('STEP 3', 'Obter encontro para teste');
  
  try {
    const { ok, data } = await supabaseSelect('encontros', {
      'limit': '1',
      'select': 'id,nome'
    });
    
    if (!ok || !Array.isArray(data) || data.length === 0) {
      error(`Nenhum encontro disponível`);
      return null;
    }
    
    const encontro = data[0];
    success(`Encontro selecionado: ${encontro.nome} (${encontro.id})`);
    return encontro.id;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return null;
  }
}

// ============================================================================
// STEP 4: CRIAR INSCRIÇÃO DE TESTE
// ============================================================================

async function step4_CreateTestInscricao(encontroId) {
  log('STEP 4', 'Criar inscrição de teste');
  
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
    
    const response = await fetch(`${API_URL}/api/inscricoes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      error(`Falha ao criar: ${result.error}`);
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
    
    success(`Inscrição criada: ${testData.inscricao_id}`);
    return testData;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return null;
  }
}

// ============================================================================
// STEP 5: VALIDAR STATUS INICIAL
// ============================================================================

async function step5_ValidateInitial(testData) {
  log('STEP 5', 'Validar status inicial');
  
  try {
    const { ok, data } = await supabaseSelect('inscricoes', {
      'id': `eq.${testData.inscricao_id}`,
      'select': 'status'
    });
    
    if (!ok || !Array.isArray(data) || data.length === 0) {
      error(`Inscrição não encontrada`);
      return false;
    }
    
    const status = data[0].status;
    success(`Status inicial: ${status}`);
    return status === 'INSCRITO';
  } catch (e) {
    error(`Erro: ${e.message}`);
    return false;
  }
}

// ============================================================================
// TESTE DE ALTERAÇÃO DE STATUS
// ============================================================================

async function testStatusChange(testNum, testData, newStatus, justificativa, shouldSucceed, expectedError) {
  log(`TEST ${testNum}`, `Alterar para ${newStatus}`);
  
  try {
    const payload = {
      inscricao_id: testData.inscricao_id,
      status_novo: newStatus,
      justificativa: justificativa || '',
      alterado_por: 'teste-admin',
      alterado_por_nome: 'Teste Admin'
    };
    
    const response = await fetch(`${API_URL}/api/inscricoes/admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    const isSuccess = response.status === 200 && result.success;
    
    if (shouldSucceed) {
      if (isSuccess) {
        success(`Status alterado para ${newStatus}`);
        info(`Resposta: status_anterior=${result.status_anterior}, historico_id=${result.historico_id}`);
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
        error(`Esperava ${expectedError}, recebeu: ${result.error}`);
        return { success: false, result };
      }
    }
  } catch (e) {
    error(`Erro na requisição: ${e.message}`);
    return { success: false };
  }
}

// ============================================================================
// VALIDAR STATUS NO DB
// ============================================================================

async function validateStatusDb(testData, expectedStatus) {
  try {
    const { ok, data } = await supabaseSelect('inscricoes', {
      'id': `eq.${testData.inscricao_id}`,
      'select': 'status'
    });
    
    if (!ok || !Array.isArray(data) || data.length === 0) return false;
    
    const actual = data[0].status;
    const isCorrect = actual === expectedStatus;
    info(`Status no DB: ${actual} ${isCorrect ? '✓' : '✗'}`);
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
    const { ok, data } = await supabaseSelect('inscricoes_status_historico', {
      'inscricao_id': `eq.${testData.inscricao_id}`,
      'select': 'id'
    });
    
    if (!ok || !Array.isArray(data)) return 0;
    return data.length;
  } catch (e) {
    return 0;
  }
}

// ============================================================================
// LIMPAR DADOS
// ============================================================================

async function cleanupTestData(testData) {
  log('CLEANUP', 'Remover dados de teste');
  
  try {
    // Apagar em ordem (respeitando constraints)
    await supabaseDelete('inscricoes_status_historico', {
      'inscricao_id': `eq.${testData.inscricao_id}`
    });
    
    await supabaseDelete('adolescente_responsaveis', {
      'adolescente_id': `eq.${testData.adolescente_id}`
    });
    
    await supabaseDelete('inscricoes', {
      'adolescente_id': `eq.${testData.adolescente_id}`
    });
    
    await supabaseDelete('adolescentes', {
      'pessoa_id': `eq.${testData.pessoa_adolescente_id}`
    });
    
    await supabaseDelete('pessoas', {
      'id': `eq.${testData.pessoa_adolescente_id}`
    });
    
    if (testData.responsavel_id) {
      await supabaseDelete('responsaveis', {
        'id': `eq.${testData.responsavel_id}`
      });
    }
    
    if (testData.pessoa_responsavel_id) {
      await supabaseDelete('pessoas', {
        'id': `eq.${testData.pessoa_responsavel_id}`
      });
    }
    
    success('Dados removidos');
    return true;
  } catch (e) {
    error(`Erro na limpeza: ${e.message}`);
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
  
  console.log('\n⚠️  PREPARAÇÃO MANUAL OBRIGATÓRIA\n');
  
  // Step 1: Informar sobre SQL
  await step1_ApplySql();
  
  console.log('\n');
  const continueTest = await new Promise((resolve) => {
    process.stdout.write('Após aplicar o SQL, pressione Enter para continuar com os testes...');
    process.stdin.once('data', () => resolve(true));
  });
  
  console.log('\n🧪 TESTES AUTOMATIZADOS\n');
  
  // Step 2: Validar tabela
  const tableOk = await step2_ValidateTable();
  if (!tableOk) {
    error('Tabela não foi criada. Verifique o SQL aplicado.');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Step 3: Obter encontro
  const encontroId = await step3_GetEncontro();
  if (!encontroId) {
    error('Não foi possível obter um encontro');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Step 4: Criar inscrição
  const testData = await step4_CreateTestInscricao(encontroId);
  if (!testData) {
    error('Não foi possível criar inscrição de teste');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Step 5: Validar status inicial
  const initialOk = await step5_ValidateInitial(testData);
  if (!initialOk) {
    error('Status inicial não é INSCRITO');
    process.exit(1);
  }
  
  console.log('\n🔄 TESTES DE ALTERAÇÃO\n');
  
  // Test 1
  let t1 = await testStatusChange(1, testData, 'EM_ANALISE', '', true);
  if (t1.success) await validateStatusDb(testData, 'EM_ANALISE');
  await delay(500);
  
  // Test 2
  let t2 = await testStatusChange(2, testData, 'PRIORIZADO', 'Priorizado para análise', true);
  if (t2.success) await validateStatusDb(testData, 'PRIORIZADO');
  await delay(500);
  
  // Test 3 - Deve falhar
  const cnt3before = await countHistorico(testData);
  let t3 = await testStatusChange(3, testData, 'CANCELADO', '', false, 'JUSTIFICATIVA_OBRIGATORIA');
  const cnt3after = await countHistorico(testData);
  if (t3.success && cnt3after === cnt3before) {
    success(`Histórico não alterado (${cnt3after} registros)`);
  }
  await delay(500);
  
  // Test 4 - Com justificativa
  let t4 = await testStatusChange(4, testData, 'CANCELADO', 'Cancelado para teste', true);
  if (t4.success) await validateStatusDb(testData, 'CANCELADO');
  await delay(500);
  
  // Test 5 - Status inválido
  const cnt5before = await countHistorico(testData);
  let t5 = await testStatusChange(5, testData, 'APROVADO', 'Teste', false, 'STATUS_INVALIDO');
  const cnt5after = await countHistorico(testData);
  if (t5.success && cnt5after === cnt5before) {
    success(`Histórico não alterado (${cnt5after} registros)`);
  }
  await delay(500);
  
  // Test 6 - Inscrição inexistente
  let t6 = await testStatusChange(6, { ...testData, inscricao_id: '00000000-0000-0000-0000-000000000000' }, 'FILA', 'Teste', false, 'INSCRICAO_NAO_ENCONTRADA');
  await delay(500);
  
  // Test 7 - Mesmo status
  let t7 = await testStatusChange(7, testData, 'CANCELADO', 'Mesmo status', false, 'STATUS_SEM_ALTERACAO');
  const cnt7 = await countHistorico(testData);
  success(`Histórico final: ${cnt7} registros`);
  
  console.log('\n📊 RESUMO FINAL\n');
  
  const allTests = [t1, t2, t3, t4, t5, t6, t7];
  const passed = allTests.filter(t => t.success).length;
  success(`${passed}/7 testes passaram`);
  
  console.log('\n🧹 LIMPEZA\n');
  await cleanupTestData(testData);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ HOMOLOGAÇÃO CONCLUÍDA');
  console.log('='.repeat(80) + '\n');
}

main().catch(e => {
  error(`Erro fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
