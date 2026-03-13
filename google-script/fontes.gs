function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🎯 EAC - Processos")
    .addItem("📌 1. Remover Duplicados", "removerDuplicadosPorNomeEData")
    .addItem("2.E-Mail de confirmação","enviarEmailsConfirmacao")
    .addItem("3.Atualização da aba inscrição Prioritarias","atualizarInscricoesPrioritariasComNovos")
    //.addItem("4.Email-Não Inscritos","enviarEmailNaoSelecionados")
    .addItem("4.Email-Boas Vindas","enviarEmailsBoasVindasEAC")
    .addItem("5.Atualização de não inscritos","atualizarNaoInscritos")

    .addToUi();
}

function distribuirAdolescentes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetOrigem = ss.getSheetByName("Inscricoes_Prioritarias");
  const sheetDestino = ss.getSheetByName("Círculos_Distribuídos");

  // Limpar destino e preparar cabeçalho
  sheetDestino.clear();
  sheetDestino.appendRow(["Nome", "Idade", "Bairro", "Sexo", "Grupo Sugerido"]);

  // Criar ou limpar aba de erros
  let abaErros = ss.getSheetByName("Erros_Pendentes");
  if (!abaErros) {
    abaErros = ss.insertSheet("Erros_Pendentes");
  } else {
    abaErros.clear();
  }
  abaErros.appendRow(["Nome", "Idade", "Bairro", "Sexo", "Valor Lido da Data", "Motivo da Exclusão"]);

  const dados = sheetOrigem.getDataRange().getValues();
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();

  const cabecalho = dados.shift();
  const colPertence = cabecalho.indexOf("Pertence à Porciúncula?");
  const validosParaDistribuicao = [];
  const excedentes = [];
  const erros = [];

  dados.forEach(linha => {
    const nome = linha[1];
    const dataNascRaw = linha[2];
    const sexo = linha[3]?.toString().trim();
    const bairro = linha[5]?.toString().trim();
    const pertence = linha[colPertence]?.toString().trim().toUpperCase();
    const confirmacao = linha[21]?.toString().trim().toUpperCase();
    const statusEnvio = linha[22]?.toString().trim().toUpperCase();

    const condicaoConfirmacao =
      (confirmacao === "CONFIRMADO" && statusEnvio === "ENVIADO") ||
      (confirmacao === "" && statusEnvio === "ENVIADO");

    if (!condicaoConfirmacao) return;
    if (pertence !== "SIM") return;

    if (!dataNascRaw) {
      erros.push([nome, "", bairro, sexo, "", "Data de nascimento ausente"]);
      return;
    }

    const anoNasc = extrairAnoSeguro(dataNascRaw);
    if (!anoNasc || isNaN(anoNasc)) {
      erros.push([nome, "", bairro, sexo, dataNascRaw, "Data de nascimento inválida"]);
      return;
    }

    const idade = parseInt(anoAtual - anoNasc);
    if (isNaN(idade)) {
      erros.push([nome, "", bairro, sexo, anoNasc, "Erro ao calcular idade"]);
      return;
    }

    // Agora a diferença: todos confirmados + enviados entram em algum grupo (mesmo fora da faixa etária)
    const registro = { nome, idade, bairro: normalizarTexto(bairro), sexo };

    if (idade >= 13 && idade <= 17) {
      validosParaDistribuicao.push(registro);
    } else {
      excedentes.push(registro);  // Fora da faixa etária
    }
  });

  // Separar por sexo os que estão na faixa de idade correta
  const masc = validosParaDistribuicao.filter(p => p.sexo?.toLowerCase() === "masculino");
  const fem = validosParaDistribuicao.filter(p => p.sexo?.toLowerCase() === "feminino");

  const mascSelecionados = masc.slice(0, 36);
  const mascExcedentesPorQtd = masc.slice(36);

  const femSelecionadas = fem.slice(0, 36);
  const femExcedentesPorQtd = fem.slice(36);

  const grupos = Array.from({ length: 7 }, () => []);

  // Distribuir os 6 primeiros círculos
  for (let i = 0; i < 6; i++) {
    const meninos = mascSelecionados.slice(i * 6, i * 6 + 6);
    const meninas = femSelecionadas.slice(i * 6, i * 6 + 6);
    grupos[i].push(...meninos, ...meninas);
  }

  // Preencher o Círculo Excedente (7º grupo) com:
  // 1. Quem passou do limite de quantidade (masc/fem)
  // 2. Quem está fora da faixa etária
  grupos[6].push(...mascExcedentesPorQtd, ...femExcedentesPorQtd, ...excedentes);

  // Escrever resultado
  grupos.forEach((grupo, i) => {
    grupo.forEach(p => {
      const nomeCirculo = i < 6 ? `Círculo ${i + 1}` : `Círculo Excedente`;
      sheetDestino.appendRow([p.nome, p.idade, p.bairro, p.sexo, nomeCirculo]);
    });
  });

  // Escrever erros
  erros.forEach(l => abaErros.appendRow(l));
}


