/**
 * Sync seguro de planilhas -> staging -> processamento Supabase.
 *
 * Uso recomendado:
 * 1. Deixe STAGING_SYNC_PROCESSAR_RPCS = false.
 * 2. Rode mig_validarConfiguracoesObrigatorias().
 * 3. Rode mig_inicializarStagingComoProcessada().
 * 4. Confira staging no Supabase.
 * 5. Depois mude STAGING_SYNC_PROCESSAR_RPCS = true.
 * 6. Rode mig_sincronizarBasesOperacionaisParaSupabase().
 */

// IDs das planilhas.
const STAGING_SYNC_SPREADSHEET_ID_INSCRICOES = '1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg';
const STAGING_SYNC_SPREADSHEET_ID_CADASTRO = '13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk';
const STAGING_SYNC_SPREADSHEET_ID_ENCONTREIROS = '1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4';
const STAGING_SYNC_ENCONTREIROS_SHEET_GID = 215132863;

// Segurança: false alimenta staging sem processar base final.
const STAGING_SYNC_PROCESSAR_RPCS = true;

// Se quiser rodar este arquivo isoladamente, preencha estes valores.
// Se deixar vazio, o script tenta ler de Script Properties.
const STAGING_SYNC_SUPABASE_URL = 'https://niagdoowqmngxjcrmstd.supabase.co';
const STAGING_SYNC_SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pYWdkb293cW1uZ3hqY3Jtc3RkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwNjIyNSwiZXhwIjoyMDkyOTgyMjI1fQ.0GasHMRPXwcuxfPNmEStwF5nnwXWymFGNotKMbogMy8';
const STAGING_SYNC_ENCONTRO_ID_CADASTRO_ATE_73 = 'd8a87f32-ecff-4b1d-b832-b734342696a2';
const STAGING_SYNC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE = '7191d2b7-4895-4d68-8360-cc2bda900ccb';
const STAGING_SYNC_LINHA_CORTE_CADASTRO_OFICIAL = 74;
const STAGING_SYNC_ENCONTRO_ID_TRIAGEM = '4edf9061-0dee-489c-81cd-0ed205f40d34';

const MIG_STAGING_CONFIG = {
  respostasFormulario: {
    spreadsheetId: STAGING_SYNC_SPREADSHEET_ID_INSCRICOES,
    nomeAba: 'Respostas ao formulário 1',
    entidadeDestino: 'inscricoes',
  },
  cadastroOficial: {
    spreadsheetId: STAGING_SYNC_SPREADSHEET_ID_CADASTRO,
    nomeAba: 'Cadastro Oficial',
    entidadeDestino: 'cadastro_oficial',
  },
  encontreiros: {
    spreadsheetId: STAGING_SYNC_SPREADSHEET_ID_ENCONTREIROS,
    gid: STAGING_SYNC_ENCONTREIROS_SHEET_GID,
    nomeAba: 'Encontreiros',
    entidadeDestino: 'encontreiros',
  },
};

