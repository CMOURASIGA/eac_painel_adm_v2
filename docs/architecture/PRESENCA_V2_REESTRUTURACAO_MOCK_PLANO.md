# EAC — Presença V2 e reestruturação controlada (plano documental)
**Data:** 2026-10-10  
**Branch:** `feat/presenca-v2-reestruturacao-mock` (base: `develop`)  
**Status:** DOCUMENTAÇÃO / PREPARAÇÃO — IMPLEMENTAÇÃO NÃO AUTORIZADA  
**Produção:** sem alterações em main/develop, schema Supabase, dados ou rotas de produção.

## 1. Propósito e fronteiras
Reestruturar gradualmente o painel EAC, preservando a operação existente, e preparar o novo controle de presença por sessões e QR Code. A branch será laboratório de validação operacional com dados sintéticos, sem depender da qualidade atual do banco. O diagnóstico do banco deve orientar contratos, mas a primeira homologação ocorrerá isolada. Nenhuma alteração em tabelas, RLS, usuários reais ou produção foi autorizada.

A revisão estática confirmou: React/TypeScript/Vite no frontend; API serverless com Next handlers; `api/comunicados.ts` distribui ações; `utils/supabaseActions.ts` centraliza integração; `services/presencaBusinessService.ts` grava presença legada; `components/PublicPresenceForm.tsx` e `components/PresencePage.tsx` implementam telas legadas; `api/auth/login.ts`, `components/LoginPage.tsx` e `app_user_profiles` participam de autenticação. Há também compatibilidade com Google Apps Script/Sheets. Não assumir substituição imediata do legado.

## 2. Escopo de públicos — sem confusão de identidade
- ENCONTRISTA: pessoa que participou como adolescente de uma edição, com vínculo histórico por edição e círculo.
- ENCONTREIRO: pessoa que participa/atua como encontreiro, tendo ou não sido encontrista do EAC.
- EX-ENCONTRISTA ENCONTREIRO: uma única pessoa com vínculos distintos; não duplicar `pessoas` nem apagar sua origem.
- Pós-encontro geral: público elegível configurado para a sessão, contemplando encontristas **e encontreiros**. Ser encontreiro não implica ter feito EAC conosco. Não presumir que todos os encontristas/encontreiros do cadastro sejam automaticamente convidados: gerar elegibilidade explícita por edição/sessão.
- Reunião de tios: uma dupla por dois círculos, um QR por sessão; participantes desses círculos e visitantes somente com regra documentada, sem mover cadastro de círculo.
- Coordenadores do pós-encontro: casal próprio, distinto das duplas de tios.
- Histórico: 18 círculos, 213 vínculos históricos de adolescentes, 209 ligados e 4 pendentes no último diagnóstico; esses quatro pendentes devem ser regularizados antes da produção, com confirmação da Lara ambígua, sem ligação automática.

## 3. Cadastro progressivo e conciliação — sem perder presença
1. QR da sessão aberta -> página mostra a reunião e solicita pesquisa de nome + telefone.
2. Coincidência confiável e pessoa elegível -> presença confirmada, sem duplicar.
3. Nome não encontrado -> coletar nome e telefone informados, gerar solicitação `PENDENTE_CONCILIACAO`, não criar `pessoas` automaticamente.
4. Telefone inexistente, telefone diferente ou usado por mais de uma pessoa -> **solicitação pendente para ADM**. Não inventar telefone, data de nascimento ou identidade; não impedir recebimento da solicitação enquanto aberta.
5. Informações cadastrais adicionais são **propostas de atualização**, não alterações automáticas. Preferência por coleta curta e progressiva (p.ex. telefone pessoal/telefone do responsável com tipo de vínculo declarado), com confirmação/validação do ADM para alterações de identidade e contatos.
6. Telefone do responsável legal pode auxiliar a conferência **somente se o vínculo cadastral for confiável**; compartilhar telefone entre irmãos não confirma sozinho a identidade.
7. Um mesmo dispositivo pode atender várias pessoas, mas é vedado exibir listagem indiscriminada, números completos ou detalhes sensíveis. Aplicar rate limit, limites de tentativas, proteção contra enumeração e auditoria.
8. O ADM resolve pendências vinculando à pessoa existente, registrando evidências e origem da alteração, ou criando pessoa após revisão. Preservar nome/telefone informados originalmente em trilha restrita.
9. Após encerramento, apenas ADM aprova/rejeita pendências criadas durante a sessão aberta. Sessão encerrada é irreversível; não aceitar novos check-ins.
10. Duplicidade: unicidade efetiva `sessao_id + pessoa_id`; solicitações pendentes recebem chave idempotente e resolução transacional. Evitar o bloqueio legado por pessoa/telefone/dia.
11. Para encontristas e encontreiros, a regra de público e identificação é comum, mas o registro deve salvar `papel_na_sessao` e vínculos de histórico/edição, sem reclassificar alguém automaticamente.

