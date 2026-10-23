# EAC Store — gateway de autenticação única: configuração e validação
Data: 2026-10-23. Branch develop. **Sem deploy autorizado.**

## O que mudou
- Dashboard original usa adapter `legacy-store/services/dashboardGateway.ts`; não solicita segunda senha. Formulário público mantém `legacy-store/services/api.ts` e sua conexão Supabase original.
- Operações administrativas usam `/api/eac-store/gateway`, roteadas para função existente `/api/auth/login`, sem aumentar número de funções Vercel.
- Gateway valida JWT HttpOnly da sessão EAC via Auth, perfil ativo e allowed_modules do banco EAC.
- Perfil ADMIN: leitura e mutações. Não-admin: leitura SOMENTE quando `allowed_modules` inclui `eac_store`; mutações bloqueadas até definição explícita de permissões específicas de financeiro/estoque/entregas.
- Seleção de ação por whitelist; entrada validada; nenhum token de serviço ou dados internos de credenciais enviados ao browser.

## Bloqueio de configuração
O projeto Vercel separado `webappcamisa` tem somente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY públicas, sem credencial de serviço para a ponte. Adicionar no Vercel do painel EAC, APENAS no ambiente Preview associado a develop:
1. `STORE_SUPABASE_URL`: URL do MESMO Supabase oficial da loja webappcamisa (server-side, não VITE).
2. `STORE_SUPABASE_SERVICE_ROLE_KEY`: credencial server-side do MESMO Supabase original. Configurar como Sensitive/Encrypted somente no servidor. NUNCA colocar com prefixo VITE_, no GitHub, no cliente ou em conversa.
Esses valores precisam de revisão humana e não foram provisionados por este desenvolvimento. Ausentes, endpoint retorna 503 `STORE_BRIDGE_NOT_CONFIGURED` e bloqueia operação, por design.
Variáveis `SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY` do EAC continuam apontando para o banco EAC. Não trocar por banco da loja.

## Risco conhecido a validar no Supabase da loja
RPCs da loja podem depender de auth.uid() e políticas por usuário. Usar service_role server-side não garante que as RPCs aceitem identidade de aplicação distinta. Antes de homologar write real: revisar definições SQL/policies e testar com dados sintéticos em projeto de homologação. Evitar executar mutações em produção real para descobrir se funciona.
Cota/quota e observabilidade: gateway em API atual do Vercel Hobby; sem funções adicionais.

## Cenários obrigatórios
- Login EAC ADMIN recém realizado → /eac-store direto e sem tela de segunda senha, consultas administrativas autorizadas.
- Logout EAC → /api/eac-store/gateway retorna 401.
- VIEWER sem eac_store → 403 em todos os endpoints, mesmo conhecendo URL.
- VIEWER com eac_store → apenas leitura e nenhum write; adotar grants específicos depois de aprovar matriz RBAC.
- Falta de STORE_SUPABASE_SERVICE_ROLE_KEY → 503 e nenhuma mutação.
- Encontro UUID inválido, quantidade inválida e ação não allowlisted → 400.
- Depois da autorização, conferir RPCs reais (incluindo email, estoque e entrega) contra cópia de QA. Não alterar tabelas históricas.

## Artes
- Formatos: feed 1080×1350, story 1080×1920, quadrado 1080×1080 e WhatsApp 1200×675.
- QR dinâmico, sem URL longa impressa. Faltam testes de imagem real exportada em todos os formatos e aprovação visual do responsável.
- Exemplo visual gerado em conversa é referência, não asset final injetado no gerador.