//funcao nova de distribuicao
function novaDistribuicaoCirculos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetDestino = ss.getSheetByName("Nova_Distribuição_Círculos");
  if (!sheetDestino) {
    sheetDestino = ss.insertSheet("Nova_Distribuição_Círculos");
  } else {
    sheetDestino.clear();
  }
  sheetDestino.appendRow(["Nome", "Idade", "Bairro", "Sexo", "Grupo Sugerido"]);

  const sheetOrigem = ss.getSheetByName("Inscricoes_Prioritarias");
  const dados = sheetOrigem.getDataRange().getValues();
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();

  const cabecalho = dados.shift();
  const colPertence = cabecalho.indexOf("Pertence à Porciúncula?");
  const colConfirmacao = 21;
  const colStatusEnvio = 22;

  const candidatos = [];

  dados.forEach(linha => {
    const nome = linha[1];
    const dataNascRaw = linha[2];
    const sexo = linha[3]?.toString().trim();
    const bairro = linha[5]?.toString().trim();
    const pertence = linha[colPertence]?.toString().trim().toUpperCase();
    const confirmacao = linha[colConfirmacao]?.toString().trim().toUpperCase();
    const statusEnvio = linha[colStatusEnvio]?.toString().trim().toUpperCase();

    if (pertence !== "SIM") return;
    if (confirmacao !== "CONFIRMADO" || statusEnvio !== "ENVIADO") return;
    if (!dataNascRaw) return;

    const anoNasc = extrairAnoSeguro(dataNascRaw);
    if (!anoNasc || isNaN(anoNasc)) return;

    const idade = parseInt(anoAtual - anoNasc);
    if (isNaN(idade)) return;

    candidatos.push({ nome, idade, bairro: normalizarTexto(bairro), sexo });
  });

  const grupos = Array.from({ length: 7 }, () => []);
  const faixas = [[13, 14], [15, 16], [17]];
  let grupoIndex = 0;

  function buscarAdolescentePorFaixa(sexoDesejado, faixaIdades, lista) {
    for (const faixa of faixaIdades) {
      const index = lista.findIndex(p => p.sexo?.toLowerCase() === sexoDesejado && faixa.includes(p.idade));
      if (index !== -1) {
        const [adolescente] = lista.splice(index, 1);
        return adolescente;
      }
    }
    return null;
  }

  while (grupoIndex < 6) {
    const grupoAtual = [];

    // Preencher meninos
    for (let i = 0; i < 6; i++) {
      const adolescente = buscarAdolescentePorFaixa("masculino", faixas, candidatos);
      grupoAtual.push(adolescente ? adolescente : { nome: "FALTA ADOLESCENTE", idade: "", bairro: "", sexo: "Masculino" });
    }

    // Preencher meninas
    for (let i = 0; i < 6; i++) {
      const adolescente = buscarAdolescentePorFaixa("feminino", faixas, candidatos);
      grupoAtual.push(adolescente ? adolescente : { nome: "FALTA ADOLESCENTE", idade: "", bairro: "", sexo: "Feminino" });
    }

    grupos[grupoIndex] = grupoAtual;
    grupoIndex++;
  }

  // Qualquer um que sobrar vai para o Excedente
  grupos[6].push(...candidatos);

  // Salvar os resultados
  grupos.forEach((grupo, i) => {
    grupo.forEach(p => {
      const nomeCirculo = i < 6 ? `Círculo ${i + 1}` : `Círculo Excedente`;
      sheetDestino.appendRow([p.nome, p.idade, p.bairro, p.sexo, nomeCirculo]);
    });
  });
}

// Suporte
function extrairAnoSeguro(dataNascRaw) {
  if (dataNascRaw instanceof Date) {
    return dataNascRaw.getFullYear();
  }
  if (typeof dataNascRaw === 'string' && dataNascRaw.includes('/')) {
    const partes = dataNascRaw.split('/');
    const ano = parseInt(partes[2]);
    return ano > 1900 ? ano : null;
  }
  return null;
}

function normalizarTexto(texto) {
  return texto?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() || "";
}


// Função de suporte para extrair o ano de forma segura
function extrairAnoSeguro(dataNascRaw) {
  if (dataNascRaw instanceof Date) {
    return dataNascRaw.getFullYear();
  }
  if (typeof dataNascRaw === 'string' && dataNascRaw.includes('/')) {
    const partes = dataNascRaw.split('/');
    const ano = parseInt(partes[2]);
    return ano > 1900 ? ano : null;
  }
  return null;
}

// Função de suporte para normalizar texto
function normalizarTexto(texto) {
  return texto?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() || "";
}


function extrairAnoSeguro(data) {
  if (Object.prototype.toString.call(data) === "[object Date]") {
    return data.getFullYear();
  }
  const match = data.toString().match(/(\d{4})/);
  return match ? parseInt(match[1]) : NaN;
}

function normalizarTexto(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}


function balancearUniformementePorSexo(masculinos, femininos, grupos, limite) {
  const intercalado = [];
  const maxLength = Math.max(masculinos.length, femininos.length);
  
  for (let i = 0; i < maxLength; i++) {
    if (masculinos[i]) intercalado.push(masculinos[i]);
    if (femininos[i]) intercalado.push(femininos[i]);
  }

  let grupoAtual = 0;
  intercalado.forEach(pessoa => {
    while (grupos[grupoAtual].length >= limite) {
      grupoAtual = (grupoAtual + 1) % grupos.length;
    }
    grupos[grupoAtual].push(pessoa);
  });
}

function distribuirSequencialmente(lista, grupos, limite) {
  let grupoAtual = 0;
  lista.forEach(pessoa => {
    while (grupos[grupoAtual].length >= limite) {
      grupoAtual = (grupoAtual + 1) % grupos.length;
    }
    grupos[grupoAtual].push(pessoa);
  });
}



// Funções auxiliares
function extrairAnoSeguro(data) {
  try {
    // 1. Se já é um Date válido, extrai diretamente
    if (Object.prototype.toString.call(data) === '[object Date]' && !isNaN(data.getTime())) {
      return data.getFullYear();
    }

    // 2. Se é texto DD/MM/YYYY
    if (typeof data === "string" && data.includes("/")) {
      const partes = data.split("/");
      if (partes.length === 3) {
        return parseInt(partes[2], 10);
      }
    }

    // 3. Se é texto DDMMYYYY
    if (typeof data === "string" && /^\d{8}$/.test(data)) {
      return parseInt(data.slice(4), 10);
    }

    // 4. Tenta converter como fallback (em último caso)
    const convertida = new Date(data);
    if (!isNaN(convertida.getTime())) {
      return convertida.getFullYear();
    }

  } catch (e) {
    Logger.log("Erro ao interpretar data: " + data);
  }

  return null;
}

