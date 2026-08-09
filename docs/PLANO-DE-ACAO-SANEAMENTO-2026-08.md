# Plano de Ação — Saneamento Técnico, Migração e Reestruturação de Menu

**Data da auditoria:** 2026-08-07 · **Revisado:** 2026-08-07 (reprioriza Google Script e adiciona cuidados obrigatórios)
**Origem:** Auditoria de estrutura, UX/UI e infraestrutura do painel (branch `develop`, commit `08989cf`), solicitada para preparar a reorganização do menu operacional.

Este documento existe para dar **controle e sequência** ao trabalho de saneamento identificado na auditoria. Cada fase tem objetivo, motivo (achado da auditoria) e critério de "pronto".

**Regra de execução (combinada com o time):**
1. Uma fase começa e termina antes da próxima começar — sem misturar mudanças de fases diferentes no mesmo commit/PR.
2. Cada fase concluída vai para `develop` para validação, antes de iniciar a fase seguinte.
3. Nenhuma fase pode remover ou quebrar sub-rotina em uso, mesmo que não esteja no radar principal da fase (ver "Cuidados obrigatórios" abaixo).

---

## Cuidados obrigatórios (valem para todas as fases, não é uma fase isolada)

### 1. Sub-rotinas vinculadas não podem ser perdidas
Várias telas hoje têm ações e dados que dependem umas das outras por baixo do capô, mesmo quando a navegação parece simples. Antes de mexer em qualquer uma dessas telas (mover, separar, reagrupar no menu), **mapear e documentar** todas as ações/serviços que ela dispara, principalmente:
- **Triagem de Inscrições / Inscrições Prioritárias**: priorização grava em `Inscricoes_Prioritarias`; a tela de Inscrições Prioritárias abre a subtela de Distribuição de Círculos; a permissão de `inscricoes_prioritarias` hoje libera `visitacao` automaticamente (regra em `buildAllowedModules`, `api/auth/login.ts`) — se essas telas forem reagrupadas, essa relação de permissão precisa ser preservada ou conscientemente redesenhada, nunca perdida sem decisão explícita.
- **Distribuição de Círculos**: depende do encontro/edição selecionado e do estado de priorização; usada também para montar a imagem exportável (`html2canvas`).
- **Visitação**: opera sobre a fila de priorizados (`VisitacaoPriorizado`), com histórico (`VisitacaoHistoricoItem`) e questionário próprio — não é uma tela solta.
- **Presença**: tem resumo por círculo e por encontro, hoje vive como subtela de Cadastro de Encontrista (`/cadastro/presenca`).
- **Equipes**: hoje compartilha componente e permissão com Cadastro de Encontreiros (`EncontreiroPage` com `initialView="equipes"`).
- **Encontros**: hoje compartilha componente com Ajustes (`SettingsPage` com `focusEncontros`).
- **Disparos**: alguns dependem de audiência montada a partir de outras telas (`BUILD_NON_ENROLLED_DISPATCH_AUDIENCE` cruza dados de Não Inscritos/Priorização).

Nenhuma dessas amarras pode simplesmente sumir numa reorganização de menu — cada uma precisa aparecer no checklist de "de-para" da fase que tocar a tela correspondente antes de a fase ser considerada pronta.

### 2. Identidade visual: usar o que já existe, sem propor marca nova
- **Logo**: usar a logo real já em produção (hoje carregada de `LOGO_URL` em `Header.tsx`), não substituir por qualquer marca genérica.
- **Cores**: manter a paleta atual do painel (azul marinho `#073b68` como cor de marca/header, e as demais cores já usadas nos componentes). O protótipo de tela enviado anteriormente foi só para validar **estrutura de menu e organização de informação** — não é uma proposta de rebranding, e a implementação real deve usar a cor e a logo atuais, não a paleta ilustrativa daquele protótipo.

---

## Fase 0 — Segurança (prioridade imediata, antes de qualquer outra fase)

**Por quê:** falha de autorização identificada em `utils/apiAuth.ts` que pode liberar acesso à API sem autenticação real.

