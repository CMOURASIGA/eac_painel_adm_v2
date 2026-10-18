# EAC Painel ADM V2 — Etapa 1: Auditoria estrutural e plano de estabilização

**Data:** 2026-10-12  
**Branch:** `feat/presenca-v2-reestruturacao-mock`  
**Estado:** INICIADA — AUDITORIA ESTÁTICA PARCIAL; implementação ainda não iniciada.  
**Proibições:** não tocar em `main`, `develop`, Supabase, produção ou credenciais; não publicar mocks em produção.

## 1. Escopo de trabalho autorizado
A solicitação é iniciar a melhoria da infraestrutura antes do desenvolvimento da Presença V2. A primeira entrega é diagnóstico, priorização, contratos e evidências de controle; qualquer mudança operacional exige implementação isolada, testes e homologação antes de merge.

### Evidências verificadas na branch
- `package.json`: React 19, Vite 6, Next 16 como dependência para API serverless, Supabase JS 2, googleapis, nodemailer; scripts `dev`, `build`, `preview` e `validate:supabase-sync`. **Não há scripts `test`, `lint`, `typecheck` declarados**, apesar de TypeScript instalado.
- `vercel.json`: `framework: vite`, `outputDirectory: dist`, rewrite SPA excluindo `/api/`.
- `vite.config.ts`: proxy `/api` para `VITE_API_PROXY` (padrão localhost:3001), além de `define` para variáveis GEMINI. **Verificar antes de build se há referências consumidoras e se o artefato inclui segredos; não se constatou vazamento em runtime.**
- `utils/supabaseServer.ts`: Supabase server-side criado com `SUPABASE_SERVICE_ROLE_KEY`, portanto políticas RLS não são, por si, limite suficiente de autorização da rota.
- `api/comunicados.ts`: roteador POST por `action` para operações públicas/administrativas; verificação central mandatória de identidade e permissão por ação não foi identificada no trecho inspecionado. Exigir inventário completo de actions e provas de autorização.
- `components/LoginPage.tsx`: login Supabase Auth via `/api/auth/login` e fallback `USER_LOGIN`; credencial de desenvolvimento restrita a `localhost` na interface; `App.tsx` mantém perfil em `localStorage` e aplica guards de menu. **Guards front-end não são autorização server-side.**
- `services/presencaBusinessService.ts`: check-in legado deduplica por pessoa/telefone e dia, grava `encontro_id: null` e atualiza `pessoas.telefone` quando divergente; incompatível com decisão de sessão + pendência ADM. Preservar até migração controlada.
- `components/PublicPresenceForm.tsx`: consome `GET_PUBLIC_PRESENCE_DATA`, `MARK_PRESENCE` e hoje permite atualização de telefone; tela nova deverá ter contrato apartado e consulta mínima.
- `docs/SPEC-PRESENCA-SESSOES-QR-CHECKIN.md`: documento anterior diverge de decisão nova de duplas/dois círculos, encontreiros no pós-encontro e conciliação exclusiva do ADM após fechamento; atualizar na fase documental seguinte.
- SQL 02 de 2026-10-12: 1.220 pessoas, 79 sem telefone, 159 números compartilhados entre 343 pessoas (até 13 por número), 477 presenças sem `encontro_id`; quatro identidades históricas pendentes. Segurança RLS exige gate separado.

## 2. Vercel — observações verificadas e pendências
**Projeto confirmado:** `eac-painel-adm-v2`, ID `prj_2MUWGh2SjDQ1hbjVhShl86ACjeig`; framework **Vite**.

**Deployments consultados:**
- Preview da branch no SHA `3efb5add8742d0f2dd14d4b34560d3b4c58d2d4d`: READY, id `dpl_C2JCWdGwbKQPfJSghakah6vUamjP`.
- Preview documental anterior SHA `1d92ceba638b1dd5cb365b0f03ac64cd4c84a6a4`: READY, id `dpl_BQ8tucJdesYm9qAeNre75hzuVhon`.
- Produção `main` SHA `febe6afca0766c77f0048db7f3456585bb89ce04`: READY, id `dpl_8PvejPwX2JvztspYhRCRKCoMByom`.
- `develop` SHA `99d57385b165e9d24756bb2f4e22b7c6145fb155`: READY, preview id `dpl_3FatD2WFVUwnEU8yJVrxQrSxeBji`.

