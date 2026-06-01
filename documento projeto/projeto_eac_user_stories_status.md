# Projeto EAC - User Stories e Status

## Resumo executivo

- Total de US: **98**
- DONE: **71**
- DOING: **0**
- TO DO: **27**

## Diretriz de usabilidade (global)

- Para listagens operacionais com ações por registro, usar preferencialmente layout em cards responsivos.
- Expor ações de CRUD no card (`Visualizar`, `Editar`, `Excluir`) e manter o detalhamento em drawer/modal quando necessário.
- Evitar tabela larga como padrão em mobile; usar tabela apenas quando houver ganho claro no desktop.

## Resumo por prioridade

- Alta: **66**
- Média: **27**
- Baixa: **3**
- Sem prioridade: **1**

## Visão consolidada por épico

### Épico 1 - Fundação Supabase e modelo de dados

**Total de US no épico:** 5

**Status:** DONE: 5

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-001 | Criar projeto Supabase e configurar ambientes | Alta | Supabase,Setup | Como administrador, quero ter o projeto Supabase criado e configurado para armazenar os dados do EAC. | Projeto criado \| Variáveis .env configuradas \| Conexão local e produção testadas | Criar projeto \| Configurar URL e keys \| Definir ambientes dev/prod |
| DONE | US-002 | Criar tabelas principais com PK/FK | Alta | Banco,Modelagem | Como desenvolvedor, quero criar as tabelas principais do banco para substituir as planilhas. | Tabelas criadas com PK, FK, constraints e índices \| Script SQL versionado no repositório | Criar migrations \| Executar em dev \| Validar relações |
| DONE | US-003 | Centralizar cadastro em pessoas | Alta | Banco,Cadastro | Como administrador, quero centralizar adolescentes, encontreiros, responsáveis e usuários na tabela pessoas. | Tabela pessoas criada \| Relações para adolescentes, encontreiros e responsáveis funcionando | Criar pessoas \| Criar adolescentes \| Criar encontreiros \| Criar responsáveis |
| DONE | US-004 | Normalizar telefone e e-mail | Alta | Dados,Qualidade | Como sistema, quero normalizar telefone e e-mail para evitar duplicidade. | Função de normalização criada \| Busca por telefone/e-mail usando campos normalizados | Normalizar telefone BR \| Normalizar e-mail \| Criar índices |
| DONE | US-005 | Criar logs de auditoria | Alta | Auditoria,Segurança | Como administrador, quero rastrear ações críticas no sistema. | Criação, alteração, exclusão e disparos gravam logs \| Log tem usuário, entidade, payload e data | Criar tabela logs \| Instrumentar APIs críticas |

### Épico 2 - Migração das planilhas atuais

**Total de US no épico:** 10

**Status:** DONE: 10

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-006 | Importar inscrições principais | Alta | Migração,Inscrições | Como administrador, quero importar a planilha principal de inscrições para o Supabase. | Aba Respostas ao formulário 1 importada \| Adolescente, responsável, inscrição e respostas criados | Mapear colunas \| Criar importador \| Validar totais |
| DONE | US-007 | Importar não inscritos | Alta | Migração,Não Inscritos | Como administrador, quero importar a aba de não inscritos. | Dados importados para nao_inscritos \| Vínculo com inscrição/pessoa quando possível | Mapear colunas \| Criar conciliação \| Gerar erros |
| DONE | US-008 | Importar inscrições prioritárias | Alta | Migração,Prioridade | Como administrador, quero importar a aba de inscrições prioritárias. | Priorizados vinculados a adolescentes e inscrições \| Sem duplicidade por inscrição | Mapear prioridades \| Criar vínculos |
| DONE | US-009 | Importar distribuição de círculos | Média | Migração,Círculos | Como administrador, quero importar a distribuição de círculos existente. | Círculos criados \| Participantes vinculados corretamente | Mapear círculo \| Criar participantes |
| DONE | US-010 | Importar chamados e mensagens de e-mail | Média | Migração,E-mail | Como administrador, quero importar chamados e mensagens de e-mail. | Email_Chamados e Email_Mensagens migrados \| Threads e tokens preservados quando existirem | Mapear chamados \| Mapear mensagens |
| DONE | US-011 | Importar lista de presença | Alta | Migração,Presença | Como administrador, quero importar registros de presença. | Presenças importadas \| Conciliação por telefone/nome \| Pendências registradas | Normalizar telefones \| Conciliar pessoas \| Registrar pendências |
| DONE | US-012 | Importar cadastro de encontreiros | Alta | Migração,Encontreiros | Como administrador, quero importar cadastro de encontreiros. | Encontreiros importados \| Campos médicos e equipes preservados | Mapear colunas \| Criar pessoas/encontreiros \| Vincular equipes |
| DONE | US-013 | Registrar erros de importação | Média | Migração,Logs | Como administrador, quero visualizar erros de importação. | Erros gravados com linha, coluna, valor e motivo \| Tela/API permite consultar erros | Criar tabela de erros \| Salvar payload |
| DONE | US-097 | Reimportar planilha de encontreiros para Supabase | Alta | Migração,Encontreiros,Dados | Como administrador, quero reprocessar a planilha de encontreiros para popular corretamente a base no Supabase. | Tabela/view de encontreiros com dados carregados \| Quantitativo validado com planilha origem \| Evidência de importação registrada | Revisar mapeamento da aba \| Executar carga full \| Validar contagem e amostra |
| DONE | US-096 | Criar camada de staging para migração das planilhas |  |  | Criar uma estrutura intermediária no Supabase para receber os dados brutos das planilhas antes de processar, normalizar, deduplicar e gravar nas tabelas oficiais. |  |  |

### Épico 3 - Script Google e sincronização temporária

**Total de US no épico:** 5

**Status:** DONE: 5

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-014 | Criar Google Apps Script de importação | Alta | Google Script,Integração | Como administrador, quero executar um script Google para enviar dados das planilhas ao Supabase. | Script lê abas configuradas \| Envia lotes para API \| Registra resultado | Criar config de planilhas \| Criar envio por lote |
| DONE | US-015 | Controlar importação full e incremental | Alta | Integração,Migração | Como sistema, quero controlar carga completa e incremental. | FULL reprocessa conforme regra \| INCREMENTAL envia apenas novos/alterados | Criar hash por linha \| Controlar última execução |
| DONE | US-016 | Exibir resumo de execução do script | Média | Google Script,Logs | Como administrador, quero ver resumo da execução. | Resumo contém lidas, importadas, ignoradas e erros | Retornar JSON \| Gravar log |
| DONE | US-017 | Evitar duplicidade na importação | Alta | Dados,Qualidade | Como sistema, quero impedir duplicidades geradas pelas planilhas. | Mesmo telefone/e-mail/nome+nascimento não duplica pessoa | Criar regra de match \| Testar duplicados |
| DONE | US-018 | Desligar sincronização após virada | Média | Go-live,Configuração | Como administrador, quero poder desativar a sincronização com planilhas. | Flag de configuração desliga leitura/escrita em planilhas | Criar feature flag \| Atualizar UI |

### Épico 4 - Novo cadastro de adolescentes

**Total de US no épico:** 6

**Status:** DONE: 7

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-019 | Criar formulário de inscrição de adolescente | Alta | Frontend,Cadastro | Como responsável/adolescente, quero preencher inscrição em formulário novo. | Formulário grava direto no Supabase \| Valida campos obrigatórios | Criar tela pública \| Criar API POST |
| DONE | US-020 | Validar campos obrigatórios da inscrição | Alta | Validação | Como sistema, quero validar campos obrigatórios. | Nome, nascimento, telefone, responsável e aceite são obrigatórios | Validação frontend \| Validação backend |
| DONE | US-021 | Calcular idade automaticamente | Média | Regra de negócio | Como sistema, quero calcular idade pela data de nascimento. | Idade calculada e armazenada/consultada corretamente | Criar função idade |
| DONE | US-022 | Criar tela de triagem de inscrições | Alta | Frontend,Inscrições | Como administrador, quero revisar inscrições recebidas. | Lista por status, data, idade, bairro e encontro | Criar filtros \| Criar paginação |
| DONE | US-023 | Alterar status da inscrição | Alta | Workflow | Como administrador, quero mudar status da inscrição. | Status muda com histórico e auditoria | Criar endpoint status \| Registrar histórico |
| DONE | US-098 | Exibir indicadores por status no cadastro de encontrista | Média | Dashboard,Workflow | Como administrador, quero visualizar indicadores por status operacional no cadastro de encontrista. | Cards com contagem por status (inscrito, priorizado, confirmado, não selecionado, desistente, cancelado) visíveis na tela | Criar agregação por status \| Exibir KPIs no topo |