function mig_validarConfiguracoesObrigatorias() {
  const result = {
    ok: true,
    processarRpcs: STAGING_SYNC_PROCESSAR_RPCS,
    configuracoes: {},
    avisos: [],
  };

  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EAC_ENCONTRO_ID_CADASTRO_ATE_73',
    'EAC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE',
    'EAC_ENCONTRO_ID_TRIAGEM',
  ];

  for (let i = 0; i < required.length; i++) {
    const key = required[i];

    try {
      const value = mig_getRequiredConfigValue_(key, mig_getInlineValueForKey_(key));
      result.configuracoes[key] = value ? 'OK' : 'VAZIO';
    } catch (e) {
      result.ok = false;
      result.configuracoes[key] = 'FALTANDO';
      result.avisos.push(String(e && e.message ? e.message : e));
    }
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function mig_sincronizarBasesOperacionaisParaSupabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const encontroIdCadastroAte73 = mig_getRequiredConfigValue_(
      'EAC_ENCONTRO_ID_CADASTRO_ATE_73',
      STAGING_SYNC_ENCONTRO_ID_CADASTRO_ATE_73
    );

    const encontroIdCadastro74EmDiante = mig_getRequiredConfigValue_(
      'EAC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE',
      STAGING_SYNC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE
    );

    const encontroIdTriagem = mig_getRequiredConfigValue_(
      'EAC_ENCONTRO_ID_TRIAGEM',
      STAGING_SYNC_ENCONTRO_ID_TRIAGEM
    );

    const resultados = {
      modo: STAGING_SYNC_PROCESSAR_RPCS ? 'SYNC_COM_PROCESSAMENTO' : 'SYNC_SEM_PROCESSAMENTO_RPC',
      staging: [],
      processamento: {},
      resumo: {},
    };

    const resultadoCadastro = mig_importarCadastroOficialParaStaging();
    const resultadoRespostas = mig_importarRespostasFormularioParaStaging();
    const resultadoEncontreiros = mig_importarEncontreirosParaStaging();

    resultados.staging.push(resultadoCadastro);
    resultados.staging.push(resultadoRespostas);
    resultados.staging.push(resultadoEncontreiros);

    if (STAGING_SYNC_PROCESSAR_RPCS === true) {
      resultados.processamento.cadastroTriagem = mig_chamarRpcSupabase_(
        'fn_processar_staging_cadastro_e_triagem',
        {
          p_encontro_id_antes_corte: encontroIdCadastroAte73,
          p_encontro_id_apos_corte: encontroIdCadastro74EmDiante,
          p_numero_linha_corte: STAGING_SYNC_LINHA_CORTE_CADASTRO_OFICIAL,
          p_encontro_id_triagem: encontroIdTriagem,
          p_importacao_cadastro_oficial: resultadoCadastro.resultado.importacaoId,
          p_importacao_respostas: resultadoRespostas.resultado.importacaoId,
        }
      );

      resultados.processamento.encontreiros = mig_chamarRpcSupabase_(
        'fn_processar_staging_encontreiros',
        {
          p_importacao_id: resultadoEncontreiros.resultado.importacaoId,
          p_nome_aba: resultadoEncontreiros.nomeAbaReal,
        }
      );
    } else {
      resultados.processamento.cadastroTriagem = {
        rpc: 'fn_processar_staging_cadastro_e_triagem',
        statusCode: 0,
        body: {
          bloqueado: true,
          motivo: 'STAGING_SYNC_PROCESSAR_RPCS=false. Staging alimentada sem processar base final.',
        },
      };

      resultados.processamento.encontreiros = {
        rpc: 'fn_processar_staging_encontreiros',
        statusCode: 0,
        body: [{
          bloqueado: true,
          motivo: 'STAGING_SYNC_PROCESSAR_RPCS=false. Staging alimentada sem processar base final.',
        }],
      };
    }

    resultados.resumo = mig_montarResumoSync_(resultados);

    Logger.log(JSON.stringify(resultados, null, 2));
    Logger.log(mig_montarMensagemResumo_(resultados));
    mig_notificarConclusao_(resultados);

    return resultados;
  } finally {
    lock.releaseLock();
  }
}

function mig_inicializarStagingComoProcessada() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const resultados = {
      modo: 'INICIALIZACAO_STAGING_PROCESSADA_SEM_RPC',
      fontes: [],
      resumo: {},
    };

    resultados.fontes.push(
      mig_inicializarFonteComoProcessada_({
        spreadsheetId: MIG_STAGING_CONFIG.cadastroOficial.spreadsheetId,
        nomeAba: MIG_STAGING_CONFIG.cadastroOficial.nomeAba,
        entidadeDestino: MIG_STAGING_CONFIG.cadastroOficial.entidadeDestino,
      })
    );

    resultados.fontes.push(
      mig_inicializarFonteComoProcessada_({
        spreadsheetId: MIG_STAGING_CONFIG.respostasFormulario.spreadsheetId,
        nomeAba: MIG_STAGING_CONFIG.respostasFormulario.nomeAba,
        entidadeDestino: MIG_STAGING_CONFIG.respostasFormulario.entidadeDestino,
      })
    );

    resultados.fontes.push(
      mig_inicializarFonteComoProcessada_({
        spreadsheetId: MIG_STAGING_CONFIG.encontreiros.spreadsheetId,
        nomeAba: MIG_STAGING_CONFIG.encontreiros.nomeAba,
        gid: MIG_STAGING_CONFIG.encontreiros.gid,
        entidadeDestino: MIG_STAGING_CONFIG.encontreiros.entidadeDestino,
      })
    );

    resultados.resumo = mig_montarResumoInicializacao_(resultados.fontes);

    Logger.log(JSON.stringify(resultados, null, 2));
    return resultados;
  } finally {
    lock.releaseLock();
  }
}

function mig_importarCadastroOficialParaStaging() {
  return mig_importarFonteEspecificaParaStaging_({
    spreadsheetId: MIG_STAGING_CONFIG.cadastroOficial.spreadsheetId,
    nomeAba: MIG_STAGING_CONFIG.cadastroOficial.nomeAba,
    entidadeDestino: MIG_STAGING_CONFIG.cadastroOficial.entidadeDestino,
  });
}