function normalizarTexto(txt) {
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function balancearGrupos(lista, grupos) {
  let i = 0;
  lista.forEach(p => {
    grupos[i % grupos.length].push(p);
    i++;
  });
}

function gerarDocumentoCirculosMelhorado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Círculos_Distribuídos");
  const dados = sheet.getDataRange().getValues();
  const pastaId = "1Muadhvo8EJ15aaYuVf6ghqT_C1sppxYt"; // Pasta destino no Drive

  const doc = DocumentApp.create("📘 Lista de Círculos – EAC Porciúncula");
  const body = doc.getBody();

  // Título centralizado
  const titulo = body.appendParagraph("📘 Lista de Círculos – EAC Porciúncula");
  titulo.setHeading(DocumentApp.ParagraphHeading.TITLE);
  titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  const registros = dados.slice(1); // remove cabeçalho
  const grupos = {};

  registros.forEach(linha => {
    const grupo = linha[4]; // Coluna "Grupo Sugerido"
    if (!grupos[grupo]) grupos[grupo] = [];
    grupos[grupo].push({
      nome: linha[0],
      idade: linha[1],
      sexo: linha[3],
      bairro: linha[2]
    });
  });

  Object.keys(grupos).sort().forEach((grupo, index, array) => {
    const grupoData = grupos[grupo].sort((a, b) => a.nome.localeCompare(b.nome));

    body.appendPageBreak(); // Início em nova página
    const tituloGrupo = body.appendParagraph(`${grupo}`);
    tituloGrupo.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    tituloGrupo.setAlignment(DocumentApp.HorizontalAlignment.LEFT);

    const tabela = body.appendTable();
    const cabecalho = tabela.appendTableRow();
    ["Nome", "Idade", "Sexo", "Bairro"].forEach(texto => {
      cabecalho.appendTableCell(texto).setBold(true);
    });

    grupoData.forEach(adolescente => {
      const linha = tabela.appendTableRow();
      linha.appendTableCell(String(adolescente.nome));
      linha.appendTableCell(String(adolescente.idade));
      linha.appendTableCell(String(adolescente.sexo));
      linha.appendTableCell(String(adolescente.bairro));
    });
  });

  doc.saveAndClose();

  // Move o documento para a pasta do Drive correta
  const file = DriveApp.getFileById(doc.getId());
  DriveApp.getFolderById(pastaId).addFile(file);
  DriveApp.getRootFolder().removeFile(file);


  function removerDuplicadosPorNomeEData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaOrigem = ss.getSheetByName("Respostas ao formulário 1");
  const dados = abaOrigem.getDataRange().getValues();

  const cabecalho = dados[0];
  const registros = dados.slice(1);

  const chavesUnicas = new Set();
  const registrosFiltrados = [];

  registros.forEach(linha => {
    const nome = linha[1]?.toString().trim().toUpperCase(); // Coluna B: Nome completo
    const dataNasc = linha[2]; // Coluna C: Data de nascimento

    let chave = nome;

    // Se for data válida, normaliza como string YYYY-MM-DD
    if (dataNasc instanceof Date && !isNaN(dataNasc.getTime())) {
      chave += `|${dataNasc.toISOString().split('T')[0]}`;
    } else {
      chave += `|${dataNasc?.toString().trim()}`;
    }

    if (!chavesUnicas.has(chave)) {
      chavesUnicas.add(chave);
      registrosFiltrados.push(linha);
    }
  });

  // Criar ou limpar a aba de destino
  const nomeAbaDestino = "Inscricoes_Sem_Duplicidade";
  let abaDestino = ss.getSheetByName(nomeAbaDestino);
  if (!abaDestino) {
    abaDestino = ss.insertSheet(nomeAbaDestino);
  } else {
    abaDestino.clear();
  }

  // Preencher nova aba
  abaDestino.appendRow(cabecalho);
  registrosFiltrados.forEach(linha => abaDestino.appendRow(linha));

  SpreadsheetApp.getUi().alert(`✅ Duplicatas removidas!\nTotal original: ${registros.length}\nRegistros únicos: ${registrosFiltrados.length}`);
}
  SpreadsheetApp.getUi().alert("📄 Documento gerado com sucesso (sem logo) e salvo no Drive!");
}

function removerDuplicadosPorNomeEData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaOrigem = ss.getSheetByName("Respostas ao formulário 1");
  const dados = abaOrigem.getDataRange().getValues();

  const cabecalho = dados[0];
  const registros = dados.slice(1);

  const chavesUnicas = new Set();
  const registrosFiltrados = [];

  registros.forEach((linha, index) => {
    const nome = linha[1]?.toString().trim().toUpperCase(); // Coluna B
    const dataNasc = linha[2]; // Coluna C
    let telefoneOriginal = linha[6]?.toString().replace(/\D/g, ""); // Coluna G (somente números)

    // ➕ Formatar telefone no padrão 55 + DDD + número
    if (telefoneOriginal.length === 11) {
      telefoneOriginal = "55" + telefoneOriginal;
    } else {
      telefoneOriginal = telefoneOriginal || ""; // manter vazio se inválido
    }

    let chave = nome;
    if (dataNasc instanceof Date && !isNaN(dataNasc.getTime())) {
      chave += `|${dataNasc.toISOString().split('T')[0]}`;
    } else {
      chave += `|${dataNasc?.toString().trim()}`;
    }

    if (!chavesUnicas.has(chave)) {
      chavesUnicas.add(chave);

      const novaLinha = [...linha];
      novaLinha[6] = telefoneOriginal;

      registrosFiltrados.push(novaLinha);

      // Marca como verificado na coluna T (índice 19)
      abaOrigem.getRange(index + 2, 20).setValue("Verificado");
    }
  });

  // Criar ou limpar aba de destino
  const nomeAbaDestino = "Inscricoes_Sem_Duplicidade";
  let abaDestino = ss.getSheetByName(nomeAbaDestino);
  if (!abaDestino) {
    abaDestino = ss.insertSheet(nomeAbaDestino);
  } else {
    abaDestino.clear();
  }

  abaDestino.appendRow(cabecalho);
  registrosFiltrados.forEach(linha => abaDestino.appendRow(linha));

  SpreadsheetApp.getUi().alert(`✅ Duplicatas removidas e verificações marcadas!\nTotal original: ${registros.length}\nRegistros únicos: ${registrosFiltrados.length}`);
}