### Épico 5 - Novo cadastro de encontreiros

**Total de US no épico:** 5

**Status:** DONE: 5

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-025 | Criar formulário de cadastro de encontreiro | Alta | Frontend,Encontreiros | Como encontreiro, quero preencher meu cadastro pelo sistema. | Cadastro grava em pessoas e encontreiros | Criar formulário \| Criar endpoint |
| DONE | US-026 | Editar cadastro de encontreiro | Alta | Frontend,Encontreiros | Como administrador, quero editar cadastro de encontreiro. | Alterações persistem no Supabase e geram auditoria | Tela edição \| API PUT |
| DONE | US-027 | Filtrar encontreiros por classificação | Média | Filtro | Como administrador, quero filtrar Adulto, Adolescente ou Outro. | Filtro funcionando na tela e API | Criar query params |
| DONE | US-028 | Consultar dados médicos/alimentares | Alta | Dados Sensíveis | Como administrador, quero consultar alergias, remédios e alimentação especial. | Campos aparecem na lista/detalhe com permissão | Criar exibição segura |
| DONE | US-029 | Vincular encontreiros a equipes | Média | Equipes | Como administrador, quero vincular encontreiros a equipes. | Encontreiro pode ter múltiplas equipes | Criar relação N:N |

### Épico 6 - Não inscritos e priorização

**Total de US no épico:** 5

**Status:** DONE: 5

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-030 | Listar não inscritos | Alta | Não Inscritos | Como administrador, quero visualizar não inscritos. | Lista exibe nome, telefone, bairro, interesse, recado e status | Criar API GET \| Criar tela |
| DONE | US-031 | Atualizar interesse confirmado | Média | Workflow | Como administrador, quero atualizar interesse confirmado. | Campo atualizado com auditoria | Criar ação |
| DONE | US-032 | Priorizar não inscrito | Alta | Prioridade | Como administrador, quero priorizar um não inscrito. | Cria registro em inscrições prioritárias sem duplicar | Criar endpoint |
| DONE | US-033 | Bloquear priorização duplicada | Alta | Dados,Qualidade | Como sistema, quero impedir prioridade duplicada. | Constraint/validação bloqueia duplicidade | Criar constraint |
| DONE | US-034 | Criar indicadores de não inscritos | Média | Dashboard | Como administrador, quero indicadores de interesse, contato mudou e já fez EAC. | KPIs calculados pela API | Criar endpoint resumo |

### Épico 7 - Distribuição de círculos

**Total de US no épico:** 6

**Status:** DONE: 6

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-035 | Gerar distribuição de círculos | Alta | Círculos | Como administrador, quero gerar distribuição dos adolescentes nos círculos. | Sistema distribui inscritos aptos entre círculos | Criar algoritmo |
| DONE | US-036 | Balancear círculos por sexo e idade | Alta | Regra de negócio | Como administrador, quero balanceamento por sexo e idade. | Regras implementadas e testadas | Definir regra \| Criar testes |
| DONE | US-037 | Manter círculo excedente | Média | Círculos | Como administrador, quero círculo excedente. | Itens fora da regra vão para excedente | Criar círculo especial |
| DONE | US-038 | Visualizar participantes por círculo | Média | Frontend,Círculos | Como administrador, quero tela agrupada por círculo. | Tela mostra contadores por círculo | Criar cards/lista |
| DONE | US-039 | Exportar lista/imagem da distribuição | Baixa | Exportação | Como administrador, quero exportar distribuição. | CSV/HTML/imagem disponível | Gerar CSV \| Gerar HTML impressão |
| DONE | US-040 | Alterar círculo manualmente | Média | Círculos | Como administrador, quero ajustar participante manualmente. | Alteração permitida com auditoria | Criar move participante |

### Épico 8 - Controle de presença

**Total de US no épico:** 6

**Status:** DONE: 6

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-041 | Registrar presença por telefone | Alta | Presença | Como operador, quero registrar presença por telefone. | Sistema localiza pessoa por telefone normalizado | Criar check-in |
| DONE | US-042 | Registrar presença pendente | Alta | Presença | Como operador, quero registrar presença quando telefone não localizar. | Presença fica pendente de conciliação | Criar status pendente |
| DONE | US-043 | Filtrar presença por encontro, mês e círculo | Média | Presença,Filtro | Como administrador, quero consultar presença por filtros. | Filtros funcionando com dados do Supabase | Criar endpoint |
| DONE | US-044 | Evitar presença duplicada no dia | Alta | Qualidade | Como sistema, quero bloquear/alertar duplicidade. | Mesmo participante não duplica presença no mesmo dia | Criar índice único |
| DONE | US-045 | Resumo de presentes por círculo | Média | Dashboard,Presença | Como administrador, quero indicadores por círculo. | Total, presentes e faltantes calculados | Criar agregação |
| DONE | US-046 | Exportar presença | Baixa | Exportação | Como administrador, quero exportar presença. | CSV/Excel disponível | Criar download |

### Épico 9 - Comunicados, disparos e e-mails

**Total de US no épico:** 6

**Status:** DONE: 6

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-047 | Cadastrar comunicados | Alta | Comunicados | Como administrador, quero cadastrar comunicados no sistema. | CRUD de comunicados no Supabase | Criar tabela \| Criar tela |
| DONE | US-048 | Executar disparo de comunicado | Alta | Disparos | Como administrador, quero executar disparo de comunicado. | Disparo processa destinatários e grava execução | Criar motor de disparo |
| DONE | US-049 | Controlar destinatários de disparo | Alta | Disparos,Logs | Como sistema, quero controlar enviados, erros e ignorados. | Tabela disparo_destinatarios preenchida corretamente | Criar logs por destinatário |
| DONE | US-050 | Disparo de aniversariantes | Alta | Disparos,Aniversário | Como administrador, quero enviar felicitação para aniversariantes do dia. | Consulta dia/mês de nascimento \| Evita reenvio no mesmo ano | Criar regra dia/mês \| Criar controle anual |
| DONE | US-051 | Disparo para não inscritos/fila | Alta | Disparos,Não Inscritos | Como administrador, quero enviar comunicado para não inscritos e fila. | Filtros equivalentes aos atuais funcionando no banco | Migrar filtros B/C/H/P/Q \| Criar status envio |
| DONE | US-052 | Acompanhar chamados/e-mails | Média | E-mail | Como administrador, quero acompanhar chamados e mensagens. | Chamados e mensagens consultáveis no painel | Criar API |

### Épico 10 - Agenda e calendário

**Total de US no épico:** 6

**Status:** DONE: 6

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-053 | Cadastrar eventos da agenda | Alta | Calendário | Como administrador, quero cadastrar eventos da agenda no Supabase. | CRUD de agenda usando Supabase \| Campos atividade, tipo, início, término, local, proprietário e observações | Criar eventos_agenda \| Criar API CRUD |
| DONE | US-054 | Vincular evento a encontro EAC | Média | Calendário,Encontros | Como administrador, quero vincular evento a um encontro. | Evento pode estar vinculado ou não a um encontro | Adicionar encontro_id |
| DONE | US-055 | Filtrar agenda por status/tipo | Média | Calendário,Filtro | Como administrador, quero filtrar agenda por status e tipo. | Filtros por Confirmado, Agendado, A confirmar e tipo funcionam | Criar filtros |
| DONE | US-056 | Enviar agenda da semana | Alta | Disparos,Calendário | Como administrador, quero disparar agenda semanal. | Busca eventos confirmados da semana no Supabase \| Evita duplicidade por semana/destinatário | Migrar regra Eventos da Semana \| Criar semana_id |
| DONE | US-074 | Importar planilha de calendário 2026 | Alta | Migração,Calendário | Como administrador, quero importar a planilha Calendário 2026. | Aba Externos importada \| Datas, locais, proprietários e observações preservados | Mapear aba Externos \| Tratar datas 00:00 \| Conciliar status |
| DONE | US-075 | Corrigir dependência da aba Calendario no script atual | Alta | Bug,Google Script | Como desenvolvedor, quero corrigir a leitura da planilha de calendário. | Script não depende apenas da aba Calendario \| Aceita Externos ou usa config | Criar configuração de aba \| Testar Eventos da Semana |