function mig_importarRespostasFormularioParaStaging() {
  return mig_importarFonteEspecificaParaStaging_({
    spreadsheetId: MIG_STAGING_CONFIG.respostasFormulario.spreadsheetId,
    nomeAba: MIG_STAGING_CONFIG.respostasFormulario.nomeAba,
    entidadeDestino: MIG_STAGING_CONFIG.respostasFormulario.entidadeDestino,
  });
}

function mig_importarEncontreirosParaStaging() {
  return mig_importarFonteEspecificaParaStaging_({
    spreadsheetId: MIG_STAGING_CONFIG.encontreiros.spreadsheetId,
    nomeAba: MIG_STAGING_CONFIG.encontreiros.nomeAba,
    gid: MIG_STAGING_CONFIG.encontreiros.gid,
    entidadeDestino: MIG_STAGING_CONFIG.encontreiros.entidadeDestino,
  });
}

function mig_importarFonteEspecificaParaStaging_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = mig_getSheetByNameOrGid_(ss, cfg.nomeAba, cfg.gid);

  if (!sheet) {
    throw new Error(
      'Aba não encontrada para staging. spreadsheetId=' + cfg.spreadsheetId +
      ', nomeAba=' + cfg.nomeAba +
      ', gid=' + (cfg.gid || '')
    );
  }

  const resultado = mig_importarAbaParaStaging_({
    spreadsheetId: cfg.spreadsheetId,
    sheet: sheet,
    statusProcessamento: 'PENDENTE',
    entidadeDestino: cfg.entidadeDestino || null,
    mensagemImportacao: null,
    forcarStatusEmLinhasIguais: false,
  });

  return {
    spreadsheetId: cfg.spreadsheetId,
    nomeAbaSolicitada: cfg.nomeAba,
    nomeAbaReal: sheet.getName(),
    gid: sheet.getSheetId(),
    resultado: resultado,
  };
}

function mig_inicializarFonteComoProcessada_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = mig_getSheetByNameOrGid_(ss, cfg.nomeAba, cfg.gid);

  if (!sheet) {
    throw new Error(
      'Aba não encontrada para inicializar staging. spreadsheetId=' + cfg.spreadsheetId +
      ', nomeAba=' + cfg.nomeAba +
      ', gid=' + (cfg.gid || '')
    );
  }

  const resultado = mig_importarAbaParaStaging_({
    spreadsheetId: cfg.spreadsheetId,
    sheet: sheet,
    statusProcessamento: 'PROCESSADO',
    entidadeDestino: cfg.entidadeDestino || null,
    mensagemImportacao: 'Inicialização da staging como PROCESSADO, sem execução das RPCs.',
    forcarStatusEmLinhasIguais: true,
  });

  return {
    spreadsheetId: cfg.spreadsheetId,
    spreadsheetName: sheet.getParent().getName(),
    nomeAba: sheet.getName(),
    gid: sheet.getSheetId(),
    resultado: resultado,
  };
}

function mig_getSheetByNameOrGid_(ss, nomeAba, gid) {
  if (nomeAba) {
    const byName = ss.getSheetByName(nomeAba);
    if (byName) return byName;
  }

  if (gid !== null && gid !== undefined && gid !== '') {
    const targetGid = Number(gid);
    const sheets = ss.getSheets();

    for (let i = 0; i < sheets.length; i++) {
      if (Number(sheets[i].getSheetId()) === targetGid) {
        return sheets[i];
      }
    }
  }

  return null;
}