## 4. Acesso de tios sem gestão pesada de login — alternativas para homologação
**Preferência do produto:** dispensar criação/gestão rotineira de senha para os tios.

- Opção A (preferencial para avaliar): convite individual controlado pelo ADM, com autenticação passwordless por link de acesso de curta duração/OTP e identidade verificável, autorização por edição e por dupla/casal. Sem senha local; links revogáveis e auditados. Não usar um QR público do adolescente como credencial administrativa.
- Opção B: conta Supabase Auth convencional, somente se a alternativa A não atender segurança/operação.
- **Não aprovar** link administrativo permanente e compartilhado sem autenticação, pois permitiria encerrar sessões e alterar presenças.
- O ADM gerencia autorizações, não credenciais/senhas dos tios; nenhum acesso é herdado apenas do nome histórico.
- Qualquer confirmação de check-in pendente após encerramento permanece exclusiva do ADM.
- **Pendente de decisão:** canal de convite/OTP, validade, reenvio, revogação e recuperação de acesso.

## 5. Modelo de domínio proposto (não é migration)
- `presenca_eventos`: reunião/ocorrência, `tipo` POS_ENCONTRO_GERAL | REUNIAO_DUPLA_TIOS, edição, título, local e organizador.
- `presenca_sessoes`: estado AGENDADA/ABERTA/ENCERRADA/CANCELADA, token público opaco, datas, autor da abertura/encerramento; uma ocorrência pode ter nova sessão se a anterior fechou, nunca reabrir a anterior.
- `presenca_sessao_publico`: snapshot de elegibilidade com `pessoa_id` quando resolvida, vínculo/papel (encontrista/encontreiro/ambos), edição, círculo histórico quando aplicável, alcance/convite.
- `presenca_autorizacoes`: pessoa/autenticação do operador, edição, dupla/casal, sessão, permissões explícitas e revogação.
- `presenca_solicitacoes`: solicitação pública por sessão, entrada original restrita, status, data de recebimento, conciliação, decisão administrativa, idempotência.
- `presenca_registros` (ou evolução segura de `presencas` após auditoria): presença consolidada, `sessao_id`, `pessoa_id`, papel/snapshot, origem QR/MANUAL, criado_em; `UNIQUE(sessao_id,pessoa_id)`.
- `presenca_auditoria`: abertura, encerramento, tentativas, correção, conciliação, vínculo e decisão com ator/tempo.
- Modelagem final depende de FKs, triggers e consumidores reais do legado; nenhum nome de tabela acima está autorizado para DDL.

## 6. Revisão estrutural do repositório — trilhas
**A. Backend e autorização (prioridade máxima)**
- Inventariar todas as ações em `api/comunicados.ts` e classificar pública/admin/operador; verificar checks server-side ação a ação e limites de payload.
- Revisar uso do `SUPABASE_SERVICE_ROLE_KEY` em `utils/supabaseServer.ts` / `utils/supabaseActions.ts`: service role ignora RLS; jamais confiar em email de `x-eac-user-email` ou perfil de localStorage como prova de autenticação.
- Harmonizar `/api/auth/login`, login legado USER_LOGIN, `app_user_profiles`, `usuarios` e `eac_profiles`, definindo uma identidade verificável para operadores.
- Revisar `LoginPage` (inclusive credenciais de desenvolvimento apenas em localhost), sessões e renovação/revogação, proteção de endpoints e CSRF conforme autenticação definida.
- Audit RLS/GRANT: `pessoas` com leitura anônima ampla e permissões genéricas de `presencas` e `encontros`; verificar exposição real e planejar correção compatível (não executar).
- Segregar APIs públicas de consulta de candidatos das APIs administrativas; proibir envio de listas de pessoas/telefones ao cliente.

**B. Fluxos e integridade**
- Documentar mapeamentos atuais `GET_PRESENCE`, `GET_PUBLIC_PRESENCE_DATA`, `MARK_PRESENCE` e dependências de `PresencePage`, `PublicPresenceForm`, dashboard/exports.
- Hoje `markPresenceService` bloqueia duplicidade pelo mesmo dia e pode atualizar telefone/e-mail: incompatível com sessão + conciliação. Preservar legado até substituir de forma controlada.
- Não confundir `encontros` (edição), `eventos_agenda` (calendário) e uma sessão real de presença.
- Validar telefone do responsável legal via `adolescente_responsaveis`, `responsaveis`; não assumir cardinalidade 1:1.
- Política explícita de visitante, ausência de cadastro, duplicidade, cancelamento, novo QR, histórico e relatórios.