### Épico 11 - Usuários, permissões e segurança

**Total de US no épico:** 5

**Status:** DONE: 2, TO DO: 3

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-057 | Implementar login seguro | Alta | Segurança,Auth | Como administrador, quero login seguro no sistema. | Login via Supabase Auth/Google OAuth | Configurar auth |
| DONE | US-058 | Controlar permissões por módulo | Alta | Segurança,Permissões | Como administrador, quero controlar permissões por módulo. | Permissões criar, editar, visualizar e excluir | Criar tabela \| Criar policies |
| DONE | US-059 | Bloquear usuário inativo | Média | Segurança | Como administrador, quero bloquear usuário inativo. | Usuário inativo não acessa o painel | Criar status |
| DONE | US-060 | Auditar ações críticas | Alta | Auditoria | Como administrador, quero auditar ações críticas. | Logs de alterações e disparos gravados | Instrumentar APIs |
| DONE | US-061 | Proteger dados sensíveis | Alta | Segurança,RLS | Como sistema, quero proteger dados de menores e dados médicos. | RLS habilitado \| Policies aplicadas | Criar RLS \| Testar acessos |

### Épico 12 - Refatoração frontend/backend

**Total de US no épico:** 8

**Status:** DONE: 4, TO DO: 4

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| DONE | US-062 | Substituir Google Script por APIs Supabase | Alta | Backend,Frontend | Como desenvolvedor, quero trocar chamadas do Google Script por APIs internas. | Módulos principais leem dados do Supabase | Criar clients \| Migrar fetches |
| DONE | US-063 | Preservar experiência atual das telas | Média | UX | Como usuário, quero manter fluxo parecido com o atual. | Telas continuam funcionais com novas APIs | Não quebrar navegação |
| DONE | US-064 | Manter filtros com botão Pesquisar | Média | UX,Filtro | Como usuário, quero filtros acionados por botão. | Busca não dispara a cada digitação | Revisar filtros |
| TO DO | US-065 | Padronizar mensagens de erro/sucesso | Média | UX | Como usuário, quero mensagens claras. | Toasts padronizados nas APIs | Criar handler |
| DONE | US-066 | Atualizar páginas de ajuda | Baixa | Documentação | Como administrador, quero ajuda refletindo o Supabase. | Ajuda explica novo fluxo e origem dos dados | Atualizar HelpPage |
| TO DO | US-076 | Criar camada de serviços de negócio | Alta | Arquitetura,Backend | Como desenvolvedor, quero tirar regras do frontend e Google Script e levar para serviços backend. | Regras de priorização, presença, calendário e disparos ficam em serviços testáveis | Criar services \| Criar testes unitários |
| TO DO | US-077 | Criar API de resumo para Dashboard | Média | Dashboard,Backend | Como usuário, quero dashboard alimentado pelo banco. | KPIs vêm de views/functions Supabase | Criar views \| Criar endpoints |
| TO DO | US-078 | Criar adapter temporário Google Sheets | Média | Arquitetura,Migração | Como desenvolvedor, quero manter adapter temporário para planilhas durante a transição. | Adapter isolado e removível \| Frontend não conhece planilha | Criar interface \| Implementar sheet adapter |

### Épico 13 - Validação, testes e homologação

**Total de US no épico:** 8

**Status:** DONE: 4, TO DO: 4

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| TO DO | US-067 | Comparar planilha x Supabase | Alta | Homologação | Como administrador, quero comparar totais migrados. | Relatório mostra totais por aba/tabela | Criar relatório |
| TO DO | US-068 | Validar duplicidades | Alta | Qualidade | Como administrador, quero relatório de duplicados. | Duplicados por telefone, e-mail e nome+nascimento | Criar relatório |
| DONE | US-069 | Homologar cadastro de adolescente | Alta | Teste | Como administrador, quero testar cadastro completo. | Fluxo do formulário até listagem aprovado | Executar caso |
| DONE | US-070 | Homologar cadastro de encontreiro | Alta | Teste | Como administrador, quero testar cadastro de encontreiro. | Fluxo completo aprovado | Executar caso |
| DONE | US-071 | Homologar presença | Alta | Teste | Como administrador, quero testar presença. | Check-in, filtros e indicadores aprovados | Executar caso |
| DONE | US-072 | Homologar priorização e círculos | Alta | Teste | Como administrador, quero testar priorização e distribuição. | Fluxo aprovado com base real | Executar caso |
| TO DO | US-073 | Homologar comunicados e disparos | Alta | Teste,Disparos | Como administrador, quero testar disparos em ambiente seguro. | Disparos não duplicam e logs estão corretos | Enviar para lista teste \| Validar logs |
| TO DO | US-079 | Homologar agenda e eventos da semana | Alta | Teste,Calendário | Como administrador, quero testar calendário e disparo de eventos da semana. | Eventos confirmados da semana são listados e enviados corretamente | Criar eventos teste \| Executar disparo |

### Épico 15 - Cadastro oficial e evolução para encontreiro

**Total de US no épico:** 2

**Status:** TO DO: 2

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| TO DO | US-080 | Criar cadastro oficial como base mestre de pessoas do EAC | Alta | Cadastro Oficial,Supabase,Modelo de Dados | Como administrador, quero manter uma base oficial de pessoas que participaram ou foram validadas no EAC, para que elas possam ser reaproveitadas em presença, círculos, comunicação e seleção futura de encontreiros. | Deve existir tabela cadastro_oficial \| Cada registro deve estar vinculado a uma pessoa \| Uma pessoa não pode ter dois cadastros oficiais ativos \| O cadastro oficial deve guardar origem, encontro e status \| O sistema deve permitir marcar pessoa como elegível para futuro encontreiro | Criar tabela cadastro_oficial \| Vincular com pessoas \| Criar constraint de cadastro ativo único \| Criar status do cadastro oficial \| Criar campo elegivel_encontreiro \| Migrar dados do cadastro oficial atual |
| TO DO | US-081 | Permitir evolução de adolescente/encontrista para encontreiro | Alta | Cadastro Oficial,Encontreiros,Regra de Negócio | Como coordenação, quero transformar uma pessoa do cadastro oficial em encontreiro elegível ou encontreiro ativo, para reaproveitar pessoas que já participaram do EAC. | O sistema deve localizar pessoa no cadastro oficial \| O sistema deve permitir adicionar papel ENCONTREIRO_ELEGIVEL \| O sistema deve permitir criar cadastro de encontreiro usando o mesmo pessoa_id \| O sistema não pode criar pessoa duplicada \| O histórico da pessoa deve mostrar participação anterior como encontrista | Criar pessoa_papeis \| Criar ação tornar elegível \| Criar ação tornar encontreiro \| Validar duplicidade \| Exibir histórico da pessoa |

### Épico 16 - Deduplicação e visões operacionais

**Total de US no épico:** 2

**Status:** TO DO: 2

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| TO DO | US-082 | Criar motor de deduplicação de inscrições | Alta | Deduplicação,Inscrições,Backend | Como administrador, quero que o sistema identifique inscrições duplicadas, para que apenas uma inscrição válida siga para análise. | Deduplicar por telefone normalizado \| Deduplicar por e-mail normalizado \| Deduplicar por nome completo + data de nascimento \| Marcar inscrições duplicadas com status DUPLICADA \| Manter histórico das duplicadas sem apagar dados \| Gerar visão equivalente à aba Inscricoes_Sem_Duplicidade | Criar função normalizar telefone \| Criar regra de matching \| Criar status DUPLICADA \| Criar histórico de duplicidade \| Criar relatório de possíveis duplicados |
| TO DO | US-083 | Criar visão de inscrições sem duplicidade no Supabase | Alta | Inscrições,Supabase,View | Como administrador, quero visualizar apenas inscrições válidas sem duplicidade, para substituir a aba Inscricoes_Sem_Duplicidade. | Deve existir view ou endpoint equivalente \| Deve retornar apenas inscrições não duplicadas \| Deve permitir filtros por encontro, status, idade, sexo e bairro \| Deve permitir exportação \| Deve servir como origem para priorização e não inscritos | Criar vw_inscricoes_sem_duplicidade \| Criar endpoint de consulta \| Criar filtros \| Criar exportação CSV \| Ajustar frontend para consumir a view |

### Épico 14 - Inventário e reconstrução funcional

**Total de US no épico:** 12

