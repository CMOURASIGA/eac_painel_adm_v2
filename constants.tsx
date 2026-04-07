
import type { Dispatch, Log } from "./types";
import { LogStatus } from "./types";

export const INITIAL_DISPATCHES: Dispatch[] = [
  {
    id: "d1",
    name: "Agradecimento de Inscrição",
    type: "agradecimento_inscricao",
    endpoint: "/disparo?tipo=agradecimento_inscricao",
    method: "GET",
    shortDescription:
      'Envia template para inscritos "não incluídos" na Planilha de Inscrições.',
    detailedDescription:
      "Este disparo varre a planilha [Inscrições Prioritárias] na aba Inscricoes_Prioritarias. Ele filtra contatos com status `nao_incluido` na coluna U.",
    rules:
      "### Regras Operacionais\n1. O status na coluna U deve ser exatamente `nao_incluido`.\n2. Não altera a planilha após o envio.",
    parameters: ["chave", "tipo"],
    status: "active",
    tags: ["Inscrição", "WhatsApp"],
    emailPreview:
      '<p>Olá, <strong>[NOME]</strong>!</p><p>Muito obrigado por se inscrever no EAC Porciúncula de Santana. Recebemos seus dados e estamos muito felizes com seu interesse!</p><p>Em breve enviaremos mais informações sobre o encontro.</p>',
  },
  {
    id: "d7",
    name: "Confirmação de Interesse (Fila)",
    type: "confirmacao_interesse_espera",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Envia um formulário de confirmação para jovens na fila de espera.",
    detailedDescription:
      "Dispara um e-mail com um link único para jovens na fila de espera confirmarem se ainda têm interesse em participar do próximo encontro.",
    rules:
      "### Protocolo de Engajamento\n- **Público:** Apenas \"Fila de Espera\".\n- **Ação:** Envia e-mail com link para formulário público.\n- **Controle:** Registra o status do envio para evitar duplicidade.\n- **Reset de envio:** limpa apenas registros com `I` em branco e `P` em branco (se `P` estiver preenchida, não reseta).",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Fila de Espera", "Engajamento"],
    emailPreview:
      '<h2 style="color: #044372; margin-top: 0;">Olá, [NOME]!</h2><p>Temos boas notícias! Estamos reorganizando as fichas recebidas para o próximo <strong>EAC</strong>, que acontecerá nos dias <strong>23 e 24/05</strong>, e seu nome está em nossa <strong>fila de espera</strong>.</p><p>Pedimos que você <strong>confirme seu interesse em participar do EAC</strong> clicando no botão abaixo. Essa resposta nos ajudará na organização do encontro. A confirmação final da participação acontecerá em uma etapa posterior, por meio de <strong>convocação oficial</strong>.</p><a href="${link}" style="background-color: #044372; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 12px; font-weight: bold;">Confirmar Interesse</a><br></br><p>Fique atento ao seu <strong>E-mail</strong> e <strong>WhatsApp</strong>. Em breve entraremos em contato.</p><p>Fraternalmente,<br><strong>Coordenação EAC Porciúncula de SantAnna</strong></p>',
  },
  {
    id: "d4",
    name: "Aviso Fila de Espera (Não Inscritos)",
    type: "waitlist_non_enrolled",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Informa aos que não estão no Cadastro de Encontrista que sua inscrição está em análise.",
    detailedDescription:
      "Identifica automaticamente quem se inscreveu mas não consta no Cadastro de Encontrista. Envia e-mail informando que o cadastro está sendo verificado para uma nova chamada.",
    rules:
      "### Protocolo de Comunicação\n- **Público:** Apenas \"Não Inscritos\" (cruzamento de planilhas).\n- **Formatação:** Layout padrão EAC.\n- **Lote:** Máximo 50 envios por clique.\n- **Controle:** Registra status na aba de Inscrições para evitar reenvio.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Espera", "Batch"],
    emailPreview:
      '<h2 style="color: #044372; margin-top: 0;">Olá, [NOME]!</h2><p>Recebemos sua inscrição para o EAC e gostaríamos de informar que seu cadastro está em nossa <strong>lista de verificação</strong>.</p><p>Estamos organizando as vagas para o próximo encontro e em breve entraremos em contato para confirmar sua participação.</p><p>Fique atento ao seu E-mail e WhatsApp!</p><br><p>Fraternalmente,<br><strong>Coordenação EAC</strong></p>',
  },
  {
    id: "d8",
    name: "Confirmação Não Inscritos (B/C/H/P)",
    type: "confirm_nao_inscritos",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Envia confirmação para a aba Não Inscritos usando filtros nas colunas H, C e P.",
    detailedDescription:
      "Percorre a aba **Não Inscritos** da planilha de inscrições e envia e-mail apenas para quem tem **H vazia**, **C com e-mail válido** e **P vazia**.",
    rules:
      "### Protocolo de Comunicação\n- **Origem:** Planilha de Inscrições, aba `Não Inscritos`.\n- **Filtro:** `H` vazia + `C` com `@` + `P` vazia.\n- **Assunto:** `EAC: Atualização sobre sua Inscrição`.\n- **Status (Coluna P):** `Enviado_Confirmacao - DD/MM/AAAA HH:mm`.\n- **Atualizações após envio:** `I = Sim`, `H = valor da P`, `M = data usada em P`.\n- **Lote:** Máximo de 50 envios por execução.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Não Inscritos", "Batch"],
    emailPreview:
      '<h2 style="color: #044372; margin-top: 0;">Olá, [NOME]!</h2><p>Recebemos sua inscrição para o EAC e gostaríamos de informar que seu cadastro está em nossa <strong>lista de verificação</strong>.</p><p>Estamos organizando as vagas para o próximo encontro e em breve entraremos em contato para confirmar sua participação.</p><p>Fique atento ao seu E-mail e WhatsApp!</p><br><p>Fraternalmente,<br><strong>Coordenação EAC</strong></p>',
  },
  {
    id: "d5",
    name: "Comunicado 99 → Cadastro de Encontrista",
    type: "comunicado_99_cadastro",
    endpoint: "google_script",
    method: "POST",
    shortDescription:
      "Envia o comunicado fixo ID 99 para toda a base do Cadastro de Encontrista via E-mail.",
    detailedDescription:
      "Disparo massivo por e-mail utilizando o conteúdo HTML do ID 99 da aba Comunicados. Busca e-mails na **Coluna H**.",
    rules:
      "### Protocolo de Alta Performance\n- **Email:** Coluna H.\n- **Processamento:** Lotes de 50 e-mails por clique.\n- **Status (Coluna W):** Grava o formato `Enviado - DD/MM/AAAA HH:mm`.\n- **Filtro:** Ignora automaticamente linhas com \"Enviado\".",
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
      "Varre a coluna C (Nascimento) e envia e-mail (**Coluna H**) para quem faz aniversário hoje.",
    rules:
      "### Protocolo de Alta Performance\n- **Email:** Coluna H.\n- **Processamento:** 50 envios por clique.\n- **Status (Coluna T):** Grava `Enviado - Data Atual`.\n- **Filtro:** Compara Dia/Mês da coluna C.",
    parameters: [],
    status: "active",
    tags: ["E-mail", "Felicitação", "Batch"],
    emailPreview:
      '<div style="text-align:center;"><h1 style="color:#044372; margin-top: 0;">🎈 Feliz Aniversário!</h1><p>Parabéns, <strong>[NOME DO ADOLESCENTE]</strong>! 🎂</p><p>A família EAC celebra sua vida com muita alegria!</p><p>Que Deus te abençoe imensamente neste novo ciclo.</p></div>',
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
      "Este motor integra dados de duas planilhas: extrai eventos do Calendário e dispara para a lista de contatos do Cadastro de Encontrista.",
    rules:
      "### Protocolo de Alta Performance\n- **Filtro de Eventos:** Apenas linhas com \"Confirmado\".\n- **Status:** Registra envio da semana atual para evitar duplicidade.\n- **Execução:** Lotes de 50 disparos por vez.",
    parameters: [],
    status: "active",
    tags: ["Agenda", "E-mail", "Calendário"],
    emailPreview:
      '<h3 style="color: #044372; margin-top: 0;">📅 Agenda da Semana EAC</h3><p>Confira as atividades programadas para os próximos dias:</p><div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0;"><p style="margin: 0; font-size: 13px;"><strong>[NOME DA ATIVIDADE]</strong><br><span style="color: #64748b;">[DATA] às [HORA] em [LOCAL]</span></p></div><p style="font-size: 12px; color: #64748b;">* Apenas eventos com status \"Confirmado\" são listados aqui.</p>',
  },
];

export const MOCK_LOGS: Log[] = [
  {
    id: "log-1",
    dispatchId: "d5",
    dispatchName: "Comunicado 99 → Cadastro de Encontrista",
    operator: "Sistema EAC",
    timestamp: new Date().toISOString(),
    duration: 4500,
    status: LogStatus.SUCCESS,
    responseSummary:
      "Sucesso: 12 e-mails enviados para a base do Cadastro de Encontrista.",
  },
];