// Função auxiliar para formatar o telefone
function formatarTelefone(telefone) {
  if (!telefone) return "";

  let telStr = telefone.toString().replace(/\D/g, ""); // Remove tudo que não for número

  // Se tiver código país + DDD + número
  if (telStr.length === 13 && telStr.startsWith("55")) {
    return `+55 ${telStr.slice(2, 4)} ${telStr.slice(4, 9)}-${telStr.slice(9)}`;
  }

  // Se tiver DDD + número (sem o +55)
  if (telStr.length === 11) {
    return `+55 ${telStr.slice(0, 2)} ${telStr.slice(2, 7)}-${telStr.slice(7)}`;
  }

  // Se tiver só número com 9 dígitos
  if (telStr.length === 9) {
    return `+55 ?? ${telStr.slice(0, 5)}-${telStr.slice(5)}`;
  }

  // Caso não reconheça o formato
  return telefone.toString(); // Retorna original como fallback
}

function gerarAbaFiltradaComPrioridades() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaOrigem = ss.getSheetByName("Inscricoes_Sem_Duplicidade");
  const nomeNovaAba = "Inscricoes_Prioritarias";

  // Criar ou acessar aba destino
  let abaDestino = ss.getSheetByName(nomeNovaAba);
  if (!abaDestino) {
    abaDestino = ss.insertSheet(nomeNovaAba);
    abaDestino.appendRow([
      ...abaOrigem.getRange(1, 1, 1, 18).getValues()[0],
      "Pertence à Porciúncula?",
      "Status da Validação"
    ]);
  }

  // Mapear todas as chaves já existentes: nome + data de nascimento
  const dadosDestino = abaDestino.getDataRange().getValues();
  const chavesRegistradas = new Set();
  for (let i = 1; i < dadosDestino.length; i++) {
    const linha = dadosDestino[i];
    const nome = linha[1];
    const dataNasc = linha[2];
    const chave = `${nome.trim().toLowerCase()}|${new Date(dataNasc).toDateString()}`;
    chavesRegistradas.add(chave);
  }

  const dados = abaOrigem.getDataRange().getValues();
  dados.shift(); // Remove cabeçalho

  const grupoIcarai = [];
  const grupoSantaRosa = [];
  const grupoSimOutros = [];
  const grupoNao = [];

  for (const linha of dados) {
    const nome = linha[1];
    const dataNasc = linha[2];
    const bairro = (linha[5] || "").toString().toLowerCase();
    const justificativa = linha[11];
    const chave = `${nome.trim().toLowerCase()}|${new Date(dataNasc).toDateString()}`;

    // Ignora se já registrado
    if (chavesRegistradas.has(chave)) continue;

    const pertence = classificarVinculoParoquia(justificativa);
    const registro = {
      data: new Date(linha[0]), // data de inscrição (coluna A)
      linha: [...linha.slice(0, 18), pertence, "VALIDADO"]
    };

    if (pertence === "SIM") {
      if (bairro.includes("icaraí")) {
        grupoIcarai.push(registro);
      } else if (bairro.includes("santa rosa")) {
        grupoSantaRosa.push(registro);
      } else {
        grupoSimOutros.push(registro);
      }
    } else {
      grupoNao.push(registro);
    }

    chavesRegistradas.add(chave); // garante não duplicar no mesmo loop
  }

  const ordenarPorData = (a, b) => a.data - b.data;
  grupoIcarai.sort(ordenarPorData);
  grupoSantaRosa.sort(ordenarPorData);
  grupoSimOutros.sort(ordenarPorData);
  grupoNao.sort(ordenarPorData);

  const todosOrdenados = [...grupoIcarai, ...grupoSantaRosa, ...grupoSimOutros, ...grupoNao];
  todosOrdenados.forEach(obj => abaDestino.appendRow(obj.linha));

  SpreadsheetApp.flush();
  Logger.log("✅ Finalizado com validação por nome + data de nascimento.");
}

// Função auxiliar no mesmo script:
function classificarVinculoParoquia(resposta) {
  if (!resposta) return "DÚVIDOSO";
  const texto = resposta.toString().toLowerCase();

  const padroesSim = [
    "sim", "anos", "ano", "meses", "mês", "há", "desde", "minha vida toda",
    "batizado na porciúncula", "primeira comunhão", "catequese", "eac", "minha família toda",
    "desde pequena", "desde que nasceu", "vai desde que nasceu", "desde que eu nasci", "2015", "2012"
  ];

  const padroesNao = [
    "não participa", "nunca", "não participo", "vou começar", "vou passar", "eventualmente",
    "às vezes", "primeira vez", "não participou", "não participa dessa", "não participo muito",
    "participa de outra", "sou da paróquia de", "pastoral da juventude", "camboinhas"
  ];

  for (let p of padroesNao) {
    if (texto.includes(p)) return "NÃO";
  }

  for (let p of padroesSim) {
    if (texto.includes(p)) return "SIM";
  }

  return "DÚVIDOSO";
}