function mig_importarAbaParaStaging_(params) {
  if (!params) {
    throw new Error('Parâmetros não informados em mig_importarAbaParaStaging_.');
  }

  const spreadsheetId = params.spreadsheetId;
  const sheet = params.sheet;
  const statusProcessamento = params.statusProcessamento || 'PENDENTE';
  const entidadeDestino = params.entidadeDestino || null;
  const mensagemImportacao = params.mensagemImportacao || null;
  const forcarStatusEmLinhasIguais = params.forcarStatusEmLinhasIguais === true;

  if (!spreadsheetId) {
    throw new Error('spreadsheetId não informado em mig_importarAbaParaStaging_.');
  }

  if (!sheet || typeof sheet.getParent !== 'function') {
    throw new Error(
      'Objeto sheet inválido em mig_importarAbaParaStaging_.' +
      '\nSpreadsheet ID: ' + spreadsheetId +
      '\nSheet recebido: ' + sheet
    );
  }

  const spreadsheet = sheet.getParent();
  const data = sheet.getDataRange().getValues();

  if (!data || data.length === 0) {
    return {
      success: true,
      spreadsheetId: spreadsheetId,
      spreadsheetName: spreadsheet.getName(),
      nomeAba: sheet.getName(),
      totalLinhas: 0,
      inseridas: 0,
      atualizadas: 0,
      importadasOuAtualizadas: 0,
      ignoradas: 0,
      ignoradasVazias: 0,
      ignoradasIguais: 0,
      importacaoId: null,
      mensagem: 'Aba vazia.',
    };
  }

  const headers = (data[0] || []).map(function(v) {
    return String(v || '').trim();
  });

  const rows = data.slice(1);
  const importacaoId = Utilities.getUuid();
  const linhasExistentes = mig_listarLinhasExistentesDaAba_(spreadsheetId, sheet.getName());

  const payloadRows = [];
  let ignoradasVazias = 0;
  let ignoradasIguais = 0;
  let linhasAlteradas = 0;
  let linhasNovas = 0;
  let linhasStatusForcado = 0;

  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    const numeroLinha = i + 2;
    const payload = mig_buildPayloadFromRow_(headers, values);

    if (mig_payloadIsEmpty_(payload)) {
      ignoradasVazias++;
      continue;
    }

    const hashLinha = mig_hashRow_(sheet.getName(), numeroLinha, payload);
    const existente = linhasExistentes[numeroLinha];

    if (existente && existente.hash_linha === hashLinha) {
      const statusDiferente =
        String(existente.status_processamento || '').trim() !== String(statusProcessamento || '').trim();

      const entidadeDiferente =
        String(existente.entidade_destino || '').trim() !== String(entidadeDestino || '').trim();

      if (forcarStatusEmLinhasIguais && (statusDiferente || entidadeDiferente)) {
        linhasStatusForcado++;

        payloadRows.push({
          modo_operacao: 'UPDATE',
          id: existente.id,
          importacao_id: importacaoId,
          spreadsheet_id: spreadsheetId,
          nome_aba: sheet.getName(),
          numero_linha: numeroLinha,
          hash_linha: hashLinha,
          payload: payload,
          status_processamento: statusProcessamento,
          entidade_destino: entidadeDestino,
          entidade_destino_id: existente.entidade_destino_id || null,
          mensagem_erro: null,
        });

        continue;
      }

      ignoradasIguais++;
      continue;
    }

    if (existente && existente.hash_linha !== hashLinha) {
      linhasAlteradas++;

      payloadRows.push({
        modo_operacao: 'UPDATE',
        id: existente.id,
        importacao_id: importacaoId,
        spreadsheet_id: spreadsheetId,
        nome_aba: sheet.getName(),
        numero_linha: numeroLinha,
        hash_linha: hashLinha,
        payload: payload,
        status_processamento: statusProcessamento,
        entidade_destino: entidadeDestino,
        entidade_destino_id: existente.entidade_destino_id || null,
        mensagem_erro: null,
      });

      continue;
    }

    linhasNovas++;

    payloadRows.push({
      modo_operacao: 'INSERT',
      id: Utilities.getUuid(),
      importacao_id: importacaoId,
      spreadsheet_id: spreadsheetId,
      nome_aba: sheet.getName(),
      numero_linha: numeroLinha,
      hash_linha: hashLinha,
      payload: payload,
      status_processamento: statusProcessamento,
      entidade_destino: entidadeDestino,
      entidade_destino_id: null,
      mensagem_erro: null,
    });
  }

  mig_criarImportacaoPlanilha_(
    importacaoId,
    spreadsheetId,
    sheet.getName(),
    spreadsheet.getName(),
    rows.length,
    payloadRows.length,
    ignoradasVazias + ignoradasIguais
  );

  let resultadoPersistencia = {
    inseridas: 0,
    atualizadas: 0,
  };

  try {
    resultadoPersistencia = mig_persistirStagingLinhas_(payloadRows);

    const totalImportadasOuAtualizadas =
      Number(resultadoPersistencia.inseridas || 0) +
      Number(resultadoPersistencia.atualizadas || 0);

    mig_atualizarImportacaoPlanilha_(
      importacaoId,
      {
        status: 'CONCLUIDA',
        total_linhas: rows.length,
        total_importadas: totalImportadasOuAtualizadas,
        total_ignoradas: ignoradasVazias + ignoradasIguais,
        total_erros: 0,
        mensagem_erro: mensagemImportacao,
        finalizado_em: new Date().toISOString(),
      }
    );

    return {
      success: true,
      spreadsheetId: spreadsheetId,
      spreadsheetName: spreadsheet.getName(),
      nomeAba: sheet.getName(),
      totalLinhas: rows.length,
      inseridas: Number(resultadoPersistencia.inseridas || 0),
      atualizadas: Number(resultadoPersistencia.atualizadas || 0),
      importadasOuAtualizadas: totalImportadasOuAtualizadas,
      ignoradas: ignoradasVazias + ignoradasIguais,
      ignoradasVazias: ignoradasVazias,
      ignoradasIguais: ignoradasIguais,
      linhasNovasDetectadas: linhasNovas,
      linhasAlteradasDetectadas: linhasAlteradas,
      linhasStatusForcado: linhasStatusForcado,
      statusProcessamentoGravado: statusProcessamento,
      importacaoId: importacaoId,
      mensagem: totalImportadasOuAtualizadas > 0
        ? 'Staging persistida com inserts/updates.'
        : 'Nenhuma linha nova ou alterada para persistir.',
    };
  } catch (e) {
    mig_atualizarImportacaoPlanilha_(
      importacaoId,
      {
        status: 'ERRO',
        total_linhas: rows.length,
        total_importadas: Number(resultadoPersistencia.inseridas || 0) + Number(resultadoPersistencia.atualizadas || 0),
        total_ignoradas: ignoradasVazias + ignoradasIguais,
        total_erros: payloadRows.length,
        mensagem_erro: String(e && e.message ? e.message : e),
        finalizado_em: new Date().toISOString(),
      }
    );

    throw e;
  }
}

