# EAC INFRA — Checkpoint 03: inventário estático de ações
**Data:** 2026-10-12  
**Branch:** `feat/presenca-v2-reestruturacao-mock`  
**Status:** AUDITADO ESTATICAMENTE; controles efetivos ainda não validados por testes.

## Resultados reproduzíveis
- `api/comunicados.ts` declara **64** ações `supabasePreferredActions`.
- `utils/supabaseActions.ts` trata **66** comparações exatas `ctx.action === ...`.
- Ações no serviço, mas ausentes do conjunto preferencial da rota: `UPDATE_NON_ENROLLED_INTEREST`, `EXECUTE_CONFIRM_INSCRITOS`. Elas podem ser internas, legadas, ou roteadas via outro caminho; **não remover** sem rastrear consumidores/fallback.
- Por heurística de prefixos nas **64 ações da rota**: **31 READ**, **32 WRITE/SIDE EFFECT**, **1 AUTH**. Isso não é prova de segurança nem da natureza exata de cada operação.
- O `scripts/audit-api-actions.mjs` adicionado no Checkpoint 02 está disponível para execução com `npm run audit:api-actions`. Não foi executado em CI neste checkpoint.
- A rota `/api/comunicados` despacha ações com cliente Supabase privilegiado por `SERVICE_ROLE_KEY`, sem guarda central de autenticação/escopo identificada no roteador. Prioridade P0 de revisão antes de adicionar endpoints ou aumentar privilégios.

## Inventário inicial por ação
A classificação é **provisória**. `PUBLIC CANDIDATE` não equivale a autorização de acesso. "NOT VERIFIED" é intencional até verificar identidade, consumidor, validação de payload, response e auditoria.

| Ação | Grupo heurístico | Acesso esperado para investigar | Autorização efetiva |
|---|---|---|---|
| `ATUALIZAR_NAO_INSCRITOS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `BUILD_NON_ENROLLED_DISPATCH_AUDIENCE` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `DELETE_COMUNICADO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `DELETE_ENCONTREIRO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `DELETE_EVENT` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `DELETE_MEMBER` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `DELETE_USER` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `EXECUTE_ANIVERSARIANTES` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `EXECUTE_COMUNICADO_99` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `EXECUTE_DISTRIBUICAO_CIRCULOS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_BANDA_CANDIDATE_DETAIL` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_BANDA_PUBLIC_CONFIG` | READ* | PUBLIC CANDIDATE — review | NOT VERIFIED |
| `GET_BANDA_RESPONSAVEIS_DASHBOARD` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_CIRCULOS_DISTRIBUIDOS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_CIRCULO_ATUAL_MAPA` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_COMUNICADOS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_CONTEXT_HELP` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_DISPARO_EXECUCOES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_EMAIL_CALLS_BY_PERSON` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_EMAIL_STATUS_SUMMARY` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_ENCONTREIROS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_ENCONTREIRO_EQUIPES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_ENCONTREIRO_PUBLIC_BY_TELEFONE` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_ENCONTROS_EQUIPES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_ENCONTRO_EQUIPES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_EQUIPES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_EVENTS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_FORMULARIOS_CONFIG` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_HISTORICO_ENCONTREIRO_EQUIPES` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_INSCRICOES_PRIORITARIAS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_LOGS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_MEMBERS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_NON_ENROLLED` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_OPERATIONAL_LOGS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_PRESENCE` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_PUBLIC_PRESENCE_DATA` | READ* | PUBLIC CANDIDATE — review | NOT VERIFIED |
| `GET_SAFE_SETTINGS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_SYNC_STATUS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `GET_USERS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `IMPORT_CALENDAR_2026_EXTERNOS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `LOG_DISPATCH_DESTINATARIOS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `LOG_DISPATCH_EXECUTION` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `MARK_PRESENCE` | WRITE/SIDE EFFECT* | PUBLIC CANDIDATE — review | NOT VERIFIED |
| `MOVE_CIRCULO_PARTICIPANTE` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `NORMALIZE_ENCONTREIRO_WHATSAPP` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `PRIORITIZE_NON_ENROLLED` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `RETRY_DISPARO_FALHAS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_BANDA_INTEREST` | WRITE/SIDE EFFECT* | PUBLIC CANDIDATE — review | NOT VERIFIED |
| `SAVE_COMUNICADO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_ENCONTREIRO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_ENCONTREIRO_EQUIPES` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_ENCONTRO_EQUIPE_MEMBROS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_EVENT` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_FORMULARIOS_CONFIG` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_MEMBER` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SAVE_USER` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SEARCH_BANDA_CANDIDATES` | READ* | PUBLIC CANDIDATE — review | NOT VERIFIED |
| `SEARCH_MEMBERS` | READ* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `SET_INSCRICAO_CIRCULO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `START_DISPARO_EXECUCAO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `UPDATE_DISPARO_EXECUCAO_STATUS` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `UPDATE_NON_ENROLLED_RECADO` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `UPDATE_NON_ENROLLED_RECORD` | WRITE/SIDE EFFECT* | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |
| `USER_LOGIN` | AUTH | SERVER AUTH REQUIRED unless documented public | NOT VERIFIED |

## Contrato obrigatório para cada operação sensível
1. Cliente envia credencial comprovável, nunca apenas `localStorage`, cabeçalho de email ou `operator` declarado no body.
2. Servidor valida sessão/usuário e status atual; consulta permissões em fonte autorizada.
3. Servidor recusa por padrão ações e escopos não previstos; ADM não deve ser inferido de email do navegador.
4. O serviço de negócio recebe o contexto validado pelo servidor, não role/pass-through do cliente.
5. Escritas devem ser idempotentes quando repetição for possível, ter rate limit e auditoria conforme risco.
6. Ações públicas são endpoints específicos, com retorno mínimo e sem possibilidade de consultar listas completas de menores.

## Bloqueios estruturais
- **P0 — não modificar `/api/comunicados` em massa sem testes dos consumidores**: vários módulos legados podem depender do gateway e do fallback de Sheets.
- **P0 — impedir acesso privilegiado sem contexto autenticado** em qualquer novo endpoint; contenção do legado requer rollout controlado.
- **P1 — incluir suíte de contrato de API e testes negativos** antes de alterar autorização; sem teste de escrita no banco real.
- **P1 — medir latência e payload das ações com maior volume**, sobretudo as listas.
- **P1 — não conectar mocks ao Supabase**, inclusive em casos de erro, e não publicar qualquer dado real de adolescentes.

## Próximas tarefas
1. Inventariar todos os endpoints além de `/api/comunicados`, sua rota, método e consumidores.
2. Mapear chamadas `postComunicadosAction` e `fetch` no cliente, incluindo módulos de cadastro, inscrição, agenda, comunicação e histórico.
3. Produzir a especificação de guard de backend e estratégia de coexistência com `USER_LOGIN`, por migração incremental.
4. Implementar primeiro testes e uma rota de exemplo protegida na branch, sem modificar acesso do legado.
5. Baseline Vercel: métricas quantitativas ainda não coletadas.

## Limites
Nenhuma evidência de exploitabilidade ou acesso indevido foi testada. Não houve migração, alteração no banco, merge ou produção. Nenhum teste E2E ou build realizado.