function enviarEmailsConfirmacao() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ABA);
  const dados = sheet.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    const nome = dados[i][1]; // Coluna B
    const email = dados[i][7]; // Coluna H
    const statusEnvio = dados[i][20]; // Coluna U
    const resposta = dados[i][21]; // Coluna V

    if (!statusEnvio && !resposta && email) {
      const linkConfirmado = `${SCRIPT_BASE_URL}?email=${encodeURIComponent(email)}&resposta=Confirmado`;
      const linkJaFez = `${SCRIPT_BASE_URL}?email=${encodeURIComponent(email)}&resposta=JaFezEAC`;

      const corpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ccc; padding: 24px; border-radius: 8px;">
          <div style="text-align: center;">
            <img src="${LOGO_URL}" alt="Logo EAC Porciúncula" width="100" style="margin-bottom: 16px;">
            <h2 style="color: #003366;">EAC – Paróquia Porciúncula de Sant’Ana</h2>
          </div>

          <p>Olá <strong>${nome}</strong>,</p>

          <p>
            Temos uma ótima notícia: sua inscrição foi <strong>confirmada</strong> para participar do
            Encontro de Adolescentes com Cristo da nossa paróquia! 🙌
          </p>

          <p>
            Mas antes, precisamos confirmar uma informação importante: você já participou do EAC em outra paróquia?
          </p>

          <p>Por favor, clique em um dos botões abaixo para nos informar:</p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${linkConfirmado}" style="background-color: #003366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 8px;">
              ✅ Confirmar inscrição
            </a>
            <a href="${linkJaFez}" style="background-color: #b32d2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 8px;">
              🙋‍♂️ Já fiz o EAC
            </a>
          </div>

          <p>
            Se tiver qualquer dúvida, entre em contato conosco pelo WhatsApp do EAC:
            <a href="https://chat.whatsapp.com/HBwZfZqZPjtAYUs3m4f6xg" style="color: #003366;">clique aqui para falar com a gente</a>.
          </p>

          <hr style="margin: 32px 0; border: none; border-top: 1px solid #ddd;">

          <div style="font-size: 12px; color: #777; text-align: center;">
            Este e-mail foi enviado automaticamente pelo sistema do EAC Porciúncula.<br>
            Fique atento aos próximos comunicados!
          </div>
        </div>`;

      MailApp.sendEmail({
        to: email,
        subject: 'Confirmação da sua inscrição no EAC Porciúncula',
        htmlBody: corpoHtml
      });

      sheet.getRange(i + 1, 21).setValue('enviado'); // Coluna U
      Utilities.sleep(1000); // Pausa para evitar limites do Gmail
    }
  }
}

function doGet(e) {
  const email = e.parameter.email;
  const resposta = e.parameter.resposta;
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ABA);
  const dados = sheet.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    const emailPlanilha = dados[i][7]; // Coluna H

    if (emailPlanilha === email) {
      sheet.getRange(i + 1, 22).setValue(resposta); // Coluna V
      const nome = dados[i][1];
      let mensagem = '';

      if (resposta === 'Confirmado') {
        mensagem = `Olá ${nome}, sua participação no EAC está confirmada! Prepare-se para viver um final de semana incrível com a gente!`;
      } else if (resposta === 'JaFezEAC') {
        mensagem = `Olá ${nome}, obrigado por compartilhar que já viveu o EAC. Vamos entrar em contato para te convidar a participar conosco como parte da equipe!`;
      }

      const html = `
        <div style="font-family: Arial, sans-serif; background-color: #f4f8fc; padding: 40px; max-width: 600px; margin: auto; border-radius: 10px; text-align: center;">
          <img src="${LOGO_URL}" alt="Logo EAC Porciúncula" width="80" style="margin-bottom: 20px;">
          <h2 style="color: #003366;">Confirmação registrada com sucesso!</h2>
          <p style="font-size: 16px; color: #333;">${mensagem}</p>
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #777;">Esta página é gerada automaticamente pelo sistema do EAC Porciúncula.</p>
        </div>`;
      return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  const erroHtml = `
    <div style="font-family: Arial, sans-serif; background-color: #fff4f4; padding: 40px; max-width: 600px; margin: auto; border-radius: 10px; text-align: center;">
      <h2 style="color: #b32d2e;">Ops!</h2>
      <p style="font-size: 16px; color: #333;">E-mail não encontrado na base de dados. Verifique o link ou entre em contato com a equipe do EAC.</p>
    </div>`;
  return HtmlService.createHtmlOutput(erroHtml).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function enviarEmailNaoSelecionados() {
  const sheet = SpreadsheetApp.openById('1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg').getSheetByName('não inscritos');
  const dados = sheet.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    const nome = dados[i][1]; // Coluna B - Nome
    const email = dados[i][2]; // Coluna C - E-mail
    const statusEnvio = dados[i][6]; // Coluna G - Status Envio

    if (!statusEnvio && email) {
      const corpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ccc; padding: 24px; border-radius: 8px;">
          <div style="text-align: center;">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC Porciúncula" width="100" style="margin-bottom: 16px;">
            <h2 style="color: #003366;">EAC – Paróquia Porciúncula de Sant’Ana</h2>
          </div>

          <p>Olá <strong>${nome}</strong>,</p>

          <p>Obrigado por se inscrever para participar do Encontro de Adolescentes com Cristo (EAC).</p>

          <p>Nesse momento estamos com as vagas preenchidas, porém fique atento , pois novas vagas podem surgir a qualquer momento.</p>

          <p>Sua inscrição continua válida para os próximos encontros na paróquia.</p>

          <p>Enquanto isso, acompanhe nossas redes sociais e participe das missas e atividades do EAC. É uma ótima forma de seguir conectado e fazer parte dessa caminhada.</p>

          <div style="text-align: center; margin: 20px 0;">
            <a href="https://www.instagram.com/eacporciunculadesantana/" style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">
              Siga o EAC no Instagram
            </a>
          </div>

          <p>Nos vemos em breve!</p>

          <hr style="margin: 32px 0; border: none; border-top: 1px solid #ddd;">

          <div style="font-size: 12px; color: #777; text-align: center;">
            Este e-mail foi enviado automaticamente pelo sistema do EAC Porciúncula.
          </div>
        </div>
      `;

      MailApp.sendEmail({
        to: email,
        subject: 'Sua inscrição no EAC Porciúncula – Aguardamos você no próximo!',
        htmlBody: corpoHtml
      });

      sheet.getRange(i + 1, 7).setValue("Enviado"); // Coluna G
      Utilities.sleep(1000); // Evita atingir limites do Gmail
    }
  }
}