function mig_criarImportacaoPlanilha_(importacaoId, spreadsheetId, nomeAba, spreadsheetName, totalLinhas, totalImportadas, totalIgnoradas) {
  const nowIso = new Date().toISOString();

  const payload = {
    id: importacaoId,
    nome: spreadsheetName + ' - ' + nomeAba,
    spreadsheet_id: spreadsheetId,
    aba: nomeAba,
    tipo_importacao: mig_deduzirTipoImportacao_(nomeAba),
    status: 'PENDENTE',
    total_linhas: Number(totalLinhas || 0),
    total_importadas: Number(totalImportadas || 0),
    total_ignoradas: Number(totalIgnoradas || 0),
    total_erros: 0,
    mensagem_erro: null,
    iniciado_em: nowIso,
  };

  mig_callSupabaseRest_('importacoes_planilha', 'post', payload, {
    Prefer: 'return=representation',
  });
}

function mig_atualizarImportacaoPlanilha_(importacaoId, patch) {
  const query = '?id=eq.' + encodeURIComponent(importacaoId);

  const payload = {
    atualizado_em: new Date().toISOString(),
  };

  Object.keys(patch || {}).forEach(function(k) {
    payload[k] = patch[k];
  });

  mig_callSupabaseRest_('importacoes_planilha' + query, 'patch', payload, {
    Prefer: 'return=representation',
  });
}

function mig_listarLinhasExistentesDaAba_(spreadsheetId, nomeAba) {
  const known = {};
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const query = '?select=id,numero_linha,hash_linha,entidade_destino,entidade_destino_id,status_processamento' +
      '&spreadsheet_id=eq.' + encodeURIComponent(spreadsheetId) +
      '&nome_aba=eq.' + encodeURIComponent(nomeAba) +
      '&limit=' + pageSize +
      '&offset=' + offset;

    const rows = mig_callSupabaseRest_('staging_planilha_linhas' + query, 'get', null, {
      Prefer: 'return=representation',
    }) || [];

    for (let i = 0; i < rows.length; i++) {
      const numeroLinha = Number(rows[i].numero_linha);
      if (!numeroLinha) continue;

      known[numeroLinha] = {
        id: rows[i].id,
        numero_linha: numeroLinha,
        hash_linha: String(rows[i].hash_linha || '').trim(),
        entidade_destino: rows[i].entidade_destino || null,
        entidade_destino_id: rows[i].entidade_destino_id || null,
        status_processamento: rows[i].status_processamento || null,
      };
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return known;
}

function mig_persistirStagingLinhas_(rows) {
  if (!rows || rows.length === 0) {
    return {
      inseridas: 0,
      atualizadas: 0,
    };
  }

  const insertRows = [];
  const updateRows = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const modo = row.modo_operacao;
    delete row.modo_operacao;

    if (modo === 'UPDATE') {
      updateRows.push(row);
    } else {
      insertRows.push(row);
    }
  }

  const inseridas = mig_bulkInsertSupabase_('staging_planilha_linhas', insertRows);

  let atualizadas = 0;

  for (let j = 0; j < updateRows.length; j++) {
    mig_atualizarLinhaStaging_(updateRows[j]);
    atualizadas++;
  }

  return {
    inseridas: inseridas,
    atualizadas: atualizadas,
  };
}