- [x] ~~Confirmar se `EAC_AUTH_REQUIRE_HEADER=true` está setada no ambiente de produção~~ — superado: `authorizeRequest()` agora nega por padrão (fail-closed) independente dessa env; o fallback antigo virou opt-in explícito via `EAC_AUTH_ALLOW_FALLBACK=true` (nunca habilitar em produção). Commit `d5520db`.
- [x] Substituir a identidade por header não assinado (`x-eac-user-email`) por validação de sessão real do Supabase Auth (JWT) no servidor — feito via cookie `httpOnly` (`utils/authSession.ts`) validado contra `supabase.auth.getUser()`; perfil resolvido por `auth_user_id` verificado. Commits `55e514a`.
- [ ] Revisar `docs/US-061-proteger-dados-sensiveis-rls.sql` — hoje as policies de RLS são `using (true)` para qualquer usuário `authenticated`, e o backend usa `service_role` (que ignora RLS). Redesenhar RLS para refletir papéis reais, não apenas "existe". **Bloqueado:** aguardando acesso ao projeto Supabase do EAC (`niagdoowqmngxjcrmstd`) na integração conectada.
- [ ] Rodar `get_advisors` (Supabase) do tipo `security` no projeto de produção e tratar os itens críticos apontados. **Bloqueado:** mesmo motivo acima.

---

## Fase 1 — Consolidar a camada de API (parar de manter duas implementações)

**Por quê:** existem duas árvores de rotas fazendo a mesma coisa — `api/*.ts` (Vercel Function no padrão Pages Router) e `app/api/*/route.ts` (Next.js App Router) — com lógica duplicada e risco real de divergência (já existia um `app/api/inscricoes/create/route-old.ts` esquecido).

**Decisão (confirmada por evidência de código, não só suposição):** manter `api/*.ts` e remover `app/api/` inteira. Motivos:
- `vercel.json` declara `"framework": "vite"`; não existe `next.config.js/.mjs/.ts` no repo; `package.json` não tem nenhum script `next build/dev/start` (só `vite`); `app/` não tem `layout.tsx`/`page.tsx`, só as `route.ts` — ou seja, isso nunca foi uma app Next.js de verdade rodando em produção, é uma migração abandonada.
- Rastreei **todo** `fetch`/`getJson`/`postJson` para `/api/...` no frontend (`components`, `services`, `App.tsx`, `utils`) e cruzei com as duas árvores: **100% das chamadas realmente alcançáveis pela UI têm handler em `api/*.ts`**. As únicas rotas exclusivas de `app/api/*/route.ts` (`nao-inscritos*`, `presenca*`, `encontreiros/create`, `sync/calendar`, `circulos-distribuidos/mover`, `circulos-distribuidos/salvar`, `inscricoes-prioritarias/distribuir`) não são chamadas por nenhum caminho de UI navegável — no caso de `nao-inscritos`, o próprio `MembersPage.tsx` tem a view inteira ("Não Inscritos") órfã: existe `openNonEnrolledView()` mas **nenhum botão no JSX chama essa função**, confirmado também pelo usuário em produção ("não tenho mais essa aba").
- `api/auth/login.ts` e demais arquivos de `api/*.ts` importam `NextApiRequest`/`NextApiResponse` de `next` só como **tipo** (`import type`) — por isso a dependência `next` no `package.json` deve ser mantida, mesmo removendo `app/api/`.

- [x] Decidir qual árvore fica — **`api/*.ts`** (App Router nunca esteve em produção; ver evidência acima).
- [x] Confirmar qual árvore está de fato servindo em produção — feito por análise estática (build config + rastreamento de chamadas), sem acesso ao dashboard Vercel do projeto real nesta sessão; usuário confirmou no app publicado que a feature exclusiva do `app/api` (Não Inscritos) não existe mais na UI.
- [x] Remover a árvore `app/api/` inteira (23 arquivos `route.ts`).
- [x] Remover arquivos órfãos (`route-old.ts`).
- [ ] Avaliar, em fase separada, remover o código morto correspondente em `MembersPage.tsx` (view "Não Inscritos", `openNonEnrolledView`, `handleSearchNonEnrolled`, `handleUpdateInterest`, ~700 linhas) — não removido agora para manter o diff desta fase pequeno e revisável.
- [ ] Documentar no README qual é o padrão de API oficial do projeto daqui pra frente (`api/*.ts`, convenção Vercel Functions).

