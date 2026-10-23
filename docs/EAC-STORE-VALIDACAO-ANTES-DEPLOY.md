# EAC Store — integração do sistema original e bloqueios para deploy
Data: 2026-10-23. Branch develop.
Origem imutável: webappcamisa main e35e331dbe1152d861fd49f2fa5512101f02ef3c.

## Implementado
- Código do Form, Dashboard, API, types e mockData originais copiado para legacy-store/ e montado dentro de /publico/loja e /eac-store, sem editar a lógica de pedidos.
- Menu e link inicial da compra redirecionam para /publico/loja, com formulário real embutido.
- Catálogo opcional aditivo com upload de imagem por backend ADMIN e consulta pública apenas de ativos, no banco do EAC.
- Store usa variáveis VITE_STORE_SUPABASE_URL e VITE_STORE_SUPABASE_ANON_KEY EXCLUSIVAS, evitando conectar sem querer a loja de camisas ao banco do painel.
- Backend do catálogo usa SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY do EAC, nunca exposição de service key no cliente.
- Migrations não executadas pelo assistente; usuário informou aplicação do SQL do catálogo.

## Configuração obrigatória no Preview da Vercel EAC
- VITE_STORE_SUPABASE_URL = URL do banco oficial da loja de camisas (conferir com o ambiente atual da loja).
- VITE_STORE_SUPABASE_ANON_KEY = publishable ou anon key pública desse mesmo banco.
- VITE_EAC_ENCONTRO_ID, VITE_EAC_ENCONTRO_NOME, VITE_SHIRT_PRICE, VITE_PIX_KEY, VITE_EAC_LOGO_URL devem ser comparados aos valores atuais usados na loja. Não copiar dados comerciais ou credenciais sensíveis automaticamente.
- Supabase EAC backend: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY já existentes devem apontar para o projeto em que eac_store_products foi criado.

## Bloqueios de aceite funcional antes de deploy
- Verificar existência da tabela e bucket no Supabase EAC (conector atual não lista o projeto EAC do usuário).
- Validar RLS anon: catálogo ativo visível; inativo invisível; nenhuma escrita anon; não expor comprovantes PIX.
- Verificar correspondência efetiva do banco da loja original; testar pre-solicitação, pagamento, e-mail, reposição, estoque e entrega sem impactar dados reais; usar fixture/teste em ambiente isolado.
- O dashboard original ainda usa login Supabase Auth próprio da loja; falta homologar SSO ou aceitar segunda autenticação temporária.
- Catálogo opcional acrescenta fotos mas ainda NÃO vincula produto_id ao pedido antigo; formulário original usa camisa/cor/tamanho. Uma variante não deve ser vendida como outro produto até este vínculo existir.
- Auditar itens de branches/PRs pendentes da loja antes de incorporá-los.
- Testes humanos de telas, upload, compra real simulada, role Financeiro, mobile, imagens e navegação.
- Evitar alterar main/produção até aprovação explícita; CI somente avalia tipos/build.