function mig_atualizarLinhaStaging_(row) {
  if (!row || !row.id) {
    throw new Error('Linha de staging sem id para atualização.');
  }

  const query = '?id=eq.' + encodeURIComponent(row.id);

  const payload = {
    importacao_id: row.importacao_id,
    spreadsheet_id: row.spreadsheet_id,
    nome_aba: row.nome_aba,
    numero_linha: row.numero_linha,
    hash_linha: row.hash_linha,
    payload: row.payload,
    status_processamento: row.status_processamento || 'PENDENTE',
    entidade_destino: row.entidade_destino || null,
    entidade_destino_id: row.entidade_destino_id || null,
    mensagem_erro: row.mensagem_erro || null,
  };

  mig_callSupabaseRest_('staging_planilha_linhas' + query, 'patch', payload, {
    Prefer: 'return=representation',
  });
}

function mig_bulkInsertSupabase_(tableName, rows) {
  if (!rows || rows.length === 0) return 0;

  const chunkSize = 200;
  let total = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    mig_callSupabaseRest_(tableName, 'post', chunk, {
      Prefer: 'return=representation',
    });

    total += chunk.length;
  }

  return total;
}

function mig_chamarRpcSupabase_(rpcName, payload) {
  const supabaseUrl = mig_getRequiredConfigValue_('SUPABASE_URL', STAGING_SYNC_SUPABASE_URL);
  const serviceRoleKey = mig_getRequiredConfigValue_('SUPABASE_SERVICE_ROLE_KEY', STAGING_SYNC_SUPABASE_SERVICE_ROLE_KEY);

  const url = String(supabaseUrl).replace(/\/+$/, '') + '/rest/v1/rpc/' + encodeURIComponent(rpcName);

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: serviceRoleKey,
      Authorization: 'Bearer ' + serviceRoleKey,
      Prefer: 'return=representation',
    },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });

  const statusCode = response.getResponseCode();
  const rawBody = response.getContentText() || '';
  let body = null;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch (e) {
    body = rawBody;
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      'Falha ao chamar RPC ' + rpcName +
      '. HTTP ' + statusCode +
      '. Resposta: ' + rawBody
    );
  }

  return {
    rpc: rpcName,
    statusCode: statusCode,
    body: body,
  };
}

function mig_callSupabaseRest_(path, method, payload, extraHeaders) {
  const supabaseUrl = mig_getRequiredConfigValue_('SUPABASE_URL', STAGING_SYNC_SUPABASE_URL);
  const serviceRoleKey = mig_getRequiredConfigValue_('SUPABASE_SERVICE_ROLE_KEY', STAGING_SYNC_SUPABASE_SERVICE_ROLE_KEY);

  const url = String(supabaseUrl).replace(/\/+$/, '') + '/rest/v1/' + path;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: 'Bearer ' + serviceRoleKey,
  };

  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function(k) {
      headers[k] = extraHeaders[k];
    });
  }

  const options = {
    method: method,
    headers: headers,
    muteHttpExceptions: true,
  };

  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const rawBody = response.getContentText() || '';

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      'Falha REST Supabase em ' + path +
      '. HTTP ' + statusCode +
      '. Resposta: ' + rawBody
    );
  }

  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch (e) {
    return rawBody;
  }
}

function mig_buildPayloadFromRow_(headers, values) {
  const payload = {};

  for (let i = 0; i < headers.length; i++) {
    const rawHeader = String(headers[i] || '').trim();
    if (!rawHeader) continue;

    payload[rawHeader] = mig_normalizeCellValue_(values[i]);
  }

  return payload;
}

function mig_normalizeCellValue_(value) {
  if (value === null || value === undefined || value === '') return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || 'America/Sao_Paulo',
      "yyyy-MM-dd'T'HH:mm:ss"
    );
  }

  return value;
}

function mig_payloadIsEmpty_(payload) {
  const keys = Object.keys(payload || {});
  if (keys.length === 0) return true;

  for (let i = 0; i < keys.length; i++) {
    const v = payload[keys[i]];

    if (v !== '' && v !== null && v !== undefined) {
      return false;
    }
  }

  return true;
}

