/**
 * MOTOR DE OPERAÇÕES EAC - V13.9.6 (CALENDAR FIX)
 * Versão com correção na edição de eventos e implementação de exclusão na agenda e inclusao de envio de email para nao inscrito
 * Novas ações criadas para controle de chamado e disparo
 */

const DEBUG_BUILD = "2026-03-03 15:10 BR"; // mude o texto sempre que publicar nova versão

const SPREADSHEET_ID_COMUNICADOS = '1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8';
const SPREADSHEET_ID_CADASTRO = '13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk';
const SPREADSHEET_ID_CALENDARIO = '1IXyy-Ozpst82DNwtypaDHUpEH4P5MfPEsnMOjw3wM9c';
const SPREADSHEET_ID_USUARIOS = '1FNp5DRTCJlxkreEtB6TvmyclZ98JL3FDnhGMmErWjyg';
const SPREADSHEET_ID_INSCRICOES = '1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg';
const SPREADSHEET_ID_PRESENCA = '1ldHCdVQiOV8EU3aN9wTiqj6rje34tZpSvB1O-09HG0E';
const PRESENCA_SHEET_GID = 1748935276;
const SPREADSHEET_ID_ENCONTREIROS = '1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4';
const ENCONTREIROS_SHEET_GID = 215132863;
const MEMBER_SEARCH_MAX_LIMIT = 30;
const MEMBER_SEARCH_DEFAULT_LIMIT = 30;

const LOGO_URL = "https://i.imgur.com/c5XQ7TW.png"; 
const INSTAGRAM_URL = "https://www.instagram.com/eacporciunculadesantana/";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    status: "ONLINE",
    version: "13.9.6",
    debugBuild: DEBUG_BUILD
  }))
    .setMimeType(ContentService.MimeType.JSON);
}


function normalizeHeader(value) {
  const s = String(value || '').trim().toLowerCase();
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizePhone(tel) {
  if (!tel) return "";
  let s = String(tel).replace(/\D/g, "");
  if (s.length === 10 || s.length === 11) s = "55" + s;
  return s;
}

const USER_REQUIRED_HEADERS = [
  "Usuario",
  "Senha",
  "Perfil",
  "Inclusao",
  "Alteracao",
  "Visualizacao",
  "Exclusao",
  "Status",
  "Disparo",
  "Calendario",
  "Comunicado",
  "Log",
  "Usuario_mod",
  "Ajuste",
  "Ajuda",
  "Cadastro",
  "Encontreiro",
  "Encontreiro_Inclusao",
  "Encontreiro_Alteracao",
  "Encontreiro_Visualizacao",
  "Encontreiro_Exclusao",
  "Prioritarios",
  "Circulos",
  "Presenca"
];

function ensureUserHeaders(sheet) {
  const required = USER_REQUIRED_HEADERS.slice();
  const lastCol = Math.max(sheet.getLastColumn(), required.length);
  const hasRows = sheet.getLastRow() > 0;

  if (!hasRows) {
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    return required;
  }

  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;

  for (let i = 0; i < required.length; i++) {
    if (!String(current[i] || "").trim()) {
      current[i] = required[i];
      changed = true;
    }
  }

  if (current.length < required.length) {
    for (let i = current.length; i < required.length; i++) {
      current[i] = required[i];
    }
    changed = true;
  }

  if (changed) {
    sheet.getRange(1, 1, 1, current.length).setValues([current]);
  }
  return current;
}

function getUserIndexes(headers) {
  return {
    usuario: getColIndex(headers, "Usuario", 0),
    senha: getColIndex(headers, "Senha", 1),
    perfil: getColIndex(headers, "Perfil", 2),
    inclusao: getColIndex(headers, "Inclusao", 3),
    alteracao: getColIndex(headers, "Alteracao", 4),
    visualizacao: getColIndex(headers, "Visualizacao", 5),
    exclusao: getColIndex(headers, "Exclusao", 6),
    status: getColIndex(headers, "Status", 7),
    disparo: getColIndex(headers, "Disparo", 8),
    calendario: getColIndex(headers, "Calendario", 9),
    comunicado: getColIndex(headers, "Comunicado", 10),
    log: getColIndex(headers, "Log", 11),
    usuario_mod: getColIndex(headers, "Usuario_mod", 12),
    ajuste: getColIndex(headers, "Ajuste", 13),
    ajuda: getColIndex(headers, "Ajuda", 14),
    cadastro: getColIndex(headers, "Cadastro", 15),
    encontreiro: getColIndex(headers, "Encontreiro", 16),
    encontreiro_inclusao: getColIndex(headers, "Encontreiro_Inclusao", 17),
    encontreiro_alteracao: getColIndex(headers, "Encontreiro_Alteracao", 18),
    encontreiro_visualizacao: getColIndex(headers, "Encontreiro_Visualizacao", 19),
    encontreiro_exclusao: getColIndex(headers, "Encontreiro_Exclusao", 20),
    prioritarios: getColIndex(headers, "Prioritarios", 21),
    circulos: getColIndex(headers, "Circulos", 22),
    presenca: getColIndex(headers, "Presenca", 23)
  };
}

function readSimNao(row, index, fallback) {
  const val = String(row[index] || "").trim();
  if (!val) return fallback || "Não";
  return val;
}

function mapCadastroMemberRow(r) {
  return {
    timestamp: r[0], nome: r[1], nascimento: r[2], sexo: r[3], endereco: r[4], bairro: r[5],
    telefone: r[6], email: r[7], responsavelNome: r[8], responsavelTel: r[9], responsavelEmail: r[10],
    tempoParoquia: r[11], participaGrupo: r[12], motivacao: r[13], expectativas: r[14],
    autorizaImagem: r[15], concordaNormas: r[16], idade: r[17], pertencePorciuncula: r[18],
    statusAniv: r[19], whatsapp: r[20], anivSimNao: r[21], statusEnvioCom: r[22], statusEnvioSem: r[23]
  };
}

function getCadastroMembers(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  return data.slice(1)
    .map(mapCadastroMemberRow)
    .filter(m => String(m.nome || "").trim());
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeSearchText(value) {
  return normalizeHeader(value || "");
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseMemberAgeNumber(value) {
  const raw = String(value || "").replace(",", ".").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function getMemberAgeForSearch(member) {
  const direct = parseMemberAgeNumber(member && member.idade);
  if (direct !== null) return direct;

  const birth = parseDateAny(member && member.nascimento);
  if (!birth) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function matchesMemberAgeRange(age, faixa) {
  const range = String(faixa || "").trim().toLowerCase();
  if (!range) return true;
  if (age === null || age === undefined) return false;

  if (range === "0_11" || range === "0-11" || range === "0a11" || range === "crianca") {
    return age >= 0 && age <= 11;
  }
  if (range === "12_16" || range === "12-16" || range === "12a16" || range === "adolescente") {
    return age >= 12 && age <= 16;
  }
  if (range === "17_plus" || range === "17+" || range === "17plus" || range === "17_mais" || range === "jovem") {
    return age >= 17;
  }
  return true;
}

function applyMemberSearch(members, payload) {
  const source = Array.isArray(members) ? members : [];
  const p = payload || {};

  const query = normalizeSearchText(p.query || p.search || p.term || p.q || "");
  const nome = normalizeSearchText(p.nome || "");
  const email = normalizeSearchText(p.email || "");
  const bairro = normalizeSearchText(p.bairro || "");
  const sexo = normalizeSearchText(p.sexo || "");
  const pertencePorciuncula = normalizeSearchText(p.pertencePorciuncula || "");
  const faixaEtaria = String(p.faixaEtaria || p.ageRange || p.faixa_idade || "").trim().toLowerCase();
  const telefoneDigits = normalizeDigits(p.telefone || p.whatsapp || "");

  const filtered = source.filter(function (m) {
    const nomeVal = normalizeSearchText(m.nome);
    const emailVal = normalizeSearchText(m.email);
    const bairroVal = normalizeSearchText(m.bairro);
    const sexoVal = normalizeSearchText(m.sexo);
    const pertenceVal = normalizeSearchText(m.pertencePorciuncula);
    const telefoneVal = normalizeDigits(m.telefone);
    const whatsappVal = normalizeDigits(m.whatsapp);

    if (query) {
      const haystack = [
        nomeVal,
        emailVal,
        bairroVal,
        normalizeSearchText(m.endereco),
        normalizeSearchText(m.telefone),
        normalizeSearchText(m.whatsapp)
      ].join(" ");
      if (haystack.indexOf(query) === -1) return false;
    }

    if (nome && nomeVal.indexOf(nome) === -1) return false;
    if (email && emailVal.indexOf(email) === -1) return false;
    if (bairro && bairroVal.indexOf(bairro) === -1) return false;
    if (sexo && sexoVal !== sexo) return false;
    if (pertencePorciuncula && pertenceVal !== pertencePorciuncula) return false;
    if (!matchesMemberAgeRange(getMemberAgeForSearch(m), faixaEtaria)) return false;

    if (telefoneDigits) {
      const joinedDigits = telefoneVal + " " + whatsappVal;
      if (joinedDigits.indexOf(telefoneDigits) === -1) return false;
    }

    return true;
  });

  const sortBy = String(p.sortBy || p.orderBy || "nome").trim();
  const sortDir = String(p.sortDir || p.direction || "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
  const mult = sortDir === "desc" ? -1 : 1;

  filtered.sort(function (a, b) {
    const av = normalizeSearchText(a[sortBy] || "");
    const bv = normalizeSearchText(b[sortBy] || "");
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });

  const requestedLimit = parsePositiveInt(p.limit || p.pageSize, MEMBER_SEARCH_DEFAULT_LIMIT);
  const limit = Math.min(MEMBER_SEARCH_MAX_LIMIT, Math.max(1, requestedLimit || MEMBER_SEARCH_DEFAULT_LIMIT));

  const requestedPage = parsePositiveInt(p.page, 1);
  const requestedOffset = parseNonNegativeInt(p.offset, -1);
  const offset = requestedOffset >= 0 ? requestedOffset : (requestedPage - 1) * limit;

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(totalPages, Math.floor(offset / limit) + 1);

  return {
    items: items,
    total: total,
    pagination: {
      page: page,
      limit: limit,
      offset: offset,
      totalPages: totalPages,
      hasNext: (offset + limit) < total,
      hasPrev: offset > 0,
      returned: items.length
    },
    filters: {
      query: p.query || p.search || p.term || p.q || "",
      nome: p.nome || "",
      email: p.email || "",
      bairro: p.bairro || "",
      sexo: p.sexo || "",
      faixaEtaria: p.faixaEtaria || p.ageRange || "",
      telefone: p.telefone || p.whatsapp || "",
      pertencePorciuncula: p.pertencePorciuncula || ""
    }
  };
}

function handleSearchMembers(payload) {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
  const sheet = getSheetResiliente(db, 'Cadastro Oficial');
  const members = getCadastroMembers(sheet);
  const result = applyMemberSearch(members, payload || {});

  return responder(true, {
    items: result.items,
    members: result.items,
    total: result.total,
    pagination: result.pagination,
    filters: result.filters
  });
}

function assertTest_(condition, message) {
  if (!condition) throw new Error(message);
}

function testMemberSearchBasics_() {
  const sample = [
    { nome: "Ana Clara", email: "ana@teste.com", bairro: "Centro", telefone: "21999990000", whatsapp: "21999990000", sexo: "Feminino", pertencePorciuncula: "Sim", endereco: "Rua A", idade: 14 },
    { nome: "Bruno", email: "bruno@teste.com", bairro: "Icarai", telefone: "21988887777", whatsapp: "21988887777", sexo: "Masculino", pertencePorciuncula: "Não", endereco: "Rua B", idade: 10 },
    { nome: "Carla", email: "carla@teste.com", bairro: "Centro", telefone: "21977776666", whatsapp: "21977776666", sexo: "Feminino", pertencePorciuncula: "Sim", endereco: "Rua C", idade: 18 }
  ];

  const byQuery = applyMemberSearch(sample, { query: "ana", limit: 30, page: 1 });
  assertTest_(byQuery.total === 1, "Falha no filtro por query.");
  assertTest_(byQuery.items.length === 1, "Falha no retorno de itens por query.");

  const byBairro = applyMemberSearch(sample, { bairro: "centro", limit: 30, page: 1 });
  assertTest_(byBairro.total === 2, "Falha no filtro por bairro.");

  const paged = applyMemberSearch(sample, { limit: 1, page: 2, sortBy: "nome", sortDir: "asc" });
  assertTest_(paged.pagination.limit === 1, "Falha na paginação: limit.");
  assertTest_(paged.pagination.page === 2, "Falha na paginação: page.");
  assertTest_(paged.total === 3, "Falha no cálculo de total.");
  assertTest_(paged.items.length === 1, "Falha no slice paginado.");

  const byAgeRange = applyMemberSearch(sample, { faixaEtaria: "12_16", limit: 30, page: 1 });
  assertTest_(byAgeRange.total === 1, "Falha no filtro por faixa etária.");
  assertTest_(String(byAgeRange.items[0].nome || "") === "Ana Clara", "Falha no retorno por faixa etária.");

  return {
    ok: true,
    message: "Testes básicos de SEARCH_MEMBERS concluídos com sucesso.",
    cases: 4
  };
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error("Requisição vazia");
    
    const body = JSON.parse(e.postData.contents);
    const { action, payload, data } = body;
    const finalPayload = payload || data || {};

    // --- NOVAS ACTIONS DE CONFIRMAÇÃO DE INTERESSE ---
    if (action === "EXECUTE_INTEREST_CONFIRMATION") {
      return handleExecuteInterestConfirmation(finalPayload);
    }
    
    if (action === "SUBMIT_INTEREST_ANSWERS") {
      return handleSubmitInterestAnswers(finalPayload);
    }

    if (action === "SEND_NON_ENROLLED_EMAIL") {
      return handleSendNonEnrolledEmail(finalPayload);
    }

    if (action === "UPDATE_NON_ENROLLED_INTEREST") {
      return handleUpdateNonEnrolledInterest(finalPayload);
    }

    if (action === "UPDATE_NON_ENROLLED_RECADO") {
      return handleUpdateNonEnrolledRecado(finalPayload);
    }

    if (action === "UPDATE_NON_ENROLLED_RECORD") {
      return handleUpdateNonEnrolledRecord(finalPayload);
    }

    if (action === "PRIORITIZE_NON_ENROLLED") {
      return handlePrioritizeNonEnrolled(finalPayload);
    }

    if (action === "ATUALIZAR_NAO_INSCRITOS") {
      const result = atualizarNaoInscritosIncremental();
      return responder(true, {
        message: `Atualização incremental concluída. Lidas: ${result.lidas}. Inseridos: ${result.inseridos}.`,
        ...result
      });
    }

    if (action === "ATUALIZAR_NAO_INSCRITOS_FULL") {
      const result = atualizarNaoInscritosFull();
      return responder(true, {
        message: `Atualização completa concluída. Lidas: ${result.lidas}. Inseridos: ${result.inseridos}.`,
        ...result
      });
    }

    if (action === "GET_INSCRICOES_PRIORITARIAS") {
      const items = listarInscricoesPrioritarias();
      return responder(true, {
        inscricoesPrioritarias: items,
        items: items,
        total: items.length
      });
    }

    if (action === "GET_CIRCULOS_DISTRIBUIDOS") {
      const circulos = listarDistribuicaoCirculos();
      return responder(true, { circulos: circulos });
    }

    if (action === "EXECUTE_DISTRIBUICAO_CIRCULOS") {
      const info = novaDistribuicaoCirculos(finalPayload);
      return responder(true, {
        message: info.message || "Distribuicao de circulos executada com sucesso.",
        info: info
      });
    }

    if (action === "SEND_EMAIL_REPLY") {
      return handleSendEmailReply(finalPayload);
    }

    if (action === "GET_EMAIL_STATUS_SUMMARY") {
      const summary = getEmailStatusSummary();
      return responder(true, { summary });
    }

    if (action === "GET_EMAIL_CALLS_BY_PERSON") {
      const idPessoa = String(finalPayload.idPessoa || finalPayload.id || "").trim();
      const history = getEmailCallsByPerson(idPessoa);
      return responder(true, { history });
    }

    if (action === "GET_ENCONTREIROS") {
      return handleGetEncontreiros();
    }

    if (action === "SAVE_ENCONTREIRO") {
      return handleSaveEncontreiro(finalPayload);
    }

    if (action === "DELETE_ENCONTREIRO") {
      return handleDeleteEncontreiro(finalPayload);
    }

    if (action === "NORMALIZE_ENCONTREIRO_WHATSAPP") {
      return handleNormalizeEncontreiroWhatsapp(finalPayload);
    }

    if (action === "USER_LOGIN") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_USUARIOS);
      const sheet = getSheetResiliente(db, 'Usuario');
      const headers = ensureUserHeaders(sheet);
      const idx = getUserIndexes(headers);
      const data = sheet.getDataRange().getValues();
      const { email, password } = finalPayload;
      const userRow = data.find((row, i) =>
        i > 0 &&
        String(row[idx.usuario]).trim().toLowerCase() === String(email).trim().toLowerCase() &&
        String(row[idx.senha]) === String(password)
      );

      if (userRow) {
        const user = {
          usuario: userRow[idx.usuario],
          perfil: userRow[idx.perfil],
          inclusao: readSimNao(userRow, idx.inclusao, "Não"),
          alteracao: readSimNao(userRow, idx.alteracao, "Não"),
          visualizacao: readSimNao(userRow, idx.visualizacao, "Sim"),
          exclusao: readSimNao(userRow, idx.exclusao, "Não"),
          status: userRow[idx.status],
          disparo: readSimNao(userRow, idx.disparo, "Não"),
          calendario: readSimNao(userRow, idx.calendario, "Não"),
          comunicado: readSimNao(userRow, idx.comunicado, "Não"),
          log: readSimNao(userRow, idx.log, "Não"),
          usuario_mod: readSimNao(userRow, idx.usuario_mod, "Não"),
          ajuste: readSimNao(userRow, idx.ajuste, "Não"),
          ajuda: readSimNao(userRow, idx.ajuda, "Não"),
          cadastro: readSimNao(userRow, idx.cadastro, "Não"),
          encontreiro: readSimNao(userRow, idx.encontreiro, "Não"),
          encontreiro_inclusao: readSimNao(userRow, idx.encontreiro_inclusao, "Não"),
          encontreiro_alteracao: readSimNao(userRow, idx.encontreiro_alteracao, "Não"),
          encontreiro_visualizacao: readSimNao(userRow, idx.encontreiro_visualizacao, "Não"),
          encontreiro_exclusao: readSimNao(userRow, idx.encontreiro_exclusao, "Não"),
          prioritarios: readSimNao(userRow, idx.prioritarios, "Não"),
          circulos: readSimNao(userRow, idx.circulos, "Não"),
          presenca: readSimNao(userRow, idx.presenca, "Não")
        };
        return responder(true, { user });
      } else {
        return responder(false, { error: "Credenciais inválidas." });
      }
    }

    // --- LÓGICA ORIGINAL RESTAURADA ---
    if (action === "CLEAR_DISPATCH_STATUS") {
      const type = finalPayload.type;

      // Reset específico da "Confirmação de Interesse (Fila)" na aba Não Inscritos:
      // só limpa H quando I está em branco e P está em branco.
      if (type === 'confirmacao_interesse_espera') {
        const sheetNao = getNaoInscritosSheet();
        const dataNao = sheetNao.getDataRange().getValues();
        if (!dataNao || dataNao.length < 2) {
          return responder(true, { message: "Planilha sem dados para limpar." });
        }

        const headersNao = dataNao[0];
        const idxStatusEnvio = getColIndex(headersNao, "Status Envio", 7);               // H
        const idxInteresse = getColIndex(headersNao, "Interesse Confirmado", 8);         // I
        const idxPreConfirmacao = getColIndex(headersNao, "Status Pre Confirmacao", 15); // P

        let elegiveis = 0;
        let limpos = 0;

        for (let i = 1; i < dataNao.length; i++) {
          const interesse = String(dataNao[i][idxInteresse] || "").trim();
          const preConfirmacao = String(dataNao[i][idxPreConfirmacao] || "").trim();
          const statusEnvio = String(dataNao[i][idxStatusEnvio] || "").trim();

          const podeResetar = interesse === "" && preConfirmacao === "";
          if (!podeResetar) continue;

          elegiveis++;
          if (statusEnvio) {
            sheetNao.getRange(i + 1, idxStatusEnvio + 1).clearContent();
            limpos++;
          }
        }

        return responder(true, {
          message: `Reset concluído. Registros elegíveis: ${elegiveis}. Status limpos: ${limpos}. Critério: I em branco e P em branco.`
        });
      }

      const dbCad = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
      const sheetCad = getSheetResiliente(dbCad, 'Cadastro Oficial');
      const data = sheetCad.getDataRange().getValues();
      const headers = data[0];
      let colIdx = -1;

      if (type === 'comunicado_99_cadastro') colIdx = getColIndex(headers, "Status envio comunicado", 22);
      else if (type === 'aniversariantes_dia') colIdx = getColIndex(headers, "Status Email Aniversariante", 19);
      else if (type === 'eventos') colIdx = getColIndex(headers, "Status Eventos", 23);

      if (colIdx !== -1) {
        const lastRow = sheetCad.getLastRow();
        if (lastRow > 1) {
          sheetCad.getRange(2, colIdx + 1, lastRow - 1, 1).clearContent();
          return responder(true, { message: "Status limpo. Planilha pronta para novo disparo." });
        }
        return responder(true, { message: "Planilha sem dados para limpar." });
      }
      throw new Error("Mapeamento de coluna não encontrado para este disparo.");
    }

    if (action === "GET_PRESENCE") {
      return handleGetPresence();
    }

    if (action === "MARK_PRESENCE") {
      return handleMarkPresence(finalPayload);
    }

    if (action === "GET_USERS") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_USUARIOS);
      const sheet = getSheetResiliente(db, 'Usuario');
      const headers = ensureUserHeaders(sheet);
      const idx = getUserIndexes(headers);
      const data = sheet.getDataRange().getValues();
      const users = data.slice(1).map(r => ({
        usuario: r[idx.usuario],
        senha: r[idx.senha],
        perfil: r[idx.perfil],
        inclusao: readSimNao(r, idx.inclusao, "Não"),
        alteracao: readSimNao(r, idx.alteracao, "Não"),
        visualizacao: readSimNao(r, idx.visualizacao, "Sim"),
        exclusao: readSimNao(r, idx.exclusao, "Não"),
        status: r[idx.status],
        disparo: readSimNao(r, idx.disparo, "Não"),
        calendario: readSimNao(r, idx.calendario, "Não"),
        comunicado: readSimNao(r, idx.comunicado, "Não"),
        log: readSimNao(r, idx.log, "Não"),
        usuario_mod: readSimNao(r, idx.usuario_mod, "Não"),
        ajuste: readSimNao(r, idx.ajuste, "Não"),
        ajuda: readSimNao(r, idx.ajuda, "Não"),
        cadastro: readSimNao(r, idx.cadastro, "Não"),
        encontreiro: readSimNao(r, idx.encontreiro, "Não"),
        encontreiro_inclusao: readSimNao(r, idx.encontreiro_inclusao, "Não"),
        encontreiro_alteracao: readSimNao(r, idx.encontreiro_alteracao, "Não"),
        encontreiro_visualizacao: readSimNao(r, idx.encontreiro_visualizacao, "Não"),
        encontreiro_exclusao: readSimNao(r, idx.encontreiro_exclusao, "Não"),
        prioritarios: readSimNao(r, idx.prioritarios, "Não"),
        circulos: readSimNao(r, idx.circulos, "Não"),
        presenca: readSimNao(r, idx.presenca, "Não")
      })).filter(u => u.usuario);
      return responder(true, { users });
    }

    if (action === "SAVE_USER") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_USUARIOS);
      const sheet = getSheetResiliente(db, 'Usuario');
      const headers = ensureUserHeaders(sheet);
      const idx = getUserIndexes(headers);
      const data = sheet.getDataRange().getValues();
      const user = finalPayload;
      const lookupValue = String(user.originalEmail || user.usuario).trim().toLowerCase();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idx.usuario]).trim().toLowerCase() === lookupValue) {
          rowIndex = i;
          break;
        }
      }

      const rowLength = Math.max(headers.length, USER_REQUIRED_HEADERS.length);
      const rowData = rowIndex !== -1
        ? (data[rowIndex] || []).slice(0, rowLength)
        : new Array(rowLength).fill("");
      while (rowData.length < rowLength) rowData.push("");

      rowData[idx.usuario] = user.usuario || "";
      rowData[idx.senha] = user.senha || "";
      rowData[idx.perfil] = user.perfil || "Simples";
      rowData[idx.inclusao] = user.inclusao || "Não";
      rowData[idx.alteracao] = user.alteracao || "Não";
      rowData[idx.visualizacao] = user.visualizacao || "Sim";
      rowData[idx.exclusao] = user.exclusao || "Não";
      rowData[idx.status] = user.status || "Ativo";
      rowData[idx.disparo] = user.disparo || "Não";
      rowData[idx.calendario] = user.calendario || "Não";
      rowData[idx.comunicado] = user.comunicado || "Não";
      rowData[idx.log] = user.log || "Não";
      rowData[idx.usuario_mod] = user.usuario_mod || "Não";
      rowData[idx.ajuste] = user.ajuste || "Não";
      rowData[idx.ajuda] = user.ajuda || "Não";
      rowData[idx.cadastro] = user.cadastro || "Não";
      rowData[idx.encontreiro] = user.encontreiro || "Não";
      rowData[idx.encontreiro_inclusao] = user.encontreiro_inclusao || "Não";
      rowData[idx.encontreiro_alteracao] = user.encontreiro_alteracao || "Não";
      rowData[idx.encontreiro_visualizacao] = user.encontreiro_visualizacao || "Não";
      rowData[idx.encontreiro_exclusao] = user.encontreiro_exclusao || "Não";
      rowData[idx.prioritarios] = user.prioritarios || "Não";
      rowData[idx.circulos] = user.circulos || "Não";
      rowData[idx.presenca] = user.presenca || "Não";

      if (rowIndex !== -1) {
        sheet.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
        return responder(true, { message: "Usuário atualizado com sucesso." });
      } else {
        sheet.appendRow(rowData);
        return responder(true, { message: "Novo usuário criado com sucesso." });
      }
    }

    if (action === "DELETE_USER") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_USUARIOS);
      const sheet = getSheetResiliente(db, 'Usuario');
      const headers = ensureUserHeaders(sheet);
      const idx = getUserIndexes(headers);
      const data = sheet.getDataRange().getValues();
      const rowIndex = data.findIndex((r, i) =>
        i > 0 && String(r[idx.usuario]).trim().toLowerCase() === String(finalPayload.usuario).trim().toLowerCase()
      );
      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex + 1);
        return responder(true, { message: "Removido." });
      } else throw new Error("Usuário não encontrado.");
    }

    
    if (action === "GET_NON_ENROLLED") {
      const dbOficial    = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
      const dbInscricoes = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);

      const sheetOficial = getSheetResiliente(dbOficial, 'Cadastro Oficial');

      // Nome oficial da aba na planilha de inscrições (pode variar com acento)
      const sheetNao = (function() {
        const candidates = ['não inscritos', 'nao inscritos', 'Não inscritos', 'Nao inscritos', 'NÃO INSCRITOS', 'NAO INSCRITOS'];
        for (var i = 0; i < candidates.length; i++) {
          const sh = dbInscricoes.getSheetByName(candidates[i]);
          if (sh) return sh;
        }
        // fallback para o resiliente (se existir na sua lib)
        try { return getSheetResiliente(dbInscricoes, 'não inscritos'); } catch (e) {}
        throw new Error("Aba 'não inscritos' não encontrada na planilha de inscrições.");
      })();

      const dataOficial = sheetOficial.getDataRange().getValues();
      const dataNao     = sheetNao.getDataRange().getValues();

      if (!dataNao || dataNao.length < 2) {
        return responder(true, {
          nonEnrolled: [],
          stats: [],
          kpis: { interesseSim: 0, jaFezEacSim: 0, contatoMudouSim: 0 },
          interestStats: { sim: 0, nao: 0, vazio: 0 },
          jaFezStats: { sim: 0, nao: 0, vazio: 0 },
          contatoMudouStats: { sim: 0, nao: 0, vazio: 0 },
          statusEnvioBlankCount: 0,
          preConfirmadasCount: 0
        });
      }

      // Conjunto oficial (para saber quem já está cadastrado)
      // Mantive r[6] como telefone no "Cadastro Oficial" para não quebrar o que já funciona no projeto.
      const phonesOficial = new Set(
        dataOficial.slice(1).map(r => normalizePhone(r[6])).filter(Boolean)
      );

      // --- Resolve índices por cabeçalho (mais seguro do que fixar A..P)
      const header = dataNao[0] || [];
      const idxByName = {};
      for (let c = 0; c < header.length; c++) {
        const key = normalizeHeader(header[c]);
        if (key) idxByName[key] = c;
      }

      function pickIdx(possibleNames, fallbackIdx) {
        const normalizedCandidates = (possibleNames || [])
          .map(function (name) { return normalizeHeader(name); })
          .filter(function (name) { return !!name; });

        // 1) match exato
        for (let i = 0; i < normalizedCandidates.length; i++) {
          const key = normalizedCandidates[i];
          if (key in idxByName) return idxByName[key];
        }

        // 2) match aproximado (quando o header tem complemento, ex: "(dd/mm/aaaa)")
        let bestIndex = -1;
        let bestDelta = 999999;
        for (let c = 0; c < header.length; c++) {
          const headerKey = normalizeHeader(header[c]);
          if (!headerKey) continue;
          for (let i = 0; i < normalizedCandidates.length; i++) {
            const target = normalizedCandidates[i];
            const isMatch = headerKey.indexOf(target) !== -1 || target.indexOf(headerKey) !== -1;
            if (!isMatch) continue;
            const delta = Math.abs(headerKey.length - target.length);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestIndex = c;
            }
          }
        }
        if (bestIndex !== -1) return bestIndex;

        return (typeof fallbackIdx === "number") ? fallbackIdx : -1;
      }

      // Base (A..H)
      const IDX = {
        linhaOrigem: pickIdx(['linha origem', 'linha_origem', 'origem'], 0),
        nome:        pickIdx(['nome', 'nome completo'], 1),
        nascimento:  pickIdx([
          'nascimento',
          'data de nascimento',
          'data nascimento',
          'nascimento (dd/mm/aaaa)',
          'data de nasc',
          'dt nascimento'
        ], -1),
        email:       pickIdx(['e-mail', 'email'], 2),
        status:      pickIdx(['status'], 3),
        dataCadastro:pickIdx(['data cadastro', 'data de cadastro'], 4),
        telefone:    pickIdx(['telefone', 'whatsapp', 'celular'], 5),
        bairro:      pickIdx(['bairro'], 6),
        statusEnvio: pickIdx(['status envio', 'status de envio'], 7),

        // Respostas (I..P)
        interesse:   pickIdx(['interesse confirmado', 'interesse', 'interesse c'], 8),
        jaFez:       pickIdx(['já fez o eac', 'ja fez o eac', 'ja fez eac'], 9),
        contatoMudou:pickIdx(['contato mudou', 'contato mu', 'mudou contato'], 10),
        recado:      pickIdx(['recado'], 11),
        dataResposta:pickIdx(['data resposta', 'data respo', 'data resp'], 12),
        amigo:       pickIdx(['amigo para', 'amigo'], 13),
        nomeAmigo:   pickIdx(['nome do amigo', 'nome amigo'], 14),
        preConfirmacao: pickIdx([
          'status pre confirmacao',
          'status pré confirmação',
          'status pré confirmacao',
          'status pre confirmação',
          'status de envio de confirmacao',
          'status de envio de confirmação',
          'pre confirmacao',
          'pré confirmação',
          'pre confirmada',
          'pre confirmado'
        ], 15),
        statusPriorizacao: pickIdx([
          'status priorizacao',
          'status priorização',
          'priorizacao',
          'priorização'
        ], 16),
        sexo: pickIdx(['sexo', 'genero', 'gênero'], 18) // S
      };

      // Helpers de contagem "sim/não/vazio"
      function bump(statsObj, rawValue) {
        const v = String(rawValue || '').trim().toLowerCase();
        if (v === 'sim') statsObj.sim++;
        else if (v === 'não' || v === 'nao') statsObj.nao++;
        else statsObj.vazio++;
      }

      const nonEnrolled = [];
      const bairroStats = {};
      const interestStats = { sim: 0, nao: 0, vazio: 0 };
      const jaFezStats = { sim: 0, nao: 0, vazio: 0 };
      const contatoMudouStats = { sim: 0, nao: 0, vazio: 0 };
      let statusEnvioBlankCount = 0;
      let preConfirmadasCount = 0;

      // Regra do indicador:
      // conta somente quando I = "SIM" e P preenchida.
      for (let i = 1; i < dataNao.length; i++) {
        const row = dataNao[i] || [];
        const interesseNormalizado = String(row[IDX.interesse] || "")
          .replace(/\u00A0/g, " ")
          .trim()
          .toUpperCase();
        const envioNormalizado = String(row[IDX.preConfirmacao] || "")
          .replace(/\u00A0/g, " ")
          .trim();
        if (interesseNormalizado === "SIM" && envioNormalizado !== "") {
          preConfirmadasCount++;
        }
      }

      for (let i = 1; i < dataNao.length; i++) {
        const r = dataNao[i] || [];

        const telKey = normalizePhone(r[IDX.telefone]);
        if (!telKey) continue;

        // Se já existe no cadastro oficial, não entra como "não inscrito"
        if (phonesOficial.has(telKey)) continue;

        const bairro = String(r[IDX.bairro] || "Não Informado").trim();

        // conta KPIs com base nas colunas I/J/K da aba "não inscritos"
        bump(interestStats, r[IDX.interesse]);
        bump(jaFezStats, r[IDX.jaFez]);
        bump(contatoMudouStats, r[IDX.contatoMudou]);

        nonEnrolled.push({
          // dados base
          linhaOrigem: r[IDX.linhaOrigem] || "",
          nome: r[IDX.nome] || "",
          nascimento: IDX.nascimento >= 0 ? (r[IDX.nascimento] || "") : "",
          dataNascimento: IDX.nascimento >= 0 ? (r[IDX.nascimento] || "") : "",
          email: r[IDX.email] || "",
          status: r[IDX.status] || "",
          dataCadastro: r[IDX.dataCadastro] || "",
          telefone: r[IDX.telefone] || "",
          bairro: bairro,
          sexo: r[IDX.sexo] || "",
          statusEnvio: r[IDX.statusEnvio] || "",

          // respostas I..P
          interesseConfirmado: r[IDX.interesse] || "",
          jaFezEac: r[IDX.jaFez] || "",
          contatoMudou: r[IDX.contatoMudou] || "",
          recado: r[IDX.recado] || "",
          dataResposta: r[IDX.dataResposta] || "",
          amigo: r[IDX.amigo] || "",
          nomeAmigo: r[IDX.nomeAmigo] || "",
          statusPreConfirmacao: r[IDX.preConfirmacao] || "",
          statusPriorizacao: r[IDX.statusPriorizacao] || ""
        });

        bairroStats[bairro] = (bairroStats[bairro] || 0) + 1;
        if (!String(r[IDX.statusEnvio] || "").trim()) {
          statusEnvioBlankCount++;
        }
      }

      const stats = Object.keys(bairroStats)
        .map(b => ({ nome: b, total: bairroStats[b] }))
        .sort((a, b) => b.total - a.total);

      const kpis = {
        interesseSim: interestStats.sim,
        jaFezEacSim: jaFezStats.sim,
        contatoMudouSim: contatoMudouStats.sim
      };

      return responder(true, {
        nonEnrolled,
        stats,
        kpis,
        interestStats,
        jaFezStats,
        contatoMudouStats,
        statusEnvioBlankCount,
        preConfirmadasCount
      });
    }
