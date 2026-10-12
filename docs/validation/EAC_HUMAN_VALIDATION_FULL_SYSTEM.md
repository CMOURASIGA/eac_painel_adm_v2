# EAC — Plano de homologação integral (ambiente isolado)
**Branch** `feat/presenca-v2-reestruturacao-mock` | **Status** READY FOR TEST PREPARATION — NOT HOMOLOGATED

## Objetivo
Homologar **todo o painel administrativo e todos os formulários públicos**, incluindo Presença V2, sem dados reais no ambiente MOCK e sem afetar produção. Não considerar deployment READY como teste funcional aprovado.

## Critério de ambientes
1. Produção (`main`) segue sem alterações; manter Supabase e integrações atuais.
2. Preview da branch: acessível somente a validadores autorizados. Mock obrigatório para toda fonte de dados operacional. Qualquer acesso real a Supabase, Google Apps Script/Sheets, e-mail, WhatsApp ou outros sistemas externos => FAIL e bloquear validação.
3. O banco mock deve conter dados inteiramente fictícios e fluxo consistente entre telas. Visível uma marca `AMBIENTE DE HOMOLOGAÇÃO — DADOS FICTÍCIOS`. Fazer reset de fixture para cenário determinístico.
4. Desabilitar envs reais no preview mock, mas **não depender apenas de desabilitar envs**: recusar operações reais no adapter por design (fail-closed).
5. Não usar imagens, contatos, tokens de sessão reais nem dados reais de menores.

## Matriz integral de Human Validation
| ID | Jornada | Resultado exigido | Status |
|---|---|---|---|
| HV-01 | Login ADM e logout | credencial de teste mock, sessão consistente, sem acesso não autorizado | NOT TESTED |
| HV-02 | Operador com permissões restritas | módulos/ações bloqueados também no servidor | NOT TESTED |
| HV-03 | Dashboard e indicadores | contagens e drill-down idênticos às fixtures | NOT TESTED |
| HV-04 | Cadastro de encontristas | visualizar, buscar, paginar, incluir/editar, impedir duplicidade | NOT TESTED |
| HV-05 | Cadastro de encontreiros | visualizar, incluir, editar, perfil de quem não fez EAC | NOT TESTED |
| HV-06 | Pessoa com dois vínculos | uma identidade, papéis independentes, histórico preservado | NOT TESTED |
| HV-07 | Inscrição pública | confirmação, campos, consentimento, concorrência e erros | NOT TESTED |
| HV-08 | Revisão/triagem de inscrições | transições, permissões e rastreabilidade | NOT TESTED |
| HV-09 | Inscrições prioritárias e fila | ordenação, filtros, integração com distribuição | NOT TESTED |
| HV-10 | Visitação | campos, filtros, atualizações e status | NOT TESTED |
| HV-11 | Círculos 35/36/37 | composição por edição, 6 círculos, duplas e dados históricos | NOT TESTED |
| HV-12 | Distribuição de círculos | inclusão, ajuste manual, exportação/arte, histórico | NOT TESTED |
| HV-13 | Equipes de encontreiro | atribuições, edição, acesso e preservação histórica | NOT TESTED |
| HV-14 | Encontros e agenda | CRUD mock de encontros/eventos, sem impactar produção | NOT TESTED |
| HV-15 | Comunicados | preparar, validar e simular envio sem qualquer disparo real | NOT TESTED |
| HV-16 | Disparos e relatórios | idempotência e logs sintéticos, sem mensagens externas | NOT TESTED |
| HV-17 | Configurações, formulários e usuários | controle granular e auditoria, sem segredos em retorno | NOT TESTED |
| HV-18 | Formulários públicos de encontreiro, visitação, banda | simulações independentes e respostas corretas | NOT TESTED |
| HV-19 | Presença legada | visualização de registros legados isolados, sem alteração | NOT TESTED |
| HV-20 | V2 — sessão de dupla | uma sessão/QR por dois círculos, não expor outros círculos | NOT TESTED |
| HV-21 | V2 — pós geral | encontrista, encontreiro externo e pessoa com ambos os papéis | NOT TESTED |
| HV-22 | V2 — telefone ausente | solicitação pendente ao ADM, sem alterar cadastro automaticamente | NOT TESTED |
| HV-23 | V2 — telefone divergente ou compartilhado | anti-enumeração, pendência e revisão administrativa | NOT TESTED |
| HV-24 | V2 — pessoa não localizada | solicitação pendente, sem cadastro automático | NOT TESTED |
| HV-25 | V2 — duplicidade e duas sessões no dia | único registro pessoa/sessão, permite sessão diferente | NOT TESTED |
| HV-26 | V2 — fechamento | manual, irreversível, QR bloqueia novas solicitações | NOT TESTED |
| HV-27 | V2 — conciliação tardia | somente ADM concilia pendência criada antes do encerramento | NOT TESTED |
| HV-28 | V2 — tios sem senha permanente | acesso por convite individual autenticável, revogável e auditável | NOT TESTED |
| HV-29 | Segurança pública | nomes/telefones não enumeráveis, rate limit e escopo | NOT TESTED |
| HV-30 | Responsividade | desktop/tablet/celular, teclado, leitor QR e acessibilidade básica | NOT TESTED |
| HV-31 | Performance Vercel | medidas p50/p95, payloads e custo vs baseline antes | NOT TESTED |
| HV-32 | Build/release | typecheck/lint/unit/E2E/build sem regressões; sem mock em produção | NOT TESTED |

## Critérios de fechamento
- Entregar evidência de cada cenário com ambiente, SHA, passos, dados sintéticos, resultado esperado/obtido, PASS/FAIL/NOT TESTED e responsável.
- Nenhum cenário P0 de segurança ou integridade pode permanecer FAIL.
- Deixar explícitos cenários NÃO executados; não rotular etapa como homologada por testes de fixtures isolados.
- Plano separado de migração ao Supabase, RLS, regularização dos quatro vínculos históricos e rollback somente após homologação mock.
- Não abrir merge em develop nem subir produção sem aprovação expressa.

## Bloqueadores presentes nesta data
- Ainda não foi criado adapter MOCK de toda aplicação; os arquivos de fixture e domínio V2 são isolados.
- Autorização de backend do legado permanece em auditoria.
- Testes E2E, build, métricas reais da Vercel, revisão visual e Human Validation não foram executados.
- Tios sem login por senha: opção passwordless proposta, ainda não implementada.