**Status:** TO DO: 12

| Status | US | Título | Prioridade | Labels | Descrição | Critérios de aceite | Itens técnicos |
|---|---|---|---|---|---|---|---|
| TO DO | US-084 | Inventariar regras atuais do Google Apps Script | Alta | Inventário,Backend,Migração | Como gerente do projeto, quero mapear todas as actions e funções do Apps Script atual para garantir que nenhuma regra operacional seja perdida na migração para Supabase. Critérios: listar actions, origem de dados, regra, destino no banco, endpoint novo e status de migração. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-085 | Criar camada de serviços de domínio no backend | Alta | Backend,Arquitetura | Como desenvolvedor, quero separar regras de cadastro, não inscritos, priorização, círculos, presença, calendário e disparos em serviços backend para evitar regra crítica no frontend. Critérios: serviços isolados, testes unitários e endpoints consumindo os serviços. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-086 | Migrar regra de geração de não inscritos | Alta | Não Inscritos,Supabase | Como coordenação, quero que o sistema gere não inscritos a partir das inscrições sem duplicidade e do cadastro oficial. Critérios: cruzamento por telefone normalizado, evitar duplicidade, gerar status operacional e manter origem da inscrição. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-087 | Migrar motor de priorização | Alta | Priorização,Backend | Como coordenação, quero priorizar não inscritos sem duplicar registros. Critérios: marcar inscrição como PRIORIZADO, criar registro em inscrições prioritárias, impedir duplicidade e gerar histórico. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-088 | Migrar algoritmo de distribuição dos círculos | Alta | Círculos,Regra de Negócio | Como coordenação, quero gerar os círculos com as mesmas regras atuais. Critérios: 6 círculos + excedente, limite 6 meninos e 6 meninas, faixa 13 a 17, promoção de 12 anos até 6 meses, matriz de idade, prioridade por bairro e gravação do resultado. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-089 | Criar histórico de execução da distribuição de círculos | Média | Círculos,Auditoria | Como administrador, quero consultar quando uma distribuição foi executada, com quais critérios e quais participantes foram alocados. Critérios: tabela de execução, tabela de resultado, usuário executor, payload de critérios e comparação entre execuções. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-090 | Migrar controle de presença por telefone | Alta | Presença,Backend | Como operador, quero registrar presença por telefone normalizado usando o banco de dados. Critérios: localizar pessoa, vincular encontro/círculo, evitar duplicidade no dia e gerar pendência quando não localizar. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-091 | Migrar disparos para regras backend | Alta | Disparos,Backend | Como administrador, quero que os disparos consultem o Supabase e não mais colunas de planilhas. Critérios: público-alvo por query, lote controlado, status por destinatário, logs e reset por tipo. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-092 | Migrar calendário e eventos da semana | Média | Calendário,Disparos | Como administrador, quero importar a agenda do calendário e enviar eventos da semana consultando o banco. Critérios: importar aba Externos, gravar eventos, filtrar semana atual, status confirmado e controlar envio por semana. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-093 | Substituir login por Supabase Auth | Alta | Segurança,Usuários | Como administrador, quero substituir usuário/senha em planilha por autenticação segura. Critérios: Supabase Auth, perfis, permissões por módulo, RLS e bloqueio de inativos. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-094 | Criar tokens seguros para formulário público | Média | Formulário Público,Segurança | Como sistema, quero enviar links de confirmação de interesse com token seguro. Critérios: token único, validade, vínculo com pessoa/inscrição, impedir resposta duplicada indevida e auditoria. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |
| TO DO | US-095 | Criar validação comparativa planilha x Supabase | Alta | Homologação,Migração | Como gerente do projeto, quero comparar totais e amostras das planilhas contra o banco após a migração. Critérios: totais por aba/tabela, duplicidades, divergências, registros sem vínculo e relatório de homologação. | Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação. | Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual |

## Backlog completo em formato checklist

- [x] **US-001 - Criar projeto Supabase e configurar ambientes**
  - Status: **DONE**
  - Épico: Épico 1 - Fundação Supabase e modelo de dados
  - Prioridade: Alta
  - Labels: Supabase,Setup
  - Descrição: Como administrador, quero ter o projeto Supabase criado e configurado para armazenar os dados do EAC.
  - Critérios de aceite: Projeto criado \| Variáveis .env configuradas \| Conexão local e produção testadas
  - Itens técnicos: Criar projeto \| Configurar URL e keys \| Definir ambientes dev/prod

- [x] **US-002 - Criar tabelas principais com PK/FK**
  - Status: **DONE**
  - Épico: Épico 1 - Fundação Supabase e modelo de dados
  - Prioridade: Alta
  - Labels: Banco,Modelagem
  - Descrição: Como desenvolvedor, quero criar as tabelas principais do banco para substituir as planilhas.
  - Critérios de aceite: Tabelas criadas com PK, FK, constraints e índices \| Script SQL versionado no repositório
  - Itens técnicos: Criar migrations \| Executar em dev \| Validar relações

- [x] **US-003 - Centralizar cadastro em pessoas**
  - Status: **DONE**
  - Épico: Épico 1 - Fundação Supabase e modelo de dados
  - Prioridade: Alta
  - Labels: Banco,Cadastro
  - Descrição: Como administrador, quero centralizar adolescentes, encontreiros, responsáveis e usuários na tabela pessoas.
  - Critérios de aceite: Tabela pessoas criada \| Relações para adolescentes, encontreiros e responsáveis funcionando
  - Itens técnicos: Criar pessoas \| Criar adolescentes \| Criar encontreiros \| Criar responsáveis

- [x] **US-004 - Normalizar telefone e e-mail**
  - Status: **DONE**
  - Épico: Épico 1 - Fundação Supabase e modelo de dados
  - Prioridade: Alta
  - Labels: Dados,Qualidade
  - Descrição: Como sistema, quero normalizar telefone e e-mail para evitar duplicidade.
  - Critérios de aceite: Função de normalização criada \| Busca por telefone/e-mail usando campos normalizados
  - Itens técnicos: Normalizar telefone BR \| Normalizar e-mail \| Criar índices

- [x] **US-005 - Criar logs de auditoria**
  - Status: **DONE**
  - Épico: Épico 1 - Fundação Supabase e modelo de dados
  - Prioridade: Alta
  - Labels: Auditoria,Segurança
  - Descrição: Como administrador, quero rastrear ações críticas no sistema.
  - Critérios de aceite: Criação, alteração, exclusão e disparos gravam logs \| Log tem usuário, entidade, payload e data
  - Itens técnicos: Criar tabela logs \| Instrumentar APIs críticas

- [x] **US-006 - Importar inscrições principais**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Inscrições
  - Descrição: Como administrador, quero importar a planilha principal de inscrições para o Supabase.
  - Critérios de aceite: Aba Respostas ao formulário 1 importada \| Adolescente, responsável, inscrição e respostas criados
  - Itens técnicos: Mapear colunas \| Criar importador \| Validar totais

- [x] **US-007 - Importar não inscritos**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Não Inscritos
  - Descrição: Como administrador, quero importar a aba de não inscritos.
  - Critérios de aceite: Dados importados para nao_inscritos \| Vínculo com inscrição/pessoa quando possível
  - Itens técnicos: Mapear colunas \| Criar conciliação \| Gerar erros

- [x] **US-008 - Importar inscrições prioritárias**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Prioridade
  - Descrição: Como administrador, quero importar a aba de inscrições prioritárias.
  - Critérios de aceite: Priorizados vinculados a adolescentes e inscrições \| Sem duplicidade por inscrição
  - Itens técnicos: Mapear prioridades \| Criar vínculos

- [x] **US-009 - Importar distribuição de círculos**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Média
  - Labels: Migração,Círculos
  - Descrição: Como administrador, quero importar a distribuição de círculos existente.
  - Critérios de aceite: Círculos criados \| Participantes vinculados corretamente
  - Itens técnicos: Mapear círculo \| Criar participantes

- [x] **US-010 - Importar chamados e mensagens de e-mail**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Média
  - Labels: Migração,E-mail
  - Descrição: Como administrador, quero importar chamados e mensagens de e-mail.
  - Critérios de aceite: Email_Chamados e Email_Mensagens migrados \| Threads e tokens preservados quando existirem
  - Itens técnicos: Mapear chamados \| Mapear mensagens

