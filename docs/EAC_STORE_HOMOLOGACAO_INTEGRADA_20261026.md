# EAC Store — Homologação integrada 2026-10-26
**Branch:** develop. **Status:** CODE STAGED / QA INFRA REQUIRED / NÃO LIBERADO PARA DEPLOY.
Nenhuma migration foi aplicada em banco real e nenhuma credencial privada foi transferida para o cliente.

## Arquitetura implementada no código
- Formulário público original `legacy-store/components/Form.tsx` continua intocado e é padrão enquanto a chave está desligada.
- Novo fluxo `StorePreRequest.tsx` guarda pré-solicitação em `eac_camisa_pre_solicitacoes` por API server-side com token aleatório 256 bits e hash SHA-256 armazenado, preço e PIX congelados.
- Conexão financeira ao Supabase original apenas por `STORE_SUPABASE_URL` e `STORE_SUPABASE_SERVICE_ROLE_KEY` em função servidor.
- Upload de comprovante usa URL/token assinado e bucket privado `camisas-comprovantes`, verifica arquivo existente antes de informar pagamento.
- `eac_camisa_confirmar_pagamento` é transacional e idempotente: chama a função original de emissão do pedido sob lock e gera pedido somente após confirmação humana.
- Financeiro `StoreFinancePanel.tsx`: consulta, valida PIX, marca não localizado, acompanha estornos; comprovantes são links assinados de curta duração.
- Cancelamento, estorno, expiração e auditoria ficam nas RPCs/tabelas novas, sem modificar as tabelas anteriores.
- `StoreAccessPanel.tsx`: concede visualização da loja, financeiro e poder de confirmar PIX individualmente. ADMIN preservado. A escrita de grants requer RPC transacional com auditoria.
- CI adicionou `tests/eac-store-finance.test.mjs` para validação do BR Code PIX e verificações estáticas de segurança.

## Instalação necessária ANTES DE LIGAR O CHECKOUT
1. Disponibilizar ao conector Supabase do ambiente de homologação o projeto real do `webappcamisa`; validar schema atual e backup. A conexão atual NÃO o lista.
2. Revisar e aplicar SOMENTE EM QA: `docs/migrations/20261026_eac_store_pre_solicitacoes_financeiro_QA.sql`. Confirmar a assinatura instalada de `private.camisa_registrar_solicitacao`, retorno `request_id`, política do bucket privado, RPC sob service_role, status `CANCELADA` e eventuais constraints.
3. Revisar e aplicar em QA EAC: `docs/migrations/20261026_eac_store_rbac_audit_QA.sql`. Confirmar tipo de `app_user_profiles.allowed_modules` (text[] ou jsonb), identidade de cada usuário operacional e auditoria.
4. Na Vercel Preview do projeto EAC, cadastrar como secrets exclusivos do servidor: `STORE_SUPABASE_URL`, `STORE_SUPABASE_SERVICE_ROLE_KEY`; manter as credenciais EAC `SUPABASE_*` apontando para EAC. Não colocar service_role em `VITE_*`.
5. Na Vercel Preview configurar valores não secretos controlados pelo operador: `STORE_SHIRT_UNIT_PRICE`, `STORE_PAYMENT_EXPIRATION_HOURS`, `STORE_PIX_KEY_TYPE`, `STORE_PIX_KEY` (configuração protegida), `STORE_PIX_RECEIVER_NAME`, `STORE_PIX_RECEIVER_CITY`, `VITE_EAC_ENCONTRO_ID`. Não confiar em defaults do banco original.
6. Inicialmente manter `STORE_FINANCE_ENABLED`, `STORE_RBAC_ENABLED` e `VITE_STORE_FINANCE_ENABLED` DESLIGADOS. Depois das migrations e testes de contrato, ativá-los **somente no Preview de develop**. O frontend usa flag de build, portanto novo deploy único será necessário quando habilitar.
7. Validar permissão com ADMIN e contas de Financeiro/Operacional efetivamente vinculadas à Auth do EAC. Usuários legados somente de planilha precisam de vínculo seguro antes de receber grants; não promover ninguém a ADMIN.

## Roteiro de QA obrigatório
- Duas sessões/telefones diferentes: criar REC em cliente A; localizar no painel Financeiro B; aprovar manualmente; emitir PED único no banco original; conferir dashboard de camisas.
- Repetir confirmação simultânea duas vezes; nunca duplicar PED nem demanda de reposição.
- Antes da confirmação, conferir que pré-solicitação NÃO aparece nas views do estoque/reposição.
- PIX Copia e Cola: conferir recebedor, chave, CRC, valor para quantidades diferentes e snapshot após reajuste.
- Comprovante: upload PDF/JPG/PNG, limite 10 MB; negar arquivo inexistente e negar leitura por usuário sem permissão; URL assinada deve expirar.
- Cancelar antes de informar PIX, depois de informar, após confirmação; bloquear estorno de pedido com entrega física e preservar auditoria.
- Expiração com navegador fechado: programar `eac_camisa_expirar_pendentes()` no scheduler do projeto QA; provar a execução.
- E-mails: `eac_camisa_email_outbox` está preparada, mas **não existe worker configurado**; implementar, testar deduplicação e observar filas antes de liberar cliente final.
- Módulo sem grant, operador financeiro sem permissão de confirmação, logout e tentativa direta de API retornam 401/403; auditoria de mudanças deve persistir.
- Regressão do formulário original, dashboard, reposição, estoque e entrega, sem pedidos históricos afetados.

## Bloqueios que impedem a declaração de prontidão operacional
- Projeto Supabase da loja indisponível no conector autenticado; SQL real/RLS/RPCs não verificáveis nem aplicáveis.
- Secrets server-side da loja ausentes na Vercel do EAC.
- Worker de e-mail/outbox e agendamento de expiração ainda não implantados; cancelar após entrega exige tratamento manual explícito.
- É proibido declarar homologado apenas porque o typecheck/build/testes estáticos estão verdes.
- Sem deploy em `main` e sem usar o banco oficial de camisas para teste exploratório.
