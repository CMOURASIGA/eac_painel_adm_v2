# EAC Infra — Checkpoint 02: inventário da API e estratégia de autorização
**Data:** 2026-10-12  
**Branch:** `feat/presenca-v2-reestruturacao-mock`  
**Status:** STATIC AUDIT / SECURITY GATE OPEN  
**Ambiente:** somente revisão GitHub e consulta de metadados Vercel, sem testes invasivos, SQL, deploy manual, merge ou edição de produção.

## Inspeção estática verificável
Arquivos de referência: `api/comunicados.ts`, `utils/supabaseActions.ts`, `utils/supabaseServer.ts`, `services/eacApiClient.ts`, `api/auth/login.ts`, `components/LoginPage.tsx`, `App.tsx`, `services/presencaBusinessService.ts`.

O `api/comunicados.ts` aceita requests POST com `action` e `data`, define `supabasePreferredActions` e encaminha a `handleSupabaseAction(action, data)`. O `utils/supabaseActions.ts` contém 66 casos de ação por comparação exata de `ctx.action`. **Nenhum middleware mandatário e central por action que valide identidade autenticada/escopo foi identificado no roteamento inspecionado**; isso não demonstra por si só todas as condições de acesso efetivas. `utils/supabaseServer.ts` usa SERVICE_ROLE_KEY do servidor; a API deve aplicar autorização explicitamente antes de execução.

O serviço do check-in legado pode atualizar o telefone e bloquear segunda presença no mesmo dia — comportamento diferente de sessão + conciliação administrativa. `App.tsx` armazena perfil em localStorage; `/api/auth/login` usa Supabase Auth e `LoginPage.tsx` tem fallback USER_LOGIN legado. É indispensável uniformizar a validação da identidade do operador e impedir confiança em `x-eac-user-email` ou em metadados fornecidos pelo cliente.

## Ferramenta entregue na branch
`scripts/audit-api-actions.mjs` e comando `npm run audit:api-actions`:
- Executam apenas leitura estática de dois arquivos locais (`api/comunicados.ts` e `utils/supabaseActions.ts`).
- Retornam JSON reproduzível com ações preferenciais da rota, casos implementados, divergências e classificação **heurística** READ / POTENTIAL_WRITE_OR_SIDE_EFFECT / AUTH / REVIEW.
- **Não** fazem conexão Supabase, não usam variáveis de ambiente e não revelam segredos.
- Não provam segurança, não substituem inspeção semântica da implementação e não examinam demais endpoints. Executar e arquivar stdout em ambiente de desenvolvimento/CI, revisando diferenças de versões.

## Matriz inicial de ação/risco a confirmar por revisão detalhada
| Categoria | Exemplos | Controle obrigatório antes de ampliação |
|---|---|---|
| Público com entrada controlada | GET_PUBLIC_PRESENCE_DATA, MARK_PRESENCE, SEARCH_BANDA_CANDIDATES, SAVE_BANDA_INTEREST | Endpoint público específico; dados mínimos; validação de payload, limitações de taxa e anti-enumeração; sem admin token |
| Administração de usuários | GET_USERS, SAVE_USER, DELETE_USER | Token verificado no servidor, papel ADM, registro de auditoria |
| Alteração de pessoas | SAVE_MEMBER, DELETE_MEMBER, SAVE_ENCONTREIRO, DELETE_ENCONTREIRO, NORMALIZE_ENCONTREIRO_WHATSAPP | Autenticação e permissão operacional por módulo, trilha de auditoria |
| Círculos/inscrições | PRIORITIZE_NON_ENROLLED, EXECUTE_DISTRIBUICAO_CIRCULOS, SET_INSCRICAO_CIRCULO, MOVE_CIRCULO_PARTICIPANTE | Restrições por edição e operação, coerência de IDs, logs |
| Comunicação/disparos | SAVE_COMUNICADO, DELETE_COMUNICADO, EXECUTE_COMUNICADO_99, EXECUTE_ANIVERSARIANTES, START_DISPARO_EXECUCAO, RETRY_DISPARO_FALHAS | Autorização, confirmação operacional, idempotência, limites de custo |
| Agenda/relatórios | GET_EVENTS, SAVE_EVENT, DELETE_EVENT, GET_PRESENCE, GET_OPERATIONAL_LOGS | RBAC/escopo e minimização de dados |
| Autenticação | USER_LOGIN | Descontinuar fallback por fases, migrar somente após inventariar usuários existentes |
| Configurações/segredos | GET_SAFE_SETTINGS, SAVE_FORMULARIOS_CONFIG | ADM; nunca incluir segredo em response |

A classificação é de triagem. Nomes de ações não determinam se a operação modifica o banco; verificar contratos, controle de acesso e consumidores.

## Riscos com prioridade
**P0-01:** Gateway `api/comunicados.ts` com actions sensíveis e acesso privilegiado à base. Inventariar e estabelecer matriz de autorização por action, com recusa por padrão.

**P0-02:** Identidade de operador não unificada (Supabase Auth + fallback USER_LOGIN + localStorage). Modelo futuro: sessão autenticada verificada server-side; perfil + autorização por edição, casal e sessão.

**P0-03:** Em dados do diagnóstico, `pessoas` possui leitura pública ampla e `encontros` permite escritas amplas segundo RLS/GRANT. Planejar remediação sem interromper dependências; **não executar DDL agora**.

**P1-04:** Endpoint público de candidatos hoje entrega conjunto agregado de pessoas; criar API por sessão que evite exposições de menores, use mínimo de campos e filtros obrigatórios.

**P1-05:** Desempenho Vercel não quantificado. Projeto confirmado framework Vite, previews e produção READY. Coletar uso/quota, funções, build, payload e timings antes de prometer ganhos.

## Próximo ciclo de implementação controlada (somente branch)
1. Executar `npm run audit:api-actions` e preservar resultado no checkpoint, sem confundir ferramenta estática com teste de segurança.
2. Construir matriz por action: consumidor frontend, rota de entrada, identidade, privilégio, acesso à base, erros e auditoria. Incluir endpoints fora de `/api/comunicados`.
3. Criar testes para negar solicitações não autenticadas nas ações privilegiadas. Não rodar chamadas mutantes em produção.
4. Propor e implementar, por incrementos isolados, guarda de autorização no backend; migrar consumidores gradualmente e impedir bypass por service_role.
5. Obter baseline real de Vercel e benchmark de build; propor otimizações ordenadas pelo ganho medido.
6. Depois, gateway MOCK sem Supabase e validação de regressão operacional antes de Presença V2.

## Critérios do checkpoint
- [x] Ferramenta estática de auditoria criada na branch.
- [x] Comando `audit:api-actions` adicionado.
- [x] Achados críticos e matriz inicial documentados.
- [ ] Saída do comando executada e anexada como evidência CI.
- [ ] Inventário completo de TODOS os endpoints e consumidores.
- [ ] Regras de autorização corrigidas e testadas.
- [ ] Baseline Vercel quantitativo obtido.
- [ ] Mocks implementados e homologados.

Nenhuma alteração intencional de comportamento da aplicação foi feita neste checkpoint.