function mig_hashRow_(nomeAba, numeroLinha, payload) {
  const input = JSON.stringify({
    nomeAba: nomeAba,
    numeroLinha: numeroLinha,
    payload: payload,
  });

  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);

  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function mig_deduzirTipoImportacao_(nomeAba) {
  const raw = String(nomeAba || '').trim().toLowerCase();

  if (raw === 'respostas ao formulário 1' || raw === 'respostas ao formulario 1') {
    return 'INCREMENTAL';
  }

  if (raw === 'cadastro oficial') return 'FULL';
  if (raw.indexOf('encontreiro') >= 0) return 'FULL';

  return 'FULL';
}

function mig_getInlineValueForKey_(key) {
  if (key === 'SUPABASE_URL') return STAGING_SYNC_SUPABASE_URL;
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') return STAGING_SYNC_SUPABASE_SERVICE_ROLE_KEY;
  if (key === 'EAC_ENCONTRO_ID_CADASTRO_ATE_73') return STAGING_SYNC_ENCONTRO_ID_CADASTRO_ATE_73;
  if (key === 'EAC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE') return STAGING_SYNC_ENCONTRO_ID_CADASTRO_74_EM_DIANTE;
  if (key === 'EAC_ENCONTRO_ID_TRIAGEM') return STAGING_SYNC_ENCONTRO_ID_TRIAGEM;

  return '';
}

function mig_getRequiredConfigValue_(propertyKey, inlineValue) {
  const direct = String(inlineValue || '').trim();

  if (direct) return direct;

  const props = PropertiesService.getScriptProperties();
  const value = String(props.getProperty(propertyKey) || '').trim();

  if (!value) {
    throw new Error('Configuração obrigatória não definida: ' + propertyKey);
  }

  return value;
}

function mig_montarResumoInicializacao_(fontes) {
  const resumo = {
    fontes: [],
    totalLinhas: 0,
    inseridas: 0,
    atualizadas: 0,
    ignoradasVazias: 0,
    ignoradasIguais: 0,
    linhasStatusForcado: 0,
  };

  for (let i = 0; i < fontes.length; i++) {
    const item = fontes[i] || {};
    const r = item.resultado || {};

    const fonte = {
      nomeAba: item.nomeAba || item.nomeAbaReal || '',
      totalLinhas: Number(r.totalLinhas || 0),
      inseridas: Number(r.inseridas || 0),
      atualizadas: Number(r.atualizadas || 0),
      ignoradasVazias: Number(r.ignoradasVazias || 0),
      ignoradasIguais: Number(r.ignoradasIguais || 0),
      linhasStatusForcado: Number(r.linhasStatusForcado || 0),
      statusProcessamentoGravado: r.statusProcessamentoGravado || '',
    };

    resumo.fontes.push(fonte);
    resumo.totalLinhas += fonte.totalLinhas;
    resumo.inseridas += fonte.inseridas;
    resumo.atualizadas += fonte.atualizadas;
    resumo.ignoradasVazias += fonte.ignoradasVazias;
    resumo.ignoradasIguais += fonte.ignoradasIguais;
    resumo.linhasStatusForcado += fonte.linhasStatusForcado;
  }

  return resumo;
}