---

## Fase 2 — Higiene de repositório

**Por quê:** repo com muitos scripts de depuração soltos na raiz, arquivos de resultado versionados, e texto corrompido (mojibake) visível ao usuário final.

- [ ] Mover os scripts `check-*.mjs`, `cleanup*.mjs`, `test-*.mjs`, `validate-*.mjs`, `temp-query.mjs`, etc. da raiz para `scripts/` (ou remover os que não são mais usados).
- [ ] Remover do versionamento arquivos de resultado pontuais (`resultados/*.json`, `response.json`, `payload-*.json`) e adicionar ao `.gitignore`.
- [ ] Corrigir o mojibake (`Ã§Ã£o` etc.) em `constants.tsx` e demais strings visíveis ao usuário.
- [ ] Padronizar encoding UTF-8 em todo o projeto para não reintroduzir o problema.

---

## Fase 3 — Testes automatizados e CI

**Por quê:** não existe `.github/workflows`, nem framework de teste configurado — todo o controle de qualidade hoje é manual.

- [ ] Adicionar um runner de teste (ex.: Vitest) e criar testes mínimos para as rotas de API críticas (login, disparos, distribuição de círculos).
- [ ] Criar workflow de GitHub Actions com lint + build + testes rodando em toda PR para `develop`/`main`.
- [ ] Bloquear merge sem CI verde (branch protection).

---

## Fase 4 — Modelo de permissões (matriz por módulo)

**Por quê:** a lógica de "quem vê o quê" está duplicada em três lugares (`App.tsx`, `Header.tsx`, `api/auth/login.ts`) como cadeias de `if`, com sobreposições que já causam vazamento de permissão (`equipes` libera com `encontreiros`; `encontros` libera com `settings`; `inscricoes_prioritarias` libera `visitacao`). Já identificado no roadmap interno do time como US-095.

- [ ] Implementar a matriz de permissões por módulo/ação (US-095), substituindo as cadeias de `if`.
- [ ] Documentar (não necessariamente eliminar) as sobreposições intencionais de permissão — ver "Cuidados obrigatórios" acima.
- [ ] Centralizar a checagem de acesso em um único lugar (hook/serviço), usado tanto pelo menu quanto pelas rotas de API.

---

## Fase 5 — Separar as telas "escondidas" (pré-requisito técnico do novo menu)

**Por quê:** `Equipes` hoje é `EncontreiroPage` com `initialView="equipes"`, e `Encontros` hoje é `SettingsPage` com `focusEncontros`. Para virarem itens de primeiro nível de verdade no novo menu, precisam ser componentes próprios — **sem perder nenhuma sub-rotina das listadas em "Cuidados obrigatórios"**.

- [ ] Mapear e documentar, tela por tela, todas as ações/dependências antes de separar (checklist de "de-para").
- [ ] Extrair `Equipes` de dentro de `EncontreiroPage.tsx` para um componente/rota própria.
- [ ] Extrair `Encontros` de dentro de `SettingsPage.tsx` para um componente/rota própria (mantendo `Ajustes` como tela separada de configuração real do sistema).
- [ ] Decidir e implementar onde entra **Distribuição de Círculos** na nova estrutura (recomendação: dentro de `Encontros`).
- [ ] Decidir se `Inscrições Prioritárias` e `Triagem de Inscrições` viram abas de uma única tela `Inscrições e Triagem`, preservando todas as ações atuais de cada uma.

---

## Fase 6 — Reestruturação do menu operacional

**Por quê:** objetivo original desta auditoria. Só entra depois da Fase 5 (senão o menu aponta pra telas que ainda não existem de forma independente).