/** Utilitário simples para data/hora no padrão brasileiro */
function formataDataHora(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/**
 * Envia o e-mail de boas-vindas usando a aba "Inscricoes_Prioritarias".
 * Para: coluna H | CC: coluna K | Status gravado na coluna X.
 * Mantém o HTML, remetente e validações anteriores.
 */
function enviarEmailsBoasVindasEAC() {
  const SHEET_NAME = 'Inscricoes_Prioritarias';
  const REMETENTE_NOME = 'EAC Porciúncula';
  const REMETENTE_EMAIL = 'eacporciunculadesantana@gmail.com';

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Aba "Inscricoes_Prioritarias" não encontrada.');

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return;

  const dados = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  // Índices zero-based no array "dados"
  const IDX_NOME = 1;       // B
  const IDX_EMAIL_TO = 7;   // H
  const IDX_EMAIL_CC = 10;  // K
  const IDX_STATUS_X = 23;  // X

  for (let i = 1; i < dados.length; i++) {
    const linha = i + 1; // 1-based para getRange
    const nome = String(dados[i][IDX_NOME] || '').trim();
    const emailTo = String(dados[i][IDX_EMAIL_TO] || '').trim();
    const emailCc = String(dados[i][IDX_EMAIL_CC] || '').trim();
    const statusX = String(dados[i][IDX_STATUS_X] || '').trim();

    // pula se já marcado ou sem e-mail válido
    if (statusX) continue;
    if (!isEmail(emailTo)) continue;

    try {
      const html = montarHtmlBoasVindas(nome);

      // Usa GmailApp e configura nome e replyTo; "from" requer alias configurado
      GmailApp.sendEmail(emailTo, 'Recebemos sua inscrição — EAC Porciúncula', '', {
        htmlBody: html,
        name: REMETENTE_NOME,
        replyTo: REMETENTE_EMAIL,
        cc: isEmail(emailCc) ? emailCc : undefined
        // from: REMETENTE_EMAIL // habilite se o alias "Enviar e-mail como" estiver configurado
      });

      sheet.getRange(linha, IDX_STATUS_X + 1).setValue('enviado'); // Coluna X
      Utilities.sleep(750);
    } catch (err) {
      sheet.getRange(linha, IDX_STATUS_X + 1).setValue('erro: ' + String(err).slice(0, 120));
      Utilities.sleep(250);
    }
  }

  function montarHtmlBoasVindas(nome) {
    const safeNome = nome || 'Olá';
    return `
  <div style="font-family: Arial, sans-serif; max-width: 640px; margin: auto; border: 1px solid #e2e2e2; border-radius: 10px; padding: 24px;">
    <div style="text-align: center; margin-bottom: 12px;">
      <img src="${LOGO_URL}" alt="Logo EAC Porciúncula" width="90" height="90" style="border-radius: 6px;">
    </div>
    <h2 style="text-align:center; color:#003366; margin: 8px 0 12px;">EAC – Paróquia Porciúncula de Sant’Ana</h2>
    <hr style="border:0; border-top:2px solid #0a3a6b; margin: 12px 0 24px;">
    <p style="font-size:16px;">Olá <strong>${safeNome}</strong>,</p>
    <p style="font-size:16px; line-height:1.5; margin: 10px 0;">Recebemos sua inscrição!</p>
    <p style="font-size:16px; line-height:1.6; margin: 0 0 16px;">
      Este é um dos nossos canais de comunicação dos eventos do EAC da Porciúncula.
      Vamos através dele mandar notícias e comunicados importantes! É um grande prazer tê-los conosco.
    </p>
    <p style="font-size:16px; line-height:1.6; margin: 0 0 20px;">
      Acompanhe nosso Instagram para ficar por dentro das novidades:
      <a href="https://www.instagram.com/eacporciunculadesantana" style="color:#0a3a6b; text-decoration:underline;">@eacporciunculadesantana</a>
    </p>
    <p style="font-size:16px; line-height:1.5; margin: 0 0 8px;">Paz e Bem!</p>
    <div style="font-size:12px; color:#777; text-align:center; margin-top: 28px;">
      Este e-mail foi enviado automaticamente pelo sistema do EAC Porciúncula.<br>
      Caso não reconheça esta mensagem, por favor, ignore.
    </div>
  </div>`;
  }

  function isEmail(e) {
    return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }
}


//----------------------------------------------
/**
 * Adiciona NOVOS registros na aba "não inscritos" sem revarrer tudo.
 * Processa apenas as linhas novas de "Inscricoes_Sem_Duplicidade"
 * desde a última execução, usando Script Properties como checkpoint.
 *
 * Layout gravado em "não inscritos":
 * A: Linha Origem (linha da Inscricoes_Sem_Duplicidade)
 * B: Nome (coluna B)
 * C: E-mail (coluna H)
 * D: Status = "Ativo"
 * E: Data Cadastro (apenas data de Inscricoes_Sem_Duplicidade!A)
 * F: Telefone (coluna G, normalizado)
 *
 * Requisitos:
 *  - Abas: Cadastro_Oficial, Inscricoes_Sem_Duplicidade, não inscritos
 */
function atualizarNaoInscritos() {
  const NOME_ABA_OFICIAL   = 'Cadastro_Oficial';
  const NOME_ABA_SEM_DUP   = 'Inscricoes_Sem_Duplicidade';
  const NOME_ABA_NAO       = 'não inscritos';
  const TZ = Session.getScriptTimeZone() || 'America/Sao_Paulo';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shOficial = ss.getSheetByName(NOME_ABA_OFICIAL);
  const shSemDup  = ss.getSheetByName(NOME_ABA_SEM_DUP);
  const shNao     = ss.getSheetByName(NOME_ABA_NAO);

  if (!shOficial || !shSemDup || !shNao) {
    throw new Error('Verifique o nome das abas.');
  }

  // 1) Telefones Oficiais para comparação (coluna G do Cadastro_Oficial)
  const lastRowOficial = shOficial.getLastRow();
  const dadosOficial = lastRowOficial > 1
    ? shOficial.getRange(2, 7, lastRowOficial - 1, 1).getValues().flat()
    : [];
  const setPhonesOficial = new Set(dadosOficial.map(t => normalizePhone(t)).filter(Boolean));

  // 2) Telefones já em "não inscritos" (coluna F)
  const lastRowNao = shNao.getLastRow();
  const dadosNao = lastRowNao > 1
    ? shNao.getRange(2, 6, lastRowNao - 1, 1).getValues().flat()
    : [];
  const setPhonesNao = new Set(dadosNao.map(t => normalizePhone(t)).filter(Boolean));

  // 3) Processar origem
  const lastRowOrigem = shSemDup.getLastRow();
  if (lastRowOrigem <= 1) return;

  const lastColOrigem = Math.max(8, shSemDup.getLastColumn());
  const dadosOrigem = shSemDup.getRange(2, 1, lastRowOrigem - 1, lastColOrigem).getValues();

  const linhasParaInserir = [];

  for (let i = 0; i < dadosOrigem.length; i++) {
    const row = dadosOrigem[i];

    const telefoneBruto = row[6]; // Coluna G (origem)
    const telefoneFinal = String(normalizePhone(telefoneBruto)); // 5521xxxxxxxxx

    if (!telefoneFinal) continue;
    if (setPhonesOficial.has(telefoneFinal)) continue;
    if (setPhonesNao.has(telefoneFinal)) continue;

    const linhaReal = i + 2;
    const nome    = String(row[1] || '').trim(); // Coluna B
    const email   = String(row[7] || '').trim(); // Coluna H
    const dataRaw = row[0];                      // Coluna A
    const dataNascimento = row[2] || '';         // Coluna C (origem) -> Coluna R (destino)

    const bairro  = String(row[5] || '').trim(); // Coluna F (origem) -> BAIRRO

    linhasParaInserir.push([
      linhaReal,                 // A
      nome,                      // B
      email,                     // C
      'Ativo',                   // D
      formatDateOnly(dataRaw, TZ), // E
      telefoneFinal,             // F
      bairro,                    // G
      '', '', '', '', '', '', '', '', '', '', // H..Q
      dataNascimento             // R
    ]);
  }

  // 4) Gravação
  if (linhasParaInserir.length > 0) {
    const proximaLinha = shNao.getLastRow() + 1;

    // Força telefone como texto (coluna F)
    const rangeTel = shNao.getRange(proximaLinha, 6, linhasParaInserir.length, 1);
    rangeTel.setNumberFormat('@');

    // Grava 18 colunas (A até R)
    shNao.getRange(proximaLinha, 1, linhasParaInserir.length, 18).setValues(linhasParaInserir);

    // Formato da data (coluna E)
    shNao.getRange(proximaLinha, 5, linhasParaInserir.length, 1).setNumberFormat('dd/MM/yyyy');
    // Formato da data de nascimento (coluna R)
    shNao.getRange(proximaLinha, 18, linhasParaInserir.length, 1).setNumberFormat('dd/MM/yyyy');

    // Reforça texto no telefone depois de gravar (ajuda a não virar número)
    rangeTel.setNumberFormat('@');

    Logger.log("Inseridos: " + linhasParaInserir.length);
  }
}


/**
 * Sempre retorna no padrão: 5521XXXXXXXXX
 * - remove não-dígitos
 * - garante DDI 55
 * - força DDD 21
 * - pega os últimos 8 ou 9 dígitos como número
 */
function normalizePhone(phone) {
  if (phone === null || phone === undefined) return '';

  let d = String(phone).replace(/\D/g, '');
  if (!d) return '';

  // Remove zeros à esquerda
  d = d.replace(/^0+/, '');

  // Remove 55 se existir
  if (d.startsWith('55')) {
    d = d.slice(2);
  }

  let numero = '';

  // Casos possíveis:
  // 21XXXXXXXXX (11) → celular
  // 21XXXXXXXX  (10) → fixo
  // XXXXXXXXX   (9)
  // XXXXXXXX    (8)
  if (d.length >= 11) {
    numero = d.slice(-9); // assume celular
  } else if (d.length === 10) {
    numero = d.slice(-8); // fixo
  } else if (d.length === 9 || d.length === 8) {
    numero = d;
  } else {
    return '';
  }

  // FORÇA SEMPRE 5521 + número
  return '5521' + numero;
}


function formatDateOnly(date, tz) {
  if (!(date instanceof Date)) return date;
  return Utilities.formatDate(date, tz, 'dd/MM/yyyy');
}


function formatDateOnly(date, tz) {
  if (!(date instanceof Date)) return date;
  return Utilities.formatDate(date, tz, 'dd/MM/yyyy');
}

function formatDateOnly(date, tz) {
  if (!(date instanceof Date)) return date;
  return Utilities.formatDate(date, tz, 'dd/MM/yyyy');
}

/** Retorna apenas a data formatada no fuso informado. */
function formatDateOnly(value, tz) {
  if (!value) return '';
  let d;
  if (Object.prototype.toString.call(value) === '[object Date]') d = value;
  else {
    const n = Number(value);
    d = !isNaN(n) ? new Date(n) : new Date(value);
  }
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz, 'dd/MM/yyyy');
}