- [x] **US-011 - Importar lista de presença**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Presença
  - Descrição: Como administrador, quero importar registros de presença.
  - Critérios de aceite: Presenças importadas \| Conciliação por telefone/nome \| Pendências registradas
  - Itens técnicos: Normalizar telefones \| Conciliar pessoas \| Registrar pendências

- [x] **US-012 - Importar cadastro de encontreiros**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Encontreiros
  - Descrição: Como administrador, quero importar cadastro de encontreiros.
  - Critérios de aceite: Encontreiros importados \| Campos médicos e equipes preservados
  - Itens técnicos: Mapear colunas \| Criar pessoas/encontreiros \| Vincular equipes

- [x] **US-013 - Registrar erros de importação**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Média
  - Labels: Migração,Logs
  - Descrição: Como administrador, quero visualizar erros de importação.
  - Critérios de aceite: Erros gravados com linha, coluna, valor e motivo \| Tela/API permite consultar erros
  - Itens técnicos: Criar tabela de erros \| Salvar payload

- [x] **US-014 - Criar Google Apps Script de importação**
  - Status: **DONE**
  - Épico: Épico 3 - Script Google e sincronização temporária
  - Prioridade: Alta
  - Labels: Google Script,Integração
  - Descrição: Como administrador, quero executar um script Google para enviar dados das planilhas ao Supabase.
  - Critérios de aceite: Script lê abas configuradas \| Envia lotes para API \| Registra resultado
  - Itens técnicos: Criar config de planilhas \| Criar envio por lote

- [x] **US-015 - Controlar importação full e incremental**
  - Status: **DONE**
  - Épico: Épico 3 - Script Google e sincronização temporária
  - Prioridade: Alta
  - Labels: Integração,Migração
  - Descrição: Como sistema, quero controlar carga completa e incremental.
  - Critérios de aceite: FULL reprocessa conforme regra \| INCREMENTAL envia apenas novos/alterados
  - Itens técnicos: Criar hash por linha \| Controlar última execução

- [x] **US-016 - Exibir resumo de execução do script**
  - Status: **DONE**
  - Épico: Épico 3 - Script Google e sincronização temporária
  - Prioridade: Média
  - Labels: Google Script,Logs
  - Descrição: Como administrador, quero ver resumo da execução.
  - Critérios de aceite: Resumo contém lidas, importadas, ignoradas e erros
  - Itens técnicos: Retornar JSON \| Gravar log

- [x] **US-017 - Evitar duplicidade na importação**
  - Status: **DONE**
  - Épico: Épico 3 - Script Google e sincronização temporária
  - Prioridade: Alta
  - Labels: Dados,Qualidade
  - Descrição: Como sistema, quero impedir duplicidades geradas pelas planilhas.
  - Critérios de aceite: Mesmo telefone/e-mail/nome+nascimento não duplica pessoa
  - Itens técnicos: Criar regra de match \| Testar duplicados

- [x] **US-018 - Desligar sincronização após virada**
  - Status: **DONE**
  - Épico: Épico 3 - Script Google e sincronização temporária
  - Prioridade: Média
  - Labels: Go-live,Configuração
  - Descrição: Como administrador, quero poder desativar a sincronização com planilhas.
  - Critérios de aceite: Flag de configuração desliga leitura/escrita em planilhas
  - Itens técnicos: Criar feature flag \| Atualizar UI

- [x] **US-019 - Criar formulário de inscrição de adolescente**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Alta
  - Labels: Frontend,Cadastro
  - Descrição: Como responsável/adolescente, quero preencher inscrição em formulário novo.
  - Critérios de aceite: Formulário grava direto no Supabase \| Valida campos obrigatórios
  - Itens técnicos: Criar tela pública \| Criar API POST

- [x] **US-020 - Validar campos obrigatórios da inscrição**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Alta
  - Labels: Validação
  - Descrição: Como sistema, quero validar campos obrigatórios.
  - Critérios de aceite: Nome, nascimento, telefone, responsável e aceite são obrigatórios
  - Itens técnicos: Validação frontend \| Validação backend

- [x] **US-021 - Calcular idade automaticamente**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Média
  - Labels: Regra de negócio
  - Descrição: Como sistema, quero calcular idade pela data de nascimento.
  - Critérios de aceite: Idade calculada e armazenada/consultada corretamente
  - Itens técnicos: Criar função idade

- [x] **US-022 - Criar tela de triagem de inscrições**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Alta
  - Labels: Frontend,Inscrições
  - Descrição: Como administrador, quero revisar inscrições recebidas.
  - Critérios de aceite: Lista por status, data, idade, bairro e encontro
  - Itens técnicos: Criar filtros \| Criar paginação

- [x] **US-023 - Alterar status da inscrição**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Alta
  - Labels: Workflow
  - Descrição: Como administrador, quero mudar status da inscrição.
  - Critérios de aceite: Status muda com histórico e auditoria
  - Itens técnicos: Criar endpoint status \| Registrar histórico

- [x] **US-024 - Controlar fila, priorizado, confirmado e não selecionado**
  - Status: **DONE**
  - Épico: Épico 4 - Novo cadastro de adolescentes
  - Prioridade: Alta
  - Labels: Workflow,Inscrições
  - Descrição: Como administrador, quero classificar inscrições sem usar abas auxiliares.
  - Critérios de aceite: Status operacional controlado no banco
  - Itens técnicos: Criar ações rápidas \| Validar transições

- [x] **US-025 - Criar formulário de cadastro de encontreiro**
  - Status: **DONE**
  - Épico: Épico 5 - Novo cadastro de encontreiros
  - Prioridade: Alta
  - Labels: Frontend,Encontreiros
  - Descrição: Como encontreiro, quero preencher meu cadastro pelo sistema.
  - Critérios de aceite: Cadastro grava em pessoas e encontreiros
  - Itens técnicos: Criar formulário \| Criar endpoint

- [x] **US-026 - Editar cadastro de encontreiro**
  - Status: **DONE**
  - Épico: Épico 5 - Novo cadastro de encontreiros
  - Prioridade: Alta
  - Labels: Frontend,Encontreiros
  - Descrição: Como administrador, quero editar cadastro de encontreiro.
  - Critérios de aceite: Alterações persistem no Supabase e geram auditoria
  - Itens técnicos: Tela edição \| API PUT

- [x] **US-027 - Filtrar encontreiros por classificação**
  - Status: **TO DO**
  - Épico: Épico 5 - Novo cadastro de encontreiros
  - Prioridade: Média
  - Labels: Filtro
  - Descrição: Como administrador, quero filtrar Adulto, Adolescente ou Outro.
  - Critérios de aceite: Filtro funcionando na tela e API
  - Itens técnicos: Criar query params

- [x] **US-028 - Consultar dados médicos/alimentares**
  - Status: **TO DO**
  - Épico: Épico 5 - Novo cadastro de encontreiros
  - Prioridade: Alta
  - Labels: Dados Sensíveis
  - Descrição: Como administrador, quero consultar alergias, remédios e alimentação especial.
  - Critérios de aceite: Campos aparecem na lista/detalhe com permissão
  - Itens técnicos: Criar exibição segura

- [x] **US-029 - Vincular encontreiros a equipes**
  - Status: **TO DO**
  - Épico: Épico 5 - Novo cadastro de encontreiros
  - Prioridade: Média
  - Labels: Equipes
  - Descrição: Como administrador, quero vincular encontreiros a equipes.
  - Critérios de aceite: Encontreiro pode ter múltiplas equipes
  - Itens técnicos: Criar relação N:N

- [ ] **US-030 - Listar não inscritos**
  - Status: **TO DO**
  - Épico: Épico 6 - Não inscritos e priorização
  - Prioridade: Alta
  - Labels: Não Inscritos
  - Descrição: Como administrador, quero visualizar não inscritos.
  - Critérios de aceite: Lista exibe nome, telefone, bairro, interesse, recado e status
  - Itens técnicos: Criar API GET \| Criar tela

- [ ] **US-031 - Atualizar interesse confirmado**
  - Status: **TO DO**
  - Épico: Épico 6 - Não inscritos e priorização
  - Prioridade: Média
  - Labels: Workflow
  - Descrição: Como administrador, quero atualizar interesse confirmado.
  - Critérios de aceite: Campo atualizado com auditoria
  - Itens técnicos: Criar ação

