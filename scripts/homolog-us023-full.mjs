#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carregar .env.local
const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.config({ path: envPath });

if (envConfig.error) {
  console.error('âŒ Erro ao carregar .env.local:', envConfig.error);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = process.env.VITE_API_PROXY || 'http://localhost:3001';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('âŒ VariÃ¡veis de ambiente nÃ£o configuradas:');
  console.error('  SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'FALTA');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? 'OK' : 'FALTA');
  process.exit(1);
}

console.log('âœ… VariÃ¡veis de ambiente carregadas');
console.log(`   URL: ${SUPABASE_URL}`);
console.log(`   API: ${API_URL}`);

// ============================================================================
// UTILITIES
// ============================================================================

function log(section, message) {
  console.log(`\nðŸ“‹ [${section}] ${message}`);
}

function success(message) {
  console.log(`âœ… ${message}`);
}

function error(message) {
  console.log(`âŒ ${message}`);
}

function info(message) {
  console.log(`â„¹ï¸  ${message}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SUPABASE HELPERS
// ============================================================================

async function supabaseSelect(table, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  
  if (filters.limit) {
    url += `&limit=${filters.limit}`;
  }
  
  if (filters.id) {
    url += `&id=eq.${filters.id}`;
  }
  
  if (filters.inscricao_id) {
    url += `&inscricao_id=eq.${filters.inscricao_id}`;
  }
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function supabaseRpc(functionName, params) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function supabaseDelete(table, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  
  if (filters.inscricao_id) {
    url += `?inscricao_id=eq.${filters.inscricao_id}`;
  }
  
  if (filters.adolescente_id) {
    url += `?adolescente_id=eq.${filters.adolescente_id}`;
  }
  
  if (filters.id) {
    url += `?id=eq.${filters.id}`;
  }
  
  if (filters.pessoa_id) {
    url += `?pessoa_id=eq.${filters.pessoa_id}`;
  }
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY
    }
  });
  
  return { ok: response.ok, status: response.status };
}

// ============================================================================
// STEP 1: VALIDAR TABELA DE HISTÃ“RICO
// ============================================================================

async function step1_ValidateHistoricoTable() {
  log('STEP 1', 'Validar tabela inscricoes_status_historico');
  
  try {
    const { ok, status, data } = await supabaseSelect('inscricoes_status_historico', { limit: 1 });
    
    if (!ok && status !== 200) {
      error(`Tabela nÃ£o existe ou nÃ£o acessÃ­vel (Status: ${status})`);
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
// STEP 2: PEGAR ENCONTRO PARA TESTE
// ============================================================================

async function step2_GetEncontro() {
  log('STEP 2', 'Obter encontro para teste');
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/encontros?select=*&data_inicio=not.is.null&order=data_inicio.desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    const data = await response.json();
    const ok = response.ok;
    
    if (!ok || !Array.isArray(data) || data.length === 0) {
      error(`Nenhum encontro com data_inicio disponivel`);
      return null;
    }
    
    const encontro = data[0];
    success(`Encontro selecionado: ${encontro.nome} (ID: ${encontro.id.substring(0, 8)}...)`);
    return encontro.id;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return null;
  }
}

// ============================================================================
// STEP 3: CRIAR INSCRIÃ‡ÃƒO DE TESTE
// ============================================================================

async function step3_CreateTestInscricao(encontroId) {
  log('STEP 3', 'Criar inscriÃ§Ã£o de teste');
  
  try {
    const payload = {
      nome_adolescente: 'Teste US023 Status',
      data_nascimento: '2011-05-10',
      telefone_adolescente: '21999990023',
      nome_responsavel: 'ResponsÃ¡vel US023 Status',
      telefone_responsavel: '21988880023',
      bairro: 'Bairro Teste',
      paroquia: 'ParÃ³quia Teste',
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
      error(`Falha ao criar: ${result.error} - ${result.message}`);
      return null;
    }

    const payloadData = result.data || {};
    const inscricaoId = result.inscricao_id || payloadData.id;
    const adolescenteId = result.adolescente_id || payloadData.adolescente_id;
    const pessoaAdolescenteId = result.pessoa_adolescente_id || payloadData.pessoa_adolescente_id;
    const responsavelId = result.responsavel_id || payloadData.responsavel_id;
    const pessoaResponsavelId = result.pessoa_responsavel_id || payloadData.pessoa_responsavel_id;
    const vinculoId = result.vinculo_id || payloadData.vinculo_id;

    if (!inscricaoId) {
      error('Resposta sem inscricao_id/id para continuar os testes');
      return null;
    }

    const testData = {
      inscricao_id: inscricaoId,
      adolescente_id: adolescenteId,
      pessoa_adolescente_id: pessoaAdolescenteId,
      responsavel_id: responsavelId,
      pessoa_responsavel_id: pessoaResponsavelId,
      vinculo_id: vinculoId
    };
    
    success(`InscriÃ§Ã£o criada: ${testData.inscricao_id.substring(0, 8)}...`);
    return testData;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return null;
  }
}

// ============================================================================
// STEP 4: VALIDAR STATUS INICIAL
// ============================================================================

async function step4_ValidateInitial(testData) {
  log('STEP 4', 'Validar status inicial');
  
  try {
    const { ok, data } = await supabaseSelect('inscricoes', { id: testData.inscricao_id });
    
    if (!ok || !Array.isArray(data) || data.length === 0) {
      error(`InscriÃ§Ã£o nÃ£o encontrada`);
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
// TESTE DE ALTERAÃ‡ÃƒO
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
        info(`Anterior: ${result.status_anterior}, HistÃ³rico: ${result.historico_id?.substring(0, 8)}...`);
        return { success: true, result };
      } else {
        error(`Esperava sucesso, mas falhou: ${result.error}`);
        return { success: false, result };
      }
    } else {
      if (!isSuccess && result.error === expectedError) {
        success(`Erro esperado: ${expectedError}`);
        return { success: true, result };
      } else {
        error(`Esperava ${expectedError}, recebeu: ${result.error}`);
        return { success: false, result };
      }
    }
  } catch (e) {
    error(`Erro na requisiÃ§Ã£o: ${e.message}`);
    return { success: false };
  }
}

// ============================================================================
// VALIDAR STATUS NO DB
// ============================================================================

async function validateStatusDb(testData, expectedStatus) {
  try {
    const { ok, data } = await supabaseSelect('inscricoes', { id: testData.inscricao_id });
    
    if (!ok || !Array.isArray(data) || data.length === 0) return false;
    
    const actual = data[0].status;
    const isCorrect = actual === expectedStatus;
    info(`Status no DB: ${actual} ${isCorrect ? 'âœ“' : 'âœ—'}`);
    return isCorrect;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// CONTAR HISTÃ“RICO
// ============================================================================

async function countHistorico(testData) {
  try {
    const { ok, data } = await supabaseSelect('inscricoes_status_historico', { inscricao_id: testData.inscricao_id });
    
    if (!ok || !Array.isArray(data)) return 0;
    return data.length;
  } catch (e) {
    return 0;
  }
}

// ============================================================================
// VALIDAR HISTÃ“RICO
// ============================================================================

async function validateHistorico(testData) {
  log('VALIDATE', 'Validar histÃ³rico de mudanÃ§as');
  
  try {
    const { ok, data } = await supabaseSelect('inscricoes_status_historico', { inscricao_id: testData.inscricao_id });
    
    if (!ok || !Array.isArray(data)) {
      error(`NÃ£o conseguiu recuperar histÃ³rico`);
      return false;
    }
    
    success(`Total de registros no histÃ³rico: ${data.length}`);
    
    data.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.status_anterior} â†’ ${h.status_novo} (${h.alterado_por_nome})`);
    });
    
    return true;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return false;
  }
}

