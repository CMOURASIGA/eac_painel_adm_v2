# EAC Store — confronto do Preview financeiro original e condições de integração
Data: 2026-10-23. Branch: develop. Status: BLOQUEADO PARA DEPLOY ATÉ PERSISTÊNCIA COMPARTILHADA.

## Fonte verificada
Repositório CMOURASIGA/webappcamisa, branch feature/pre-solicitacao-pix-manual-local, SHA b5f4ab44869d141c29b2ede58a2b63c7e2b3e2f0. Preview READY: webappcamisa-kg208sogq-christians-projects-4954426e.vercel.app. Ver docs/pagamentos/DECISAO_PIX_MANUAL_VALIDACAO_HUMANA.md, HUMAN_VALIDATION_SANDBOX.md e MAPA_MIGRACAO_LOCALSTORAGE_SUPABASE.md na branch referida.

## Achado que muda a arquitetura
O Preview homologado financeiro roda em /sandbox e /sandbox/admin/financeiro. A persistência usa exclusivamente localStorage (webappcamisa_sandbox_requests_v1, settings_v1, counter_v1). Outro dispositivo ou navegador não compartilha pré-solicitações. Comprovantes são apenas metadados durante o sandbox; não há Storage real. Confirmar um pagamento no sandbox gera PED local, NÃO o pedido oficial no Supabase da produção. Expiração ocorre ao reabrir o app, não por job.

NÃO copiar Sandbox.tsx para o caminho público de produção e declarar a operação integrada. Isso deixaria os pedidos invisíveis para o Financeiro. A versão de produção main mantém formulário e RPCs originais com fluxo distinto.

## Decisão operacional vinculante
1. Pré-solicitação sem cobrança deve gerar REC e congelar preço, prazo, recebedor e payload PIX (BR Code).
2. Enviar comprovante somente após pagamento informado, e manter status AGUARDANDO_VALIDACAO_FINANCEIRA.
3. Financeiro autorizado pelo EAC confirma PIX manualmente ou marca NAO_LOCALIZADO.
4. Confirmado gera PED oficial idempotente em transação única e SOMENTE então alimenta estoques e reposição. Nenhuma reserva antes.
5. Cancelamento/estorno devem preservar trilha de auditoria e estados intermediários. E-mails enfileirados idempotentemente; expiração server-side.
6. Histórico de pedidos da main não será sobrescrito. Preservar dados e RPCs originais; adicionar migração de compatibilidade.
7. Financeiro necessita módulo e grant específico, com autorização no backend (não por localStorage nem menu).
8. A publicação inicial dependerá de ambiente Supabase de homologação com esquema real da loja, policies/RPCs revisadas e credenciais STORE_SUPABASE_URL/STORE_SUPABASE_SERVICE_ROLE_KEY APENAS server-side no Preview EAC.
9. Para QA, rodar HV-01 a HV-15 com dois navegadores diferentes; verificar persistência cruzada, idempotência, auditoria, comprovantes reais e transições.

## Bloqueios confirmados por ferramenta em 23/10
- Vercel EAC Preview contém VITE_STORE_SUPABASE_URL/VITE_STORE_SUPABASE_ANON_KEY, mas NÃO contém STORE_SUPABASE_URL nem STORE_SUPABASE_SERVICE_ROLE_KEY. O gateway retorna 503 e não deve inventar outra autenticação.
- O projeto Supabase da loja/EAC não aparece entre os projetos acessíveis pelo conector atual (list_projects retornou games_lucas, pegaus_consultservices e 7Commander_oficial). Sem acesso ao schema e migrations em ambiente seguro, não é possível homologar uma transação real ou validar RLS.
- Supabase SQL da loja não deve ser aplicado cegamente à produção; primeiro revisão + backup + cópia QA.

## Próximo lote implementável assim que ambiente de homologação estiver acessível
A. Esquema de pré-solicitações, pagamentos, itens, auditoria e outbox preservando IDs/estados originais.
B. RPC transacional confirm_payment: lock de pré-solicitação, checagem de valor/status, PED único, auditoria, atualização das views de estoque.
C. APIs proxy de criação/consulta pública por protocolo/token de alta entropia, envio de comprovante para bucket privado e operações do Financeiro validadas pela sessão EAC.
D. Editor RBAC finance_read, finance_validate, stock_read, stock_manage, delivery_manage; admins inalterados.
E. Testes automatizados de transições, dupla confirmação simultânea, acesso negado, captura de PNG nos quatro formatos e regressão original.
F. Apenas então Preview consolidado; sem merge em main ou produção nesta etapa.