- [ ] **US-032 - Priorizar não inscrito**
  - Status: **TO DO**
  - Épico: Épico 6 - Não inscritos e priorização
  - Prioridade: Alta
  - Labels: Prioridade
  - Descrição: Como administrador, quero priorizar um não inscrito.
  - Critérios de aceite: Cria registro em inscrições prioritárias sem duplicar
  - Itens técnicos: Criar endpoint

- [ ] **US-033 - Bloquear priorização duplicada**
  - Status: **TO DO**
  - Épico: Épico 6 - Não inscritos e priorização
  - Prioridade: Alta
  - Labels: Dados,Qualidade
  - Descrição: Como sistema, quero impedir prioridade duplicada.
  - Critérios de aceite: Constraint/validação bloqueia duplicidade
  - Itens técnicos: Criar constraint

- [ ] **US-034 - Criar indicadores de não inscritos**
  - Status: **TO DO**
  - Épico: Épico 6 - Não inscritos e priorização
  - Prioridade: Média
  - Labels: Dashboard
  - Descrição: Como administrador, quero indicadores de interesse, contato mudou e já fez EAC.
  - Critérios de aceite: KPIs calculados pela API
  - Itens técnicos: Criar endpoint resumo

- [ ] **US-035 - Gerar distribuição de círculos**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Alta
  - Labels: Círculos
  - Descrição: Como administrador, quero gerar distribuição dos adolescentes nos círculos.
  - Critérios de aceite: Sistema distribui inscritos aptos entre círculos
  - Itens técnicos: Criar algoritmo

- [ ] **US-036 - Balancear círculos por sexo e idade**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Alta
  - Labels: Regra de negócio
  - Descrição: Como administrador, quero balanceamento por sexo e idade.
  - Critérios de aceite: Regras implementadas e testadas
  - Itens técnicos: Definir regra \| Criar testes

- [ ] **US-037 - Manter círculo excedente**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Média
  - Labels: Círculos
  - Descrição: Como administrador, quero círculo excedente.
  - Critérios de aceite: Itens fora da regra vão para excedente
  - Itens técnicos: Criar círculo especial

- [ ] **US-038 - Visualizar participantes por círculo**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Média
  - Labels: Frontend,Círculos
  - Descrição: Como administrador, quero tela agrupada por círculo.
  - Critérios de aceite: Tela mostra contadores por círculo
  - Itens técnicos: Criar cards/lista

- [ ] **US-039 - Exportar lista/imagem da distribuição**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Baixa
  - Labels: Exportação
  - Descrição: Como administrador, quero exportar distribuição.
  - Critérios de aceite: CSV/HTML/imagem disponível
  - Itens técnicos: Gerar CSV \| Gerar HTML impressão

- [ ] **US-040 - Alterar círculo manualmente**
  - Status: **TO DO**
  - Épico: Épico 7 - Distribuição de círculos
  - Prioridade: Média
  - Labels: Círculos
  - Descrição: Como administrador, quero ajustar participante manualmente.
  - Critérios de aceite: Alteração permitida com auditoria
  - Itens técnicos: Criar move participante

- [ ] **US-041 - Registrar presença por telefone**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Alta
  - Labels: Presença
  - Descrição: Como operador, quero registrar presença por telefone.
  - Critérios de aceite: Sistema localiza pessoa por telefone normalizado
  - Itens técnicos: Criar check-in

- [ ] **US-042 - Registrar presença pendente**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Alta
  - Labels: Presença
  - Descrição: Como operador, quero registrar presença quando telefone não localizar.
  - Critérios de aceite: Presença fica pendente de conciliação
  - Itens técnicos: Criar status pendente

- [ ] **US-043 - Filtrar presença por encontro, mês e círculo**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Média
  - Labels: Presença,Filtro
  - Descrição: Como administrador, quero consultar presença por filtros.
  - Critérios de aceite: Filtros funcionando com dados do Supabase
  - Itens técnicos: Criar endpoint

- [ ] **US-044 - Evitar presença duplicada no dia**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Alta
  - Labels: Qualidade
  - Descrição: Como sistema, quero bloquear/alertar duplicidade.
  - Critérios de aceite: Mesmo participante não duplica presença no mesmo dia
  - Itens técnicos: Criar índice único

- [ ] **US-045 - Resumo de presentes por círculo**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Média
  - Labels: Dashboard,Presença
  - Descrição: Como administrador, quero indicadores por círculo.
  - Critérios de aceite: Total, presentes e faltantes calculados
  - Itens técnicos: Criar agregação

- [ ] **US-046 - Exportar presença**
  - Status: **TO DO**
  - Épico: Épico 8 - Controle de presença
  - Prioridade: Baixa
  - Labels: Exportação
  - Descrição: Como administrador, quero exportar presença.
  - Critérios de aceite: CSV/Excel disponível
  - Itens técnicos: Criar download

- [ ] **US-047 - Cadastrar comunicados**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Alta
  - Labels: Comunicados
  - Descrição: Como administrador, quero cadastrar comunicados no sistema.
  - Critérios de aceite: CRUD de comunicados no Supabase
  - Itens técnicos: Criar tabela \| Criar tela

- [ ] **US-048 - Executar disparo de comunicado**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Alta
  - Labels: Disparos
  - Descrição: Como administrador, quero executar disparo de comunicado.
  - Critérios de aceite: Disparo processa destinatários e grava execução
  - Itens técnicos: Criar motor de disparo

- [ ] **US-049 - Controlar destinatários de disparo**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Alta
  - Labels: Disparos,Logs
  - Descrição: Como sistema, quero controlar enviados, erros e ignorados.
  - Critérios de aceite: Tabela disparo_destinatarios preenchida corretamente
  - Itens técnicos: Criar logs por destinatário

- [ ] **US-050 - Disparo de aniversariantes**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Alta
  - Labels: Disparos,Aniversário
  - Descrição: Como administrador, quero enviar felicitação para aniversariantes do dia.
  - Critérios de aceite: Consulta dia/mês de nascimento \| Evita reenvio no mesmo ano
  - Itens técnicos: Criar regra dia/mês \| Criar controle anual

- [ ] **US-051 - Disparo para não inscritos/fila**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Alta
  - Labels: Disparos,Não Inscritos
  - Descrição: Como administrador, quero enviar comunicado para não inscritos e fila.
  - Critérios de aceite: Filtros equivalentes aos atuais funcionando no banco
  - Itens técnicos: Migrar filtros B/C/H/P/Q \| Criar status envio

- [ ] **US-052 - Acompanhar chamados/e-mails**
  - Status: **TO DO**
  - Épico: Épico 9 - Comunicados, disparos e e-mails
  - Prioridade: Média
  - Labels: E-mail
  - Descrição: Como administrador, quero acompanhar chamados e mensagens.
  - Critérios de aceite: Chamados e mensagens consultáveis no painel
  - Itens técnicos: Criar API

- [x] **US-053 - Cadastrar eventos da agenda**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Alta
  - Labels: Calendário
  - Descrição: Como administrador, quero cadastrar eventos da agenda no Supabase.
  - Critérios de aceite: CRUD de agenda usando Supabase \| Campos atividade, tipo, início, término, local, proprietário e observações
  - Itens técnicos: Criar eventos_agenda \| Criar API CRUD

- [x] **US-054 - Vincular evento a encontro EAC**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Média
  - Labels: Calendário,Encontros
  - Descrição: Como administrador, quero vincular evento a um encontro.
  - Critérios de aceite: Evento pode estar vinculado ou não a um encontro
  - Itens técnicos: Adicionar encontro_id

- [x] **US-055 - Filtrar agenda por status/tipo**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Média
  - Labels: Calendário,Filtro
  - Descrição: Como administrador, quero filtrar agenda por status e tipo.
  - Critérios de aceite: Filtros por Confirmado, Agendado, A confirmar e tipo funcionam
  - Itens técnicos: Criar filtros

- [x] **US-056 - Enviar agenda da semana**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Alta
  - Labels: Disparos,Calendário
  - Descrição: Como administrador, quero disparar agenda semanal.
  - Critérios de aceite: Busca eventos confirmados da semana no Supabase \| Evita duplicidade por semana/destinatário
  - Itens técnicos: Migrar regra Eventos da Semana \| Criar semana_id

- [x] **US-057 - Implementar login seguro**
  - Status: **DONE**
  - Épico: Épico 11 - Usuários, permissões e segurança
  - Prioridade: Alta
  - Labels: Segurança,Auth
  - Descrição: Como administrador, quero login seguro no sistema.
  - Critérios de aceite: Login via Supabase Auth/Google OAuth
  - Itens técnicos: Configurar auth