if (action === "GET_MEMBERS") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
      const sheet = getSheetResiliente(db, 'Cadastro Oficial');
      const members = getCadastroMembers(sheet);
      return responder(true, { members });
    }

    if (action === "SEARCH_MEMBERS") {
      return handleSearchMembers(finalPayload);
    }

    if (action === "RUN_MEMBER_SEARCH_TESTS") {
      return responder(true, testMemberSearchBasics_());
    }

    if (action === "SAVE_MEMBER") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
      const sheet = getSheetResiliente(db, 'Cadastro Oficial');
      const data = sheet.getDataRange().getValues();
      const m = finalPayload;
      const lookupEmail = String(m.originalEmail || m.email).trim().toLowerCase();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][7]).trim().toLowerCase() === lookupEmail) {
          rowIndex = i;
          break;
        }
      }
      const rowValues = [
        m.timestamp || new Date(), m.nome || "", m.nascimento || "", m.sexo || "", m.endereco || "", m.bairro || "",
        m.telefone || "", m.email || "", m.responsavelNome || "", m.responsavelTel || "", m.responsavelEmail || "",
        m.tempoParoquia || "", m.participaGrupo || "", m.motivacao || "", m.expectativas || "",
        m.autorizaImagem || "", m.concordaNormas || "", m.idade || "", m.pertencePorciuncula || "",
        m.statusAniv || "", m.whatsapp || m.telefone || "", m.anivSimNao || "Nao", m.statusEnvioCom || "", m.statusEnvioSem || ""
      ];
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex + 1, 1, 1, 24).setValues([rowValues]);
        return responder(true, { message: "Cadastro oficial atualizado com sucesso." });
      } else {
        sheet.appendRow(rowValues);
        return responder(true, { message: "Adolescente incluído com sucesso." });
      }
    }

    if (action === "DELETE_MEMBER") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
      const sheet = getSheetResiliente(db, 'Cadastro Oficial');
      const data = sheet.getDataRange().getValues();
      const rowIndex = data.findIndex((r, i) => i > 0 && String(r[7]).trim().toLowerCase() === String(finalPayload.email).trim().toLowerCase());
      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex + 1);
        return responder(true, { message: "Removido." });
      } else throw new Error("Membro não encontrado.");
    }

    if (action === "GET_EVENTS") {
      const dbCal = SpreadsheetApp.openById(SPREADSHEET_ID_CALENDARIO);
      const sheetCal = getSheetResiliente(dbCal, 'Calendario');
      const data = sheetCal.getDataRange().getValues();
      const events = data.slice(1).map((r, idx) => {
        let inicioStr = r[2] instanceof Date ? Utilities.formatDate(r[2], "GMT-3", "yyyy-MM-dd'T'HH:mm:ss") : String(r[2] || "");
        let terminoStr = r[3] instanceof Date ? Utilities.formatDate(r[3], "GMT-3", "yyyy-MM-dd'T'HH:mm:ss") : String(r[3] || "");
        return { id: "ev-" + idx, atividade: r[0], tipo: r[1], inicio: inicioStr, termino: terminoStr, local: r[4], proprietario: r[5], status: r[6] };
      }).filter(ev => ev.atividade);
      return responder(true, { events });
    }
    
    if (action === "SAVE_EVENT") {
      const dbCal = SpreadsheetApp.openById(SPREADSHEET_ID_CALENDARIO);
      const sheetCal = getSheetResiliente(dbCal, 'Calendario');
      const ev = finalPayload;
      const dataRows = sheetCal.getDataRange().getValues();
      const rowValues = [ev.atividade, ev.tipo, ev.inicio, ev.termino, ev.local, ev.proprietario, ev.status];
      
      let rowIndex = -1;
      if (ev.id && String(ev.id).startsWith("ev-")) {
        rowIndex = parseInt(String(ev.id).replace("ev-", ""), 10) + 1;
      }

      if (rowIndex > 0 && rowIndex < dataRows.length) {
        sheetCal.getRange(rowIndex + 1, 1, 1, 7).setValues([rowValues]);
        return responder(true, { message: "Evento atualizado com sucesso." });
      } else {
        sheetCal.appendRow(rowValues);
        return responder(true, { message: "Evento registrado com sucesso." });
      }
    }

    if (action === "DELETE_EVENT") {
      const dbCal = SpreadsheetApp.openById(SPREADSHEET_ID_CALENDARIO);
      const sheetCal = getSheetResiliente(dbCal, 'Calendario');
      const ev = finalPayload;
      if (ev.id && String(ev.id).startsWith("ev-")) {
        const rowIndex = parseInt(String(ev.id).replace("ev-", ""), 10) + 1;
        sheetCal.deleteRow(rowIndex + 1);
        return responder(true, { message: "Evento removido da agenda." });
      }
      throw new Error("ID de evento inválido para exclusão.");
    }

    if (action === "GET_COMUNICADOS") {
      const data = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS).getSheetByName('Comunicados').getDataRange().getValues();
      const comunicados = data.slice(1).map(r => ({
        id: String(r[0]), titulo: r[1], assunto: r[2], corpo: r[3], status: r[4]
      })).filter(c => c.id);
      return responder(true, { comunicados });
    }

    if (action === "DELETE_COMUNICADO") {
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS).getSheetByName('Comunicados');
      const data = sheet.getDataRange().getValues();
      const idTarget = String(finalPayload.id || "").trim();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === idTarget) {
          sheet.deleteRow(i + 1);
          return responder(true, { message: "Comunicado #" + idTarget + " removido." });
        }
      }
      throw new Error("Comunicado #" + idTarget + " não encontrado.");
    }

    if (action === "SAVE_COMUNICADO") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS);
      const sheet = getSheetResiliente(db, 'Comunicados');
      const allData = sheet.getDataRange().getValues();
      const rowValues = [finalPayload.id, finalPayload.titulo, finalPayload.assunto, finalPayload.corpo, finalPayload.status, finalPayload.dataAgendada, finalPayload.dataEventos];
      const rowIndex = allData.findIndex((r, i) => i > 0 && String(r[0]).trim() === String(finalPayload.id).trim());
      if (rowIndex !== -1) sheet.getRange(rowIndex + 1, 1, 1, 7).setValues([rowValues]);
      else sheet.appendRow(rowValues);
      return responder(true, { message: "Salvo com sucesso." });
    }

    if (action === "GET_LOGS") {
      const db = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS);
      const sheet = getSheetResiliente(db, 'Logs');
      const data = sheet.getDataRange().getValues();
      const logs = data.slice(1).map((r, i) => ({
        id: "log-" + i, dispatchId: String(r[0]), dispatchName: String(r[1]), operator: String(r[2]), 
        timestamp: r[3], duration: r[4], status: r[5], responseSummary: r[6]
      })).reverse().slice(0, 50);
      return responder(true, { logs });
    }

    if (action === "EXECUTE_COMUNICADO_99") {
      const info = enviarComunicado99();
      const status = info.count > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d5", "Comunicado 99", "Operador EAC", info.message, status);
      return responder(true, { message: info.message, count: info.count });
    } 
    else if (action === "EXECUTE_ANIVERSARIANTES") {
      const info = enviarAniversariantes();
      const status = info.count > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d6", "Aniversariantes", "Operador EAC", info.message, status);
      return responder(true, { message: info.message, count: info.count });
    }
    else if (action === "EXECUTE_EMERGENCIA_NOV2025") {
      const info = enviarEmergenciaNov2025(finalPayload);
      const status = info.count > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d9", "Emergência por Período de Cadastro", "Operador EAC", info.message, status);
      return responder(true, { message: info.message, count: info.count });
    }
    else if (action === "EXECUTE_EVENTOS") {
      const info = enviarEventosSemana();
      const status = info.count > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d3", "Agenda da Semana", "Operador EAC", info.message, status);
      return responder(true, { message: info.message, count: info.count });
    }
    else if (action === "EXECUTE_WAITLIST_NON_ENROLLED") {
      const info = enviarComunicadoEspera();
      const status = info.count > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d4", "Fila de Espera", "Operador EAC", info.message, status);
      return responder(true, { message: info.message, count: info.count });
    }
    else if (action === "EXECUTE_CONFIRM_NAO_INSCRITOS") {
      const info = enviarConfirmacaoNaoInscritos();
      const status = info.enviados > 0 ? "SUCCESS" : "NO_DATA";
      registrarLog("d8", "Confirmação Não Inscritos", "Operador EAC", JSON.stringify(info), status);
      return responder(true, { info, message: `Disparo concluído. Enviados: ${info.enviados}, Processados: ${info.processados}, Ignorados: ${info.ignorados}.` });
    }

    // Se nenhuma ação corresponder
    throw new Error(`A action "${action}" não é reconhecida pelo motor.`);

  } catch (err) {
    registrarLog("error", "doPost", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

const PRESENCE_HEADERS_DEFAULT = [
  "Nome completo",
  "Telefone",
  "Círculo",
  "Carimbo de data/hora",
  "Mês"
];

function getControlePresencaSheet_() {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID_PRESENCA);

  const byGid = db.getSheets().find(function (s) {
    return s.getSheetId && s.getSheetId() === PRESENCA_SHEET_GID;
  });
  if (byGid) return byGid;

  const candidates = [
    "Controle de Presença",
    "Controle de Presenca",
    "Presença",
    "Presenca",
    "Respostas ao formulário 1",
    "Respostas ao formulario 1"
  ];
  for (let i = 0; i < candidates.length; i++) {
    const sh = db.getSheetByName(candidates[i]);
    if (sh) return sh;
  }

  return getSheetResiliente(db, "Controle de Presença");
}

function ensurePresenceHeaders_(sheet) {
  const required = PRESENCE_HEADERS_DEFAULT.slice();
  const lastCol = Math.max(sheet.getLastColumn(), required.length);
  const hasRows = sheet.getLastRow() > 0;

  if (!hasRows) {
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    return required;
  }

  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;
  for (let i = 0; i < required.length; i++) {
    if (!String(current[i] || "").trim()) {
      current[i] = required[i];
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(1, 1, 1, current.length).setValues([current]);
  }
  return current;
}

function getPresenceHeaderIndexes_(headers) {
  const idxTelefone = getColIndex(headers, "Telefone", 1);
  return {
    nome: getColIndex(headers, "Nome completo", getColIndex(headers, "Nome", 0)),
    telefone: idxTelefone,
    circulo: getColIndex(headers, "Círculo", getColIndex(headers, "Circulo", 2)),
    timestamp: getColIndex(headers, "Carimbo de data/hora", getColIndex(headers, "Timestamp", 3)),
    mes: getColIndex(headers, "Mês", getColIndex(headers, "Mes", 4)),
    telCadastrado: getColIndex(headers, "Telefone Cadastrado", getColIndex(headers, "Tel Cadastrado", idxTelefone))
  };
}

function normalizePresencePhoneKey_(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  return digits;
}

function extractPresenceRecordFromRow_(row, rowNumber, idx) {
  const nome = String(row[idx.nome] || "").trim();
  const telefone = String(row[idx.telefone] || row[idx.telCadastrado] || "").trim();
  const circulo = String(row[idx.circulo] || "").trim();
  const timestamp = row[idx.timestamp] || "";
  let mes = String(row[idx.mes] || "").trim();

  if (!mes) {
    const dt = parseDateAny(timestamp);
    if (dt) mes = String(dt.getMonth() + 1);
  }

  const presente = !!(timestamp && String(timestamp).trim());
  return {
    id: "presence-" + rowNumber,
    rowNumber: rowNumber,
    nome: nome,
    telefone: telefone,
    circulo: circulo,
    timestamp: timestamp,
    mes: mes,
    telCadastrado: row[idx.telCadastrado] || "",
    presente: presente
  };
}

function listPresenceRecords_() {
  const sheet = getControlePresencaSheet_();
  const headers = ensurePresenceHeaders_(sheet);
  const idx = getPresenceHeaderIndexes_(headers);
  const data = sheet.getDataRange().getValues();

  if (!data || data.length < 2) {
    return { sheet: sheet, headers: headers, indexes: idx, records: [] };
  }

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || [];
    const hasAny = row.some(function (v) { return String(v || "").trim() !== ""; });
    if (!hasAny) continue;

    const rec = extractPresenceRecordFromRow_(row, i + 1, idx);
    if (!rec.nome && !rec.telefone) continue;
    records.push(rec);
  }

  return { sheet: sheet, headers: headers, indexes: idx, records: records };
}

function handleGetPresence() {
  try {
    const info = listPresenceRecords_();
    const records = info.records || [];
    const now = new Date();
    const nowDay = now.getDate();
    const nowMonth = now.getMonth();
    const nowYear = now.getFullYear();

    let presentesHoje = 0;
    const circulos = {};
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const circ = String(rec.circulo || "").trim();
      if (circ) circulos[normalizeHeader(circ)] = true;

      const dt = parseDateAny(rec.timestamp);
      if (dt &&
        dt.getDate() === nowDay &&
        dt.getMonth() === nowMonth &&
        dt.getFullYear() === nowYear) {
        presentesHoje++;
      }
    }

    const totalRegistered = records.length;
    const faltantes = Math.max(0, totalRegistered - presentesHoje);
    const circulosAtivos = Object.keys(circulos).length;

    return responder(true, {
      presence: records,
      totalRegistered: totalRegistered,
      presentesHoje: presentesHoje,
      faltantes: faltantes,
      circulosAtivos: circulosAtivos
    });
  } catch (err) {
    registrarLog("error", "GET_PRESENCE", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}

function handleMarkPresence(payload) {
  try {
    const phoneRaw = String((payload && (payload.telefone || payload.phone || payload.tel || payload.whatsapp)) || "").trim();
    if (!phoneRaw) throw new Error("Telefone não informado para marcação de presença.");

    const targetPhoneKey = normalizePresencePhoneKey_(phoneRaw);
    if (!targetPhoneKey) throw new Error("Telefone inválido para marcação de presença.");

    const info = listPresenceRecords_();
    const sheet = info.sheet;
    const headers = info.headers;
    const idx = info.indexes;
    const data = sheet.getDataRange().getValues();

    const nomePayload = String((payload && payload.nome) || "").trim();
    const circuloPayload = String((payload && payload.circulo) || "").trim();
    const now = new Date();
    const mesPayload = String((payload && payload.mes) || (now.getMonth() + 1)).trim();

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      const keyTel = normalizePresencePhoneKey_(row[idx.telefone]);
      const keyTelCad = normalizePresencePhoneKey_(row[idx.telCadastrado]);
      if ((keyTel && keyTel === targetPhoneKey) || (keyTelCad && keyTelCad === targetPhoneKey)) {
        rowIndex = i;
        break;
      }
    }

    let savedRow = null;
    if (rowIndex >= 1) {
      const rowData = (data[rowIndex] || []).slice();
      while (rowData.length < headers.length) rowData.push("");

      if (idx.nome >= 0 && nomePayload && !String(rowData[idx.nome] || "").trim()) rowData[idx.nome] = nomePayload;
      if (idx.circulo >= 0 && circuloPayload && !String(rowData[idx.circulo] || "").trim()) rowData[idx.circulo] = circuloPayload;
      if (idx.telefone >= 0 && !String(rowData[idx.telefone] || "").trim()) rowData[idx.telefone] = phoneRaw;
      if (idx.telCadastrado >= 0) rowData[idx.telCadastrado] = rowData[idx.telCadastrado] || phoneRaw;
      if (idx.timestamp >= 0) rowData[idx.timestamp] = now;
      if (idx.mes >= 0) rowData[idx.mes] = mesPayload;

      sheet.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
      if (idx.timestamp >= 0) {
        sheet.getRange(rowIndex + 1, idx.timestamp + 1).setNumberFormat("dd/MM/yyyy HH:mm");
      }
      savedRow = rowData;
    } else {
      const rowData = new Array(headers.length).fill("");
      if (idx.nome >= 0) rowData[idx.nome] = nomePayload || "";
      if (idx.telefone >= 0) rowData[idx.telefone] = phoneRaw;
      if (idx.circulo >= 0) rowData[idx.circulo] = circuloPayload || "";
      if (idx.timestamp >= 0) rowData[idx.timestamp] = now;
      if (idx.mes >= 0) rowData[idx.mes] = mesPayload;
      if (idx.telCadastrado >= 0) rowData[idx.telCadastrado] = phoneRaw;

      sheet.appendRow(rowData);
      const newRow = sheet.getLastRow();
      if (idx.timestamp >= 0) {
        sheet.getRange(newRow, idx.timestamp + 1).setNumberFormat("dd/MM/yyyy HH:mm");
      }
      savedRow = rowData;
    }

    const rowNumber = rowIndex >= 1 ? rowIndex + 1 : sheet.getLastRow();
    const updated = extractPresenceRecordFromRow_(savedRow || [], rowNumber, idx);

    return responder(true, {
      message: "Presença registrada com sucesso.",
      record: updated
    });
  } catch (err) {
    registrarLog("error", "MARK_PRESENCE", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}

// --- NOVOS HANDLERS ---

function handleExecuteInterestConfirmation(payload) {
  try {
    const appUrl = payload.appUrl;
    if (!appUrl) {
      throw new Error("URL do aplicativo (appUrl) não foi fornecida.");
    }

    const sheet = getNaoInscritosSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Mapeamento de colunas (0-based)
    const NOME_COL = 1;  // Coluna B
    const EMAIL_COL = 2; // Coluna C
    const STATUS_COL = 3; // Coluna D
    const STATUS_ENVIO_COL = 7; // Coluna H

    let enviados = 0;
    const timestamp = nowBR();

    // Começa em 1 para pular o cabeçalho
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const nome = row[NOME_COL];
      const email = row[EMAIL_COL];
      const status = row[STATUS_COL];
      const statusEnvio = row[STATUS_ENVIO_COL];

      if (status === "Ativo" && email && (!statusEnvio || !String(statusEnvio).includes("Enviado"))) {
        
        const link = `${appUrl}?mode=interest_form&email=${encodeURIComponent(email)}&name=${encodeURIComponent(nome)}`;
        
        const htmlBody = `
          <h2 style="color: #044372;">Olá, ${nome}!</h2>

          <p>
            Temos boas notícias! Estamos reorganizando as fichas recebidas para o próximo 
            <strong>EAC</strong>, que acontecerá nos dias <strong>23 e 24/05</strong>, e seu nome está em nossa 
            <strong>fila de espera</strong>.
          </p>

          <p>
            Pedimos que você <strong>confirme seu interesse em participar do EAC</strong> clicando no botão abaixo.
            Essa resposta nos ajudará na organização do encontro. A confirmação final da participação
            acontecerá em uma etapa posterior, por meio de <strong>convocação oficial</strong>.
          </p>

          <a href="${link}" style="background-color: #044372; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 12px; font-weight: bold;">
            Confirmar Interesse
          </a>

          <br><br>

          <p>
            Fique atento ao seu <strong>E-mail</strong> e <strong>WhatsApp</strong>. Em breve entraremos em contato.
          </p>

          <p>
            Fraternalmente,<br>
            <strong>Coordenação EAC Porciúncula de Sant'Anna</strong>
          </p>

        `;

        try {
          MailApp.sendEmail({
            to: email,
            subject: "Confirme seu interesse no EAC datas 23 e 24/05",
            htmlBody: molduraEmail(htmlBody)
          });

          // Atualiza o status de envio na planilha
          sheet.getRange(i + 1, STATUS_ENVIO_COL + 1).setValue(`Enviado em ${timestamp}`);
          enviados++;
        } catch (e) {
          // Loga o erro mas continua o processo
          console.error(`Falha ao enviar para ${email}: ${e.toString()}`);
          registrarLog("error", "handleExecuteInterestConfirmation", "Sistema", `Falha ao enviar para ${email}: ${e.toString()}`, "ERROR");
        }
      }
      
      // Limite de envios para evitar exceder quotas do Google
      if (enviados >= 45) {
        break;
      }
    }

    if (enviados > 0) {
      return responder(true, { message: `Disparo de confirmação concluído. ${enviados} e-mails enviados.`, enviados: enviados });
    } else {
      return responder(true, { message: "Nenhum jovem na fila de espera precisando de confirmação.", enviados: 0 });
    }

  } catch (err) {
    registrarLog("error", "handleExecuteInterestConfirmation", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function handleSubmitInterestAnswers(payload) {
  try {
    const { email, answers } = payload;
    if (!email || !answers) {
      throw new Error("Dados insuficientes. E-mail e respostas são obrigatórios.");
    }

    const sheet = getNaoInscritosSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Colunas para as respostas (0-based)
    const RESPOSTA_COLS = {
      interesse: 8,          // I
      disponibilidade: 9,    // J (Já fez o EAC em outra paróquia?)
      contatoMudou: 10,      // K
      recado: 11,            // L
      dataResposta: 12,      // M
      amigoSimNao: 13,       // N
      amigoNome: 14,         // O
    };

    const NEW_HEADERS = [
      "Interesse Confirmado",             // I
      "Já fez o EAC em outra paróquia?",  // J
      "Contato Mudou?",                   // K
      "Recado",                           // L
      "Data Resposta",                    // M
      "Amigo para fazer junto?",          // N
      "Nome do amigo"                     // O
    ];

    // Verifica e cria os cabeçalhos se necessário
    let headersChanged = false;
    for (let i = 0; i < NEW_HEADERS.length; i++) {
      const colIndex = RESPOSTA_COLS.interesse + i;
      if (colIndex < headers.length && headers[colIndex] === "") {
        headers[colIndex] = NEW_HEADERS[i];
        headersChanged = true;
      } else if (colIndex >= headers.length) {
        headers.push(NEW_HEADERS[i]);
        headersChanged = true;
      }
    }

    if (headersChanged) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // Encontra a linha do usuário pelo e-mail (case-insensitive)
    const targetEmail = String(email).trim().toLowerCase();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim().toLowerCase() === targetEmail) { // Coluna C para email
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error(`E-mail "${email}" não encontrado na lista de espera.`);
    }

    // Prepara os dados para escrita
    const rowData = [
      answers.q1 || "", // InteresseConfirmado
      answers.q3 || "", // Já fez o EAC em outra paróquia? (q3 no form)
      answers.q2 || "", // Contato Mudou? (q2 no form)
      answers.q4 || "", // Recado (q4 no form)
      nowBR(),          // DataResposta
      answers.q5 || "", // Amigo para fazer junto? (q5: Sim/Não)
      answers.q6 || ""  // Nome do amigo (q6)
    ];

    // Escreve os dados na planilha (vai escrever de I até O)
    sheet
      .getRange(rowIndex + 1, RESPOSTA_COLS.interesse + 1, 1, rowData.length)
      .setValues([rowData]);

    return responder(true, { message: "Respostas registradas com sucesso. Obrigado por confirmar!" });


  } catch (err) {
    registrarLog("error", "handleSubmitInterestAnswers", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function handleUpdateNonEnrolledInterest(payload) {
  try {
    const normalizeSelection = function (v) {
      const s = String(v || "").trim().toLowerCase();
      if (!s) return "";
      if (s === "sim" || s === "s" || s === "yes" || s === "y" || s === "1") return "Sim";
      if (s === "nao" || s === "não" || s === "nÃ£o" || s === "no" || s === "n" || s === "0") return "Não";
      if (s === "em branco" || s === "branco" || s === "-") return "";
      return "";
    };

    const interestInput = normalizeSelection(payload.interesse || payload.valor || payload.value);
    const idPessoa = String(payload.idPessoa || payload.id || payload.linhaOrigem || payload.linha_origem || "").trim();
    const emailLookup = String(payload.email || payload.to || "").trim().toLowerCase();

    if (!idPessoa && !emailLookup) {
      throw new Error("Informe o ID (coluna A) ou o e-mail para atualizar o interesse.");
    }

    const sheet = getNaoInscritosSheet();
    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {
      throw new Error("Planilha 'NÃ£o inscritos' vazia.");
    }

    const headers = data[0];
    const idxId = getColIndex(headers, "Linha Origem", 0);
    const idxEmail = getColIndex(headers, "E-mail", 2);
    const idxNome = getColIndex(headers, "Nome completo", 1);
    const idxStatus = getColIndex(headers, "Status", 3);
    const idxDataCadastro = getColIndex(headers, "Data Cadastro", 4);
    const idxTelefone = getColIndex(headers, "Telefone", 5);
    const idxBairro = getColIndex(headers, "Bairro", 6);
    const idxStatusEnvio = getColIndex(headers, "Status Envio", 7);
    const idxInteresse = getColIndex(headers, "Interesse Confirmado", 8);
    const idxJaFez = getColIndex(headers, "JÃ¡ fez o EAC", 9);
    const idxContatoMudou = getColIndex(headers, "Contato mudou", 10);
    const idxRecado = getColIndex(headers, "Recado", 11);
    const idxDataResposta = getColIndex(headers, "Data Resposta", 12);
    const idxAmigo = getColIndex(headers, "Amigo para", 13);
    const idxNomeAmigo = getColIndex(headers, "Nome do amigo", 14);

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const idVal = row[idxId] !== undefined && row[idxId] !== null ? String(row[idxId]).trim() : "";
      const emailVal = String(row[idxEmail] || "").trim().toLowerCase();
      if ((idPessoa && idVal === idPessoa) || (emailLookup && emailVal === emailLookup)) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Registro de NÃ£o Inscrito nÃ£o encontrado para atualizar o interesse.");
    }

    const finalInteresse = interestInput;
    const respostaTimestamp = finalInteresse ? nowBR() : "";

    sheet.getRange(rowIndex + 1, idxInteresse + 1).setValue(finalInteresse);
    sheet.getRange(rowIndex + 1, idxDataResposta + 1).setValue(respostaTimestamp);

    const rowData = data[rowIndex].slice();
    rowData[idxInteresse] = finalInteresse;
    rowData[idxDataResposta] = respostaTimestamp;

    const updated = {
      linhaOrigem: rowData[idxId] || "",
      nome: rowData[idxNome] || "",
      email: rowData[idxEmail] || "",
      status: rowData[idxStatus] || "",
      dataCadastro: rowData[idxDataCadastro] || "",
      telefone: rowData[idxTelefone] || "",
      bairro: rowData[idxBairro] || "",
      statusEnvio: rowData[idxStatusEnvio] || "",
      interesseConfirmado: finalInteresse,
      jaFezEac: rowData[idxJaFez] || "",
      contatoMudou: rowData[idxContatoMudou] || "",
      recado: rowData[idxRecado] || "",
      dataResposta: respostaTimestamp,
      amigo: rowData[idxAmigo] || "",
      nomeAmigo: rowData[idxNomeAmigo] || ""
    };

    return responder(true, { message: "Interesse atualizado com sucesso.", updatedRow: updated });
  } catch (err) {
    registrarLog("error", "handleUpdateNonEnrolledInterest", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function handleUpdateNonEnrolledRecado(payload) {
  try {
    const finalRecado = payload.recado === undefined || payload.recado === null
      ? ""
      : String(payload.recado).trim();
    const idPessoa = String(payload.idPessoa || payload.id || payload.linhaOrigem || payload.linha_origem || "").trim();
    const emailLookup = String(payload.email || payload.to || "").trim().toLowerCase();

    if (!idPessoa && !emailLookup) {
      throw new Error("Informe o ID (coluna A) ou o e-mail para atualizar o recado.");
    }

    const sheet = getNaoInscritosSheet();
    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {
      throw new Error("Planilha 'Nao inscritos' vazia.");
    }

    const headers = data[0];
    const idxId = getColIndex(headers, "Linha Origem", 0);
    const idxEmail = getColIndex(headers, "E-mail", 2);
    const idxNome = getColIndex(headers, "Nome completo", 1);
    const idxStatus = getColIndex(headers, "Status", 3);
    const idxDataCadastro = getColIndex(headers, "Data Cadastro", 4);
    const idxTelefone = getColIndex(headers, "Telefone", 5);
    const idxBairro = getColIndex(headers, "Bairro", 6);
    const idxStatusEnvio = getColIndex(headers, "Status Envio", 7);
    const idxInteresse = getColIndex(headers, "Interesse Confirmado", 8);
    const idxJaFez = getColIndex(headers, "JÃ¡ fez o EAC", 9);
    const idxContatoMudou = getColIndex(headers, "Contato mudou", 10);
    const idxRecado = getColIndex(headers, "Recado", 11);
    const idxDataResposta = getColIndex(headers, "Data Resposta", 12);
    const idxAmigo = getColIndex(headers, "Amigo para", 13);
    const idxNomeAmigo = getColIndex(headers, "Nome do amigo", 14);

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const idVal = row[idxId] !== undefined && row[idxId] !== null ? String(row[idxId]).trim() : "";
      const emailVal = String(row[idxEmail] || "").trim().toLowerCase();
      if ((idPessoa && idVal === idPessoa) || (emailLookup && emailVal === emailLookup)) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Registro de Nao Inscrito nao encontrado para atualizar o recado.");
    }

    sheet.getRange(rowIndex + 1, idxRecado + 1).setValue(finalRecado);

    const rowData = data[rowIndex].slice();
    rowData[idxRecado] = finalRecado;

    const updated = {
      linhaOrigem: rowData[idxId] || "",
      nome: rowData[idxNome] || "",
      email: rowData[idxEmail] || "",
      status: rowData[idxStatus] || "",
      dataCadastro: rowData[idxDataCadastro] || "",
      telefone: rowData[idxTelefone] || "",
      bairro: rowData[idxBairro] || "",
      statusEnvio: rowData[idxStatusEnvio] || "",
      interesseConfirmado: rowData[idxInteresse] || "",
      jaFezEac: rowData[idxJaFez] || "",
      contatoMudou: rowData[idxContatoMudou] || "",
      recado: finalRecado,
      dataResposta: rowData[idxDataResposta] || "",
      amigo: rowData[idxAmigo] || "",
      nomeAmigo: rowData[idxNomeAmigo] || ""
    };

    return responder(true, { message: "Recado atualizado com sucesso.", updatedRow: updated });
  } catch (err) {
    registrarLog("error", "handleUpdateNonEnrolledRecado", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function getOwnValueFromKeys_(obj, keys) {
  const source = obj && typeof obj === "object" ? obj : {};
  const list = Array.isArray(keys) ? keys : [];
  for (let i = 0; i < list.length; i++) {
    const key = list[i];
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeYesNoOrBlank_(value) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  const s = raw.toLowerCase();
  if (!s) return "";
  if (s === "sim" || s === "s" || s === "yes" || s === "y" || s === "1" || s === "true") return "Sim";
  if (s === "nao" || s === "não" || s === "n" || s === "no" || s === "0" || s === "false") return "Não";
  if (s === "-" || s === "em branco" || s === "branco") return "";
  return raw;
}

function normalizePriorizacaoForSheet_(value) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  const s = raw.toLowerCase();
  if (!s) return "";
  if (s === "sim" || s === "s" || s === "yes" || s === "y" || s === "1" || s === "true" || s === "on") return "SIM";
  if (s === "nao" || s === "não" || s === "n" || s === "no" || s === "0" || s === "false" || s === "off") return "";
  return raw;
}

function normalizeBirthDateForStorage_(value) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!raw) return "";
  const parsed = parseDateAny(raw);
  if (!parsed) return raw;
  return Utilities.formatDate(parsed, "GMT-3", "dd/MM/yyyy");
}

function buildNonEnrolledIndexes_(headers) {
  const hdr = Array.isArray(headers) ? headers : [];
  return {
    idxId: getColIndex(hdr, "Linha Origem", 0),
    idxNome: getColIndex(hdr, "Nome completo", getColIndex(hdr, "Nome", 1)),
    idxEmail: getColIndex(hdr, "E-mail", getColIndex(hdr, "Email", 2)),
    idxStatus: getColIndex(hdr, "Status", 3),
    idxDataCadastro: getColIndex(hdr, "Data Cadastro", 4),
    idxTelefone: getColIndex(hdr, "Telefone", 5),
    idxBairro: getColIndex(hdr, "Bairro", 6),
    idxStatusEnvio: getColIndex(hdr, "Status Envio", 7),
    idxInteresse: getColIndex(hdr, "Interesse Confirmado", 8),
    idxJaFez: getColIndex(hdr, "Já fez o EAC em outra paróquia?", getColIndex(hdr, "Ja fez o EAC", 9)),
    idxContatoMudou: getColIndex(hdr, "Contato Mudou?", getColIndex(hdr, "Contato mudou", 10)),
    idxRecado: getColIndex(hdr, "Recado", 11),
    idxDataResposta: getColIndex(hdr, "Data Resposta", 12),
    idxAmigo: getColIndex(hdr, "Amigo para fazer junto?", getColIndex(hdr, "Amigo para", 13)),
    idxNomeAmigo: getColIndex(hdr, "Nome do amigo", 14),
    idxPreConfirmacao: getColIndex(hdr, "Status Pre Confirmacao", 15),
    idxStatusPriorizacao: getColIndex(hdr, "Status Priorizacao", 16),
    idxDataNascimento: getColIndex(hdr, "Data de nascimento", getColIndex(hdr, "Data nascimento", 17)),
    idxSexo: getColIndex(hdr, "Sexo", 18)
  };
}

function buildUpdatedNonEnrolledRowObject_(rowData, idx) {
  const row = Array.isArray(rowData) ? rowData : [];
  const indexes = idx || {};
  return {
    linhaOrigem: row[indexes.idxId] || "",
    nome: row[indexes.idxNome] || "",
    email: row[indexes.idxEmail] || "",
    status: row[indexes.idxStatus] || "",
    dataCadastro: row[indexes.idxDataCadastro] || "",
    telefone: row[indexes.idxTelefone] || "",
    bairro: row[indexes.idxBairro] || "",
    statusEnvio: row[indexes.idxStatusEnvio] || "",
    interesseConfirmado: row[indexes.idxInteresse] || "",
    jaFezEac: row[indexes.idxJaFez] || "",
    contatoMudou: row[indexes.idxContatoMudou] || "",
    recado: row[indexes.idxRecado] || "",
    dataResposta: row[indexes.idxDataResposta] || "",
    amigo: row[indexes.idxAmigo] || "",
    nomeAmigo: row[indexes.idxNomeAmigo] || "",
    statusPreConfirmacao: row[indexes.idxPreConfirmacao] || "",
    statusPriorizacao: row[indexes.idxStatusPriorizacao] || "",
    dataNascimento: row[indexes.idxDataNascimento] || "",
    nascimento: row[indexes.idxDataNascimento] || "",
    sexo: row[indexes.idxSexo] || ""
  };
}

function updateSemDuplicidadeFromNonEnrolled_(input) {
  const payload = input && typeof input === "object" ? input : {};
  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const shSemDup = getSheetResiliente(dbIns, "Inscricoes_Sem_Duplicidade");
  const data = shSemDup.getDataRange().getValues();
  if (!data || data.length < 2) {
    throw new Error("Aba 'Inscricoes_Sem_Duplicidade' vazia.");
  }

  const headers = data[0] || [];
  const lastCol = Math.max(shSemDup.getLastColumn(), headers.length, 8);
  const idxNome = getColIndex(headers, "Nome completo", getColIndex(headers, "Nome", 1));
  const idxNascimento = getColIndex(headers, "Data de nascimento", getColIndex(headers, "Data nascimento", 2));
  const idxSexo = getColIndex(headers, "Sexo", 3);
  const idxDataCadastro = getColIndex(headers, "Data Cadastro", 0);
  const idxBairro = getColIndex(headers, "Bairro", 5);
  const idxTelefone = getColIndex(headers, "Telefone", 6);
  const idxEmail = getColIndex(headers, "E-mail", getColIndex(headers, "Email", 7));

  const linhaOrigem = Number(payload.linhaOrigem);
  const emailTarget = String(payload.email || "").trim().toLowerCase();
  const phoneTarget = normalizePhone(payload.telefone || "");
  const nomeTarget = String(payload.nome || "").trim().toLowerCase();
  const nascimentoTarget = String(payload.dataNascimento || "").trim();
  const hasAnyMatchKey = !!(emailTarget || phoneTarget || nomeTarget);

  function rowMatches(row) {
    const r = Array.isArray(row) ? row : [];
    const emailVal = String(r[idxEmail] || "").trim().toLowerCase();
    const phoneVal = normalizePhone(r[idxTelefone] || "");
    const nomeVal = String(r[idxNome] || "").trim().toLowerCase();
    const nascimentoVal = String(r[idxNascimento] || "").trim();

    if (emailTarget && emailVal === emailTarget) return true;
    if (phoneTarget && phoneVal === phoneTarget) return true;
    if (nomeTarget && nascimentoTarget && nomeVal === nomeTarget && nascimentoVal === nascimentoTarget) return true;
    if (nomeTarget && !nascimentoTarget && nomeVal === nomeTarget) return true;
    return false;
  }

  let rowNumber = -1;
  if (isFinite(linhaOrigem) && linhaOrigem >= 2 && linhaOrigem <= data.length) {
    const candidate = data[linhaOrigem - 1] || [];
    if (!hasAnyMatchKey || rowMatches(candidate)) {
      rowNumber = linhaOrigem;
    }
  }

  if (rowNumber === -1 && hasAnyMatchKey) {
    for (let i = 1; i < data.length; i++) {
      if (rowMatches(data[i])) {
        rowNumber = i + 1;
        break;
      }
    }
  }

  if (rowNumber === -1) {
    throw new Error("Registro não encontrado em 'Inscricoes_Sem_Duplicidade' para sincronizar edição.");
  }

  const row = (data[rowNumber - 1] || []).slice();
  while (row.length < lastCol) row.push("");

  if (idxNome >= 0) row[idxNome] = String(payload.nome || "").trim();
  if (idxEmail >= 0) row[idxEmail] = String(payload.email || "").trim();
  if (idxTelefone >= 0) row[idxTelefone] = String(payload.telefone || "").trim();
  if (idxBairro >= 0) row[idxBairro] = String(payload.bairro || "").trim();
  if (idxNascimento >= 0) row[idxNascimento] = normalizeBirthDateForStorage_(payload.dataNascimento || "");
  if (idxSexo >= 0) row[idxSexo] = String(payload.sexo || "").trim();
  if (idxDataCadastro >= 0) row[idxDataCadastro] = payload.dataCadastro || "";

  shSemDup.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return { updated: true, rowNumber: rowNumber };
}

function handleUpdateNonEnrolledRecord(payload) {
  try {
    const source = payload && typeof payload === "object" ? payload : {};
    const record = source.record && typeof source.record === "object" ? source.record : source;

    const idPessoa = String(
      source.idPessoa ||
      source.id ||
      source.linhaOrigem ||
      source.linha_origem ||
      record.idPessoa ||
      record.id ||
      record.linhaOrigem ||
      record.linha_origem ||
      ""
    ).trim();
    const emailLookup = String(source.email || source.to || record.email || "").trim().toLowerCase();

    if (!idPessoa && !emailLookup) {
      throw new Error("Informe o ID (coluna A) ou o e-mail para editar o cadastro.");
    }

    const shNao = getNaoInscritosSheet();
    const data = shNao.getDataRange().getValues();
    if (!data || data.length < 2) {
      throw new Error("Planilha 'Nao inscritos' vazia.");
    }

    const headers = data[0] || [];
    const idx = buildNonEnrolledIndexes_(headers);

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      const idVal = String(row[idx.idxId] || "").trim();
      const emailVal = String(row[idx.idxEmail] || "").trim().toLowerCase();
      if ((idPessoa && idVal === idPessoa) || (emailLookup && emailVal === emailLookup)) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Registro de Nao Inscrito nao encontrado para edicao.");
    }

    const rowData = (data[rowIndex] || []).slice();
    const maxIdx = Math.max(
      idx.idxSexo,
      idx.idxDataNascimento,
      idx.idxStatusPriorizacao,
      idx.idxPreConfirmacao,
      idx.idxNomeAmigo,
      idx.idxAmigo,
      idx.idxDataResposta,
      idx.idxRecado,
      idx.idxContatoMudou,
      idx.idxJaFez,
      idx.idxInteresse,
      idx.idxStatusEnvio,
      idx.idxBairro,
      idx.idxTelefone,
      idx.idxDataCadastro,
      idx.idxStatus,
      idx.idxEmail,
      idx.idxNome,
      idx.idxId
    );
    while (rowData.length <= maxIdx) rowData.push("");

    const currentInteresse = String(rowData[idx.idxInteresse] || "").trim();

    function applyString(keys, index, shouldTrim) {
      if (index < 0) return false;
      const provided = getOwnValueFromKeys_(record, keys);
      if (provided === undefined) return false;
      const raw = String(provided === null ? "" : provided);
      rowData[index] = shouldTrim === false ? raw : raw.trim();
      return true;
    }

    function applyYesNo(keys, index) {
      if (index < 0) return false;
      const provided = getOwnValueFromKeys_(record, keys);
      if (provided === undefined) return false;
      rowData[index] = normalizeYesNoOrBlank_(provided);
      return true;
    }

    applyString(["nome", "Nome"], idx.idxNome, true);
    applyString(["email", "Email", "eMail", "e-mail"], idx.idxEmail, true);
    applyString(["status", "Status"], idx.idxStatus, true);
    applyString(["dataCadastro", "data_cadastro", "Data Cadastro", "timestamp"], idx.idxDataCadastro, true);
    applyString(["telefone", "Telefone", "whatsapp", "WhatsApp"], idx.idxTelefone, true);
    applyString(["bairro", "Bairro"], idx.idxBairro, true);
    applyString(["statusEnvio", "Status Envio", "status_envio"], idx.idxStatusEnvio, true);

    const changedInteresse = applyYesNo(["interesseConfirmado", "interesse", "Interesse", "I"], idx.idxInteresse);
    applyYesNo(["jaFezEac", "jaFez", "Ja fez o EAC", "J"], idx.idxJaFez);
    applyYesNo(["contatoMudou", "Contato Mudou", "K"], idx.idxContatoMudou);

    applyString(["recado", "Recado", "L"], idx.idxRecado, false);
    const changedDataResposta = applyString(["dataResposta", "Data Resposta", "M"], idx.idxDataResposta, true);
    applyString(["amigo", "Amigo para", "N"], idx.idxAmigo, true);
    applyString(["nomeAmigo", "Nome do amigo", "O"], idx.idxNomeAmigo, true);
    applyString(["statusPreConfirmacao", "preConfirmacao", "Status Pre Confirmacao", "P"], idx.idxPreConfirmacao, true);

    if (idx.idxStatusPriorizacao >= 0) {
      const providedPriorizacao = getOwnValueFromKeys_(record, ["statusPriorizacao", "Status Priorizacao", "Q"]);
      if (providedPriorizacao !== undefined) {
        rowData[idx.idxStatusPriorizacao] = normalizePriorizacaoForSheet_(providedPriorizacao);
      }
    }

    if (idx.idxDataNascimento >= 0) {
      const providedNascimento = getOwnValueFromKeys_(record, ["dataNascimento", "nascimento", "Data de nascimento", "R"]);
      if (providedNascimento !== undefined) {
        rowData[idx.idxDataNascimento] = normalizeBirthDateForStorage_(providedNascimento);
      }
    }
    applyString(["sexo", "Sexo", "S"], idx.idxSexo, true);

    if (changedInteresse && !changedDataResposta && idx.idxDataResposta >= 0) {
      const finalInteresse = String(rowData[idx.idxInteresse] || "").trim();
      if (finalInteresse !== currentInteresse) {
        rowData[idx.idxDataResposta] = finalInteresse ? nowBR() : "";
      }
    }

    const linhaOrigemFinal = String(rowData[idx.idxId] || idPessoa || "").trim();
    const syncInfo = updateSemDuplicidadeFromNonEnrolled_({
      linhaOrigem: linhaOrigemFinal,
      nome: rowData[idx.idxNome] || "",
      email: rowData[idx.idxEmail] || "",
      telefone: rowData[idx.idxTelefone] || "",
      bairro: rowData[idx.idxBairro] || "",
      dataCadastro: rowData[idx.idxDataCadastro] || "",
      dataNascimento: rowData[idx.idxDataNascimento] || "",
      sexo: rowData[idx.idxSexo] || ""
    });

    shNao.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
    const updated = buildUpdatedNonEnrolledRowObject_(rowData, idx);

    return responder(true, {
      message: "Cadastro de Nao Inscrito atualizado com sucesso.",
      updatedRow: updated,
      semDuplicidadeSync: syncInfo
    });
  } catch (err) {
    registrarLog("error", "handleUpdateNonEnrolledRecord", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function handlePrioritizeNonEnrolled(payload) {
  try {
    const idRegistro = String(
      payload.linhaOrigem ||
      payload.linha_origem ||
      payload.idRegistro ||
      payload.idPessoa ||
      payload.id ||
      ""
    ).trim();
    if (!idRegistro) {
      throw new Error("Informe a linhaOrigem para priorizar.");
    }

    const requestedTarget = parsePriorizacaoTarget_(
      payload.priorizar !== undefined
        ? payload.priorizar
        : (payload.statusPriorizacao !== undefined ? payload.statusPriorizacao : payload.status)
    );

    const result = priorizarNaoInscrito(idRegistro, { priorizar: requestedTarget });
    return responder(true, result);
  } catch (err) {
    registrarLog("error", "handlePrioritizeNonEnrolled", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function parsePriorizacaoTarget_(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (s === "sim" || s === "s" || s === "yes" || s === "y" || s === "1" || s === "true" || s === "on") return true;
  if (s === "nao" || s === "não" || s === "n" || s === "no" || s === "0" || s === "false" || s === "off") return false;
  return null;
}

function priorizarNaoInscrito(idRegistro, options) {
  const linhaOrigem = Number(idRegistro);
  if (!isFinite(linhaOrigem) || linhaOrigem < 2) {
    throw new Error("linhaOrigem inválida para priorização.");
  }

  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const shNao = getNaoInscritosSheet();
  const shPrior = getSheetResiliente(dbIns, "Inscricoes_Prioritarias");
  const SOURCE_B_TO_O_START = 2;
  const SOURCE_B_TO_O_END = 15;
  const SOURCE_COL_R_DATA_NASC = 18;
  const SOURCE_COL_S_SEXO = 19;
  const DEST_COL_O_DATA_NASC_IDX = 14; // O (0-based)
  const DEST_COL_P_IDADE_IDX = 15;     // P (0-based)
  const DEST_COL_Q_SEXO_IDX = 16;      // Q (0-based)
  const PRIOR_HEADERS_DEFAULT = [
    "Nome completo",
    "E-mail",
    "Status",
    "Data Cadastro",
    "Telefone",
    "Bairro",
    "Status Envio",
    "Interesse Confirmado",
    "Já fez o EAC em outra paróquia?",
    "Contato Mudou?",
    "Recado",
    "Data Resposta",
    "Amigo para fazer junto?",
    "Nome do amigo",
    "Data de nascimento",
    "Idade",
    "Sexo"
  ];

  const naoData = shNao.getDataRange().getValues();
  if (!naoData || naoData.length < 2) {
    throw new Error("Planilha 'Nao inscritos' vazia.");
  }

  const naoHeaders = naoData[0];
  const idxLinhaOrigem = getColIndex(naoHeaders, "Linha Origem", 0);
  const idxNome = getColIndex(naoHeaders, "Nome completo", 1);
  const idxEmail = getColIndex(naoHeaders, "E-mail", 2);
  const idxDataCadastro = getColIndex(naoHeaders, "Data Cadastro", 4);
  const idxTelefone = getColIndex(naoHeaders, "Telefone", 5);
  const idxBairro = getColIndex(naoHeaders, "Bairro", 6);
  const idxStatusPriorizacao = getColIndex(naoHeaders, "Status Priorizacao", 16); // Q
  const idxDataNascimento = getColIndex(naoHeaders, "Data de nascimento", 17); // R

  const sourceHeadersBO = naoHeaders.slice(SOURCE_B_TO_O_START - 1, SOURCE_B_TO_O_END);
  const expectedBOSize = SOURCE_B_TO_O_END - SOURCE_B_TO_O_START + 1;
  const PRIOR_HEADERS = sourceHeadersBO.length === expectedBOSize
    ? sourceHeadersBO.concat(["Data de nascimento", "Idade", "Sexo"])
    : PRIOR_HEADERS_DEFAULT.slice();

  if (!String(naoHeaders[idxStatusPriorizacao] || "").trim()) {
    shNao.getRange(1, idxStatusPriorizacao + 1).setValue("Status Priorizacao");
  }

  let rowIndexNao = -1;
  for (let i = 1; i < naoData.length; i++) {
    const idVal = String(naoData[i][idxLinhaOrigem] || "").trim();
    if (idVal && Number(idVal) === linhaOrigem) {
      rowIndexNao = i;
      break;
    }
  }
  if (rowIndexNao === -1) {
    throw new Error("Registro não encontrado na aba 'Nao inscritos' para a linhaOrigem informada.");
  }

  const naoRow = naoData[rowIndexNao].slice();
  const statusAtual = String(naoRow[idxStatusPriorizacao] || "").trim();
  const jaPriorizado = isTruthyYes_(statusAtual);
  const priorizarFinal = options && typeof options.priorizar === "boolean"
    ? options.priorizar
    : !jaPriorizado;
  const statusPriorizacao = priorizarFinal ? "SIM" : "";
  shNao.getRange(rowIndexNao + 1, idxStatusPriorizacao + 1).setValue(statusPriorizacao);

  const nome = String(naoRow[idxNome] || "").trim();
  const email = String(naoRow[idxEmail] || "").trim();
  const telefone = String(naoRow[idxTelefone] || "").trim();
  const bairro = String(naoRow[idxBairro] || "").trim();
  const dataCadastro = naoRow[idxDataCadastro] || "";
  // Regra do processo: coluna R da aba "não inscritos" -> coluna O da aba "Inscricoes_Prioritarias"
  const dataNascimento = naoRow[SOURCE_COL_R_DATA_NASC - 1] || naoRow[idxDataNascimento] || "";
  const sexoOrigem = String(naoRow[SOURCE_COL_S_SEXO - 1] || "").trim();
  const idade = calcularIdade(dataNascimento);
  const rowFromBToO = naoRow.slice(SOURCE_B_TO_O_START - 1, SOURCE_B_TO_O_END);
  while (rowFromBToO.length < expectedBOSize) rowFromBToO.push("");
  const rowToInsert = rowFromBToO.slice(0, expectedBOSize);
  rowToInsert[DEST_COL_O_DATA_NASC_IDX] = dataNascimento;
  rowToInsert[DEST_COL_P_IDADE_IDX] = idade;
  rowToInsert[DEST_COL_Q_SEXO_IDX] = sexoOrigem;

  // Mantém a estrutura da aba de prioritários alinhada com B:O + extras.
  shPrior.getRange(1, 1, 1, PRIOR_HEADERS.length).setValues([PRIOR_HEADERS]);
  const priorLastCol = Math.max(shPrior.getLastColumn(), PRIOR_HEADERS.length);
  const priorHeaders = shPrior.getRange(1, 1, 1, priorLastCol).getValues()[0];

  if (!priorizarFinal) {
    let removedFromPrioritarias = 0;
    if (nome || email) {
      const keyToRemove = buildPriorizacaoKeyFromFields_(nome, email, dataCadastro, dataNascimento);
      const priorLastRowRemove = shPrior.getLastRow();
      if (priorLastRowRemove > 1) {
        const priorData = shPrior.getRange(2, 1, priorLastRowRemove - 1, priorLastCol).getValues();
        for (let i = priorData.length - 1; i >= 0; i--) {
          if (rowMatchesPriorizacaoKey_(priorData[i], keyToRemove, priorHeaders)) {
            shPrior.deleteRow(i + 2);
            removedFromPrioritarias++;
          }
        }
      }
    }

    naoRow[idxStatusPriorizacao] = "";
    return {
      message: removedFromPrioritarias > 0
        ? "Priorização removida e candidato retirado de Inscricoes_Prioritarias."
        : "Priorização removida.",
      linhaOrigem: String(linhaOrigem),
      removedFromPrioritarias: removedFromPrioritarias,
      updatedRow: {
        linhaOrigem: naoRow[idxLinhaOrigem] || "",
        nome: nome,
        email: email,
        telefone: telefone,
        bairro: bairro,
        status: naoRow[getColIndex(naoHeaders, "Status", 3)] || "",
        dataCadastro: dataCadastro,
        dataNascimento: dataNascimento,
        idade: idade,
        sexo: sexoOrigem,
        statusPriorizacao: ""
      }
    };
  }

  if (!nome && !email) {
    throw new Error("Registro sem nome/e-mail suficiente para priorizacao.");
  }

  const key = buildPriorizacaoKeyFromFields_(nome, email, dataCadastro, dataNascimento);
  const priorLastRow = shPrior.getLastRow();
  let alreadyExists = false;
  if (priorLastRow > 1) {
    const priorData = shPrior.getRange(2, 1, priorLastRow - 1, priorLastCol).getValues();
    for (let i = 0; i < priorData.length; i++) {
      if (rowMatchesPriorizacaoKey_(priorData[i], key, priorHeaders)) {
        alreadyExists = true;
        break;
      }
    }
  }

  if (!alreadyExists) {
    shPrior.appendRow(rowToInsert);
  }

  naoRow[idxStatusPriorizacao] = statusPriorizacao;

  return {
    message: alreadyExists
      ? "Registro priorizado. Candidato já existia em Inscricoes_Prioritarias."
      : "Registro priorizado e copiado para Inscricoes_Prioritarias.",
    linhaOrigem: String(linhaOrigem),
    copiedToPrioritarias: !alreadyExists,
    updatedRow: {
      linhaOrigem: naoRow[idxLinhaOrigem] || "",
      nome: nome,
      email: email,
      telefone: telefone,
      bairro: bairro,
      status: naoRow[getColIndex(naoHeaders, "Status", 3)] || "",
      dataCadastro: dataCadastro,
      dataNascimento: dataNascimento,
      idade: idade,
      sexo: sexoOrigem,
      statusPriorizacao: statusPriorizacao
    }
  };
}

function buildPriorizacaoKey_(row, headers) {
  const values = Array.isArray(row) ? row : [];
  const hdr = Array.isArray(headers) ? headers : [];

  const idxNomeCompleto = hdr.length ? getColIndex(hdr, "Nome completo", -1) : -1;
  const idxNome = hdr.length ? getColIndex(hdr, "Nome", -1) : -1;
  const idxEmail = hdr.length ? getColIndex(hdr, "E-mail", -1) : -1;
  const idxDataCadastro = hdr.length ? getColIndex(hdr, "Data Cadastro", -1) : -1;
  const idxDataNascimento = hdr.length
    ? getColIndex(hdr, "Data de nascimento", getColIndex(hdr, "Data nascimento", -1))
    : -1;

  const nome = (idxNomeCompleto >= 0 ? values[idxNomeCompleto] : "") || (idxNome >= 0 ? values[idxNome] : "") || values[0] || values[1] || "";
  const email = (idxEmail >= 0 ? values[idxEmail] : "") || values[1] || values[7] || "";
  const dataCadastro = (idxDataCadastro >= 0 ? values[idxDataCadastro] : "") || values[3] || values[0] || "";
  const dataNascimento = (idxDataNascimento >= 0 ? values[idxDataNascimento] : "") || values[14] || values[5] || values[2] || "";

  return buildPriorizacaoKeyFromFields_(nome, email, dataCadastro, dataNascimento);
}

function buildPriorizacaoKeyFromFields_(nome, email, dataCadastro, nascimento) {
  const nomeKey = String(nome || "").trim().toLowerCase();
  const emailKey = String(email || "").trim().toLowerCase();
  const dateRef = nascimento || dataCadastro || "";
  const nascKey = priorizacaoDateKey_(dateRef);
  return nomeKey + "|" + nascKey + "|" + emailKey;
}

function rowMatchesPriorizacaoKey_(row, targetKey, headers) {
  if (!Array.isArray(row) || !targetKey) return false;

  const keyMapped = buildPriorizacaoKey_(row, headers);
  if (keyMapped === targetKey) return true;

  // Formato legado curto: [Nome, Email, Telefone, Bairro, Data cadastro, Data nascimento, Idade]
  const keyShortLegacy = buildPriorizacaoKeyFromFields_(row[0], row[1], row[4], row[5]);
  if (keyShortLegacy === targetKey) return true;

  // Formato legado antigo: Nome em B, Nascimento em C, Email em H
  const keyLegacy = buildPriorizacaoKeyFromFields_(row[1], row[7], "", row[2]);
  return keyLegacy === targetKey;
}

function priorizacaoDateKey_(value) {
  const d = parseDateAny(value);
  if (!d) return String(value || "").trim().toLowerCase();
  return Utilities.formatDate(d, "GMT-3", "yyyy-MM-dd");
}

function listarInscricoesPrioritarias() {
  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const sheet = getSheetResiliente(dbIns, "Inscricoes_Prioritarias");
  const data = sheet.getDataRange().getValues();

  if (!data || data.length < 2) return [];

  const headers = data[0] || [];
  const idxNome = getColIndex(headers, "Nome completo", getColIndex(headers, "Nome", 0));
  const idxEmail = getColIndex(headers, "E-mail", getColIndex(headers, "Email", 1));
  const idxStatus = getColIndex(headers, "Status", -1);
  const idxDataCadastro = getColIndex(headers, "Data Cadastro", getColIndex(headers, "Data cadastro", -1));
  const idxTelefone = getColIndex(headers, "Telefone", 4);
  const idxBairro = getColIndex(headers, "Bairro", 5);
  const idxStatusEnvio = getColIndex(headers, "Status Envio", -1);
  const idxInteresse = getColIndex(headers, "Interesse Confirmado", -1);
  const idxJaFez = getColIndex(headers, "Já fez o EAC em outra paróquia?", getColIndex(headers, "Ja fez o EAC", -1));
  const idxContatoMudou = getColIndex(headers, "Contato Mudou?", -1);
  const idxRecado = getColIndex(headers, "Recado", -1);
  const idxDataResposta = getColIndex(headers, "Data Resposta", -1);
  const idxAmigo = getColIndex(headers, "Amigo para fazer junto?", getColIndex(headers, "Amigo para", -1));
  const idxNomeAmigo = getColIndex(headers, "Nome do amigo", -1);

  // Campos opcionais (algumas planilhas podem não ter).
  const idxDataNascimento = getColIndex(headers, "Data de nascimento", getColIndex(headers, "Data nascimento", 14)); // O
  const idxIdade = getColIndex(headers, "Idade", 15); // P
  const idxSexo = getColIndex(headers, "Sexo", 16); // Q
  const idxPertence = getColIndex(headers, "Pertence a Porciuncula", -1);
  const idxStatusValidacao = getColIndex(headers, "Status da Validacao", -1);

  // Mapa auxiliar para permitir despriorização a partir da tela de prioritários:
  // chave (nome + email + dataCadastro + dataNascimento) -> linhaOrigem da aba "não inscritos".
  const linhaOrigemByKey = {};
  try {
    const shNao = getNaoInscritosSheet();
    const naoData = shNao.getDataRange().getValues();
    if (naoData && naoData.length > 1) {
      const naoHeaders = naoData[0] || [];
      const idxNaoLinhaOrigem = getColIndex(naoHeaders, "Linha Origem", 0);
      const idxNaoNome = getColIndex(naoHeaders, "Nome completo", getColIndex(naoHeaders, "Nome", 1));
      const idxNaoEmail = getColIndex(naoHeaders, "E-mail", getColIndex(naoHeaders, "Email", 2));
      const idxNaoDataCadastro = getColIndex(naoHeaders, "Data Cadastro", 4);
      const idxNaoDataNascimento = getColIndex(naoHeaders, "Data de nascimento", getColIndex(naoHeaders, "Data nascimento", 17));

      for (let i = 1; i < naoData.length; i++) {
        const rowNao = naoData[i] || [];
        const linhaOrigem = String(rowNao[idxNaoLinhaOrigem] || "").trim();
        if (!linhaOrigem) continue;

        const keyNao = buildPriorizacaoKeyFromFields_(
          rowNao[idxNaoNome] || "",
          rowNao[idxNaoEmail] || "",
          rowNao[idxNaoDataCadastro] || "",
          rowNao[idxNaoDataNascimento] || ""
        );
        if (keyNao && !linhaOrigemByKey[keyNao]) {
          linhaOrigemByKey[keyNao] = linhaOrigem;
        }
      }
    }
  } catch (e) {
    // Mantém o retorno sem linhaOrigem caso não seja possível mapear a aba de não inscritos.
  }

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || [];
    const nome = String(row[idxNome] || "").trim();
    const email = String(row[idxEmail] || "").trim();
    if (!nome && !email) continue;

    const dataNascimento = idxDataNascimento >= 0 ? (row[idxDataNascimento] || "") : "";
    const idadeRaw = idxIdade >= 0 ? row[idxIdade] : "";
    const idadeCalculada = calcularIdade(dataNascimento);
    const idadeFinal = String(idadeCalculada || "").trim() || String(idadeRaw || "").trim();
    const sexo = idxSexo >= 0 ? String(row[idxSexo] || "").trim() : "";
    const pertencePorciuncula = idxPertence >= 0 ? String(row[idxPertence] || "").trim() : "";
    const statusValidacao = idxStatusValidacao >= 0 ? String(row[idxStatusValidacao] || "").trim() : "";
    const keyPrior = buildPriorizacaoKey_(row, headers);
    const keyFallback = buildPriorizacaoKeyFromFields_(
      nome,
      email,
      idxDataCadastro >= 0 ? (row[idxDataCadastro] || "") : "",
      dataNascimento
    );
    const linhaOrigem = String(linhaOrigemByKey[keyPrior] || linhaOrigemByKey[keyFallback] || "").trim();

    items.push({
      id: "pri-" + (i + 1),
      linhaOrigem: linhaOrigem,
      nome: nome,
      email: email,
      status: idxStatus >= 0 ? String(row[idxStatus] || "").trim() : "",
      statusEnvio: idxStatusEnvio >= 0 ? String(row[idxStatusEnvio] || "").trim() : "",
      interesseConfirmado: idxInteresse >= 0 ? String(row[idxInteresse] || "").trim() : "",
      jaFezEac: idxJaFez >= 0 ? String(row[idxJaFez] || "").trim() : "",
      contatoMudou: idxContatoMudou >= 0 ? String(row[idxContatoMudou] || "").trim() : "",
      recado: idxRecado >= 0 ? String(row[idxRecado] || "").trim() : "",
      dataResposta: idxDataResposta >= 0 ? (row[idxDataResposta] || "") : "",
      amigo: idxAmigo >= 0 ? String(row[idxAmigo] || "").trim() : "",
      nomeAmigo: idxNomeAmigo >= 0 ? String(row[idxNomeAmigo] || "").trim() : "",
      telefone: String(row[idxTelefone] || "").trim(),
      bairro: String(row[idxBairro] || "").trim(),
      dataCadastro: idxDataCadastro >= 0 ? (row[idxDataCadastro] || "") : "",
      dataNascimento: dataNascimento,
      idade: idadeFinal,
      sexo: sexo,
      pertencePorciuncula: pertencePorciuncula,
      statusValidacao: statusValidacao
    });
  }

  return items;
}

function listarDistribuicaoCirculos() {
  const CIRCLE_NAMES = [
    "Circulo 1",
    "Circulo 2",
    "Circulo 3",
    "Circulo 4",
    "Circulo 5",
    "Circulo 6",
    "Circulo Excedente"
  ];

  const grouped = {};
  for (var i = 0; i < CIRCLE_NAMES.length; i++) {
    grouped[CIRCLE_NAMES[i]] = [];
  }

  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const candidates = [
    "Círculos_Distribuídos",
    "Circulos_Distribuidos",
    "Círculos Distribuídos",
    "Circulos Distribuidos",
    "Nova_Distribuicao_Circulos"
  ];

  let sheet = null;
  for (var c = 0; c < candidates.length; c++) {
    const sh = dbIns.getSheetByName(candidates[c]);
    if (sh) {
      sheet = sh;
      break;
    }
  }

  if (!sheet) return grouped;

  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return grouped;

  function normalizeCircleName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Circulo Excedente";
    const norm = normalizeHeader(raw);
    const m = norm.match(/circulo\s*(\d+)/);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 6) return "Circulo " + n;
    }
    if (norm.indexOf("exced") !== -1) return "Circulo Excedente";
    return "Circulo Excedente";
  }

  for (var r = 1; r < data.length; r++) {
    const row = data[r] || [];
    const nome = String(row[0] || "").trim();
    const idade = row[1] || "";
    const bairro = String(row[2] || "").trim();
    const sexo = String(row[3] || "").trim();
    const grupo = normalizeCircleName(row[4] || "");

    if (!nome && !bairro && !sexo && !idade) continue;

    grouped[grupo].push({
      nome: nome,
      idade: idade,
      bairro: bairro,
      sexo: sexo,
      grupoSugerido: grupo
    });
  }

  return grouped;
}

function parseCirculoAgeLimit_(value, fallback, hardMin, hardMax) {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  const floored = Math.floor(n);
  if (floored < hardMin || floored > hardMax) return fallback;
  return floored;
}

function buildAgePriorityLabel_(minAge, maxAge) {
  const start = Number(minAge);
  const end = Number(maxAge);
  if (!isFinite(start) || !isFinite(end) || end < start) return "";
  const list = [];
  for (let age = start; age <= end; age++) list.push(String(age));
  if (list.length === 1) return list[0];
  if (list.length === 2) return list[0] + " e " + list[1];
  return list.slice(0, -1).join(", ") + " e " + list[list.length - 1];
}

function novaDistribuicaoCirculos(payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const sheetOrigem = getSheetResiliente(dbIns, "Inscricoes_Prioritarias");
  const sheetDestino = getSheetResiliente(dbIns, "Nova_Distribuicao_Circulos");
  const DEST_HEADERS = ["Nome", "Idade", "Bairro", "Sexo", "Grupo Sugerido"];
  const CIRCLE_NAMES = ["Circulo 1", "Circulo 2", "Circulo 3", "Circulo 4", "Circulo 5", "Circulo 6", "Circulo Excedente"];
  const MAIN_MIN_AGE = parseCirculoAgeLimit_(
    input.minAge !== undefined ? input.minAge : input.idadeMinima,
    13,
    0,
    99
  );
  const MAIN_MAX_AGE = parseCirculoAgeLimit_(
    input.maxAge !== undefined ? input.maxAge : input.idadeMaxima,
    17,
    0,
    99
  );
  if (MAIN_MAX_AGE < MAIN_MIN_AGE) {
    throw new Error("Faixa etaria invalida para distribuicao: idade maxima menor que idade minima.");
  }
  const MAIN_CIRCLES_COUNT = 6;
  const MAX_BY_SEXO_PER_CIRCLE = 6;

  const data = sheetOrigem.getDataRange().getValues();
  sheetDestino.clear();
  sheetDestino.getRange(1, 1, 1, DEST_HEADERS.length).setValues([DEST_HEADERS]);

  if (!data || data.length < 2) {
    return {
      message: "Sem dados para distribuicao em Inscricoes_Prioritarias.",
      totalAptos: 0,
      totalDistribuidos: 0,
      totalFiltradosPorIdade: 0,
      grupos: [],
      storage: {
        spreadsheetId: SPREADSHEET_ID_INSCRICOES,
        sheetName: "Nova_Distribuicao_Circulos"
      }
    };
  }

  const headers = data[0] || [];
  const idxNome = getColIndex(headers, "Nome completo", getColIndex(headers, "Nome", 0));
  const idxSexo = getColIndex(headers, "Sexo", 16); // Q
  const idxBairro = getColIndex(headers, "Bairro", 5);
  const idxIdade = getColIndex(headers, "Idade", 15);
  const idxDataNascimento = getColIndex(headers, "Data de nascimento", getColIndex(headers, "Data nascimento", 14));
  const idxPertence = getColIndex(headers, "Pertence a Porciuncula", -1);
  const idxStatusValidacao = getColIndex(headers, "Status da Validacao", -1);

  const aptos = [];
  let filtradosPorIdade = 0;
  let foraDaFaixaPrincipal = 0;
  let dozePromovidosParaFaixaPrincipal = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || [];
    const nome = String(row[idxNome] || "").trim();
    if (!nome) continue;

    const pertence = idxPertence >= 0 ? String(row[idxPertence] || "").trim() : "";
    const statusValidacao = idxStatusValidacao >= 0 ? String(row[idxStatusValidacao] || "").trim() : "";

    // Se houver essas colunas, aplica filtro.
    if (idxPertence >= 0 && pertence && !isTruthyYes_(pertence)) continue;
    if (idxStatusValidacao >= 0 && statusValidacao && normalizeHeader(statusValidacao) !== "validado") continue;

    const idadePlanilha = idxIdade >= 0 ? parseMemberAgeNumber(row[idxIdade]) : null;
    const idadeCalculada = idxDataNascimento >= 0 ? parseMemberAgeNumber(calcularIdade(row[idxDataNascimento])) : null;
    const idadeBase = idadeCalculada !== null ? idadeCalculada : idadePlanilha;
    if (idadeBase === null) {
      filtradosPorIdade++;
      continue;
    }
    const nascimento = idxDataNascimento >= 0 ? row[idxDataNascimento] : "";
    const promote12 = shouldPromoteAge12ToMainRange_(idadeBase, nascimento, 6);
    if (promote12) dozePromovidosParaFaixaPrincipal++;
    const idadeDistribuicao = promote12 ? MAIN_MIN_AGE : idadeBase;
    if (!isMainRangeAgeForCirculo_(idadeDistribuicao, MAIN_MIN_AGE, MAIN_MAX_AGE)) foraDaFaixaPrincipal++;

    const sexoInfo = idxSexo >= 0 ? normalizeSexoForCirculo_(row[idxSexo]) : { key: "nao_informado", label: "Nao informado" };
    const bairro = String(row[idxBairro] || "").trim();
    aptos.push({
      nome: nome,
      idade: idadeBase,
      idadeDistribuicao: idadeDistribuicao,
      bairro: bairro,
      sexo: sexoInfo.label,
      sexoKey: sexoInfo.key
    });
  }

  const grupos = Array.from({ length: CIRCLE_NAMES.length }, function () { return []; });

  const masculinosPool = aptos.filter(function (p) { return p.sexoKey === "masculino"; });
  const femininosPool = aptos.filter(function (p) { return p.sexoKey === "feminino"; });
  const naoInformadosPool = aptos.filter(function (p) { return p.sexoKey !== "masculino" && p.sexoKey !== "feminino"; });

  // Nova regra:
  // 1) C1..C6 com limite de 6 meninos + 6 meninas (max 12 por circulo).
  // 2) Prioridade de idade: 13 -> 14 -> 15 -> 16 -> 17.
  // 3) Para completar vagas, usa fora da faixa priorizando 17+, depois menores de 13.
  // 4) Meninas tentam seguir o mesmo bairro dominante dos meninos do circulo.
  for (let i = 0; i < MAIN_CIRCLES_COUNT; i++) {
    let bairroReferencia = pickDominantBairroForCirculoPool_(masculinosPool, MAIN_MIN_AGE, MAIN_MAX_AGE);
    if (!bairroReferencia) {
      bairroReferencia = pickDominantBairroForCirculoPool_(femininosPool, MAIN_MIN_AGE, MAIN_MAX_AGE);
    }

    for (let slot = 0; slot < MAX_BY_SEXO_PER_CIRCLE; slot++) {
      const picked = pullCandidateForCirclePool_(masculinosPool, {
        preferredBairro: bairroReferencia,
        currentCircle: grupos[i],
        mainMinAge: MAIN_MIN_AGE,
        mainMaxAge: MAIN_MAX_AGE,
        strictMatrix: true,
        allowOutsideMainRange: false
      });
      if (!picked) break;
      grupos[i].push(picked);
      if (!bairroReferencia && String(picked.bairro || "").trim()) {
        bairroReferencia = String(picked.bairro || "").trim();
      }
    }

    for (let slot = 0; slot < MAX_BY_SEXO_PER_CIRCLE; slot++) {
      const picked = pullCandidateForCirclePool_(femininosPool, {
        preferredBairro: bairroReferencia,
        currentCircle: grupos[i],
        mainMinAge: MAIN_MIN_AGE,
        mainMaxAge: MAIN_MAX_AGE,
        strictMatrix: true,
        allowOutsideMainRange: false
      });
      if (!picked) break;
      grupos[i].push(picked);
      if (!bairroReferencia && String(picked.bairro || "").trim()) {
        bairroReferencia = String(picked.bairro || "").trim();
      }
    }
  }

  // Excedente: prioridade para fora da faixa principal.
  // Se houver sobra dentro da faixa por limite de capacidade/sexo, tambem vai para excedente.
  const sobras = []
    .concat(masculinosPool)
    .concat(femininosPool)
    .concat(naoInformadosPool);
  const excedenteForaFaixa = [];
  const excedenteDentroFaixa = [];
  for (let i = 0; i < sobras.length; i++) {
    const p = sobras[i];
    if (isMainRangeAgeForCirculo_(getCandidateAgeForDistribuicao_(p), MAIN_MIN_AGE, MAIN_MAX_AGE)) {
      excedenteDentroFaixa.push(p);
    } else {
      excedenteForaFaixa.push(p);
    }
  }
  grupos[6] = excedenteForaFaixa.concat(excedenteDentroFaixa);

  const rowsOut = [];
  const gruposResumo = [];
  for (let i = 0; i < grupos.length; i++) {
    const nomeCirculo = CIRCLE_NAMES[i];
    const g = grupos[i];
    const sexoCounts = getSexoCounts_(g);
    gruposResumo.push({
      nome: nomeCirculo,
      quantidade: g.length,
      masculino: sexoCounts.masculino,
      feminino: sexoCounts.feminino,
      naoInformado: sexoCounts.naoInformado
    });
    for (let j = 0; j < g.length; j++) {
      const p = g[j];
      // Registra a idade utilizada na distribuicao (ex.: 12 promovido para 13 quando falta <= 6 meses).
      rowsOut.push([p.nome, getCandidateAgeForDistribuicao_(p), p.bairro, p.sexo, nomeCirculo]);
    }
  }

  if (rowsOut.length > 0) {
    sheetDestino.getRange(2, 1, rowsOut.length, DEST_HEADERS.length).setValues(rowsOut);
  }

  return {
    message: "Distribuicao de circulos concluida com sucesso.",
    totalAptos: aptos.length,
    totalDistribuidos: rowsOut.length,
    totalFiltradosPorIdade: filtradosPorIdade,
    totalForaDaFaixaPrincipal: foraDaFaixaPrincipal,
    totalDozeComViradaAte6Meses: dozePromovidosParaFaixaPrincipal,
    totalExcedenteForaFaixa: excedenteForaFaixa.length,
    totalExcedenteDentroFaixa: excedenteDentroFaixa.length,
    grupos: gruposResumo,
    storage: {
      spreadsheetId: SPREADSHEET_ID_INSCRICOES,
      sheetName: "Nova_Distribuicao_Circulos"
    },
    criterios: {
      faixaPrincipalIdade: MAIN_MIN_AGE + " a " + MAIN_MAX_AGE + " anos",
      regraDozeAnos: "12 anos so entra na faixa principal quando falta ate 6 meses para completar 13",
      matrizCombinacaoIdade: "13 com 14; a partir de 14, combinacao com diferenca maxima de 2 anos",
      limitePorCirculo: "C1..C6: ate 6 meninos e ate 6 meninas (maximo 12)",
      prioridadeIdade: buildAgePriorityLabel_(MAIN_MIN_AGE, MAIN_MAX_AGE) + "; respeitando matriz de combinacao de forma estrita em C1..C6",
      prioridadeBairro: "Meninas tentam acompanhar o bairro dominante dos meninos do circulo",
      regraExcedente: "Recebe idades fora de " + MAIN_MIN_AGE + ".." + MAIN_MAX_AGE + " e tambem sobras da faixa principal que nao encaixam por matriz/limite de sexo"
    }
  };
}

function normalizeSexoForCirculo_(value) {
  const raw = normalizeHeader(value || "");
  if (raw === "masculino" || raw === "masc" || raw === "m") {
    return { key: "masculino", label: "Masculino" };
  }
  if (raw === "feminino" || raw === "fem" || raw === "f") {
    return { key: "feminino", label: "Feminino" };
  }
  const label = String(value || "").trim() || "Nao informado";
  return { key: "nao_informado", label: label };
}

function isTruthyYes_(value) {
  const s = normalizeHeader(value || "");
  return s === "sim" || s === "s" || s === "yes" || s === "y" || s === "1" || s === "true";
}

function isMainRangeAgeForCirculo_(age, minAge, maxAge) {
  const n = Number(age);
  return isFinite(n) && n >= minAge && n <= maxAge;
}

function getCandidateAgeForDistribuicao_(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const n = Number(candidate.idadeDistribuicao !== undefined ? candidate.idadeDistribuicao : candidate.idade);
  if (!isFinite(n)) return null;
  return Math.floor(n);
}

function getStartOfDay_(value) {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function getDaysUntilNextBirthday_(birthDate, refDate) {
  const birth = parseDateAny(birthDate);
  if (!birth) return null;

  const ref = getStartOfDay_(refDate || new Date());
  let next = new Date(ref.getFullYear(), birth.getMonth(), birth.getDate(), 0, 0, 0, 0);
  if (next.getTime() < ref.getTime()) {
    next = new Date(ref.getFullYear() + 1, birth.getMonth(), birth.getDate(), 0, 0, 0, 0);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diff = next.getTime() - ref.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

function shouldPromoteAge12ToMainRange_(age, birthDate, maxMonthsAhead) {
  const n = Number(age);
  if (!isFinite(n) || Math.floor(n) !== 12) return false;

  const monthsAhead = Number(maxMonthsAhead);
  const daysLimit = (isFinite(monthsAhead) && monthsAhead > 0 ? Math.floor(monthsAhead) : 6) * 31;
  const days = getDaysUntilNextBirthday_(birthDate, new Date());
  return days !== null && days >= 0 && days <= daysLimit;
}

function isAgePairAllowedByCirculoMatrix_(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!isFinite(na) || !isFinite(nb)) return true;

  const low = Math.min(na, nb);
  const high = Math.max(na, nb);

  // 13 com 14 (e entre 13) como base da matriz.
  if (low <= 13) return high <= 14;

  // A partir de 14, permite progressao de ate 2 anos (14-16, 15-17, 16-18...).
  return (high - low) <= 2;
}

function isAgeAllowedInCircleByMatrix_(candidateAge, currentCircle) {
  const n = Number(candidateAge);
  if (!isFinite(n)) return false;

  const list = Array.isArray(currentCircle) ? currentCircle : [];
  if (list.length === 0) return true;

  for (let i = 0; i < list.length; i++) {
    const ageInCircle = getCandidateAgeForDistribuicao_(list[i]);
    if (ageInCircle === null) continue;
    if (!isAgePairAllowedByCirculoMatrix_(n, ageInCircle)) return false;
  }

  return true;
}

function getOutsideRangeAgeRankForCirculo_(age, minAge, maxAge) {
  const n = Number(age);
  if (!isFinite(n)) return 9999;
  if (n > maxAge) return n - maxAge; // 17 antes de 18, etc
  if (n < minAge) return 100 + (minAge - n); // menores ficam apos maiores de 16
  return 0;
}

function pickDominantBairroForCirculoPool_(pool, minAge, maxAge) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length === 0) return "";

  const countByBairro = {};
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const bairroLabel = String(p.bairro || "").trim() || "Nao informado";
    const bairroKey = normalizeHeader(bairroLabel);
    if (!countByBairro[bairroKey]) {
      countByBairro[bairroKey] = { label: bairroLabel, inRange: 0, total: 0, firstIndex: i };
    }
    countByBairro[bairroKey].total++;
    if (isMainRangeAgeForCirculo_(getCandidateAgeForDistribuicao_(p), minAge, maxAge)) {
      countByBairro[bairroKey].inRange++;
    }
  }

  const keys = Object.keys(countByBairro);
  const hasInRange = keys.some(function (key) { return countByBairro[key].inRange > 0; });

  let bestLabel = "";
  let bestPrimary = -1;
  let bestTotal = -1;
  let bestFirstIndex = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < keys.length; i++) {
    const item = countByBairro[keys[i]];
    const primary = hasInRange ? item.inRange : item.total;
    if (
      primary > bestPrimary ||
      (primary === bestPrimary && item.total > bestTotal) ||
      (primary === bestPrimary && item.total === bestTotal && item.firstIndex < bestFirstIndex)
    ) {
      bestPrimary = primary;
      bestTotal = item.total;
      bestFirstIndex = item.firstIndex;
      bestLabel = item.label;
    }
  }

  return bestLabel;
}

function pullCandidateForCirclePool_(pool, options) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length === 0) return null;

  const minAgeRaw = Number(options && options.mainMinAge);
  const maxAgeRaw = Number(options && options.mainMaxAge);
  const minAge = isFinite(minAgeRaw) ? Math.floor(minAgeRaw) : 13;
  const maxAge = isFinite(maxAgeRaw) ? Math.floor(maxAgeRaw) : 17;
  const preferredBairroNorm = normalizeHeader(options && options.preferredBairro ? options.preferredBairro : "");
  const currentCircle = Array.isArray(options && options.currentCircle) ? options.currentCircle : [];
  const strictMatrix = !!(options && options.strictMatrix);
  const allowOutsideMainRange = options && options.allowOutsideMainRange === false ? false : true;

  function pickByAge(age, requirePreferredBairro, requireMatrix) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const idade = getCandidateAgeForDistribuicao_(p);
      if (idade === null || idade !== age) continue;
      if (requirePreferredBairro && preferredBairroNorm && normalizeHeader(p.bairro || "") !== preferredBairroNorm) continue;
      if (requireMatrix && !isAgeAllowedInCircleByMatrix_(idade, currentCircle)) continue;
      return list.splice(i, 1)[0];
    }
    return null;
  }

  // Prioridade principal de idade: minAge -> ... -> maxAge
  // Primeiro respeita a matriz de combinacao; se nao houver opcao, relaxa a matriz.
  for (let age = minAge; age <= maxAge; age++) {
    const picked = pickByAge(age, true, true);
    if (picked) return picked;
  }
  for (let age = minAge; age <= maxAge; age++) {
    const picked = pickByAge(age, false, true);
    if (picked) return picked;
  }

  if (strictMatrix) return null;

  for (let age = minAge; age <= maxAge; age++) {
    const picked = pickByAge(age, true, false);
    if (picked) return picked;
  }
  for (let age = minAge; age <= maxAge; age++) {
    const picked = pickByAge(age, false, false);
    if (picked) return picked;
  }

  if (!allowOutsideMainRange) return null;

  // Fallback fora da faixa para completar vagas.
  function pickFallbackOutsideMainRange(requireMatrix) {
    let bestIdx = -1;
    let bestBairroPenalty = Number.MAX_SAFE_INTEGER;
    let bestAgeRank = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const idade = getCandidateAgeForDistribuicao_(p);
      if (idade === null) continue;
      if (isMainRangeAgeForCirculo_(idade, minAge, maxAge)) continue;
      if (requireMatrix && !isAgeAllowedInCircleByMatrix_(idade, currentCircle)) continue;

      const bairroPenalty = preferredBairroNorm && normalizeHeader(p.bairro || "") !== preferredBairroNorm ? 1 : 0;
      const ageRank = getOutsideRangeAgeRankForCirculo_(idade, minAge, maxAge);

      if (
        bestIdx < 0 ||
        bairroPenalty < bestBairroPenalty ||
        (bairroPenalty === bestBairroPenalty && ageRank < bestAgeRank) ||
        (bairroPenalty === bestBairroPenalty && ageRank === bestAgeRank && i < bestIdx)
      ) {
        bestIdx = i;
        bestBairroPenalty = bairroPenalty;
        bestAgeRank = ageRank;
      }
    }

    if (bestIdx >= 0) return list.splice(bestIdx, 1)[0];
    return null;
  }

  return pickFallbackOutsideMainRange(true) || pickFallbackOutsideMainRange(false);
}

function getSexoCounts_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = { masculino: 0, feminino: 0, naoInformado: 0 };
  for (let i = 0; i < list.length; i++) {
    const key = String(list[i].sexoKey || "").trim();
    if (key === "masculino") counts.masculino++;
    else if (key === "feminino") counts.feminino++;
    else counts.naoInformado++;
  }
  return counts;
}

const ENCONTREIRO_HEADERS = [
  "Timestamp",
  "Nome completo",
  "Data de nascimento",
  "Idade",
  "E-mail",
  "Celular / WhatsApp",
  "Endereco completo",
  "Responsavel / Grau de Parentesco e Contato (caso menor de idade)",
  "Bairro onde mora",
  "Frequenta missas?",
  "Se sim, onde?",
  "Participa de algum movimento da igreja?",
  "Se sim, qual e em qual paroquia?",
  "Paroquia onde voce fez o EAC",
  "Ja trabalhou em algum EAC?",
  "Ja coordenou alguma equipe?",
  "Seus pais ja fizeram algum encontro?",
  "Possui alguma alergia? Se sim, qual?",
  "Toma algum remedio? Se sim, qual?",
  "Possui alguma alimentacao especial?",
  "Se voce trabalhou no nosso ultimo encontro, tem alguma sugestao para melhorarmos?",
  "Nos de uma dica sobre o que voce gostaria que acontecesse em algum pos-encontro.",
  "Classificacao"
];

function getEncontreirosSheet() {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID_ENCONTREIROS);
  const byId = db.getSheets().find(s => s.getSheetId && s.getSheetId() === ENCONTREIROS_SHEET_GID);
  if (byId) return byId;

  const candidates = [
    "Cadastro de Encontreiro",
    "Cadastro Encontreiro",
    "Encontreiros",
    "encontreiros",
    "Respostas ao formulario 1"
  ];
  for (let i = 0; i < candidates.length; i++) {
    const sh = db.getSheetByName(candidates[i]);
    if (sh) return sh;
  }

  const all = db.getSheets();
  if (all && all.length > 0) return all[0];
  return db.insertSheet("Cadastro de Encontreiro");
}