**Ainda não medidos:** consumo da quota por tipo, banda, funções, duração/CPU, latência p95, tamanho efetivo do bundle, duração de build, custo, número de funções ou requests. **Não atribuir limites da Vercel a causa específica sem esses dados.** READY informa status do deployment, não homologação funcional.

## 3. Backlog priorizado de infraestrutura
| Item | Prioridade | Atividade | Evidência exigida | Condição de aceite |
|---|---|---|---|---|
| INF-01 | P0 | Mapear todas as actions em `/api/comunicados` e endpoints; classificar público, autenticado, ADM, sensível, leitura e escrita | Matriz rota/action/ator/autorização/consumidor | Nenhuma action privilegiada sem verificação server-side |
| INF-02 | P0 | Estabelecer uma identidade de operador verificável, compatibilizando Supabase Auth/legado | Fluxo de autenticação e revogação, testes de token inválido | Sem confiança em email/header/localStorage enviados pelo cliente |
| INF-03 | P0 | Projetar proteção para service role, RLS e leitura pública; aplicar depois com migração controlada | Plano de risco/regressão, revisão de consumidores, testes | Dados de pessoas não enumeráveis anonimamente |
| INF-04 | P1 | Medir Vercel: deployments, build, bundle, bandwidth, funções, limites efetivos e latências | Relatório baseline antes/depois | Otimizar somente gargalos medidos |
| INF-05 | P1 | Separar domínio de presença e contratos de APIs, sem alterar fluxo atual | Diagramas + contratos request/response/erros | Legado intacto e API futura não o reutiliza de modo inseguro |
| INF-06 | P1 | Planejar gateway de mocks sem Supabase nem chamadas externas | Testes automáticos de isolamento | Mock Preview não acessa base real; produção não habilita mock |
| INF-07 | P1 | Incluir plano de typecheck, lint, unitários, integração e Playwright | Comandos executáveis e baseline | Falhas documentadas, sem falsos PASS |
| INF-08 | P2 | Inventariar chamadas grandes, fan-out, paginação, cache e refetch | Traços e contadores de requests/payload | Redução validada sem regressão |
| INF-09 | P2 | Revisar rotas SPA/serverless, bibliotecas redundantes, segredos, env e observabilidade | Checklist por módulo | Preview e produção estáveis |
| INF-10 | P2 | Matriz operacional de regressão de todos os módulos | Casos por perfil e jornada | Histórico, cadastros e formulários preservados |

## 4. Estratégia de execução
1. Documentar rotas/actions e seus consumidores, priorizando operações de gravação.
2. Definir boundary de autenticação/autorização do backend; seguir estritamente a identidade verificada no servidor.
3. Obter baseline do Vercel e de build sem alterações em produção.
4. Refatorar componentes comuns em commits pequenos e reversíveis, **na branch**, depois de estabelecer testes que detectem regressão.
5. Preparar adaptador MOCK isolado; dados sintéticos para todo o painel e Presença V2.
6. Homologar navegação, login, autorizações, cadastros, inscrições, círculos, agenda, comunicação, encontreiros, camisas/formulários e presença legada no Preview.
7. Só então iniciar desenvolvimento da Presença V2, respeitando sessões por dupla/pós geral, perfis mistos, telefone pendente e conciliação exclusiva ADM após encerramento.

## 5. Riscos e bloqueios
- Alteração direta de RLS no banco em uso pode derrubar telas legadas. Exige inventário de consumidores, aprovação e rollback.
- `service_role` aplicado a actions genéricas exige verificação de identidade server-side antes de qualquer aumento de funcionalidade.
- Mocks só são válidos com bloqueio real de rede para Supabase, não apenas troca visual de dados.
- Passwordless para tios é hipótese de UX, não autorização para links administrativos permanentes.
- Diagnósticos de SQL não revelam configurações, métricas de faturamento ou integrações de runtime da Vercel.

## 6. Checkpoint
- [x] Branch de trabalho existente.
- [x] Inspeção estática dos arquivos estruturais principais.
- [x] Projeto e deployments Vercel identificados.
- [x] Backlog de estabilização e gates definidos.
- [ ] Inventário exaustivo do repo/rotas e actions.
- [ ] Medições quantitativas completas Vercel + testes reais de build.
- [ ] Refatoração e MOCK implementados.
- [ ] Matriz de Human Validation executada.
- [ ] Autorização para migrar dados/mesclar/produção.

**Decisão:** Etapa 1 iniciada. Documento e evidências apenas; sem alterações funcionais, sem migrations, sem merge.