- [x] **US-058 - Controlar permissões por módulo**
  - Status: **DONE**
  - Épico: Épico 11 - Usuários, permissões e segurança
  - Prioridade: Alta
  - Labels: Segurança,Permissões
  - Descrição: Como administrador, quero controlar permissões por módulo.
  - Critérios de aceite: Permissões criar, editar, visualizar e excluir
  - Itens técnicos: Criar tabela \| Criar policies

- [x] **US-059 - Bloquear usuário inativo**
  - Status: **DONE**
  - Épico: Épico 11 - Usuários, permissões e segurança
  - Prioridade: Média
  - Labels: Segurança
  - Descrição: Como administrador, quero bloquear usuário inativo.
  - Critérios de aceite: Usuário inativo não acessa o painel
  - Itens técnicos: Criar status

- [x] **US-060 - Auditar ações críticas**
  - Status: **DONE**
  - Épico: Épico 11 - Usuários, permissões e segurança
  - Prioridade: Alta
  - Labels: Auditoria
  - Descrição: Como administrador, quero auditar ações críticas.
  - Critérios de aceite: Logs de alterações e disparos gravados
  - Itens técnicos: Instrumentar APIs

- [x] **US-061 - Proteger dados sensíveis**
  - Status: **DONE**
  - Épico: Épico 11 - Usuários, permissões e segurança
  - Prioridade: Alta
  - Labels: Segurança,RLS
  - Descrição: Como sistema, quero proteger dados de menores e dados médicos.
  - Critérios de aceite: RLS habilitado \| Policies aplicadas
  - Itens técnicos: Criar RLS \| Testar acessos

- [x] **US-062 - Substituir Google Script por APIs Supabase**
  - Status: **DONE**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Alta
  - Labels: Backend,Frontend
  - Descrição: Como desenvolvedor, quero trocar chamadas do Google Script por APIs internas.
  - Critérios de aceite: Módulos principais leem dados do Supabase
  - Itens técnicos: Criar clients \| Migrar fetches

- [x] **US-063 - Preservar experiência atual das telas**
  - Status: **DONE**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Média
  - Labels: UX
  - Descrição: Como usuário, quero manter fluxo parecido com o atual.
  - Critérios de aceite: Telas continuam funcionais com novas APIs
  - Itens técnicos: Não quebrar navegação

- [x] **US-064 - Manter filtros com botão Pesquisar**
  - Status: **DONE**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Média
  - Labels: UX,Filtro
  - Descrição: Como usuário, quero filtros acionados por botão.
  - Critérios de aceite: Busca não dispara a cada digitação
  - Itens técnicos: Revisar filtros

- [ ] **US-065 - Padronizar mensagens de erro/sucesso**
  - Status: **TO DO**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Média
  - Labels: UX
  - Descrição: Como usuário, quero mensagens claras.
  - Critérios de aceite: Toasts padronizados nas APIs
  - Itens técnicos: Criar handler

- [x] **US-066 - Atualizar páginas de ajuda**
  - Status: **DONE**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Baixa
  - Labels: Documentação
  - Descrição: Como administrador, quero ajuda refletindo o Supabase.
  - Critérios de aceite: Ajuda explica novo fluxo e origem dos dados
  - Itens técnicos: Atualizar HelpPage

- [ ] **US-067 - Comparar planilha x Supabase**
  - Status: **TO DO**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Homologação
  - Descrição: Como administrador, quero comparar totais migrados.
  - Critérios de aceite: Relatório mostra totais por aba/tabela
  - Itens técnicos: Criar relatório

- [ ] **US-068 - Validar duplicidades**
  - Status: **TO DO**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Qualidade
  - Descrição: Como administrador, quero relatório de duplicados.
  - Critérios de aceite: Duplicados por telefone, e-mail e nome+nascimento
  - Itens técnicos: Criar relatório

- [x] **US-069 - Homologar cadastro de adolescente**
  - Status: **DONE**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste
  - Descrição: Como administrador, quero testar cadastro completo.
  - Critérios de aceite: Fluxo do formulário até listagem aprovado
  - Itens técnicos: Executar caso

- [x] **US-070 - Homologar cadastro de encontreiro**
  - Status: **DONE**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste
  - Descrição: Como administrador, quero testar cadastro de encontreiro.
  - Critérios de aceite: Fluxo completo aprovado
  - Itens técnicos: Executar caso

- [x] **US-071 - Homologar presença**
  - Status: **DONE**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste
  - Descrição: Como administrador, quero testar presença.
  - Critérios de aceite: Check-in, filtros e indicadores aprovados
  - Itens técnicos: Executar caso

- [x] **US-072 - Homologar priorização e círculos**
  - Status: **DONE**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste
  - Descrição: Como administrador, quero testar priorização e distribuição.
  - Critérios de aceite: Fluxo aprovado com base real
  - Itens técnicos: Executar caso

- [ ] **US-073 - Homologar comunicados e disparos**
  - Status: **TO DO**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste,Disparos
  - Descrição: Como administrador, quero testar disparos em ambiente seguro.
  - Critérios de aceite: Disparos não duplicam e logs estão corretos
  - Itens técnicos: Enviar para lista teste \| Validar logs

- [x] **US-074 - Importar planilha de calendário 2026**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Alta
  - Labels: Migração,Calendário
  - Descrição: Como administrador, quero importar a planilha Calendário 2026.
  - Critérios de aceite: Aba Externos importada \| Datas, locais, proprietários e observações preservados
  - Itens técnicos: Mapear aba Externos \| Tratar datas 00:00 \| Conciliar status

- [x] **US-075 - Corrigir dependência da aba Calendario no script atual**
  - Status: **DONE**
  - Épico: Épico 10 - Agenda e calendário
  - Prioridade: Alta
  - Labels: Bug,Google Script
  - Descrição: Como desenvolvedor, quero corrigir a leitura da planilha de calendário.
  - Critérios de aceite: Script não depende apenas da aba Calendario \| Aceita Externos ou usa config
  - Itens técnicos: Criar configuração de aba \| Testar Eventos da Semana

- [ ] **US-076 - Criar camada de serviços de negócio**
  - Status: **TO DO**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Alta
  - Labels: Arquitetura,Backend
  - Descrição: Como desenvolvedor, quero tirar regras do frontend e Google Script e levar para serviços backend.
  - Critérios de aceite: Regras de priorização, presença, calendário e disparos ficam em serviços testáveis
  - Itens técnicos: Criar services \| Criar testes unitários

- [ ] **US-077 - Criar API de resumo para Dashboard**
  - Status: **TO DO**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Média
  - Labels: Dashboard,Backend
  - Descrição: Como usuário, quero dashboard alimentado pelo banco.
  - Critérios de aceite: KPIs vêm de views/functions Supabase
  - Itens técnicos: Criar views \| Criar endpoints

- [ ] **US-078 - Criar adapter temporário Google Sheets**
  - Status: **TO DO**
  - Épico: Épico 12 - Refatoração frontend/backend
  - Prioridade: Média
  - Labels: Arquitetura,Migração
  - Descrição: Como desenvolvedor, quero manter adapter temporário para planilhas durante a transição.
  - Critérios de aceite: Adapter isolado e removível \| Frontend não conhece planilha
  - Itens técnicos: Criar interface \| Implementar sheet adapter

- [ ] **US-079 - Homologar agenda e eventos da semana**
  - Status: **TO DO**
  - Épico: Épico 13 - Validação, testes e homologação
  - Prioridade: Alta
  - Labels: Teste,Calendário
  - Descrição: Como administrador, quero testar calendário e disparo de eventos da semana.
  - Critérios de aceite: Eventos confirmados da semana são listados e enviados corretamente
  - Itens técnicos: Criar eventos teste \| Executar disparo

- [ ] **US-080 - Criar cadastro oficial como base mestre de pessoas do EAC**
  - Status: **TO DO**
  - Épico: Épico 15 - Cadastro oficial e evolução para encontreiro
  - Prioridade: Alta
  - Labels: Cadastro Oficial,Supabase,Modelo de Dados
  - Descrição: Como administrador, quero manter uma base oficial de pessoas que participaram ou foram validadas no EAC, para que elas possam ser reaproveitadas em presença, círculos, comunicação e seleção futura de encontreiros.
  - Critérios de aceite: Deve existir tabela cadastro_oficial \| Cada registro deve estar vinculado a uma pessoa \| Uma pessoa não pode ter dois cadastros oficiais ativos \| O cadastro oficial deve guardar origem, encontro e status \| O sistema deve permitir marcar pessoa como elegível para futuro encontreiro
  - Itens técnicos: Criar tabela cadastro_oficial \| Vincular com pessoas \| Criar constraint de cadastro ativo único \| Criar status do cadastro oficial \| Criar campo elegivel_encontreiro \| Migrar dados do cadastro oficial atual