function ensureEncontreiroHeaders(sheet) {
  const required = ENCONTREIRO_HEADERS.slice();
  const lastCol = Math.max(sheet.getLastColumn(), required.length);
  const hasRows = sheet.getLastRow() > 0;

  if (!hasRows) {
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    return required;
  }

  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;

  for (let i = 0; i < required.length; i++) {
    if (!String(current[i] || "").trim()) {
      current[i] = required[i];
      changed = true;
    }
  }

  if (current.length < required.length) {
    for (let i = current.length; i < required.length; i++) {
      current[i] = required[i];
    }
    changed = true;
  }

  if (changed) {
    sheet.getRange(1, 1, 1, current.length).setValues([current]);
  }
  return current;
}

function getEncontreiroIndexes(headers) {
  return {
    timestamp: getColIndex(headers, "Timestamp", 0),
    nomeCompleto: getColIndex(headers, "Nome completo", 1),
    dataNascimento: getColIndex(headers, "Data de nascimento", 2),
    idade: getColIndex(headers, "Idade", 3),
    email: getColIndex(headers, "E-mail", 4),
    celularWhatsapp: getColIndex(headers, "Celular / WhatsApp", 5),
    enderecoCompleto: getColIndex(headers, "Endereco completo", 6),
    responsavelContato: getColIndex(headers, "Responsavel / Grau de Parentesco e Contato", 7),
    bairro: getColIndex(headers, "Bairro onde mora", 8),
    frequentaMissas: getColIndex(headers, "Frequenta missas?", 9),
    ondeMissas: getColIndex(headers, "Se sim, onde?", 10),
    participaMovimento: getColIndex(headers, "Participa de algum movimento da igreja?", 11),
    movimentoParoquia: getColIndex(headers, "Se sim, qual e em qual paroquia?", 12),
    paroquiaFezEac: getColIndex(headers, "Paroquia onde voce fez o EAC", 13),
    jaTrabalhouEac: getColIndex(headers, "Ja trabalhou em algum EAC?", 14),
    jaCoordenouEquipe: getColIndex(headers, "Ja coordenou alguma equipe?", 15),
    paisFizeramEncontro: getColIndex(headers, "Seus pais ja fizeram algum encontro?", 16),
    possuiAlergia: getColIndex(headers, "Possui alguma alergia? Se sim, qual?", 17),
    tomaRemedio: getColIndex(headers, "Toma algum remedio? Se sim, qual?", 18),
    alimentacaoEspecial: getColIndex(headers, "Possui alguma alimentacao especial?", 19),
    sugestaoUltimoEncontro: getColIndex(headers, "Se voce trabalhou no nosso ultimo encontro, tem alguma sugestao para melhorarmos?", 20),
    dicaPosEncontro: getColIndex(headers, "Nos de uma dica sobre o que voce gostaria que acontecesse em algum pos-encontro.", 21),
    classificacao: getColIndex(headers, "Classificacao", 22)
  };
}

