# Plano de Ação — Saneamento Técnico, Migração e Reestruturação de Menu

**Data da auditoria:** 2026-08-07
**Origem:** Auditoria de estrutura, UX/UI e infraestrutura do painel (branch `develop`, commit `08989cf`), solicitada para preparar a reorganização do menu operacional.

Este documento existe para dar **controle e sequência** ao trabalho de saneamento identificado na auditoria. Cada fase tem um objetivo, o que motivou ela (achado da auditoria) e critério de "pronto". Marcar os itens conforme forem concluídos.

---

## Fase 0 — Segurança (prioridade imediata, antes de qualquer outra fase)

**Por quê:** falha de autorização identificada em `utils/apiAuth.ts` que pode liberar acesso à API sem autenticação real.

- [ ] Confirmar se `EAC_AUTH_REQUIRE_HEADER=true` está setada no ambiente de **produção** na Vercel. Se não estiver, setar imediatamente — hoje, sem essa flag, uma requisição sem o header `x-eac-user-email` é autorizada (`fallback: true`) desde que exista um ADMIN ativo no sistema, o que é sempre verdade em produção.
- [ ] Substituir a identidade por header não assinado (`x-eac-user-email`, hoje lido do `localStorage` no client) por validação de sessão real do Supabase Auth (JWT) no servidor, em todas as rotas de API.
- [ ] Revisar `docs/US-061-proteger-dados-sensiveis-rls.sql` — hoje as policies de RLS são `using (true)` para qualquer usuário `authenticated`, e o backend usa `service_role` (que ignora RLS). Redesenhar RLS para refletir papéis reais, não apenas "existe".
- [ ] Rodar `get_advisors` (Supabase) do tipo `security` no projeto de produção e tratar os itens críticos apontados.

---

## Fase 1 — Consolidar a camada de API (parar de manter duas implementações)

**Por quê:** existem duas árvores de rotas fazendo a mesma coisa — `api/*.ts` (Pages Router / Vercel Function) e `app/api/*/route.ts` (App Router) — com lógica duplicada e risco real de divergência (já existe um `app/api/inscricoes/create/route-old.ts` esquecido).

- [ ] Decidir qual árvore fica (recomendação: `app/api/*/route.ts`, é o padrão atual do Next e está mais completa).
- [ ] Confirmar, olhando o build/deploy real da Vercel, qual árvore está de fato servindo em produção hoje.
- [ ] Migrar qualquer rota exclusiva de `api/*.ts` para `app/api/*/route.ts` e remover a árvore antiga.
- [ ] Remover arquivos órfãos (`route-old.ts` e afins).
- [ ] Documentar no README qual é o padrão de API oficial do projeto daqui pra frente.

---

## Fase 2 — Concluir a migração Google Sheets → Supabase e desligar o Apps Script

**Por quê:** a ideia é não depender mais do Google Script, mas hoje 6 disparos operacionais ainda passam por ele, e a configuração do sistema ainda exige a chave do Apps Script.

- [ ] Migrar para Supabase as ações que hoje só existem no Apps Script:
  - [ ] `EXECUTE_EVENTOS` (disparo "Eventos da Semana")
  - [ ] `EXECUTE_WAITLIST_NON_ENROLLED` (disparo "Aviso Fila de Espera - Não Inscritos")
  - [ ] `EXECUTE_INTEREST_CONFIRMATION` (disparo "Confirmação de Interesse - Fila")
  - [ ] `EXECUTE_COMUNICACAO_NAO_PARTICIPACAO_EAC` (disparo "Comunicação não participação EAC")
  - [ ] `EXECUTE_EMERGENCIA_NOV2025` (disparo "Emergência Pós Montagem - Nov/2025")
  - [ ] `CLEAR_DISPATCH_STATUS` (limpar status de disparo)