- [ ] **US-081 - Permitir evolução de adolescente/encontrista para encontreiro**
  - Status: **TO DO**
  - Épico: Épico 15 - Cadastro oficial e evolução para encontreiro
  - Prioridade: Alta
  - Labels: Cadastro Oficial,Encontreiros,Regra de Negócio
  - Descrição: Como coordenação, quero transformar uma pessoa do cadastro oficial em encontreiro elegível ou encontreiro ativo, para reaproveitar pessoas que já participaram do EAC.
  - Critérios de aceite: O sistema deve localizar pessoa no cadastro oficial \| O sistema deve permitir adicionar papel ENCONTREIRO_ELEGIVEL \| O sistema deve permitir criar cadastro de encontreiro usando o mesmo pessoa_id \| O sistema não pode criar pessoa duplicada \| O histórico da pessoa deve mostrar participação anterior como encontrista
  - Itens técnicos: Criar pessoa_papeis \| Criar ação tornar elegível \| Criar ação tornar encontreiro \| Validar duplicidade \| Exibir histórico da pessoa

- [ ] **US-082 - Criar motor de deduplicação de inscrições**
  - Status: **TO DO**
  - Épico: Épico 16 - Deduplicação e visões operacionais
  - Prioridade: Alta
  - Labels: Deduplicação,Inscrições,Backend
  - Descrição: Como administrador, quero que o sistema identifique inscrições duplicadas, para que apenas uma inscrição válida siga para análise.
  - Critérios de aceite: Deduplicar por telefone normalizado \| Deduplicar por e-mail normalizado \| Deduplicar por nome completo + data de nascimento \| Marcar inscrições duplicadas com status DUPLICADA \| Manter histórico das duplicadas sem apagar dados \| Gerar visão equivalente à aba Inscricoes_Sem_Duplicidade
  - Itens técnicos: Criar função normalizar telefone \| Criar regra de matching \| Criar status DUPLICADA \| Criar histórico de duplicidade \| Criar relatório de possíveis duplicados

- [ ] **US-083 - Criar visão de inscrições sem duplicidade no Supabase**
  - Status: **TO DO**
  - Épico: Épico 16 - Deduplicação e visões operacionais
  - Prioridade: Alta
  - Labels: Inscrições,Supabase,View
  - Descrição: Como administrador, quero visualizar apenas inscrições válidas sem duplicidade, para substituir a aba Inscricoes_Sem_Duplicidade.
  - Critérios de aceite: Deve existir view ou endpoint equivalente \| Deve retornar apenas inscrições não duplicadas \| Deve permitir filtros por encontro, status, idade, sexo e bairro \| Deve permitir exportação \| Deve servir como origem para priorização e não inscritos
  - Itens técnicos: Criar vw_inscricoes_sem_duplicidade \| Criar endpoint de consulta \| Criar filtros \| Criar exportação CSV \| Ajustar frontend para consumir a view

- [ ] **US-084 - Inventariar regras atuais do Google Apps Script**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Inventário,Backend,Migração
  - Descrição: Como gerente do projeto, quero mapear todas as actions e funções do Apps Script atual para garantir que nenhuma regra operacional seja perdida na migração para Supabase. Critérios: listar actions, origem de dados, regra, destino no banco, endpoint novo e status de migração.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-085 - Criar camada de serviços de domínio no backend**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Backend,Arquitetura
  - Descrição: Como desenvolvedor, quero separar regras de cadastro, não inscritos, priorização, círculos, presença, calendário e disparos em serviços backend para evitar regra crítica no frontend. Critérios: serviços isolados, testes unitários e endpoints consumindo os serviços.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-086 - Migrar regra de geração de não inscritos**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Não Inscritos,Supabase
  - Descrição: Como coordenação, quero que o sistema gere não inscritos a partir das inscrições sem duplicidade e do cadastro oficial. Critérios: cruzamento por telefone normalizado, evitar duplicidade, gerar status operacional e manter origem da inscrição.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-087 - Migrar motor de priorização**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Priorização,Backend
  - Descrição: Como coordenação, quero priorizar não inscritos sem duplicar registros. Critérios: marcar inscrição como PRIORIZADO, criar registro em inscrições prioritárias, impedir duplicidade e gerar histórico.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-088 - Migrar algoritmo de distribuição dos círculos**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Círculos,Regra de Negócio
  - Descrição: Como coordenação, quero gerar os círculos com as mesmas regras atuais. Critérios: 6 círculos + excedente, limite 6 meninos e 6 meninas, faixa 13 a 17, promoção de 12 anos até 6 meses, matriz de idade, prioridade por bairro e gravação do resultado.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-089 - Criar histórico de execução da distribuição de círculos**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Média
  - Labels: Círculos,Auditoria
  - Descrição: Como administrador, quero consultar quando uma distribuição foi executada, com quais critérios e quais participantes foram alocados. Critérios: tabela de execução, tabela de resultado, usuário executor, payload de critérios e comparação entre execuções.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-090 - Migrar controle de presença por telefone**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Presença,Backend
  - Descrição: Como operador, quero registrar presença por telefone normalizado usando o banco de dados. Critérios: localizar pessoa, vincular encontro/círculo, evitar duplicidade no dia e gerar pendência quando não localizar.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-091 - Migrar disparos para regras backend**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Disparos,Backend
  - Descrição: Como administrador, quero que os disparos consultem o Supabase e não mais colunas de planilhas. Critérios: público-alvo por query, lote controlado, status por destinatário, logs e reset por tipo.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-092 - Migrar calendário e eventos da semana**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Média
  - Labels: Calendário,Disparos
  - Descrição: Como administrador, quero importar a agenda do calendário e enviar eventos da semana consultando o banco. Critérios: importar aba Externos, gravar eventos, filtrar semana atual, status confirmado e controlar envio por semana.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-093 - Substituir login por Supabase Auth**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Segurança,Usuários
  - Descrição: Como administrador, quero substituir usuário/senha em planilha por autenticação segura. Critérios: Supabase Auth, perfis, permissões por módulo, RLS e bloqueio de inativos.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-094 - Criar tokens seguros para formulário público**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Média
  - Labels: Formulário Público,Segurança
  - Descrição: Como sistema, quero enviar links de confirmação de interesse com token seguro. Critérios: token único, validade, vínculo com pessoa/inscrição, impedir resposta duplicada indevida e auditoria.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [ ] **US-095 - Criar validação comparativa planilha x Supabase**
  - Status: **TO DO**
  - Épico: Épico 14 - Inventário e reconstrução funcional
  - Prioridade: Alta
  - Labels: Homologação,Migração
  - Descrição: Como gerente do projeto, quero comparar totais e amostras das planilhas contra o banco após a migração. Critérios: totais por aba/tabela, duplicidades, divergências, registros sem vínculo e relatório de homologação.
  - Critérios de aceite: Ver descrição do card. Validar regra atual contra código e planilhas antes da implementação.
  - Itens técnicos: Mapear regra atual \| Definir origem Supabase \| Criar serviço backend \| Criar endpoint \| Ajustar frontend \| Homologar contra planilha atual

- [x] **US-096 - Criar camada de staging para migração das planilhas**
  - Status: **DONE**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Descrição: Criar uma estrutura intermediária no Supabase para receber os dados brutos das planilhas antes de processar, normalizar, deduplicar e gravar nas tabelas oficiais.

- [x] **US-097 - Reimportar planilha de encontreiros para Supabase**
  - Status: **TO DO**
  - Épico: Épico 2 - Migração das planilhas atuais
  - Prioridade: Alta
  - Labels: Migração,Encontreiros,Dados
  - Descrição: Como administrador, quero reprocessar a planilha de encontreiros para popular corretamente a base no Supabase.
  - Critérios de aceite: Tabela/view de encontreiros com dados carregados \| Quantitativo validado com planilha origem \| Evidência de importação registrada
  - Itens técnicos: Revisar mapeamento da aba \| Executar carga full \| Validar contagem e amostra