// ============================================================================
// LIMPEZA
// ============================================================================

async function cleanup(testData) {
  log('CLEANUP', 'Remover dados de teste');
  
  try {
    // Apagar em ordem
    await supabaseDelete('inscricoes_status_historico', { inscricao_id: testData.inscricao_id });
    await supabaseDelete('inscricoes', { adolescente_id: testData.adolescente_id });
    await supabaseDelete('adolescente_responsaveis', { adolescente_id: testData.adolescente_id });
    await supabaseDelete('adolescentes', { pessoa_id: testData.pessoa_adolescente_id });
    await supabaseDelete('pessoas', { id: testData.pessoa_adolescente_id });
    
    if (testData.responsavel_id) {
      await supabaseDelete('responsaveis', { id: testData.responsavel_id });
    }
    
    if (testData.pessoa_responsavel_id) {
      await supabaseDelete('pessoas', { id: testData.pessoa_responsavel_id });
    }
    
    success('Dados de teste removidos');
    return true;
  } catch (e) {
    error(`Erro: ${e.message}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('ðŸš€ HOMOLOGAÃ‡ÃƒO AUTOMATIZADA US-023');
  console.log('='.repeat(80));
  
  console.log('\nðŸ“¦ PREPARAÃ‡ÃƒO DO BANCO DE DADOS\n');
  
  // Verificar se SQL foi aplicado
  const tableOk = await step1_ValidateHistoricoTable();
  
  if (!tableOk) {
    console.log('\nâš ï¸  AÃ‡ÃƒO NECESSÃRIA:');
    console.log('');
    console.log('A tabela inscricoes_status_historico nÃ£o existe.');
    console.log('');
    console.log('Por favor, execute no Supabase SQL Editor:');
    console.log('1. Abra: https://app.supabase.com');
    console.log('2. SQL Editor â†’ New Query');
    console.log('3. Cole o arquivo: docs/US-023-alterar-status-inscricao.sql');
    console.log('4. Clique Run');
    console.log('5. Execute novamente este script');
    console.log('');
    process.exit(1);
  }
  
  console.log('\nðŸ§ª PREPARAÃ‡ÃƒO DE TESTE\n');
  
  await delay(1000);
  
  // Obter encontro
  const encontroId = await step2_GetEncontro();
  if (!encontroId) {
    console.log('\nâŒ NÃ£o foi possÃ­vel obter um encontro para teste');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Criar inscriÃ§Ã£o
  const testData = await step3_CreateTestInscricao(encontroId);
  if (!testData) {
    console.log('\nâŒ NÃ£o foi possÃ­vel criar inscriÃ§Ã£o de teste');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Validar status inicial
  const initialOk = await step4_ValidateInitial(testData);
  if (!initialOk) {
    console.log('\nâŒ Status inicial nÃ£o Ã© INSCRITO');
    await cleanup(testData);
    process.exit(1);
  }
  
  console.log('\nðŸ”„ TESTES DE ALTERAÃ‡ÃƒO DE STATUS\n');
  
  // Test 1
  let t1 = await testStatusChange(1, testData, 'EM_ANALISE', '', true);
  if (t1.success) await validateStatusDb(testData, 'EM_ANALISE');
  await delay(500);
  
  // Test 2
  let t2 = await testStatusChange(2, testData, 'PRIORIZADO', 'Priorizado para anÃ¡lise inicial.', true);
  if (t2.success) await validateStatusDb(testData, 'PRIORIZADO');
  await delay(500);
  
  // Test 3 - Deve falhar (sem justificativa)
  const cnt3before = await countHistorico(testData);
  let t3 = await testStatusChange(3, testData, 'CANCELADO', '', false, 'JUSTIFICATIVA_OBRIGATORIA');
  const cnt3after = await countHistorico(testData);
  if (t3.success && cnt3after === cnt3before) {
    success(`HistÃ³rico nÃ£o alterado (${cnt3after} registros)`);
  }
  await delay(500);
  
  // Test 4 - Com justificativa
  let t4 = await testStatusChange(4, testData, 'CANCELADO', 'Cancelado por motivo de teste.', true);
  if (t4.success) await validateStatusDb(testData, 'CANCELADO');
  await delay(500);
  
  // Test 5 - Status invÃ¡lido
  const cnt5before = await countHistorico(testData);
  let t5 = await testStatusChange(5, testData, 'APROVADO', 'Teste status invÃ¡lido', false, 'STATUS_INVALIDO');
  const cnt5after = await countHistorico(testData);
  if (t5.success && cnt5after === cnt5before) {
    success(`HistÃ³rico nÃ£o alterado (${cnt5after} registros)`);
  }
  await delay(500);
  
  // Test 6 - InscriÃ§Ã£o inexistente
  let t6 = await testStatusChange(6, { ...testData, inscricao_id: '00000000-0000-0000-0000-000000000000' }, 'FILA', 'Teste', false, 'INSCRICAO_NAO_ENCONTRADA');
  await delay(500);
  
  // Test 7 - Mesmo status
  let t7 = await testStatusChange(7, testData, 'CANCELADO', 'Teste mesmo status', false, 'STATUS_SEM_ALTERACAO');
  await delay(500);
  
  console.log('\nðŸ“Š VALIDAÃ‡ÃƒO FINAL\n');
  
  // Validar histÃ³rico
  await validateHistorico(testData);
  
  // Resumo
  const allTests = [t1, t2, t3, t4, t5, t6, t7];
  const passed = allTests.filter(t => t.success).length;
  
  console.log('\nðŸ“ˆ RESUMO DOS TESTES\n');
  success(`${passed}/7 testes passaram`);
  
  if (passed === 7) {
    console.log('\nâœ… TODOS OS TESTES APROVADOS!');
  } else {
    console.log(`\nâš ï¸  ${7 - passed} teste(s) falharam`);
  }
  
  console.log('\nðŸ§¹ LIMPEZA\n');
  await cleanup(testData);
  
  console.log('\n' + '='.repeat(80));
  console.log('âœ… HOMOLOGAÃ‡ÃƒO CONCLUÃDA');
  console.log('='.repeat(80) + '\n');
  
  process.exit(passed === 7 ? 0 : 1);
}

main().catch(e => {
  error(`Erro fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