function parseDateAny(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const s = String(value).trim();
  if (!s) return null;

  // dd/MM/yyyy [HH:mm[:ss]]
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    const h = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const se = Number(m[6] || 0);
    const parsedBR = new Date(y, mo, d, h, mi, se, 0);
    if (
      !isNaN(parsedBR.getTime()) &&
      parsedBR.getFullYear() === y &&
      parsedBR.getMonth() === mo &&
      parsedBR.getDate() === d &&
      parsedBR.getHours() === h &&
      parsedBR.getMinutes() === mi &&
      parsedBR.getSeconds() === se
    ) return parsedBR;
  }

  // yyyy-MM-dd [HH:mm[:ss]] ou yyyy-MM-ddTHH:mm[:ss]
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const h = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const se = Number(m[6] || 0);
    const parsedISO = new Date(y, mo, d, h, mi, se, 0);
    if (
      !isNaN(parsedISO.getTime()) &&
      parsedISO.getFullYear() === y &&
      parsedISO.getMonth() === mo &&
      parsedISO.getDate() === d &&
      parsedISO.getHours() === h &&
      parsedISO.getMinutes() === mi &&
      parsedISO.getSeconds() === se
    ) return parsedISO;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function calcularIdade(dataNascimento) {
  if (dataNascimento === undefined || dataNascimento === null || dataNascimento === "") return "";

  const idadeReal = getAgeFromBirthDate(dataNascimento);
  if (idadeReal !== "") return idadeReal;

  let anoNascimento = NaN;
  const raw = String(dataNascimento).trim();
  if (!raw) return "";

  // Fallback para entradas que tenham apenas o ano.
  if (/^\d{4}$/.test(raw)) {
    anoNascimento = Number(raw);
  } else {
    const m = raw.match(/(\d{4})/);
    if (m) anoNascimento = Number(m[1]);
  }

  const anoAtual = new Date().getFullYear();
  const idade = anoAtual - Number(anoNascimento);
  if (!isFinite(idade) || idade < 0) return "";
  return idade;
}

function getCurrentBusinessSemesterRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1..12

  // Regra solicitada:
  // - Se estamos no 1o semestre: considera 01..06
  // - Se estamos no 2o semestre: considera 06..12
  const start = (month <= 6)
    ? new Date(year, 0, 1, 0, 0, 0, 0)   // 01/jan
    : new Date(year, 5, 1, 0, 0, 0, 0);  // 01/jun

  const end = (month <= 6)
    ? new Date(year, 5, 30, 23, 59, 59, 999)  // 30/jun
    : new Date(year, 11, 31, 23, 59, 59, 999); // 31/dez

  return { start, end };
}

function getAgeFromBirthDate(value) {
  const birth = parseDateAny(value);
  if (!birth) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : "";
}

function normalizeWhatsappBrazil(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }

  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const tail = digits.slice(-8);
    return "55" + ddd + "9" + tail;
  }

  return digits.startsWith("55") ? digits : "55" + digits;
}

function parseEncontreiroRowNumber(payload) {
  const rawId = String(payload && (payload.id || payload.rowNumber || payload.row || payload.linha) || "").trim();
  if (!rawId) return -1;
  if (/^enc-\d+$/i.test(rawId)) {
    return parseInt(rawId.split("-")[1], 10);
  }
  if (/^\d+$/.test(rawId)) return parseInt(rawId, 10);
  return -1;
}

