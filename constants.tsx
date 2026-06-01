
import type { Dispatch, Log } from "./types";
import { LogStatus } from "./types";

export const INITIAL_DISPATCHES: Dispatch[] = [
  {
    id: "d1",
    name: "Agradecimento de InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o",
    type: "agradecimento_inscricao",
    endpoint: "/disparo?tipo=agradecimento_inscricao",
    method: "GET",
    shortDescription:
      'Envia template para inscritos "nÃƒÆ’Ã‚Â£o incluÃƒÆ’Ã‚Â­dos" na Planilha de InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes.',
    detailedDescription:
      "Este disparo varre a planilha [InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes PrioritÃƒÆ’Ã‚Â¡rias] na aba Inscricoes_Prioritarias. Ele filtra contatos com status `nao_incluido` na coluna U.",
    rules:
      "### Regras Operacionais\n1. O status na coluna U deve ser exatamente `nao_incluido`.\n2. NÃƒÆ’Ã‚Â£o altera a planilha apÃƒÆ’Ã‚Â³s o envio.",
    parameters: ["chave", "tipo"],
    status: "active",
    tags: ["InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o", "WhatsApp"],
    emailPreview:
      '<p>OlÃƒÆ’Ã‚Â¡, <strong>[NOME]</strong>!</p><p>Muito obrigado por se inscrever no EAC PorciÃƒÆ’Ã‚Âºncula de Santana. Recebemos seus dados e estamos muito felizes com seu interesse!</p><p>Em breve enviaremos mais informaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes sobre o encontro.</p>',
  },
  {
    id: "d7",
    name: "ConfirmaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de Interesse (Fila)",
    type: "confirmacao_interesse_espera",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Envia um formulÃƒÆ’Ã‚Â¡rio de confirmaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o para jovens na fila de espera.",
    detailedDescription:
      "Dispara um e-mail com um link ÃƒÆ’Ã‚Âºnico para jovens na fila de espera confirmarem se ainda tÃƒÆ’Ã‚Âªm interesse em participar do prÃƒÆ’Ã‚Â³ximo encontro.",
    rules:
      "### Protocolo de Engajamento\n- **PÃƒÆ’Ã‚Âºblico:** Apenas \"Fila de Espera\".\n- **AÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:** Envia e-mail com link para formulÃƒÆ’Ã‚Â¡rio pÃƒÆ’Ã‚Âºblico.\n- **Controle:** Registra o status do envio para evitar duplicidade.\n- **Reset de envio:** limpa apenas registros com `I` em branco e `P` em branco (se `P` estiver preenchida, nÃƒÆ’Ã‚Â£o reseta).",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Fila de Espera", "Engajamento"],
    emailPreview:
      '<h2 style="color: #044372; margin-top: 0;">OlÃƒÆ’Ã‚Â¡, [NOME]!</h2><p>Temos boas notÃƒÆ’Ã‚Â­cias! Estamos reorganizando as fichas recebidas para o prÃƒÆ’Ã‚Â³ximo <strong>EAC</strong>, que acontecerÃƒÆ’Ã‚Â¡ nos dias <strong>23 e 24/05</strong>, e seu nome estÃƒÆ’Ã‚Â¡ em nossa <strong>fila de espera</strong>.</p><p>Pedimos que vocÃƒÆ’Ã‚Âª <strong>confirme seu interesse em participar do EAC</strong> clicando no botÃƒÆ’Ã‚Â£o abaixo. Essa resposta nos ajudarÃƒÆ’Ã‚Â¡ na organizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do encontro. A confirmaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o final da participaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o acontecerÃƒÆ’Ã‚Â¡ em uma etapa posterior, por meio de <strong>convocaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o oficial</strong>.</p><a href="${link}" style="background-color: #044372; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 12px; font-weight: bold;">Confirmar Interesse</a><br></br><p>Fique atento ao seu <strong>E-mail</strong> e <strong>WhatsApp</strong>. Em breve entraremos em contato.</p><p>Fraternalmente,<br><strong>CoordenaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o EAC PorciÃƒÆ’Ã‚Âºncula de SantAnna</strong></p>',
  },
  {
    id: "d4",
    name: "Aviso Fila de Espera (NÃƒÆ’Ã‚Â£o Inscritos)",
    type: "waitlist_non_enrolled",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Informa aos que nÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â£o no Cadastro de Encontrista que sua inscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o estÃƒÆ’Ã‚Â¡ em anÃƒÆ’Ã‚Â¡lise.",
    detailedDescription:
      "Identifica automaticamente quem se inscreveu mas nÃƒÆ’Ã‚Â£o consta no Cadastro de Encontrista. Envia e-mail informando que o cadastro estÃƒÆ’Ã‚Â¡ sendo verificado para uma nova chamada.",
    rules:
      "### Protocolo de ComunicaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o\n- **PÃƒÆ’Ã‚Âºblico:** Apenas \"NÃƒÆ’Ã‚Â£o Inscritos\" (cruzamento de planilhas).\n- **FormataÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:** Layout padrÃƒÆ’Ã‚Â£o EAC.\n- **Lote:** MÃƒÆ’Ã‚Â¡ximo 50 envios por clique.\n- **Controle:** Registra status na aba de InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes para evitar reenvio.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Espera", "Batch"],
    emailPreview:
      '<h2 style="color:#044372; margin-top:0;">Ola, [NOME]!</h2><p>Recebemos sua inscricao para o EAC.</p><p>Seu cadastro foi registrado e em breve enviaremos os proximos passos.</p><p>Fique atento ao seu e-mail e WhatsApp.</p><br><p>Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
  },
  {
    id: "d8",
    name: "Confirmacao de Inscricao (Supabase)",
    type: "confirm_nao_inscritos",
    endpoint: "supabase_api",
    method: "POST",
    shortDescription:
      "Monta publico por status de inscricao e prepara lote com deduplicacao no novo backend.",
    detailedDescription:
      "Consulta a view `vw_inscricoes_completas` e seleciona registros com `status_inscricao` em INSCRITO. O email destino e `coalesce(email_responsavel, email)`.",
    rules:
      "### Protocolo de Comunicacao (Novo Sistema)\n- **Origem:** `vw_inscricoes_completas`.\n- **Filtro:** `status_inscricao = 'INSCRITO'`.\n- **Email destino:** `coalesce(email_responsavel, email)`.\n- **Deduplicacao:** por email (case-insensitive).\n- **Anti-reenvio:** ignora destinatarios com `SUCCESS` em `disparo_destinatarios` no mesmo disparo.\n- **Lote:** padrao 50 por execucao.\n- **Envio efetivo:** SMTP Gmail configurado no backend.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Inscritos", "Batch"],
    emailPreview:
      '<h2 style="color:#044372; margin-top:0;">Ola, [NOME]!</h2><p>Recebemos sua inscricao para o EAC.</p><p>Seu cadastro foi registrado e em breve enviaremos os proximos passos.</p><p>Fique atento ao seu e-mail e WhatsApp.</p><br><p>Fraternalmente,<br><strong>Coordenacao EAC</strong></p>',
  },
  {
    id: "d10",
    name: "ComunicaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o nÃƒÆ’Ã‚Â£o participaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o EAC",
    type: "comunicacao_nao_participacao_eac",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Comunica aos nÃƒÆ’Ã‚Â£o inscritos sem priorizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o (Q != SIM) que nÃƒÆ’Ã‚Â£o foram selecionados para o EAC atual.",
    detailedDescription:
      "Percorre a aba **NÃƒÆ’Ã‚Â£o Inscritos** da planilha de inscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes e envia e-mail apenas para quem tem **H vazia**, **C com e-mail vÃƒÆ’Ã‚Â¡lido**, **P vazia** e **Q (Status PriorizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o) diferente de SIM**.",
    rules:
      "### Protocolo de ComunicaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o\n- **Origem:** Planilha de InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes, aba `NÃƒÆ’Ã‚Â£o Inscritos`.\n- **Filtro:** `H` vazia + `C` com `@` + `P` vazia + `Q != SIM`.\n- **Assunto:** `EAC: ComunicaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o sobre sua InscriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o`.\n- **Status (Coluna P):** `Enviado_Nao_Participacao - DD/MM/AAAA HH:mm`.\n- **Lote:** MÃƒÆ’Ã‚Â¡ximo de 50 envios por execuÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "NÃƒÆ’Ã‚Â£o Inscritos", "Batch"],
    emailPreview:
      '<h2 style="color: #044372; margin-top: 0;">OlÃƒÆ’Ã‚Â¡, [NOME]!</h2><p>Agradecemos seu interesse em participar do EAC.</p><p>Neste momento, vocÃƒÆ’Ã‚Âª <strong>nÃƒÆ’Ã‚Â£o foi selecionado para o EAC atual</strong>. Seu cadastro permanece em nossa base e vocÃƒÆ’Ã‚Âª serÃƒÆ’Ã‚Â¡ convocado para o <strong>EAC do prÃƒÆ’Ã‚Â³ximo semestre</strong>.</p><p>Fique atento ao seu E-mail e WhatsApp para os prÃƒÆ’Ã‚Â³ximos comunicados.</p><br><p>Fraternalmente,<br><strong>CoordenaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o EAC</strong></p>',
  },
  {
    id: "d5",
    name: "Comunicado 99 - Cadastro de Encontrista",
    type: "comunicado_99_cadastro",
    endpoint: "supabase_api",
    method: "POST",
    shortDescription:
      "Envia o comunicado fixo ID 99 para toda a base do Cadastro de Encontrista via E-mail.",
    detailedDescription:
      "Disparo massivo por e-mail utilizando o conteúdo dinâmico do comunicado ID 99. O público é montado via `vw_cadastro_oficial` (e-mail válido + deduplicação + anti-reenvio).",
    rules:
      "### Protocolo de Comunicação (Novo Sistema)\n- **Origem:** `vw_cadastro_oficial`.\n- **Template:** conteúdo dinâmico de `comunicados.id = 99`.\n- **Email destino:** coluna de e-mail válida.\n- **Deduplicação:** por e-mail (case-insensitive).\n- **Anti-reenvio:** exclui destinatários com `SUCCESS` já registrado para este disparo.\n- **Lote:** padrão 50 por execução.\n- **Envio efetivo:** SMTP Gmail configurado no backend.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "ID 99", "Batch"],
    emailPreview:
      '<div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 2px dashed #cbd5e1; text-align: center;"><p style="color: #64748b; font-weight: bold; font-size: 12px; margin: 0;">O CONTEÚDO DESTE DISPARO É DINÂMICO</p><p style="color: #94a3b8; font-size: 10px; margin-top: 4px;">O sistema carregará automaticamente o texto/HTML salvo no <strong>ID 99</strong> do módulo de Comunicados.</p></div>',
  },
  {
    id: "d6",
    name: "Aniversariantes do Dia",
    type: "aniversariantes_dia",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Felicita automaticamente os aniversariantes da data atual no Cadastro de Encontrista.",
    detailedDescription:
      "Varre a coluna C (Nascimento) e envia e-mail (**Coluna H**) para quem faz aniversÃƒÆ’Ã‚Â¡rio hoje.",
    rules:
      "### Protocolo de Alta Performance\n- **Email:** Coluna H.\n- **Processamento:** 50 envios por clique.\n- **Status (Coluna T):** Grava `Enviado - Data Atual`.\n- **Filtro:** Compara Dia/MÃƒÆ’Ã‚Âªs da coluna C.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "FelicitaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o", "Batch"],
    emailPreview:
      '<div style="text-align:center;"><h1 style="color:#044372; margin-top: 0;">ÃƒÂ°Ã…Â¸Ã…Â½Ã‹â€  Feliz AniversÃƒÆ’Ã‚Â¡rio!</h1><p>ParabÃƒÆ’Ã‚Â©ns, <strong>[NOME DO ADOLESCENTE]</strong>! ÃƒÂ°Ã…Â¸Ã…Â½Ã¢â‚¬Å¡</p><p>A famÃƒÆ’Ã‚Â­lia EAC celebra sua vida com muita alegria!</p><p>Que Deus te abenÃƒÆ’Ã‚Â§oe imensamente neste novo ciclo.</p></div>',
  },
  {
    id: "d9",
    name: "EmergÃƒÆ’Ã‚Âªncia PÃƒÆ’Ã‚Â³s Montagem - PerÃƒÆ’Ã‚Â­odo de Cadastro",
    type: "emergencia_nov2025",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Envia um comunicado emergencial por intervalo de cadastro (mÃƒÆ’Ã‚Âªs inicial atÃƒÆ’Ã‚Â© data final).",
    detailedDescription:
      "Dispara para registros cuja data de cadastro (coluna A / Timestamp ou Data Cadastro) esteja dentro do perÃƒÆ’Ã‚Â­odo selecionado: mÃƒÆ’Ã‚Âªs inicial atÃƒÆ’Ã‚Â© data final. O conteÃƒÆ’Ã‚Âºdo pode ser editado antes do envio e a origem dos dados pode ser escolhida entre Encontreiros e Cadastro de Encontrista.",
    rules:
      "### Protocolo de EmergÃƒÆ’Ã‚Âªncia\n- **PerÃƒÆ’Ã‚Â­odo:** MÃƒÆ’Ã‚Âªs inicial + Data final definidos na execuÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o.\n- **ReferÃƒÆ’Ã‚Âªncia:** Coluna A (Timestamp/Data Cadastro).\n- **ConteÃƒÆ’Ã‚Âºdo:** Texto customizÃƒÆ’Ã‚Â¡vel antes do disparo.\n- **Origem:** Encontreiros ou Cadastro de Encontrista.\n- **Lote:** MÃƒÆ’Ã‚Â¡ximo de 50 envios por execuÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o.",
    parameters: ["targetSheet", "message", "startMonth", "endDate"],
    status: "active",
    tags: ["EmergÃƒÆ’Ã‚Âªncia", "Encontreiro", "E-mail"],
    emailPreview:
      '<div style="text-align:center;"><h1 style="color:#B91C1C; margin-top: 0;">ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â COMUNICADO EMERGENCIAL</h1><p>OlÃƒÆ’Ã‚Â¡, [NOME]</p><p>Este ÃƒÆ’Ã‚Â© um aviso importante para os inscritos de Novembro/2025. Verifique sua caixa e responda se necessÃƒÆ’Ã‚Â¡rio.</p></div>',
  },
  {
    id: "d3",
    name: "Eventos da Semana",
    type: "eventos",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Gera e envia automaticamente a agenda de eventos confirmados para o Cadastro de Encontrista.",
    detailedDescription:
      "Este motor integra dados de duas planilhas: extrai eventos do CalendÃƒÆ’Ã‚Â¡rio e dispara para a lista de contatos do Cadastro de Encontrista.",
    rules:
      "### Protocolo de Alta Performance\n- **Filtro de Eventos:** Apenas linhas com \"Confirmado\".\n- **Status:** Registra envio da semana atual para evitar duplicidade.\n- **ExecuÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o:** Lotes de 50 disparos por vez.",
    parameters: [],
    status: "active",
    tags: ["Agenda", "E-mail", "CalendÃƒÆ’Ã‚Â¡rio"],
    emailPreview:
      '<h3 style="color: #044372; margin-top: 0;">ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¦ Agenda da Semana EAC</h3><p>Confira as atividades programadas para os prÃƒÆ’Ã‚Â³ximos dias:</p><div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0;"><p style="margin: 0; font-size: 13px;"><strong>[NOME DA ATIVIDADE]</strong><br><span style="color: #64748b;">[DATA] ÃƒÆ’Ã‚Â s [HORA] em [LOCAL]</span></p></div><p style="font-size: 12px; color: #64748b;">* Apenas eventos com status \"Confirmado\" sÃƒÆ’Ã‚Â£o listados aqui.</p>',
  },
];

export const MOCK_LOGS: Log[] = [
  {
    id: "log-1",
    dispatchId: "d5",
    dispatchName: "Comunicado 99 - Cadastro de Encontrista",
    operator: "Sistema EAC",
    timestamp: new Date().toISOString(),
    duration: 4500,
    status: LogStatus.SUCCESS,
    responseSummary:
      "Sucesso: 12 e-mails enviados para a base do Cadastro de Encontrista.",
  },
];