- [ ] Implementar navegação em 2 níveis (grupo > item): Início / Pessoas (Inscrições e Triagem, Cadastro de Encontristas, Cadastro de Encontreiros, Visitação) / Encontros / Equipes / Presença / Comunicação (Comunicados, Disparos, Calendário) / Gestão (Usuários, Logs, Ajustes, Ajuda).
- [ ] Sidebar fixa e colapsável no desktop; accordion agrupado no mobile; breadcrumb "Seção > Página".
- [ ] **Usar a logo e a cor de marca atuais do painel** (ver "Cuidados obrigatórios").
- [ ] Atualizar `utils/navigationRoadmap.ts` e resolver a divergência com `docs/US-ROADMAP-MODULOS-OPERACIONAIS.md` (hoje todos os 17 itens já estão `enabled: true`, mas o documento descreve um gate por prontidão de US).

---

## Fase 7 — Refatoração dos componentes gigantes

**Por quê:** `MembersPage.tsx` (3.714 linhas), `InscricoesPrioritariasPage` (1.301), `EncontreiroPage` (1.228), `PresencePage` (1.130) reimplementam cada um seu próprio padrão de filtro/card/modal em vez de reaproveitar `PersonCard`, `Badge`, `StatCard`.

- [ ] Quebrar `MembersPage.tsx` em subcomponentes (lista, filtros, modal de edição, exportação).
- [ ] Repetir para `InscricoesPrioritariasPage`, `EncontreiroPage`, `PresencePage`.
- [ ] Consolidar os padrões repetidos de card/filtro/modal em componentes compartilhados reais.

---

## Fase 8 — Finalizar a migração Google Sheets → Supabase (última fase, escopo reduzido)

**Por quê:** rebaixada de prioridade a pedido do time — os disparos abaixo ainda não estão em uso hoje, então não bloqueiam nada. Os disparos que já rodam corretamente via Supabase **não entram nesta fase e não devem ser tocados/quebrados** por ela.

- [ ] Migrar (somente quando for retomar o uso) as ações que hoje só existem no Apps Script:
  - [ ] `EXECUTE_EVENTOS` (disparo "Eventos da Semana")
  - [ ] `EXECUTE_WAITLIST_NON_ENROLLED` (disparo "Aviso Fila de Espera - Não Inscritos")
  - [ ] `EXECUTE_INTEREST_CONFIRMATION` (disparo "Confirmação de Interesse - Fila")
  - [ ] `EXECUTE_COMUNICACAO_NAO_PARTICIPACAO_EAC` (disparo "Comunicação não participação EAC")
  - [ ] `EXECUTE_EMERGENCIA_NOV2025` (disparo "Emergência Pós Montagem - Nov/2025")
  - [ ] `CLEAR_DISPATCH_STATUS` (limpar status de disparo)
- [ ] Corrigir (quando for retomar) o disparo "Confirmação de Inscrição (Supabase)" (d8): ação inconsistente entre front (`EXECUTE_CONFIRM_INSCRITOS`) e backend (`EXECUTE_CONFIRM_NAO_INSCRITOS`).
- [ ] Decidir o destino do disparo "Agradecimento de Inscrição" (d1): sem `action` mapeada hoje, botão não faz nada.
- [ ] Só depois de migrar os itens acima: remover da tela Ajustes o campo de URL do Google Web App, remover a exigência de `CHAVE_MESTRA`, remover o fallback do Google Script e a env `EAC_ALLOW_SHEETS_FALLBACK_READ`, apagar `google-script/*.gs`, e limpar README/`.env.vercel.example`.

**Critério de pronto da fase:** nenhuma ação do sistema depende de `script.google.com` — mas só executar esta fase depois de todas as anteriores, e só migrar os disparos quando eles voltarem a ser usados.

---

## Ordem de execução (atualizada)

```
Fase 0 (segurança)  →  Fase 1 (API única)  →  Fase 2 (higiene)  →  Fase 3 (testes/CI)
        →  Fase 4 (permissões)  →  Fase 5 (separar telas, sem perder sub-rotinas)
        →  Fase 6 (menu novo, com logo/cores atuais)  →  Fase 7 (refatoração dos componentes grandes)
        →  Fase 8 (fim do Google Script — só os disparos ainda não usados, por último)
```

Cada fase: implementar → validar em `develop` → só então iniciar a próxima. Sem misturar fases no mesmo commit/PR.