function mapEncontreiroRow(row, rowNumber, idx) {
  const timestamp = row[idx.timestamp] || "";
  const celular = row[idx.celularWhatsapp] || "";
  const whatsappNormalizado = normalizeWhatsappBrazil(celular);

  return {
    id: "enc-" + rowNumber,
    rowNumber: rowNumber,
    timestamp: timestamp,
    nomeCompleto: row[idx.nomeCompleto] || "",
    dataNascimento: row[idx.dataNascimento] || "",
    idade: row[idx.idade] || getAgeFromBirthDate(row[idx.dataNascimento]),
    email: row[idx.email] || "",
    celularWhatsapp: celular,
    enderecoCompleto: row[idx.enderecoCompleto] || "",
    responsavelContato: row[idx.responsavelContato] || "",
    bairro: row[idx.bairro] || "",
    frequentaMissas: row[idx.frequentaMissas] || "",
    ondeMissas: row[idx.ondeMissas] || "",
    participaMovimento: row[idx.participaMovimento] || "",
    movimentoParoquia: row[idx.movimentoParoquia] || "",
    paroquiaFezEac: row[idx.paroquiaFezEac] || "",
    jaTrabalhouEac: row[idx.jaTrabalhouEac] || "",
    jaCoordenouEquipe: row[idx.jaCoordenouEquipe] || "",
    paisFizeramEncontro: row[idx.paisFizeramEncontro] || "",
    possuiAlergia: row[idx.possuiAlergia] || "",
    tomaRemedio: row[idx.tomaRemedio] || "",
    alimentacaoEspecial: row[idx.alimentacaoEspecial] || "",
    sugestaoUltimoEncontro: row[idx.sugestaoUltimoEncontro] || "",
    dicaPosEncontro: row[idx.dicaPosEncontro] || "",
    classificacao: row[idx.classificacao] || "",
    whatsappNormalizado: whatsappNormalizado,
    whatsappLink: whatsappNormalizado ? "https://wa.me/" + whatsappNormalizado : ""
  };
}

function handleGetEncontreiros() {
  try {
    const sheet = getEncontreirosSheet();
    const headers = ensureEncontreiroHeaders(sheet);
    const data = sheet.getDataRange().getValues();
    const idx = getEncontreiroIndexes(headers);

    if (!data || data.length < 2) {
      return responder(true, {
        encontreiros: [],
        indicators: { total: 0, novosSemestre: 0, novos7dias: 0 },
        bairroStats: []
      });
    }

    const semesterRange = getCurrentBusinessSemesterRange();

    let novosSemestre = 0;
    const bairroMap = {};
    const list = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      const hasValue = row.some(v => String(v || "").trim() !== "");
      if (!hasValue) continue;

      const rowNumber = i + 1;
      const mapped = mapEncontreiroRow(row, rowNumber, idx);
      list.push(mapped);

      const ts = parseDateAny(mapped.timestamp);
      if (ts && ts >= semesterRange.start && ts <= semesterRange.end) {
        novosSemestre++;
      }

      const bairro = String(mapped.bairro || "Nao informado").trim() || "Nao informado";
      bairroMap[bairro] = (bairroMap[bairro] || 0) + 1;
    }

    list.sort((a, b) => {
      const da = parseDateAny(a.timestamp);
      const db = parseDateAny(b.timestamp);
      if (da && db) return db.getTime() - da.getTime();
      if (da) return -1;
      if (db) return 1;
      return b.rowNumber - a.rowNumber;
    });

    const bairroStats = Object.keys(bairroMap)
      .map(nome => ({ nome: nome, quantidade: bairroMap[nome] }))
      .sort((a, b) => b.quantidade - a.quantidade);

    return responder(true, {
      encontreiros: list,
      indicators: {
        total: list.length,
        novosSemestre: novosSemestre,
        // compatibilidade com frontend legado
        novos7dias: novosSemestre
      },
      bairroStats: bairroStats
    });
  } catch (err) {
    registrarLog("error", "GET_ENCONTREIROS", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}

function handleSaveEncontreiro(payload) {
  try {
    const sheet = getEncontreirosSheet();
    const headers = ensureEncontreiroHeaders(sheet);
    const idx = getEncontreiroIndexes(headers);

    const rowNumber = parseEncontreiroRowNumber(payload || {});
    const lastRow = sheet.getLastRow();
    const canUpdate = rowNumber > 1 && rowNumber <= lastRow;

    let currentRow = new Array(ENCONTREIRO_HEADERS.length).fill("");
    if (canUpdate) {
      currentRow = sheet.getRange(rowNumber, 1, 1, ENCONTREIRO_HEADERS.length).getValues()[0];
    }

    const timestampInput = (payload && payload.timestamp) || currentRow[idx.timestamp] || new Date();
    const nascimento = String((payload && payload.dataNascimento) || "").trim();
    const idade = String((payload && payload.idade) || "").trim() || getAgeFromBirthDate(nascimento);

    const rowValues = new Array(ENCONTREIRO_HEADERS.length).fill("");
    rowValues[idx.timestamp] = timestampInput;
    rowValues[idx.nomeCompleto] = String((payload && payload.nomeCompleto) || "").trim();
    rowValues[idx.dataNascimento] = nascimento;
    rowValues[idx.idade] = idade;
    rowValues[idx.email] = String((payload && payload.email) || "").trim();
    rowValues[idx.celularWhatsapp] = String((payload && payload.celularWhatsapp) || "").trim();
    rowValues[idx.enderecoCompleto] = String((payload && payload.enderecoCompleto) || "").trim();
    rowValues[idx.responsavelContato] = String((payload && payload.responsavelContato) || "").trim();
    rowValues[idx.bairro] = String((payload && payload.bairro) || "").trim();
    rowValues[idx.frequentaMissas] = String((payload && payload.frequentaMissas) || "").trim();
    rowValues[idx.ondeMissas] = String((payload && payload.ondeMissas) || "").trim();
    rowValues[idx.participaMovimento] = String((payload && payload.participaMovimento) || "").trim();
    rowValues[idx.movimentoParoquia] = String((payload && payload.movimentoParoquia) || "").trim();
    rowValues[idx.paroquiaFezEac] = String((payload && payload.paroquiaFezEac) || "").trim();
    rowValues[idx.jaTrabalhouEac] = String((payload && payload.jaTrabalhouEac) || "").trim();
    rowValues[idx.jaCoordenouEquipe] = String((payload && payload.jaCoordenouEquipe) || "").trim();
    rowValues[idx.paisFizeramEncontro] = String((payload && payload.paisFizeramEncontro) || "").trim();
    rowValues[idx.possuiAlergia] = String((payload && payload.possuiAlergia) || "").trim();
    rowValues[idx.tomaRemedio] = String((payload && payload.tomaRemedio) || "").trim();
    rowValues[idx.alimentacaoEspecial] = String((payload && payload.alimentacaoEspecial) || "").trim();
    rowValues[idx.sugestaoUltimoEncontro] = String((payload && payload.sugestaoUltimoEncontro) || "").trim();
    rowValues[idx.dicaPosEncontro] = String((payload && payload.dicaPosEncontro) || "").trim();
    rowValues[idx.classificacao] = String((payload && payload.classificacao) || "").trim();

    let savedRowNumber = rowNumber;
    if (canUpdate) {
      sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      savedRowNumber = sheet.getLastRow();
    }

    const savedObj = mapEncontreiroRow(rowValues, savedRowNumber, idx);
    return responder(true, {
      message: canUpdate ? "Cadastro de encontreiro atualizado com sucesso." : "Cadastro de encontreiro incluído com sucesso.",
      encontreiro: savedObj
    });
  } catch (err) {
    registrarLog("error", "SAVE_ENCONTREIRO", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}

function handleDeleteEncontreiro(payload) {
  try {
    const sheet = getEncontreirosSheet();
    const rowNumber = parseEncontreiroRowNumber(payload || {});
    if (rowNumber <= 1 || rowNumber > sheet.getLastRow()) {
      throw new Error("Registro de encontreiro nao encontrado para exclusao.");
    }
    sheet.deleteRow(rowNumber);
    return responder(true, { message: "Cadastro de encontreiro removido com sucesso." });
  } catch (err) {
    registrarLog("error", "DELETE_ENCONTREIRO", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}

function handleNormalizeEncontreiroWhatsapp(payload) {
  try {
    const sheet = getEncontreirosSheet();
    const headers = ensureEncontreiroHeaders(sheet);
    const idx = getEncontreiroIndexes(headers);

    const rowNumber = parseEncontreiroRowNumber(payload || {});
    if (rowNumber <= 1 || rowNumber > sheet.getLastRow()) {
      throw new Error("Registro de encontreiro nao encontrado para normalizar WhatsApp.");
    }

    const raw = sheet.getRange(rowNumber, idx.celularWhatsapp + 1).getValue();
    const normalized = normalizeWhatsappBrazil(raw);
    if (!normalized) {
      throw new Error("Telefone invalido para normalizacao.");
    }

    sheet.getRange(rowNumber, idx.celularWhatsapp + 1).setValue(normalized);
    const link = "https://wa.me/" + normalized;

    return responder(true, {
      message: "WhatsApp normalizado com sucesso.",
      id: "enc-" + rowNumber,
      celularWhatsapp: normalized,
      whatsappLink: link
    });
  } catch (err) {
    registrarLog("error", "NORMALIZE_ENCONTREIRO_WHATSAPP", "Sistema", String(err), "ERROR");
    return responder(false, { error: String(err) });
  }
}


function handleSendNonEnrolledEmail(payload) {
  try {
    const toInput = String(payload.to || payload.email || "").trim();
    if (!toInput || toInput.indexOf("@") === -1) throw new Error("Destinatário de e-mail inválido.");

    const subjectBase = String(payload.subjectBase || payload.subject || "Contato EAC").trim();
    const name = String(payload.name || "").trim();
    const rawBody = String(payload.body || "").trim();
    const operator = String(payload.operator || "Operador EAC").trim();
    const explicitIdPessoa = String(payload.idPessoa || payload.linhaOrigem || payload.linha_origem || payload.id || "").trim();
    const requestedSender = String(payload.senderEmail || "").trim();

    const personInfo = resolveNonEnrolledPerson(toInput, explicitIdPessoa);
    const to = String(personInfo.email || toInput).trim();
    const idPessoa = String(personInfo.idPessoa || "").trim();
    const nomeFinal = name || personInfo.nome || "";

    if (!idPessoa) {
      throw new Error("Não foi possível identificar o registro na aba 'Não Inscritos' (coluna A).");
    }

    const { sheet: chamadosSheet, headerIndexes } = getEmailChamadosSheet();
    const seq = computeNextSequenceForId(chamadosSheet, idPessoa, headerIndexes);
    const token = `[NI${idPessoa}-${seq}]`;
    const subjectFinal = `${subjectBase} ${token}`;
    const idChamado = `NI-${idPessoa}-${seq}`;
    const sentAt = nowBR();

    const effectiveBody = rawBody || (nomeFinal ? `Olá, ${nomeFinal}!` : "Olá!");
    const bodyHtml = effectiveBody
      .split(/\n\n+/)
      .map(function (paragraph) {
        return "<p>" + paragraph.replace(/\n/g, "<br>") + "</p>";
      })
      .join("");

    const signature = "<p>Fraternalmente,<br><strong>Coordenação EAC Porciúncula de Sant'Anna</strong></p>";
    const finalHtml = bodyHtml + signature;

    const senderEmail = resolveSenderEmail(requestedSender);
    const sendResult = sendEmailWithPreferredSender({
      to,
      subject: subjectFinal,
      plainBody: effectiveBody,
      htmlBody: molduraEmail(finalHtml),
      senderEmail
    });
    const senderEmailUsed = sendResult.senderUsed || senderEmail || getConfiguredSenderEmail();
    if (!senderEmailUsed) {
      throw new Error("Remetente nao configurado. Defina SENDER_EMAIL nas propriedades do script.");
    }

    // Tenta descobrir o threadId logo após o envio (ajuda o monitoramento de replies)
    let threadId = sendResult.threadId || "";
    if (!threadId) {
      try {
        const searchTokenQuery = `subject:"${token}" newer_than:7d`;
        const foundThreads = GmailApp.search(searchTokenQuery, 0, 1);
        if (foundThreads && foundThreads.length > 0) {
          threadId = foundThreads[0].getId();
        }
      } catch (e) {}
    }

    const row = [];
    row[headerIndexes.idChamado] = idChamado;
    row[headerIndexes.idPessoa] = idPessoa;
    row[headerIndexes.seq] = seq;
    row[headerIndexes.toEmail] = to;
    row[headerIndexes.nome] = nomeFinal;
    row[headerIndexes.subjectBase] = subjectBase;
    row[headerIndexes.token] = token;
    row[headerIndexes.subjectFinal] = subjectFinal;
    row[headerIndexes.body] = rawBody || effectiveBody;
    row[headerIndexes.status] = "ENVIADO";
    row[headerIndexes.sentAt] = sentAt;
    row[headerIndexes.senderEmail] = senderEmailUsed;
    row[headerIndexes.threadId] = threadId;
    row[headerIndexes.lastReplyAt] = "";
    row[headerIndexes.lastReplyFrom] = "";
    row[headerIndexes.lastReplySnippet] = "";
    row[headerIndexes.lastCheckedAt] = "";

    chamadosSheet.appendRow(row);

    registrarLog("manual_email", "Envio Manual Não Inscritos", operator, "E-mail enviado para " + to + " (" + idChamado + ")", "SUCCESS");
    return responder(true, { message: "E-mail enviado com sucesso.", idChamado: idChamado, token: token, subject: subjectFinal });
  } catch (err) {
    registrarLog("manual_email", "Envio Manual Não Inscritos", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function getEmailChamadosSheet() {
  const REQUIRED_HEADERS = [
    "idChamado",
    "idPessoa",
    "seq",
    "toEmail",
    "nome",
    "subjectBase",
    "token",
    "subjectFinal",
    "body",
    "status",
    "sentAt",
    "senderEmail",
    "threadId",
    "lastReplyAt",
    "lastReplyFrom",
    "lastReplySnippet",
    "lastCheckedAt"
  ];

  const db = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const sheet = getSheetResiliente(db, 'Email_Chamados');

  // Garante cabeçalho na ordem definida
  sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);

  const headerIndexes = {};
  REQUIRED_HEADERS.forEach((h, idx) => headerIndexes[h] = idx);

  return { sheet, headerIndexes };
}

function computeNextSequenceForId(sheet, idPessoa, headerIndexes) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(headerIndexes).length);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  let maxSeq = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const id = String(row[headerIndexes.idPessoa] || "").trim();
    if (id === idPessoa) {
      const seqVal = Number(row[headerIndexes.seq]);
      if (!isNaN(seqVal) && seqVal > maxSeq) {
        maxSeq = seqVal;
      }
    }
  }
  return maxSeq + 1;
}

function resolveNonEnrolledPerson(toEmail, explicitId) {
  const result = { idPessoa: explicitId || "", nome: "", email: "" };
  try {
    const sheet = getNaoInscritosSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return result;

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const header = data[0] || [];
    const normalized = header.map(h => normalizeHeader(h));

    let idxEmail = normalized.findIndex(h => h === 'e-mail' || h === 'email');
    if (idxEmail === -1) idxEmail = 2; // Coluna C padrão

    let idxNome = normalized.findIndex(h => h === 'nome' || h === 'nome completo');
    if (idxNome === -1) idxNome = 1; // Coluna B padrão

    const targetEmail = String(toEmail || "").trim().toLowerCase();

    // 1) Se idPessoa explícito veio, usa linha pela coluna A
    if (result.idPessoa) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const idColA = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : "";
        if (idColA === result.idPessoa) {
          result.email = String(row[idxEmail] || "").trim();
          result.nome = String(row[idxNome] || "").trim() || result.nome;
          return result;
        }
      }
    }

    // 2) Fallback por e-mail
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const email = String(row[idxEmail] || "").trim().toLowerCase();
      if (targetEmail && email === targetEmail) {
        result.idPessoa = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : result.idPessoa;
        result.email = String(row[idxEmail] || "").trim();
        result.nome = String(row[idxNome] || "").trim() || result.nome;
        break;
      }
    }
  } catch (e) {}
  return result;
}

function resolveSenderEmail(requested) {
  const explicit = String(requested || "").trim();
  if (explicit) return explicit;
  const configured = getConfiguredSenderEmail();
  if (configured) return configured;
  throw new Error("Remetente nao configurado. Defina SENDER_EMAIL nas propriedades do script.");
}

function getConfiguredSenderEmail() {
  try {
    const props = PropertiesService.getScriptProperties();
    const keys = ['SENDER_EMAIL', 'EMAIL_SENDER', 'MAIL_SENDER', 'REMETENTE_EMAIL'];
    for (let i = 0; i < keys.length; i++) {
      const val = String(props.getProperty(keys[i]) || "").trim();
      if (val) return val;
    }
  } catch (e) {}

  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (userEmail) return userEmail;
  } catch (e) {}
  return "";
}

function pickSenderAlias(requestedEmail) {
  const info = { canUseAlias: false, alias: "", primary: "" };
  try {
    info.primary = Session.getActiveUser().getEmail() || "";
  } catch (e) {}

  if (!requestedEmail) return info;

  const target = String(requestedEmail).trim().toLowerCase();
  try {
    const aliases = GmailApp.getAliases();
    const canUse = aliases.some(a => String(a || "").trim().toLowerCase() === target) ||
      (info.primary && info.primary.toLowerCase() === target);
    if (canUse) {
      info.canUseAlias = true;
      info.alias = requestedEmail;
      return info;
    }
  } catch (e) {}

  info.alias = requestedEmail;
  return info;
}

function sendEmailWithPreferredSender(params) {
  const { to, subject, plainBody, htmlBody, senderEmail } = params;
  const senderInfo = pickSenderAlias(senderEmail);
  const replyTo = senderEmail || senderInfo.primary || "";
  let senderUsed = senderInfo.primary || "";
  let threadId = "";

  try {
    if (senderInfo.canUseAlias) {
      GmailApp.sendEmail(to, subject, plainBody || "", {
        htmlBody: htmlBody,
        from: senderInfo.alias,
        replyTo: senderInfo.alias,
        name: "Coordenação EAC"
      });
      senderUsed = senderInfo.alias;
    } else {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        htmlBody: htmlBody,
        replyTo: replyTo || undefined,
        name: "Coordenação EAC"
      });
      senderUsed = replyTo || senderInfo.primary || "";
    }
  } catch (err) {
    // Fallback simples para MailApp, preservando replyTo
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: htmlBody,
      replyTo: replyTo || undefined,
      name: "Coordenação EAC"
    });
    senderUsed = replyTo || senderInfo.primary || "";
  }

  return { senderUsed: senderUsed, threadId: threadId };
}

/**
 * Varre chamados ENVIADO em Email_Chamados buscando respostas no Gmail.
 * Busca por token no assunto (newer_than:60d) e identifica mensagens de terceiros
 * posteriores ao sentAt. Atualiza status e dados da última resposta.
 */