/** Remove tudo que não for dígito, trata prefixos 55 e zeros iniciais.
 *  Mantém apenas os últimos 11 dígitos quando houver (padrão BR com DDD + 9).
 */
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D+/g, '');
  // remove prefixo 55 se existir
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  // remove zero à esquerda de alguns formatos
  digits = digits.replace(/^0+/, '');
  // se ficou muito longo, mantêm os 11 últimos dígitos
  if (digits.length > 11) {
    digits = digits.slice(-11);
  }
  return digits;
}

/** Converte Date ou string para apenas a data no fuso do script. */
function formatDateOnly(value, tz) {
  if (!value) return '';
  let d;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    d = value;
  } else {
    const tryNum = Number(value);
    if (!isNaN(tryNum)) d = new Date(tryNum);
    else d = new Date(value);
  }
  if (isNaN(d.getTime())) return '';
  // zera horas para formatar só a data
  return Utilities.formatDate(d, tz, 'dd/MM/yyyy');
}
//----------------------------------------------------------

/**
 * Insere em "Inscricoes_Prioritarias" SOMENTE os itens listados em "não inscritos"
 * cuja coluna G (controle) esteja vazia. Mantém a ordem de "não inscritos".
 * Após inserir, marca em "não inscritos" coluna G: "migrado - dd/MM/yyyy HH:mm".
 *
 * Depende de:
 *  - Abas: "Inscricoes_Sem_Duplicidade", "Inscricoes_Prioritarias", "não inscritos"
 *  - classificarVinculoParoquia(justificativa)
 */