- [ ] Corrigir o disparo **"Confirmação de Inscrição (Supabase)"** (d8): o front dispara a ação `EXECUTE_CONFIRM_INSCRITOS`, mas o código só reconhece `EXECUTE_CONFIRM_NAO_INSCRITOS` — nenhuma das duas está cadastrada em `supabasePreferredActions`. Decidir o nome correto e ligar de fato ao Supabase.
- [ ] Corrigir o disparo **"Agradecimento de Inscrição"** (d1): não tem `action` mapeada em `App.tsx` — hoje o botão não faz nada. Decidir se o disparo deve existir (migrar para Supabase) ou ser removido do catálogo.
- [ ] Remover da tela **Ajustes** o campo de URL do Google Web App e qualquer texto que mencione o Apps Script.
- [ ] Remover a exigência de `CHAVE_MESTRA` em `/api/comunicados` (hoje retorna erro 500 se não estiver setada, mesmo em cenários já 100% Supabase).
- [ ] Remover o branch de fallback do Google Script em `api/comunicados.ts` e a env `EAC_ALLOW_SHEETS_FALLBACK_READ`.
- [ ] Apagar (ou mover para um repositório de arquivo histórico) `google-script/code.gs`, `google-script/fontes.gs`, `google-script/staging-sync.gs`, e despublicar o Web App em script.google.com.
- [ ] Remover do README a seção "Integração Google Apps Script" e do `.env.vercel.example` as variáveis `GOOGLE_WEBAPP_URL`, `NEXT_PUBLIC_GOOGLE_WEBAPP_URL`, `VITE_GOOGLE_WEBAPP_URL`, `CHAVE_MESTRA`.
- [ ] Remover o parâmetro `googleWebAppUrl` que ainda é repassado por `LoginPage.tsx` (o login em si já roda via Supabase Auth / ação `USER_LOGIN`).

**Critério de pronto da fase:** nenhuma ação do sistema depende de `script.google.com`; busca por `google_script`, `GOOGLE_WEBAPP_URL` e `CHAVE_MESTRA` no código não retorna mais nada em uso ativo.

---

## Fase 3 — Higiene de repositório

**Por quê:** repo com muitos scripts de depuração soltos na raiz, arquivos de resultado versionados, e texto corrompido (mojibake) visível ao usuário final.

- [ ] Mover os scripts `check-*.mjs`, `cleanup*.mjs`, `test-*.mjs`, `validate-*.mjs`, `temp-query.mjs`, etc. da raiz para `scripts/` (ou remover os que não são mais usados).
- [ ] Remover do versionamento arquivos de resultado pontuais (`resultados/*.json`, `response.json`, `payload-*.json`) e adicionar ao `.gitignore`.
- [ ] Corrigir o mojibake (`Ã§Ã£o` etc.) em `constants.tsx` e demais strings visíveis ao usuário — hoje aparece texto quebrado, por exemplo no nome de disparos na tela de Disparos.
- [ ] Padronizar encoding UTF-8 em todo o projeto (editor/commit hooks) para não reintroduzir o problema.

---

## Fase 4 — Testes automatizados e CI

**Por quê:** não existe `.github/workflows`, nem framework de teste configurado — todo o controle de qualidade hoje é manual.

- [ ] Adicionar um runner de teste (ex.: Vitest, já compatível com Vite) e criar testes mínimos para as rotas de API críticas (login, disparos, distribuição de círculos).
- [ ] Criar workflow de GitHub Actions com lint + build + testes rodando em toda PR para `develop`/`main`.
- [ ] Bloquear merge sem CI verde (branch protection).

---

## Fase 5 — Modelo de permissões (matriz por módulo)

**Por quê:** a lógica de "quem vê o quê" está duplicada em três lugares (`App.tsx`, `Header.tsx`, `api/auth/login.ts`) como cadeias de `if`, com sobreposições que já causam vazamento de permissão (`equipes` libera com `encontreiros`; `encontros` libera com `settings`). Isso já está identificado no roadmap interno do time como US-095.

- [ ] Implementar a matriz de permissões por módulo/ação (US-095), substituindo as cadeias de `if`.
- [ ] Corrigir as sobreposições indevidas de permissão citadas acima.
- [ ] Centralizar a checagem de acesso em um único lugar (hook/serviço), usado tanto pelo menu quanto pelas rotas de API.

