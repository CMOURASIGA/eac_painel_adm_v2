# EAC — Checkpoint 04–05: isolamento sintético e autorização para iniciar Presença V2
**Data:** 2026-10-12  
**Branch:** `feat/presenca-v2-reestruturacao-mock`  
**Status:** PREPARAÇÃO IMPLEMENTADA PARCIALMENTE / GATE DE INÍCIO PRESENÇA V2  
**Produção/Supabase:** não alterados.

## 1. Entregas efetivas
- `docs/architecture/EAC_INFRA_CHECKPOINT_03_INVENTARIO_ACTIONS.md`: mapa estático das 64 ações da rota / 66 casos no serviço, duas diferenças de roteamento.
- `scripts/audit-api-actions.mjs` e `npm run audit:api-actions`: auditoria por análise estática, com classificação heurística. Ainda não substitui validação de autorização.
- `tests/fixtures/eac-presenca-v2.synthetic.mjs`: fixture determinística e inteiramente sintética da edição 37 com 6 círculos, três duplas, participantes encontristas, encontreiros e ambos, telefone compartilhado, ausência de telefone, sessão aberta e encerrada.
- `tests/eac-presenca-v2-fixtures.test.mjs`: seis testes de integridade dessa fixture, incluindo detecção de dupla inválida.
- `npm run test:fixtures`: executa os testes via `node --test`.

**Atenção:** a fixture é **apenas material de testes**. Não existe roteamento MOCK na UI, nem garantia implementada de bloqueio de rede, nem banco fake substituindo o Supabase. Não afirmar que a aplicação está funcionando em modo mock.

## 2. Mapeamento inicial de consumidores
- `App.tsx` consome sync, eventos, comunicados, logs e ações de disparo através de `callApiProxy`.
- `components/PublicPresenceForm.tsx` consome `GET_FORMULARIOS_CONFIG`, `GET_PUBLIC_PRESENCE_DATA` e `MARK_PRESENCE`, sem conceito formal de sessão.
- `components/PresencePage.tsx` usa `services/presencaService.ts` e painel administrativo legado.
- `components/LoginPage.tsx` usa `/api/auth/login` com fallback `USER_LOGIN` via `/api/comunicados`.
- `services/presencaBusinessService.ts` atualiza cadastro durante check-in, condição incompatível com novo desenho.
- Mapear ainda todo o restante do repositório (API e consumidores) antes de mexer no gateway central.

## 3. Critérios de gate (não confundir code commit com homologação)
| Gate | Situação | Exigência |
|---|---|---|
| Documentação funcional e dados Supabase | OK com ressalvas | quatro identidades históricas pendentes, resolver antes de produção |
| Inventário parcial de actions e consumidores | PARTIAL | mapear demais endpoints e consumidores |
| Baseline da Vercel | PARTIAL | projeto/framework/deployments OK, cotas/custos/p95/bundle não medidos |
| Isolamento de mocks | NOT TESTED / NOT IMPLEMENTED | adapter de dados + garantia fail-closed sem Supabase e sem outros serviços reais |
| Autorização backend | NOT IMPLEMENTED | contexto autenticado e verificado, default deny, testes negativos, sem confiar em headers de cliente |
| Regressões operacionais | NOT TESTED | fluxos principais em desktop/mobile, testes automatizados |
| Testes de fixtures | SOURCE COMMITTED, NOT RUN | executar `npm run test:fixtures` |
| V2 presença / UI + domínio | NOT STARTED | início após decisão expressa e fixação de arquitetura |

## 4. Arquitetura do próximo incremento isolado (Presença V2)
**Fase A: infraestrutura mock**, antes das telas V2:
- Criar `PresenceRepository`/adaptador com fonte `mock` estritamente server-side e ambiente explicitamente permitido; recusar mock em produção. Fixture não deve ser importada no bundle público.
- Expor operações testáveis de domínio puras: montar público elegível; listar por sessão com minimização; conferir telefone com ambiguidade; gerar solicitação; confirmar presença idempotentemente; encerrar sessão; impedir reabertura; conciliar depois por ADM.
- Não reutilizar `MARK_PRESENCE` legado para novo check-in.
- Separar interfaces públicas das administrativas; integrar autenticação somente após identificar usuário real e permissões verificadas.
- Testes cobrindo encontreiro sem histórico de encontrista, ambos papéis, duas reuniões no mesmo dia, duplicidade simultânea, telefone compartilhado, falta de telefone, sessão fechada, correção e ADM pós-fechamento.
- Planejar mock em build isolada/preview protegido, **não simplesmente opção no menu de produção**.

**Fase B: primeira tarefa do desenvolvimento Presença V2**, após gates A:
1. Implementar contrato tipado de domínio + `PresenceRepository` puramente mock.
2. Criar fluxo de sessão por dupla e pós-encontro, ainda sem Supabase.
3. Testar permissões e conciliação idempotente.
4. Disponibilizar preview protegido somente depois de smoke test.

## 5. Regra de continuidade
Usuário autorizou avanço até chegar ao início do desenvolvimento da Presença V2, preservando o fluxo de infraestrutura primeiro. **Não afirmar que a infraestrutura já está homologada:** o próximo trabalho obrigatório é completar e testar o isolamento do mock, segurança do servidor e regressões. Requer execução dos testes (não inferir PASS). Não realizar merge em main/develop, deploy de produção ou DDL.