function atualizarInscricoesPrioritariasComNovos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaOrigem = ss.getSheetByName("Inscricoes_Sem_Duplicidade");
  const abaDestino = ss.getSheetByName("Inscricoes_Prioritarias");
  const abaNao = ss.getSheetByName("não inscritos");
  const TZ = Session.getScriptTimeZone() || 'America/Sao_Paulo';

  if (!abaOrigem || !abaDestino || !abaNao) {
    throw new Error("Verifique as abas: Inscricoes_Sem_Duplicidade, Inscricoes_Prioritarias e não inscritos.");
  }

  // 1) Mapear chaves existentes no destino para não duplicar
  const valsDestino = abaDestino.getDataRange().getValues();
  const chavesDestino = new Set();
  for (let i = 1; i < valsDestino.length; i++) {
    const nome = (valsDestino[i][1] || "").toString();
    const dataNasc = valsDestino[i][2];
    chavesDestino.add(montarChave(nome, dataNasc));
  }

  // 2) Coletar apenas as linhas de origem que estão pendentes em "não inscritos"
  //    A = linha origem, G = controle de migração (vazio = pendente)
  const valsNao = abaNao.getDataRange().getValues();
  const pendentes = []; // [{linhaOrigem, rowNaoInscritos}]
  for (let i = 1; i < valsNao.length; i++) {
    const linhaOrigem = Number(valsNao[i][0]);  // col A
    const controle = (valsNao[i][6] || "").toString().trim(); // col G
    if (!controle && Number.isFinite(linhaOrigem) && linhaOrigem >= 2) {
      pendentes.push({ linhaOrigem, idxNao: i }); // i = índice zero-based dentro de valsNao
    }
  }
  if (pendentes.length === 0) {
    Logger.log("Nada novo: não há pendentes em 'não inscritos' (coluna G).");
    return;
  }

  // 3) Buscar somente as linhas necessárias na origem usando RangeList (A..R = 18 colunas)
  //    Mantemos a mesma montagem de saída: 18 colunas + pertence + VALIDADO
  const ranges = pendentes.map(p => `A${p.linhaOrigem}:R${p.linhaOrigem}`);
  const rangeList = abaOrigem.getRangeList(ranges).getRanges();
  // rangeList[i].getValues() sempre retorna [[...]]
  const registrosAInserir = [];
  const jaConsideradas = new Set();

  for (let i = 0; i < rangeList.length; i++) {
    const vr = rangeList[i].getValues()[0]; // linha única
    const nome = (vr[1] || "").toString();
    const dataNasc = vr[2];
    const justificativa = vr[11];
    const chave = montarChave(nome, dataNasc);

    if (chavesDestino.has(chave) || jaConsideradas.has(chave)) {
      continue;
    }
    const pertence = classificarVinculoParoquia(justificativa);
    registrosAInserir.push({
      linhaDestino: [...vr.slice(0, 18), pertence, "VALIDADO"],
      idxNao: pendentes[i].idxNao // para marcar depois na aba "não inscritos"
    });
    jaConsideradas.add(chave);
  }

  if (registrosAInserir.length === 0) {
    Logger.log("Nenhum registro novo válido para inserir.");
    return;
  }

  // 4) Inserir mantendo a ordem de 'não inscritos'
  registrosAInserir.forEach(obj => abaDestino.appendRow(obj.linhaDestino));

  // 5) Marcar "migrado" na coluna G de "não inscritos" para cada item inserido
  const stamp = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm");
  registrosAInserir.forEach(obj => {
    const linhaNao = obj.idxNao + 1 + 1; // idx zero-based + cabeçalho + 1
    abaNao.getRange(linhaNao, 7).setValue(`migrado - ${stamp}`); // col G
  });

  SpreadsheetApp.flush();
  Logger.log(`✅ Inseridos ${registrosAInserir.length} registros. Marcados como migrados em 'não inscritos'.`);
}

// ------ helpers ------
function montarChave(nome, dataNasc) {
  const n = (nome || '').toString().trim().toLowerCase();
  const d = toDateSafe(dataNasc);
  return `${n}|${d.toDateString()}`;
}
function toDateSafe(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? new Date(0) : d;
}