function checkEmailReplies() {
  Logger.log("checkEmailReplies: início");
  const { sheet, headerIndexes } = getEmailChamadosSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { processed: 0, replied: 0 };

  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(headerIndexes).length);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const LIMIT = 50;
  let processed = 0;
  let replied = 0;
  const now = new Date();
  const nowStr = Utilities.formatDate(now, "GMT-3", "dd/MM/yyyy HH:mm");

  for (let i = 0; i < data.length && processed < LIMIT; i++) {
    const row = data[i];
    const status = String(row[headerIndexes.status] || "").trim().toUpperCase();
    const token = String(row[headerIndexes.token] || "").trim();
    const canProcess = token && (status === "ENVIADO" || status === "RESPONDIDO");
    if (!canProcess) continue;

    Logger.log(`checkEmailReplies: linha=${i + 2} token=${token} status=${status}`);

    const sentAtRaw = row[headerIndexes.sentAt];
    const sentAtDate = parseDateResiliente(sentAtRaw) || new Date(0);
    Logger.log(`checkEmailReplies: sentAt=${Utilities.formatDate(sentAtDate, "GMT-3", "dd/MM/yyyy HH:mm:ss")}`);
    let senderEmail = String(row[headerIndexes.senderEmail] || "").trim().toLowerCase();
    if (!senderEmail) {
      senderEmail = String(getConfiguredSenderEmail() || "").trim().toLowerCase();
      if (senderEmail) {
        row[headerIndexes.senderEmail] = senderEmail;
      }
    }
    const toEmail = String(row[headerIndexes.toEmail] || "").trim().toLowerCase();
    const threadId = String(row[headerIndexes.threadId] || "").trim();
    const sentMs = sentAtDate.getTime();

    // Busca threads: começa pelo threadId salvo e SEMPRE faz uma busca pelo token,
    // evitando perder respostas que fiquem em um thread separado.
    const threads = [];
    const seenThreadIds = new Set();
    try {
      if (threadId) {
        const th = GmailApp.getThreadById(threadId);
        if (th) {
          threads.push(th);
          seenThreadIds.add(th.getId());
        }
      }
    } catch (e) {}

    try {
      const query = `subject:"${token}" newer_than:60d`;
      const found = GmailApp.search(query, 0, 5) || [];
      for (let t = 0; t < found.length; t++) {
        const th = found[t];
        const id = th.getId();
        if (!seenThreadIds.has(id)) {
          threads.push(th);
          seenThreadIds.add(id);
        }
      }
      Logger.log(`checkEmailReplies: search query="${query}" found=${found ? found.length : 0} threadsUsados=${threads.length}`);
    } catch (e) {
      Logger.log(`checkEmailReplies: erro na busca por token "${token}": ${e}`);
    }

    let lastReply = null;
    let lastReplyDate = null;

    const extractEmail = (s) => {
      const str = String(s || "").toLowerCase();
      const m = str.match(/<([^>]+)>/);
      if (m && m[1]) return m[1].trim();
      const parts = str.split(/\s+/);
      const maybe = parts.find(p => p.includes("@"));
      return (maybe || str).replace(/[<>]/g, "").trim();
    };

    const senderAddr = extractEmail(senderEmail);
    const contactAddr = extractEmail(toEmail);

    for (let t = 0; t < threads.length; t++) {
      const msgs = threads[t].getMessages();
      for (let m = 0; m < msgs.length; m++) {
        const msg = msgs[m];
        const from = String(msg.getFrom() || "").toLowerCase();
        const fromAddr = extractEmail(from);
        const msgDate = msg.getDate();
        const msgDateStr = Utilities.formatDate(msgDate, "GMT-3", "dd/MM/yyyy HH:mm:ss");

        const isFromSender = senderAddr && fromAddr === senderAddr;
        const msDiff = msgDate.getTime() - sentMs;
        const toleranceMs = 12 * 60 * 60 * 1000; // 12h para compensar carimbos inconsistentes

        if (isFromSender) {
          Logger.log(`checkEmailReplies: msg token=${token} from=${from} date=${msgDateStr} SKIP reason=from_sender`);
          continue;
        }
        if (contactAddr && fromAddr !== contactAddr) {
          Logger.log(`checkEmailReplies: msg token=${token} from=${from} date=${msgDateStr} SKIP reason=not_contact contact=${contactAddr}`);
          continue;
        }
        if (msDiff < -toleranceMs) {
          Logger.log(`checkEmailReplies: msg token=${token} from=${from} date=${msgDateStr} SKIP reason=too_old msDiff=${msDiff}`);
          continue;
        }

        if (!lastReplyDate || msgDate > lastReplyDate) {
          lastReply = msg;
          lastReplyDate = msgDate;
          Logger.log(`checkEmailReplies: msg token=${token} from=${from} date=${msgDateStr} chosenAsLatest=true`);
        } else {
          Logger.log(`checkEmailReplies: msg token=${token} from=${from} date=${msgDateStr} SKIP reason=older_than_current`);
        }
      }
      Logger.log(`checkEmailReplies: thread ${t + 1}/${threads.length} msgs=${msgs.length} analisadas`);
    }

    if (lastReply) {
      const body = lastReply.getPlainBody ? lastReply.getPlainBody() : lastReply.getBody();
      const snippet = buildReplySnippet(body);
      row[headerIndexes.status] = "RESPONDIDO";
      row[headerIndexes.lastReplyAt] = Utilities.formatDate(lastReplyDate, "GMT-3", "dd/MM/yyyy HH:mm");
      row[headerIndexes.lastReplyFrom] = lastReply.getFrom();
      row[headerIndexes.lastReplySnippet] = snippet;
      replied++;
      Logger.log(`checkEmailReplies: reply encontrada token=${token} from=${row[headerIndexes.lastReplyFrom]} at=${row[headerIndexes.lastReplyAt]}`);

      // registra a mensagem completa no histórico (Email_Mensagens), evitando duplicados por messageId
      let msgId = "";
      try { msgId = lastReply.getId(); } catch (e) {}
      if (!msgId || !emailMessageExistsById(msgId)) {
        appendEmailMessage({
          idChamado: row[headerIndexes.idChamado],
          idPessoa: row[headerIndexes.idPessoa],
          direction: "IN",
          from: lastReply.getFrom(),
          to: toEmail,
          subject: row[headerIndexes.subjectFinal] || token,
          body: body,
          threadId: threadId || "",
          messageId: msgId,
          timestamp: lastReplyDate
        });
      }
    } else {
      Logger.log(`checkEmailReplies: nenhuma reply token=${token}`);
    }

    row[headerIndexes.lastCheckedAt] = nowStr;
    sheet.getRange(i + 2, 1, 1, lastCol).setValues([row]);
    processed++;
  }

  return { processed: processed, replied: replied, checkedAt: nowStr };
}

/**
 * Gera um trecho limpo da resposta, removendo citações anteriores e mantendo quebras.
 */
function buildReplySnippet(body) {
  const raw = String(body || "");
  const lines = raw.split(/\r?\n/);
  const cleaned = [];

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (line.startsWith(">")) continue; // descarta citações ">"
    const lower = line.toLowerCase();
    if (lower.includes(" escreveu:")) break; // para antes do bloco citado
    if (lower.startsWith("em ") && lower.includes(" escreveu:")) break;
    cleaned.push(line);
  }

  const snippet = cleaned.join("\n").trim();
  return snippet.slice(0, 400);
}

/**
 * Retorna apenas o ultimo chamado de cada idPessoa (inclui ENCERRADO).
 */
function getEmailStatusSummary() {
  const { sheet, headerIndexes } = getEmailChamadosSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(headerIndexes).length);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const summaryByPerson = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[headerIndexes.status] || "").trim().toUpperCase();

    const idPessoa = String(row[headerIndexes.idPessoa] || "").trim();
    if (!idPessoa) continue;

    const seqVal = Number(row[headerIndexes.seq]);
    const seq = isNaN(seqVal) ? 0 : seqVal;
    const current = summaryByPerson[idPessoa];

    if (!current || seq > current.seq) {
      summaryByPerson[idPessoa] = {
        seq: seq,
        idChamado: String(row[headerIndexes.idChamado] || "").trim(),
        status: status || "ENVIADO",
        token: row[headerIndexes.token] || "",
        sentAt: row[headerIndexes.sentAt] || null,
        lastReplyAt: row[headerIndexes.lastReplyAt] || null,
        lastReplyFrom: row[headerIndexes.lastReplyFrom] || null,
        lastReplySnippet: row[headerIndexes.lastReplySnippet] || null
      };
    }
  }

  // Ajusta últimos replies com base em Email_Mensagens (direction IN)
  try {
    const msgSheet = getEmailMessagesSheet();
    const msgData = msgSheet.getDataRange().getValues();
    if (msgData.length > 1) {
      const hdr = msgData[0] || [];
      const idxIdPessoa = hdr.findIndex(h => String(h || "").toLowerCase() === "idpessoa");
      const idxDir = hdr.findIndex(h => String(h || "").toLowerCase() === "direction");
      const idxFrom = hdr.findIndex(h => String(h || "").toLowerCase() === "from");
      const idxBody = hdr.findIndex(h => String(h || "").toLowerCase() === "body");
      const idxTs = hdr.findIndex(h => String(h || "").toLowerCase() === "timestamp");
      const idxIdChamado = hdr.findIndex(h => String(h || "").toLowerCase() === "idchamado");

      const toDate = (v) => {
        if (v instanceof Date) return v;
        if (!v) return parseDateResiliente(v);
        return null;
      };

      for (let i = 1; i < msgData.length; i++) {
        const row = msgData[i];
        const dir = String(row[idxDir] || "").toUpperCase();
        if (dir !== "IN") continue;
        const idPessoa = String(row[idxIdPessoa] || "").trim();
        if (!idPessoa) continue;
        const ts = toDate(row[idxTs]);
        if (!ts) continue;
        const from = row[idxFrom] || "";
        const body = row[idxBody] || "";
        const idChamadoMsg = String(row[idxIdChamado] || "").trim();

        const entry = summaryByPerson[idPessoa];
        const currentTs = entry && entry.lastReplyAt ? toDate(entry.lastReplyAt) : null;
        if (!entry || !currentTs || ts > currentTs) {
          summaryByPerson[idPessoa] = Object.assign({}, entry || {}, {
            idChamado: idChamadoMsg || (entry && entry.idChamado) || "",
            status: "RESPONDIDO",
            lastReplyAt: Utilities.formatDate(ts, "GMT-3", "dd/MM/yyyy HH:mm"),
            lastReplyFrom: from,
            lastReplySnippet: buildReplySnippet(body)
          });
        }
      }
    }
  } catch (e) {
    Logger.log("getEmailStatusSummary: erro ao ler Email_Mensagens: " + e);
  }

  const result = {};
  Object.keys(summaryByPerson).forEach(function (id) {
    const entry = summaryByPerson[id];
    result[id] = {
      idChamado: entry.idChamado || "",
      status: entry.status,
      token: entry.token || "",
      sentAt: entry.sentAt,
      lastReplyAt: entry.lastReplyAt,
      lastReplyFrom: entry.lastReplyFrom,
      lastReplySnippet: entry.lastReplySnippet
    };
  });

  return result;
}

/**
 * Retorna todos os chamados de uma pessoa, ordenados por seq desc.
 */
function getEmailCallsByPerson(idPessoa) {
  const id = String(idPessoa || "").trim();
  if (!id) return [];

  const { sheet, headerIndexes } = getEmailChamadosSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(headerIndexes).length);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const calls = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowId = String(row[headerIndexes.idPessoa] || "").trim();
    if (rowId !== id) continue;
    const seqVal = Number(row[headerIndexes.seq]);
    const seq = isNaN(seqVal) ? 0 : seqVal;
    calls.push({
      idChamado: String(row[headerIndexes.idChamado] || "").trim(),
      seq: seq,
      status: String(row[headerIndexes.status] || "").trim().toUpperCase(),
      sentAt: row[headerIndexes.sentAt] || null,
      lastReplyAt: row[headerIndexes.lastReplyAt] || null,
      lastReplyFrom: row[headerIndexes.lastReplyFrom] || null,
      lastReplySnippet: row[headerIndexes.lastReplySnippet] || null,
      subjectFinal: row[headerIndexes.subjectFinal] || "",
      body: row[headerIndexes.body] || "",
      token: row[headerIndexes.token] || "",
      direction: "OUT",
      timestamp: row[headerIndexes.sentAt] || null
    });
  }

  // mensagens individuais (histórico completo)
  const msgSheet = getEmailMessagesSheet();
  const msgData = msgSheet.getDataRange().getValues();
  const msgHeader = msgData[0] || [];
  const idxMsgIdPessoa = msgHeader.findIndex(h => String(h || "").toLowerCase() === "idpessoa");
  const idxDirection = msgHeader.findIndex(h => String(h || "").toLowerCase() === "direction");
  const idxFrom = msgHeader.findIndex(h => String(h || "").toLowerCase() === "from");
  const idxTo = msgHeader.findIndex(h => String(h || "").toLowerCase() === "to");
  const idxSubject = msgHeader.findIndex(h => String(h || "").toLowerCase() === "subject");
  const idxBody = msgHeader.findIndex(h => String(h || "").toLowerCase() === "body");
  const idxThread = msgHeader.findIndex(h => String(h || "").toLowerCase() === "threadid");
  const idxMessageId = msgHeader.findIndex(h => String(h || "").toLowerCase() === "messageid");
  const idxTs = msgHeader.findIndex(h => String(h || "").toLowerCase() === "timestamp");
  const idxIdChamado = msgHeader.findIndex(h => String(h || "").toLowerCase() === "idchamado");

  const messages = [];
  for (let i = 1; i < msgData.length; i++) {
    const row = msgData[i];
    const rowId = String(row[idxMsgIdPessoa] || "").trim();
    if (rowId !== id) continue;
    messages.push({
      idChamado: String(row[idxIdChamado] || "").trim(),
      direction: String(row[idxDirection] || "").toUpperCase(),
      from: row[idxFrom] || "",
      to: row[idxTo] || "",
      subjectFinal: row[idxSubject] || "",
      body: row[idxBody] || "",
      threadId: row[idxThread] || "",
      messageId: row[idxMessageId] || "",
      timestamp: row[idxTs] || null
    });
  }

  // Combina chamados (como OUT) com mensagens (IN/OUT)
  const combined = [];
  calls.forEach(c => combined.push(c));
  messages.forEach(m => combined.push(m));

  const toMs = (val) => {
    if (val instanceof Date) return val.getTime();
    if (!val) return 0;
    const d = parseDateResiliente(val);
    return d ? d.getTime() : 0;
  };

  combined.sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));

  return combined;
}

/**
 * Busca threads por token/assunto com várias consultas (mais tolerante).
 */
function findThreadsByToken(token, subject, toEmail, days) {
  const queries = [];
  const safeToken = String(token || "").trim();
  const safeSubject = String(subject || "").trim();
  const newer = days ? ` newer_than:${days}d` : "";
  if (safeToken) {
    queries.push(`subject:"${safeToken}"${newer}`);
    queries.push(`subject:${safeToken}${newer}`);
  }
  if (safeSubject) {
    queries.push(`subject:"${safeSubject}"${newer}`);
  }
  if (safeToken && toEmail) {
    queries.push(`to:${toEmail} subject:"${safeToken}"${newer}`);
  }

  const threads = [];
  const seen = new Set();
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const found = GmailApp.search(q, 0, 5) || [];
      for (let t = 0; t < found.length; t++) {
        const th = found[t];
        const id = th.getId();
        if (!seen.has(id)) {
          threads.push(th);
          seen.add(id);
        }
      }
      Logger.log(`findThreadsByToken: query="${q}" found=${found ? found.length : 0}`);
    } catch (e) {
      Logger.log(`findThreadsByToken: erro na busca "${q}": ${e}`);
    }
  }
  return threads;
}

/**
 * Responde a um chamado mantendo o mesmo thread (quando existir).
 * Payload esperado: { idChamado?, token?, body, operator, senderEmail? }
 */
function handleSendEmailReply(payload) {
  try {
    const { idChamado, token, body, operator, senderEmail } = payload || {};
    const closeCall = payload && payload.closeCall === true;
    if (!body) throw new Error("Corpo da resposta não informado.");
    if (!idChamado && !token) throw new Error("Informe idChamado ou token para localizar o chamado.");

    const { sheet: chamadosSheet, headerIndexes } = getEmailChamadosSheet();
    const data = chamadosSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = String(row[headerIndexes.idChamado] || "").trim();
      const tk = String(row[headerIndexes.token] || "").trim();
      if ((idChamado && id === String(idChamado).trim()) || (token && tk === String(token).trim())) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) throw new Error("Chamado não encontrado para responder.");

    const row = data[rowIndex];
    const to = String(row[headerIndexes.toEmail] || "").trim();
    if (!to || to.indexOf("@") === -1) throw new Error("E-mail de destino inválido no chamado.");
    const subjectFinal = String(row[headerIndexes.subjectFinal] || "").trim();
    const savedToken = String(row[headerIndexes.token] || "").trim();
    const threadIdSaved = String(row[headerIndexes.threadId] || "").trim();
    const effectiveToken = savedToken || String(token || "");

    // Resolve thread: tenta o threadId salvo e buscas mais tolerantes pelo token/assunto
    const threads = [];
    const seenIds = new Set();
    try {
      if (threadIdSaved) {
        const th = GmailApp.getThreadById(threadIdSaved);
        if (th) { threads.push(th); seenIds.add(th.getId()); }
      }
    } catch (e) {}

    const extraThreads = findThreadsByToken(effectiveToken, subjectFinal, to, 180);
    extraThreads.forEach(th => {
      const id = th.getId();
      if (!seenIds.has(id)) {
        threads.push(th);
        seenIds.add(id);
      }
    });

    const senderInfo = pickSenderAlias(resolveSenderEmail(senderEmail));
    const replyTo = senderEmail || senderInfo.primary || "";
    let threadUsed = threadIdSaved || "";
    let messageId = "";

    const htmlWrapped = molduraEmail(body);

    if (threads.length > 0) {
      const th = threads[0];
      const msg = th.reply(body, {
        htmlBody: htmlWrapped,
        from: senderInfo.canUseAlias ? senderInfo.alias : undefined,
        replyTo: replyTo || undefined,
        name: "Coordenação EAC"
      });
      threadUsed = th.getId();
      try { messageId = msg.getId(); } catch (e) {}
    } else {
      // fallback: envia novo e-mail com Re: <subjectFinal ou token> e já captura threadId via busca
      const subj = subjectFinal && subjectFinal.toLowerCase().startsWith("re:") ? subjectFinal : `Re: ${subjectFinal || effectiveToken}`;
      MailApp.sendEmail({
        to: to,
        subject: subj,
        htmlBody: htmlWrapped,
        replyTo: replyTo || undefined,
        name: "Coordenação EAC"
      });
      const foundAfter = findThreadsByToken(effectiveToken || subj, subj, to, 3);
      if (foundAfter && foundAfter.length > 0) {
        threadUsed = foundAfter[0].getId();
      }
    }

    const nowStr = nowBR();
    const snippet = buildReplySnippet(body);

    // Atualiza a linha do chamado
    row[headerIndexes.status] = closeCall ? "ENCERRADO" : "RESPONDIDO";
    row[headerIndexes.lastReplyAt] = nowStr;
    row[headerIndexes.lastReplyFrom] = senderInfo.alias || senderInfo.primary || replyTo || "Operador";
    row[headerIndexes.lastReplySnippet] = snippet;
    row[headerIndexes.lastCheckedAt] = nowStr;
    if (threadUsed && !row[headerIndexes.threadId]) {
      row[headerIndexes.threadId] = threadUsed;
    }
    chamadosSheet.getRange(rowIndex + 1, 1, 1, chamadosSheet.getLastColumn()).setValues([row]);

    // Registra em Email_Mensagens (histórico completo)
    appendEmailMessage({
      idChamado: row[headerIndexes.idChamado],
      idPessoa: row[headerIndexes.idPessoa],
      direction: "OUT",
      from: senderInfo.alias || senderInfo.primary || replyTo,
      to: to,
      subject: subjectFinal || effectiveToken,
      body: body,
      threadId: threadUsed || "",
      messageId: messageId || "",
      timestamp: new Date()
    });

    const msg = closeCall ? "Resposta enviada e chamado encerrado com sucesso." : "Resposta enviada com sucesso.";
    return responder(true, { message: msg, threadId: threadUsed || null, status: row[headerIndexes.status] });
  } catch (err) {
    registrarLog("error", "SEND_EMAIL_REPLY", "Sistema", err.toString(), "ERROR");
    return responder(false, { error: err.toString() });
  }
}

function getEmailMessagesSheet() {
  const HEADERS = ["idChamado","idPessoa","direction","from","to","subject","body","threadId","messageId","timestamp"];
  const db = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const sheet = getSheetResiliente(db, 'Email_Mensagens');
  sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function appendEmailMessage(msg) {
  try {
    const sheet = getEmailMessagesSheet();
    sheet.appendRow([
      msg.idChamado || "",
      msg.idPessoa || "",
      msg.direction || "",
      msg.from || "",
      msg.to || "",
      msg.subject || "",
      msg.body || "",
      msg.threadId || "",
      msg.messageId || "",
      msg.timestamp || new Date()
    ]);
  } catch (e) {
    Logger.log("appendEmailMessage erro: " + e);
  }
}

function emailMessageExistsById(messageId) {
  if (!messageId) return false;
  try {
    const sheet = getEmailMessagesSheet();
    const data = sheet.getDataRange().getValues();
    const header = data[0] || [];
    const idx = header.findIndex(h => String(h || "").toLowerCase() === "messageid");
    if (idx === -1) return false;
    return data.slice(1).some(r => String(r[idx] || "").trim() === String(messageId).trim());
  } catch (e) {
    return false;
  }
}

/**
 * Cria trigger de tempo para rodar checkEmailReplies a cada 10 minutos (sem duplicar).
 */
function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(tr => tr.getHandlerFunction && tr.getHandlerFunction() === "checkEmailReplies");
  if (!exists) {
    ScriptApp.newTrigger("checkEmailReplies").timeBased().everyMinutes(10).create();
  }
  return { ok: true, message: "Trigger verificado/criado." };
}

// --- UTILITÁRIOS INTERNOS ---

/**
 * Atualiza a aba "não inscritos" com novos registros da aba "Inscricoes_Sem_Duplicidade".
 * Mantida por compatibilidade: agora delega para o fluxo incremental.
 */
function atualizarNaoInscritos() {
  return atualizarNaoInscritosIncremental();
}

const CHECKPOINT_SEMDUP_PROP_KEY = "ultimaLinhaSemDup";

/**
 * Processa somente linhas novas de "Inscricoes_Sem_Duplicidade" usando checkpoint.
 * Checkpoint salvo em Script Properties: ultimaLinhaSemDup.
 */
function atualizarNaoInscritosIncremental() {
  const props = PropertiesService.getScriptProperties();
  const ultimaLinhaProcessada = Number(props.getProperty(CHECKPOINT_SEMDUP_PROP_KEY) || 1);
  const linhaInicial = Math.max(2, ultimaLinhaProcessada + 1);

  const result = atualizarNaoInscritosCore_({
    mode: "incremental",
    startRow: linhaInicial
  });

  props.setProperty(CHECKPOINT_SEMDUP_PROP_KEY, String(result.lastRowOrigem));
  return result;
}

/**
 * Fallback de manutenção: executa varredura completa em "Inscricoes_Sem_Duplicidade".
 */
function atualizarNaoInscritosFull() {
  const props = PropertiesService.getScriptProperties();
  const result = atualizarNaoInscritosCore_({
    mode: "full",
    startRow: 2
  });
  props.setProperty(CHECKPOINT_SEMDUP_PROP_KEY, String(result.lastRowOrigem));
  return result;
}

