# Roadmap de US - Módulos Operacionais (Liberação por Prontidão)

## Diretriz
Os menus `Disparos`, `Calendário`, `Comunicados`, `Logs`, `Usuários`, `Ajustes` e `Ajuda` só serão liberados no `navigationRoadmap` quando o respectivo pacote de US estiver completo e validado.

Cada pacote deve cobrir:
1. Regra funcional do módulo.
2. Modelo de dados no Supabase.
3. Paridade com rotina legada (planilha / Apps Script).
4. API + frontend.
5. Auditoria e rastreabilidade.
6. Teste de homologação com evidência.

---

## Sequência proposta de execução (US)

## Bloco 1 - Usuários e Acesso (base para os demais)

### US-095 - Matriz de perfis e permissões por módulo
- Objetivo: definir perfis (`ADMIN`, `COORD`, `OPERADOR`, etc.) e permissões por menu/ação.
- Banco: revisar `app_user_profiles` + tabela de permissões granular se necessário.
- Entrega: documento de matriz + seed inicial.

### US-096 - Gestão de usuários no painel
- Objetivo: cadastrar/editar/inativar usuários com vínculo ao `auth.users`.
- Banco: `app_user_profiles`, histórico de alterações.
- Paridade legada: mapear colunas da planilha de usuários atual.
- Entrega: tela `Usuários` funcional + API segura.

### US-097 - Controle de acesso por rota/ação
- Objetivo: bloquear ações críticas por permissão (não só esconder menu).
- Entrega: autorização server-side em todas as APIs operacionais.

**Gate de liberação do menu `Usuários`:**
1. CRUD validado.
2. Permissões aplicadas no backend.
3. Log de auditoria ativo.

---

## Bloco 2 - Comunicados (cadastro da mensagem)

### US-098 - Modelo oficial de comunicados
- Objetivo: normalizar entidade de comunicado (assunto, corpo, segmento, status, versão).
- Banco: revisar tabela `comunicados` + versionamento simples.

### US-099 - Editor e ciclo de vida de comunicado
- Objetivo: criar, editar, arquivar, duplicar comunicado.
- Paridade legada: comparar com estrutura usada na planilha de comunicados.

### US-100 - Validação de conteúdo para disparo
- Objetivo: impedir disparo sem campos obrigatórios e sem público elegível.

**Gate de liberação do menu `Comunicados`:**
1. CRUD completo.
2. Validações ativas.
3. Integração pronta para `Disparos`.

---

## Bloco 3 - Disparos (execução operacional)

### US-101 - Motor de disparo com fila e status
- Objetivo: iniciar disparo, acompanhar progresso, tratar sucesso/falha.
- Banco: `disparos`, `disparo_execucoes`, `disparo_destinatarios`.

### US-102 - Regras de audiência e deduplicação
- Objetivo: garantir público correto e sem envio duplicado indevido.
- Paridade legada: reproduzir critérios da planilha/rules do Apps Script.

### US-103 - Reprocessamento e retentativa controlada
- Objetivo: retentar falhas sem reenviar para já confirmados.

**Gate de liberação do menu `Disparos`:**
1. Execução com status fim-a-fim.
2. Destinatários auditados.
3. Deduplicação homologada.

---

## Bloco 4 - Calendário (agenda operacional)

### US-104 - Modelo de eventos e recorrência mínima
- Objetivo: manter eventos oficiais do EAC com janela de execução.
- Banco: `eventos_agenda` e campos de status.

### US-105 - Gestão de calendário no painel
- Objetivo: criar/editar/cancelar eventos com impacto nos disparos.
- Paridade legada: verificar calendário da planilha atual.

### US-106 - Integração calendário x disparos
- Objetivo: disparos dependentes da semana/evento correto.

**Gate de liberação do menu `Calendário`:**
1. CRUD estável.
2. Eventos refletindo nos disparos.
3. Filtro por semana/mês validado.

---

## Bloco 5 - Logs e observabilidade

### US-107 - Log unificado de operações
- Objetivo: consolidar log de usuário, API e disparo em formato único.

### US-108 - Tela de logs com filtros operacionais
- Objetivo: filtrar por módulo, período, status, operador, `dispatchId`.

### US-109 - Exportação e trilha de auditoria
- Objetivo: exportar evidências para prestação de contas.

**Gate de liberação do menu `Logs`:**
1. Logs de todos os módulos críticos.
2. Filtros úteis ao operacional.
3. Exportação funcionando.

---

## Bloco 6 - Ajustes e ajuda operacional

### US-110 - Ajustes seguros por ambiente
- Objetivo: separar configuração sensível de parâmetros operacionais.

### US-111 - Ajuda contextual por módulo
- Objetivo: manual rápido e critérios de uso por rotina.

**Gate de liberação dos menus `Ajustes` e `Ajuda`:**
1. Ajustes sem risco de expor segredo.
2. Documentação operacional mínima pronta.

---

## Ordem de liberação de menus (proposta)
1. `Usuários`
2. `Comunicados`
3. `Disparos`
4. `Calendário`
5. `Logs`
6. `Ajustes`
7. `Ajuda`

---

## Critério de pronto por US
Uma US só fecha quando houver:
1. Script SQL versionado (quando aplicável).
2. API implementada com autorização.
3. Tela integrada.
4. Teste de homologação executado.
5. Evidência registrada em `docs/` (resultado e pendências).