---

## Fase 6 — Separar as telas "escondidas" (pré-requisito técnico do novo menu)

**Por quê:** `Equipes` hoje é `EncontreiroPage` com `initialView="equipes"`, e `Encontros` hoje é `SettingsPage` com `focusEncontros`. Para virarem itens de primeiro nível de verdade no novo menu, precisam ser componentes próprios.

- [ ] Extrair `Equipes` de dentro de `EncontreiroPage.tsx` para um componente/rota própria.
- [ ] Extrair `Encontros` de dentro de `SettingsPage.tsx` para um componente/rota própria (mantendo `Ajustes` como tela separada de configuração real do sistema).
- [ ] Decidir e implementar onde entra **Distribuição de Círculos** na nova estrutura (hoje não está contemplada na proposta de menu, mas é uma tela real e usada — recomendação: dentro de `Encontros`, por ser uma organização específica de uma edição do encontro).
- [ ] Decidir se `Inscrições Prioritárias` e `Triagem de Inscrições` (hoje duas telas/menus separados) viram abas de uma única tela `Inscrições e Triagem`, conforme a proposta de menu.

---

## Fase 7 — Reestruturação do menu operacional

**Por quê:** objetivo original desta auditoria. Só faz sentido implementar depois da Fase 6 (senão o menu aponta pra telas que ainda não existem de forma independente).

- [ ] Implementar navegação em 2 níveis (grupo > item), com base na proposta:
  - Início
  - Pessoas → Inscrições e Triagem, Cadastro de Encontristas, Cadastro de Encontreiros, Visitação
  - Encontros (incluindo Distribuição de Círculos, a definir na Fase 6)
  - Equipes
  - Presença
  - Comunicação → Comunicados, Disparos, Calendário
  - Gestão → Usuários, Logs, Ajustes, Ajuda
- [ ] Sidebar fixa e colapsável no desktop (hoje só existe o drawer estilo mobile, mesmo em telas grandes).
- [ ] Accordion agrupado no drawer mobile.
- [ ] Breadcrumb "Seção > Página" no header.
- [ ] Atualizar `utils/navigationRoadmap.ts` e resolver a divergência com `docs/US-ROADMAP-MODULOS-OPERACIONAIS.md`: o documento descreve um gate de liberação por prontidão de US, mas no código todos os 17 itens já estão `enabled: true`. Ou implementar o gate de verdade, ou atualizar/remover o documento para não confundir o time.

---

## Fase 8 — Refatoração dos componentes gigantes

**Por quê:** `MembersPage.tsx` tem 3.714 linhas; `InscricoesPrioritariasPage` 1.301; `EncontreiroPage` 1.228; `PresencePage` 1.130. Cada um reimplementa seu próprio padrão de filtro/card/modal em vez de reaproveitar `PersonCard`, `Badge`, `StatCard` já existentes.

- [ ] Quebrar `MembersPage.tsx` em subcomponentes (lista, filtros, modal de edição, exportação).
- [ ] Repetir o mesmo tratamento para `InscricoesPrioritariasPage`, `EncontreiroPage`, `PresencePage`.
- [ ] Consolidar os padrões repetidos de card/filtro/modal em componentes compartilhados reais.

---

## Ordem recomendada de execução

```
Fase 0 (segurança)  →  Fase 1 (API única)  →  Fase 2 (fim do Google Script)
        →  Fase 3 (higiene)  →  Fase 4 (testes/CI)
        →  Fase 5 (permissões)  →  Fase 6 (separar telas)  →  Fase 7 (menu novo)
        →  Fase 8 (refatoração dos componentes grandes, contínua)
```

Fase 0 é bloqueante e deve ser tratada de imediato, independente do resto. Fases 1–4 reduzem risco técnico antes de adicionar a complexidade do menu novo. Fases 5–7 entregam o que foi pedido (menu operacional reorganizado) sobre uma base mais segura. Fase 8 é trabalho contínuo, pode andar em paralelo às demais a partir da Fase 3.