function atualizarNaoInscritosCore_(opts) {
  const TZ = Session.getScriptTimeZone() || "America/Sao_Paulo";

  const dbCad = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
  const dbIns = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);

  const shOficial = getSheetResiliente(dbCad, "Cadastro Oficial");
  const shSemDup = getSheetResiliente(dbIns, "Inscricoes_Sem_Duplicidade");
  const shNao = getNaoInscritosSheet();

  // Garante que a coluna S esteja identificada para receber o sexo.
  if (shNao.getLastRow() >= 1) {
    const hdrLastCol = Math.max(shNao.getLastColumn(), 19);
    const hdr = shNao.getRange(1, 1, 1, hdrLastCol).getValues()[0] || [];
    if (!String(hdr[18] || "").trim()) {
      shNao.getRange(1, 19).setValue("Sexo");
    }
  }

  const lastRowOficial = shOficial.getLastRow();
  const dadosOficial = lastRowOficial > 1
    ? shOficial.getRange(2, 7, lastRowOficial - 1, 1).getValues().flat()
    : [];
  const setPhonesOficial = new Set(dadosOficial.map(function (t) { return normalizePhone(t); }).filter(Boolean));

  const lastRowNao = shNao.getLastRow();
  const naoLastCol = Math.max(shNao.getLastColumn(), 19);
  const dadosNao = lastRowNao > 1
    ? shNao.getRange(2, 1, lastRowNao - 1, naoLastCol).getValues()
    : [];
  const setPhonesNao = new Set();
  const naoByPhone = {};
  for (let i = 0; i < dadosNao.length; i++) {
    const rowNao = dadosNao[i] || [];
    const phone = normalizePhone(rowNao[5]); // F
    if (!phone) continue;
    setPhonesNao.add(phone);
    if (!naoByPhone[phone]) {
      naoByPhone[phone] = {
        rowNumber: i + 2,
        sexo: String(rowNao[18] || "").trim() // S
      };
    }
  }

  const mode = String((opts && opts.mode) || "incremental");
  const startRow = Math.max(2, Number((opts && opts.startRow) || 2));
  const lastRowOrigem = shSemDup.getLastRow();
  if (lastRowOrigem < startRow) {
    return {
      inseridos: 0,
      lidas: 0,
      modo: mode,
      linhaInicial: startRow,
      lastRowOrigem: Math.max(lastRowOrigem, 1)
    };
  }

  const lastColOrigem = Math.max(8, shSemDup.getLastColumn());
  const qtdLinhas = lastRowOrigem - startRow + 1;
  const dadosOrigem = shSemDup.getRange(startRow, 1, qtdLinhas, lastColOrigem).getValues();
  const linhasParaInserir = [];

  for (let i = 0; i < dadosOrigem.length; i++) {
    const row = dadosOrigem[i];
    const telefoneFinal = String(normalizePhone(row[6])); // G
    if (!telefoneFinal) continue;
    if (setPhonesOficial.has(telefoneFinal)) continue;

    const linhaReal = startRow + i;
    const nome = String(row[1] || "").trim(); // B
    const dataNascimento = row[2] || "";      // C -> coluna R destino
    const sexo = String(row[3] || "").trim(); // D -> coluna S destino
    const bairro = String(row[5] || "").trim(); // F
    const email = String(row[7] || "").trim();  // H
    const dataRaw = row[0];                     // A

    // Se já existe em "não inscritos", atualiza somente o sexo (coluna S) quando estiver vazio.
    if (setPhonesNao.has(telefoneFinal)) {
      const existing = naoByPhone[telefoneFinal];
      if (existing && sexo && !existing.sexo) {
        shNao.getRange(existing.rowNumber, 19).setValue(sexo); // S
        existing.sexo = sexo;
      }
      continue;
    }

    // A..G + H..Q vazias + R(data nascimento) + S(sexo)
    linhasParaInserir.push([
      linhaReal,
      nome,
      email,
      "Ativo",
      formatDateOnly(dataRaw, TZ),
      telefoneFinal,
      bairro,
      "", "", "", "", "", "", "", "", "", "",
      dataNascimento,
      sexo
    ]);

    // Evita duplicidades dentro do mesmo lote incremental.
    setPhonesNao.add(telefoneFinal);
  }

  if (linhasParaInserir.length === 0) {
    return {
      inseridos: 0,
      lidas: dadosOrigem.length,
      modo: mode,
      linhaInicial: startRow,
      lastRowOrigem: lastRowOrigem
    };
  }

  const proximaLinha = shNao.getLastRow() + 1;
  const totalCols = 19; // A..S

  const rangeTel = shNao.getRange(proximaLinha, 6, linhasParaInserir.length, 1);
  rangeTel.setNumberFormat("@");

  shNao.getRange(proximaLinha, 1, linhasParaInserir.length, totalCols).setValues(linhasParaInserir);
  shNao.getRange(proximaLinha, 5, linhasParaInserir.length, 1).setNumberFormat("dd/MM/yyyy");
  shNao.getRange(proximaLinha, 18, linhasParaInserir.length, 1).setNumberFormat("dd/MM/yyyy");
  rangeTel.setNumberFormat("@");

  return {
    inseridos: linhasParaInserir.length,
    lidas: dadosOrigem.length,
    modo: mode,
    linhaInicial: startRow,
    lastRowOrigem: lastRowOrigem
  };
}

function formatDateOnly(value, tz) {
  if (!value) return "";
  let d = null;
  if (Object.prototype.toString.call(value) === "[object Date]") {
    d = value;
  } else {
    const n = Number(value);
    d = !isNaN(n) ? new Date(n) : new Date(value);
  }
  if (!d || isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, tz, "dd/MM/yyyy");
}

/**
 * Retorna a aba "não inscritos" da planilha de Inscrições (usa os mesmos candidatos do GET_NON_ENROLLED).
 */
function getNaoInscritosSheet() {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
  const candidates = ['não inscritos', 'nao inscritos', 'Não inscritos', 'Nao inscritos', 'NÃO INSCRITOS', 'NAO INSCRITOS'];
  for (var i = 0; i < candidates.length; i++) {
    const sh = db.getSheetByName(candidates[i]);
    if (sh) return sh;
  }
  return getSheetResiliente(db, 'não inscritos');
}

/**
 * Conferência do indicador de pré confirmados.
 * Regra: I = "SIM" e P preenchida.
 */
function contarPreConfirmados() {
  const sheet = getNaoInscritosSheet();
  const dados = sheet.getDataRange().getValues();
  if (!dados || dados.length < 2) return 0;

  const headers = dados[0] || [];
  const idxInteresse = getColIndex(headers, "Interesse Confirmado", 8); // I
  const idxPreConfirmacao = getColIndex(headers, "Status Pre Confirmacao", 15); // P

  let total = 0;
  for (let i = 1; i < dados.length; i++) {
    const interesseNormalizado = String(dados[i][idxInteresse] || "")
      .replace(/\u00A0/g, " ")
      .trim()
      .toUpperCase();
    const envioNormalizado = String(dados[i][idxPreConfirmacao] || "")
      .replace(/\u00A0/g, " ")
      .trim();

    if (interesseNormalizado === "SIM" && envioNormalizado !== "") {
      total++;
    }
  }

  return total;
}

/**
 * Retorna a data e hora atual em formato brasileiro (dd/MM/yyyy HH:mm).
 */
function nowBR() {
  return Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
}


// --- UTILITÁRIOS INTERNOS ---

function responder(ok, data) {
  return ContentService.createTextOutput(JSON.stringify({ ok, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarLog(dispatchId, name, operator, summary, status) {
  try {
    const db = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS);
    const sheet = getSheetResiliente(db, 'Logs');
    sheet.appendRow([dispatchId, name, operator, new Date(), 0, status, summary]);
  } catch(e) {}
}

function getSheetResiliente(db, name) {
  let sheet = db.getSheetByName(name);
  if (!sheet) {
    const sheets = db.getSheets();
    sheet = sheets.find(s => s.getName().trim().toLowerCase() === name.trim().toLowerCase());
    if (!sheet) sheet = db.insertSheet(name); 
  }
  return sheet;
}

function parseDateResiliente(val) {
  return parseDateAny(val);
}

function getColIndex(headers, searchName, fallbackIndex) {
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const target = norm(searchName);
  let idx = headers.findIndex(h => norm(h) === target);
  if (idx !== -1) return idx;
  const candidates = headers
    .map((h, i) => ({ text: norm(h), index: i }))
    .filter(c => c.text.includes(target))
    .sort((a, b) => a.text.length - b.text.length);
  return candidates.length > 0 ? candidates[0].index : fallbackIndex;
}

function molduraEmail(html) {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="background: #044372; padding: 25px; text-align: center;">
        <img src="${LOGO_URL}" alt="EAC" style="max-height: 70px;">
      </div>
      <div style="padding: 30px; color: #1e293b; line-height: 1.6;">
        ${html}
        <div style="margin-top: 30px; text-align: center;">
          <a href="${INSTAGRAM_URL}" style="background: #044372; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">SIGA NOSSO INSTAGRAM</a>
        </div>
      </div>
    </div>
  `;
}

function enviarComunicado99() {
  try {
    const dbCom = SpreadsheetApp.openById(SPREADSHEET_ID_COMUNICADOS);
    const rowsCom = dbCom.getSheetByName('Comunicados').getDataRange().getValues();
    const row99 = rowsCom.find(r => String(r[0]).trim() === '99');
    if (!row99) throw new Error("ID 99 não encontrado.");
    const assunto = row99[2];
    const htmlBase = row99[3];
    const dbCad = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
    const sheetCad = getSheetResiliente(dbCad, 'Cadastro Oficial');
    const data = sheetCad.getDataRange().getValues();
    const headers = data[0];
    const idxEmail = getColIndex(headers, "E-mail", 7); 
    const idxStatus = getColIndex(headers, "Status envio comunicado", 22);
    let enviados = 0;
    const hojeStr = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][idxEmail] || "").trim();
      const status = String(data[i][idxStatus] || "").trim();
      if (email && email.includes('@') && !status.toLowerCase().includes("enviado")) {
        try {
          MailApp.sendEmail({ to: email, subject: assunto, htmlBody: molduraEmail(htmlBase) });
          data[i][idxStatus] = "Enviado - " + hojeStr;
          enviados++;
        } catch (e) {}
        if (enviados >= 50) break;
      }
    }
    if (enviados > 0) {
      const statusColData = data.map(r => [r[idxStatus]]);
      sheetCad.getRange(1, idxStatus + 1, statusColData.length, 1).setValues(statusColData);
    }
    return { count: enviados, message: enviados > 0 ? `Sucesso: ${enviados} envios.` : "Sem novos e-mails." };
  } catch (err) { return { count: 0, message: "Erro: " + err.message }; }
}

function enviarAniversariantes() {
  try {
    const dbCad = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
    const sheetCad = getSheetResiliente(dbCad, 'Cadastro Oficial');
    const data = sheetCad.getDataRange().getValues();
    const headers = data[0];
    const idxNome = getColIndex(headers, "Nome completo", 1);
    const idxEmail = getColIndex(headers, "E-mail", 7); 
    const idxNasc = getColIndex(headers, "Data de nascimento", 2); 
    const idxStatus = getColIndex(headers, "Status Email Aniversariante", 19); 
    let enviados = 0;
    const hoje = new Date();
    const hojeDia = hoje.getDate();
    const hojeMes = hoje.getMonth() + 1;
    const hojeAnoStr = Utilities.formatDate(hoje, "GMT-3", "dd/MM/yyyy");
    for (let i = 1; i < data.length; i++) {
      const nome = String(data[i][idxNome] || "").trim();
      const email = String(data[i][idxEmail] || "").trim();
      const status = String(data[i][idxStatus] || "").trim();
      const nascRaw = data[i][idxNasc];
      const nascDate = parseDateResiliente(nascRaw);
      if (email && email.includes('@') && nascDate && nascDate.getDate() === hojeDia && (nascDate.getMonth() + 1) === hojeMes && !status.includes(hojeAnoStr)) {
        const html = `<div style="text-align:center;"><h1 style="color:#044372;">🎈 Feliz Aniversário!</h1><p>Parabéns, ${nome}! 🎂</p><p>A família EAC celebra sua vida com muita alegria!</p></div>`;
        try {
          MailApp.sendEmail({ to: email, subject: "🎈 Feliz Aniversário do EAC!", htmlBody: molduraEmail(html) });
          data[i][idxStatus] = "Enviado - " + hojeAnoStr;
          enviados++;
        } catch (e) {}
        if (enviados >= 50) break;
      }
    }
    if (enviados > 0) {
      const statusColData = data.map(r => [r[idxStatus]]);
      sheetCad.getRange(1, idxStatus + 1, statusColData.length, 1).setValues(statusColData);
    }
    return { count: enviados, message: enviados > 0 ? `Sucesso: ${enviados} aniversariantes.` : "Nenhum novo para hoje." };
  } catch (err) { return { count: 0, message: "Erro: " + err.message }; }
}

function enviarEmergenciaNov2025(payload) {
  try {
    const targetSheet = payload && payload.targetSheet === 'cadastro' ? 'cadastro' : 'encontreiros';
    const mensagem = String(payload && payload.message ? payload.message : '').trim();
    const startMonthInput = String(payload && payload.startMonth ? payload.startMonth : '2025-11').trim();
    const endDateInput = String(payload && payload.endDate ? payload.endDate : '').trim();
    const texto = mensagem || 'Olá!\n\nEste é um comunicado emergencial para os inscritos no período selecionado. Por favor, leia com atenção e responda se necessário.';
    const htmlBody = molduraEmail(texto.replace(/\n/g, '<br>'));
    const sheet = targetSheet === 'cadastro'
      ? getSheetResiliente(SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO), 'Cadastro Oficial')
      : getEncontreirosSheet();

    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) return { count: 0, message: 'Planilha sem dados.' };

    const headers = data[0];
    const idxTimestampPrincipal = targetSheet === 'cadastro'
      ? getColIndex(headers, 'Data Cadastro', getColIndex(headers, 'Timestamp', 0))
      : getColIndex(headers, 'Timestamp', 0);
    const idxTimestampAlternativo = getColIndex(headers, 'Carimbo de data/hora', idxTimestampPrincipal);
    const idxEmailPrincipal = getColIndex(headers, 'E-mail', targetSheet === 'cadastro' ? 7 : 4);
    const idxEmailAlternativo = getColIndex(headers, 'Email', idxEmailPrincipal);

    function parseTimestampFromRow(registro) {
      const candA = registro[idxTimestampPrincipal];
      const candB = registro[idxTimestampAlternativo];
      return parseDateResiliente(candA) || parseDateResiliente(candB) || null;
    }

    function pickEmailFromRow(registro) {
      const candA = String(registro[idxEmailPrincipal] || '').trim();
      if (candA && candA.includes('@')) return candA;
      const candB = String(registro[idxEmailAlternativo] || '').trim();
      if (candB && candB.includes('@')) return candB;
      return '';
    }

    const startMatch = startMonthInput.match(/^(\d{4})-(\d{2})$/);
    let startDate = new Date(2025, 10, 1, 0, 0, 0, 0); // fallback: 01/11/2025
    if (startMatch) {
      const year = Number(startMatch[1]);
      const month = Number(startMatch[2]);
      if (isFinite(year) && isFinite(month) && month >= 1 && month <= 12) {
        startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      }
    }

    let endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
    if (endDateInput) {
      const endParsed = parseDateResiliente(endDateInput);
      if (endParsed) {
        endDate = new Date(
          endParsed.getFullYear(),
          endParsed.getMonth(),
          endParsed.getDate(),
          23, 59, 59, 999
        );
      }
    }

    if (endDate.getTime() < startDate.getTime()) {
      return { count: 0, message: 'Intervalo inválido: a data final deve ser igual ou posterior ao mês inicial.' };
    }

    const periodoLabel = Utilities.formatDate(startDate, "GMT-3", "dd/MM/yyyy") + " até " + Utilities.formatDate(endDate, "GMT-3", "dd/MM/yyyy");
    let enviados = 0;
    let semData = 0;
    let foraDoPeriodo = 0;
    let semEmail = 0;
    let falhasEnvio = 0;
    const emailsEnviados = {};

    for (let i = 1; i < data.length; i++) {
      const registro = data[i];
      const tsDate = parseTimestampFromRow(registro);
      if (!tsDate) {
        semData++;
        continue;
      }
      if (tsDate.getTime() < startDate.getTime() || tsDate.getTime() > endDate.getTime()) {
        foraDoPeriodo++;
        continue;
      }

      const email = pickEmailFromRow(registro);
      if (!email) {
        semEmail++;
        continue;
      }

      const emailKey = String(email).trim().toLowerCase();
      if (emailsEnviados[emailKey]) continue;

      try {
        MailApp.sendEmail({ to: email, subject: '⚠️ Comunicado Emergencial EAC - Período Selecionado', htmlBody });
        emailsEnviados[emailKey] = true;
        enviados++;
      } catch (e) {
        falhasEnvio++;
      }
      if (enviados >= 50) break;
    }

    const diagnostico = `Diagnóstico: enviados=${enviados}, semData=${semData}, foraPeriodo=${foraDoPeriodo}, semEmail=${semEmail}, falhas=${falhasEnvio}.`;
    return {
      count: enviados,
      message: enviados > 0
        ? `Sucesso: ${enviados} envios emergenciais no período ${periodoLabel}. ${diagnostico}`
        : `Nenhum registro elegível no período ${periodoLabel}. ${diagnostico}`
    };
  } catch (err) {
    return { count: 0, message: 'Erro: ' + err.message };
  }
}

function enviarEventosSemana() {
  try {
    const dbCal = SpreadsheetApp.openById(SPREADSHEET_ID_CALENDARIO);
    const sheetCal = getSheetResiliente(dbCal, 'Calendario'); 
    const calData = sheetCal.getDataRange().getValues();
    const hoje = new Date();
    const diaDaSemana = hoje.getDay() === 0 ? 7 : hoje.getDay(); 
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - (diaDaSemana - 1));
    inicioSemana.setHours(0,0,0,0);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23,59,59,999);
    let eventosHTML = "";
    let temEventos = false;
    for (let i = 1; i < calData.length; i++) {
      const dataInicio = parseDateResiliente(calData[i][2]);
      const obs = String(calData[i][6] || "").trim(); 
      if (dataInicio && dataInicio >= inicioSemana && dataInicio <= fimSemana && obs.toLowerCase().includes("confirmado")) {
        temEventos = true;
        const dataFmt = Utilities.formatDate(dataInicio, "GMT-3", "dd/MM 'às' HH:mm");
        eventosHTML += `<p><strong>${calData[i][0]}</strong> - ${dataFmt} em ${calData[i][4]}</p>`;
      }
    }
    if (!temEventos) return { count: 0, message: "Sem eventos confirmados para esta semana." };
    const dbCad = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
    const sheetCad = getSheetResiliente(dbCad, 'Cadastro Oficial');
    const cadData = sheetCad.getDataRange().getValues();
    const headers = cadData[0];
    const idxEmail = getColIndex(headers, "E-mail", 7); 
    const idxStatusEventos = getColIndex(headers, "Status Eventos", 23); 
    const semanaID = "Sem_ID_" + Utilities.formatDate(inicioSemana, "GMT-3", "ww_yyyy");
    let enviados = 0;
    for (let i = 1; i < cadData.length; i++) {
      const email = String(cadData[i][idxEmail] || "").trim();
      const status = String(cadData[i][idxStatusEventos] || "").trim();
      if (email && email.includes('@') && !status.includes(semanaID)) {
        try {
          MailApp.sendEmail({ to: email, subject: "📅 EAC: Agenda da Semana", htmlBody: molduraEmail(eventosHTML) });
          cadData[i][idxStatusEventos] = "Enviado - " + semanaID;
          enviados++;
        } catch (e) {}
        if (enviados >= 50) break;
      }
    }
    if (enviados > 0) {
      const statusColData = cadData.map(r => [r[idxStatusEventos]]);
      sheetCad.getRange(1, idxStatusEventos + 1, statusColData.length, 1).setValues(statusColData);
    }
    return { count: enviados, message: enviados + " enviados." };
  } catch (err) { return { count: 0, message: err.message }; }
}

function enviarComunicadoEspera() {
  try {
    const dbOficial = SpreadsheetApp.openById(SPREADSHEET_ID_CADASTRO);
    const dbInscricoes = SpreadsheetApp.openById(SPREADSHEET_ID_INSCRICOES);
    const sheetOficial = getSheetResiliente(dbOficial, 'Cadastro Oficial');
    const sheetSemDup = getSheetResiliente(dbInscricoes, 'Inscricoes_Sem_Duplicidade');
    
    const dataOficial = sheetOficial.getDataRange().getValues();
    const dataInscricoes = sheetSemDup.getDataRange().getValues();
    
    const phonesOficial = new Set(dataOficial.slice(1).map(r => normalizePhone(r[6])).filter(Boolean));
    const hojeStr = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
    
    let enviados = 0;
    const headers = dataInscricoes[0];
    let idxStatusWait = getColIndex(headers, "Status Espera EAC", 9);
    
    for (let i = 1; i < dataInscricoes.length; i++) {
      const tel = normalizePhone(dataInscricoes[i][6]);
      const email = String(dataInscricoes[i][7] || "").trim();
      const nome = String(dataInscricoes[i][1] || "").trim();
      const statusWait = String(dataInscricoes[i][idxStatusWait] || "").trim();
      
      if (tel && !phonesOficial.has(tel) && email.includes('@') && !statusWait.includes("Enviado")) {
        const html = `
          <h2 style="color: #044372;">Olá, ${nome}!</h2>
          <p>Recebemos sua inscrição para o EAC e gostaríamos de informar que seu cadastro está em nossa <strong>lista de verificação</strong>.</p>
          <p>Estamos organizando as vagas para o próximo encontro e em breve entraremos em contato para confirmar sua participação.</p>
          <p>Fique atento ao seu E-mail e WhatsApp!</p>
          <br>
          <p>Fraternalmente,<br><strong>Coordenação EAC</strong></p>
        `;
        
        try {
          MailApp.sendEmail({ to: email, subject: "EAC: Atualização sobre sua Inscrição", htmlBody: molduraEmail(html) });
          dataInscricoes[i][idxStatusWait] = "Enviado - " + hojeStr;
          enviados++;
        } catch (e) {}
        
        if (enviados >= 50) break;
      }
    }
    
    if (enviados > 0) {
      const statusColData = dataInscricoes.map(r => [r[idxStatusWait]]);
      sheetSemDup.getRange(1, idxStatusWait + 1, statusColData.length, 1).setValues(statusColData);
    }
    
    return { count: enviados, message: enviados > 0 ? `Sucesso: ${enviados} avisos enviados.` : "Nenhum novo não inscrito para avisar." };
  } catch (err) { 
    return { count: 0, message: "Erro: " + err.message }; 
  }
}

function enviarConfirmacaoNaoInscritos() {
  try {
    const sheetNao = getNaoInscritosSheet();
    const data = sheetNao.getDataRange().getValues();

    if (!data || data.length < 2) {
      return { enviados: 0, processados: 0, ignorados: 0 };
    }

    const IDX_NOME = 1;   // Coluna B
    const IDX_EMAIL = 2;  // Coluna C
    const IDX_H = 7;      // Coluna H
    const IDX_I = 8;      // Coluna I
    const IDX_M = 12;     // Coluna M
    const IDX_P = 15;     // Coluna P
    const LIMITE = 50;

    let enviados = 0;
    let processados = 0;
    let ignorados = 0;

    for (let i = 1; i < data.length; i++) {
      processados++;

      const row = data[i];
      const nome = String(row[IDX_NOME] || "").trim();
      const email = String(row[IDX_EMAIL] || "").trim();
      const condicaoH = String(row[IDX_H] || "").trim();
      const statusP = String(row[IDX_P] || "").trim();

      const podeEnviar = !condicaoH && email.includes("@") && !statusP;
      if (!podeEnviar) {
        ignorados++;
        continue;
      }

      const htmlBody = `
        <h2 style="color: #044372;">Olá, ${nome || "jovem"}!</h2>
        <p>Recebemos sua inscrição para o EAC e gostaríamos de informar que seu cadastro está em nossa <strong>lista de verificação</strong>.</p>
        <p>Estamos organizando as vagas para o próximo encontro e em breve entraremos em contato para confirmar sua participação.</p>
        <p>Fique atento ao seu E-mail e WhatsApp!</p>
        <br>
        <p>Fraternalmente,<br><strong>Coordenação EAC</strong></p>
      `;

      try {
        MailApp.sendEmail({
          to: email,
          subject: "EAC: Atualização sobre sua Inscrição",
          htmlBody: molduraEmail(htmlBody)
        });

        const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
        const status = "Enviado_Confirmacao - " + ts;
        // Regras de atualização pós-envio:
        // I = Sim, H = valor da P, M = data usada na P e P = status completo.
        sheetNao.getRange(i + 1, IDX_I + 1).setValue("Sim");
        sheetNao.getRange(i + 1, IDX_H + 1).setValue(status);
        sheetNao.getRange(i + 1, IDX_M + 1).setValue(ts);
        sheetNao.getRange(i + 1, IDX_P + 1).setValue(status);

        enviados++;
        if (enviados >= LIMITE) break;
      } catch (e) {
        ignorados++;
      }
    }

    return { enviados: enviados, processados: processados, ignorados: ignorados };
  } catch (err) {
    throw new Error("Erro no disparo de confirmação para Não Inscritos: " + err.message);
  }
}

function __autorizarEnvio() {
  MailApp.sendEmail("cmourasiga@gmail.com", "Teste autorização EAC", "OK");
}

/**
 * funcao de debug
 */

function debugDataSource_() {
  const info = {
    debugBuild: DEBUG_BUILD,
    effectiveUser: Session.getEffectiveUser().getEmail(),
    activeUser: Session.getActiveUser().getEmail(),
    scriptId: ScriptApp.getScriptId(),
  };

  // IDs que você usa no projeto
  info.SPREADSHEET_ID_INSCRICOES = (typeof SPREADSHEET_ID_INSCRICOES !== "undefined") ? SPREADSHEET_ID_INSCRICOES : null;
  info.SPREADSHEET_ID_MEMBROS = (typeof SPREADSHEET_ID_MEMBROS !== "undefined") ? SPREADSHEET_ID_MEMBROS : null;

  // Tenta abrir a planilha de inscrições
  if (info.SPREADSHEET_ID_INSCRICOES) {
    try {
      const ss = SpreadsheetApp.openById(info.SPREADSHEET_ID_INSCRICOES);
      info.inscricoes = {
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        url: ss.getUrl(),
        sheets: ss.getSheets().map(s => s.getName()),
      };

      const sh = ss.getSheetByName("não inscritos") || ss.getSheetByName("nao inscritos");
      info.naoInscritosSheetFound = !!sh;

      if (sh) {
        const lastRow = sh.getLastRow();
        const lastCol = sh.getLastColumn();
        const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

        info.naoInscritos = {
          sheetName: sh.getName(),
          gid: sh.getSheetId(),
          lastRow,
          lastCol,
          headers,
          sampleRow2: (lastRow >= 2) ? sh.getRange(2, 1, 1, lastCol).getValues()[0] : null,
        };
      }
    } catch (e) {
      info.inscricoesError = String(e);
    }
  } else {
    info.inscricoesError = "SPREADSHEET_ID_INSCRICOES não definido no code.gs";
  }

  return info;
}