function mig_montarResumoSync_(resultados) {
  const staging = resultados && resultados.staging ? resultados.staging : [];
  const proc = resultados && resultados.processamento ? resultados.processamento : {};

  const cadastro = proc.cadastroTriagem && proc.cadastroTriagem.body
    ? proc.cadastroTriagem.body.cadastro_oficial || {}
    : {};

  const triagem = proc.cadastroTriagem && proc.cadastroTriagem.body
    ? proc.cadastroTriagem.body.triagem || {}
    : {};

  const encontreirosBody = proc.encontreiros && proc.encontreiros.body
    ? (Array.isArray(proc.encontreiros.body) ? proc.encontreiros.body[0] : proc.encontreiros.body) || {}
    : {};

  const resumo = {
    staging: {
      novasLinhas: 0,
      linhasAtualizadas: 0,
      importadasOuAtualizadas: 0,
      ignoradasIguais: 0,
      ignoradasVazias: 0,
      linhasStatusForcado: 0,
      porFonte: [],
    },
    processamento: {
      rpcsBloqueadas: STAGING_SYNC_PROCESSAR_RPCS !== true,
      cadastroOficial: {
        linhasProcessadas: Number(cadastro.linhas_processadas || 0),
        cadastrosCriadosOuAtualizados: Number(cadastro.cadastros_criados_ou_atualizados || 0),
        inscricoesCriadasOuAtualizadas: Number(cadastro.inscricoes_criadas_ou_atualizadas || 0),
        erros: Number(cadastro.erros || 0),
      },
      triagem: {
        linhasEnviadas: Number(triagem.linhas_enviadas_para_triagem || 0),
        linhasIgnoradasPorCadastroOficial: Number(triagem.linhas_ignoradas_por_cadastro_oficial || 0),
        inscricoesCriadasOuAtualizadas: Number(triagem.inscricoes_criadas_ou_atualizadas || 0),
        erros: Number(triagem.erros || 0),
      },
      encontreiros: {
        linhasProcessadas: Number(encontreirosBody.linhas_processadas || 0),
        encontreirosCriadosOuAtualizados: Number(encontreirosBody.encontreiros_criados_ou_atualizados || 0),
        erros: Number(encontreirosBody.erros || 0),
      },
    },
  };

  for (let i = 0; i < staging.length; i++) {
    const item = staging[i] || {};
    const r = item.resultado || {};

    const porFonte = {
      nomeAba: item.nomeAbaReal || item.nomeAbaSolicitada || '',
      novasLinhas: Number(r.inseridas || 0),
      linhasAtualizadas: Number(r.atualizadas || 0),
      importadasOuAtualizadas: Number(r.importadasOuAtualizadas || 0),
      ignoradasIguais: Number(r.ignoradasIguais || 0),
      ignoradasVazias: Number(r.ignoradasVazias || 0),
      linhasStatusForcado: Number(r.linhasStatusForcado || 0),
    };

    resumo.staging.porFonte.push(porFonte);
    resumo.staging.novasLinhas += porFonte.novasLinhas;
    resumo.staging.linhasAtualizadas += porFonte.linhasAtualizadas;
    resumo.staging.importadasOuAtualizadas += porFonte.importadasOuAtualizadas;
    resumo.staging.ignoradasIguais += porFonte.ignoradasIguais;
    resumo.staging.ignoradasVazias += porFonte.ignoradasVazias;
    resumo.staging.linhasStatusForcado += porFonte.linhasStatusForcado;
  }

  return resumo;
}

function mig_notificarConclusao_(resultados) {
  const resumo = mig_montarMensagemResumo_(resultados);
  const mensagem = 'Sync finalizado.\n\n' + resumo;

  try {
    SpreadsheetApp.getUi().alert(mensagem);
  } catch (e) {
    Logger.log(mensagem);
    Logger.log(JSON.stringify({
      aviso: 'UI indisponível; execução provavelmente via gatilho.',
      erroUi: String(e && e.message ? e.message : e),
      resumo: resultados && resultados.resumo ? resultados.resumo : null,
    }, null, 2));
  }
}

function mig_montarMensagemResumo_(resultados) {
  const resumo = resultados && resultados.resumo
    ? resultados.resumo
    : mig_montarResumoSync_(resultados);

  const linhas = [];

  const novas = Number(resumo.staging.novasLinhas || 0);
  const atualizadas = Number(resumo.staging.linhasAtualizadas || 0);
  const iguais = Number(resumo.staging.ignoradasIguais || 0);
  const vazias = Number(resumo.staging.ignoradasVazias || 0);
  const statusForcado = Number(resumo.staging.linhasStatusForcado || 0);

  const procCadastro = resumo.processamento.cadastroOficial || {};
  const procTriagem = resumo.processamento.triagem || {};
  const procEncontreiros = resumo.processamento.encontreiros || {};

  const totalErros =
    Number(procCadastro.erros || 0) +
    Number(procTriagem.erros || 0) +
    Number(procEncontreiros.erros || 0);

  linhas.push(
    'Novas: ' + novas +
    ' | Atualizadas: ' + atualizadas +
    ' | Iguais: ' + iguais +
    ' | Vazias: ' + vazias +
    ' | Status forçado: ' + statusForcado +
    ' | Erros: ' + totalErros
  );

  if (resumo.processamento.rpcsBloqueadas) {
    linhas.push('RPCs bloqueadas: SIM. A base final não foi processada por este sync.');
  } else {
    linhas.push('RPCs bloqueadas: NÃO. Processamento da base final liberado.');
  }

  if (novas > 0 || atualizadas > 0 || statusForcado > 0 || totalErros > 0) {
    linhas.push(
      'Cadastro: ' + Number(procCadastro.cadastrosCriadosOuAtualizados || 0) +
      ' | Triagem: ' + Number(procTriagem.linhasEnviadas || 0) +
      ' | Encontreiros: ' + Number(procEncontreiros.encontreirosCriadosOuAtualizados || 0)
    );
  }

  return linhas.join('\n');
}