**C. Vercel e organização**
- Auditar arquitetura híbrida Vite + Next API, `vercel.json`, imports/dependências não usados, bundle, chamadas redundantes, respostas volumosas, funções e timeouts, limites de execução, logs e erros de build.
- Medir antes de otimizar: build, tamanho do bundle, latência/payload de endpoints, quantidade de requests, uso de funções, respostas por consulta, quota/plano e comportamento de caching.
- Refatorar serviços por domínio e contratos tipados, paginar buscas e listas, remover fan-out desnecessário e respostas de dados excessivos. Não migrar de framework sem benchmark e decisão.
- Preservar funcionalidades em produção: inscrições, círculos, agenda, encontrados/encontreiros, camisas, formulários e demais fluxos.
- Rever segredos e variáveis de ambiente; mocks não podem mascarar falhas de produção.

**D. Qualidade**
- Criar plano para typecheck, lint, unit tests, E2E Playwright, checks build/preview, smoke tests, matriz de regressão e observabilidade.
- Definir contrato estável de repositórios e adaptadores antes de escrever um segundo backend mock.

## 7. Mocks / validação operacional — isolamento rigoroso
- Seleção de fonte exclusiva do ambiente de preview/local; **fail closed**: produção usa apenas backend real.
- Dados sintéticos, determinísticos e **sem nomes/telefones reais** dos adolescentes; nenhuma consulta/mutation no Supabase quando mock for selecionado.
- Cenários: 35º/36º/37º, seis círculos por edição, duplas de dois círculos, pós-encontro com públicos mistos (encontristas, encontreiros, ambos), homônimos, telefone ausente/divergente/compartilhado, visitante, ausência de vínculo, segundo check-in na mesma sessão, duas reuniões no mesmo dia, concorrência, sessão encerrada, pendência e conciliação após encerramento, operador sem acesso.
- Validar todas as jornadas existentes pelo menos em smoke/regressão, não apenas presença. Registrar PASS/FAIL/NOT TESTED.
- Sem dados mockados na build pública de produção; advertência visual inequívoca de MOCK; reset controlado; não transportar IDs sintéticos à base real.
- Qualquer preview deve exigir autenticação ou restrição adequada e não expor dados pessoais.

## 8. Sequência e gates
**Gate 0 — esta entrega:** branch isolada + documentação apenas. Sem código funcional, sem migration e sem merge.

**Gate 1 — auditoria complementar:** inventário completo de APIs e dependências, mapa de autenticação, análise de Vercel com métricas reais e risco de regressão. Rever todo o repositório, incluindo configurações e scripts não inspecionados anteriormente.

**Gate 2 — homologação funcional:** fechar elegibilidade de encontristas/encontreiros, atualização cadastral progressiva, acesso passwordless dos tios, perfil dos coordenadores e política de visitante. Atualizar SPEC legada que ainda descreve reunião por círculo e cadastro rápido automático.

**Gate 3 — SPEC técnica:** contratos de API, modelo final de persistência e RLS, plano de migração/reversão, matrizes de testes e critérios de aceite. Identificar SQLs de diagnóstico pontuais após cruzar repositório com esquema já exportado.

**Gate 4 — autorização separada:** implementar mocks, telas e fluxo em branch, sem conectividade Supabase, apenas se o proprietário autorizar expressamente.

**Gate 5 — homologação operacional:** E2E, regressão geral, relatórios e evidências de cenário; corrigir mock até aprovação.

**Gate 6 — integração real:** somente após autorização própria para dados reais, migrations revisadas, segurança, cadastros históricos regularizados, rollout gradual e rollback definido.

## 9. Evidências e checkpoints
- Cada etapa deve indicar branch, SHA, arquivos alterados, impacto Vercel, testes e riscos.
- Nenhum PR para `develop` ou `main` é automaticamente autorizado.
- Não normalizar ou fundir identidades históricas silenciosamente.
- Não modificar `presencas` legada antes de provar ausência de regressão.
- Esta documentação **não** declara que auditoria do repositório completo, performance Vercel ou validação operacional já tenham sido executadas.

## 10. Critérios de aceite da preparação
- [x] Branch isolada a partir de `develop`.
- [x] Escopo e riscos documentados.
- [x] Encontristas/encontreiros contemplados sem duplicar pessoas.
- [x] Plano de cadastro progressivo e fila ADM.
- [x] Alternativa sem senha para tios identificada, ainda sujeita a homologação.
- [x] Estratégia mock sem Supabase definida em papel.
- [ ] Auditoria completa de todos os módulos e métricas Vercel.
- [ ] SPEC técnica/RLS/API definitiva.
- [ ] Autorização para implementar.
