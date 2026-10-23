# EAC Store — integração sem regressão
Data: 2026-10-23
Status: SPEC APROVADA PARA IMPLEMENTAÇÃO, SEM DEPLOY OU MIGRATION.

## Decisão do responsável
Manter o projeto CMOURASIGA/webappcamisa integralmente como base funcional, preservando contratos, Supabase, pedidos, comprovantes PIX, status, estoque, reposição, entrega, dashboard e eventual financeiro existente. **Não reescrever as rotinas atuais**. Incorporar ao portal EAC e apenas adicionar o que falta.

## Rotas propostas
- /eac-store: administração no shell EAC, com autorização por papel; aproveitar dashboard operacional original e manter separação de funções de Financeiro.
- /publico/loja: loja sem login com o formulário original e catálogo de produtos, mantendo fluxo original de compra.
- Home.tsx, linha original 225: CTA "Compra de Camisas" aponta hoje para https://webappcamisa.vercel.app/. **Alterar para /publico/loja somente depois de existir rota integrada e homologada**. Até lá preservar link em produção.
- Manter redirecionamento de URLs antigas após cutover, para não quebrar QR codes e links enviados em WhatsApp.

## Cadastro incremental de produtos
- Campos: produto, descrição pública, preço, ativo, imagem principal opcional, variantes cor/tamanho, quantidade/estoque, ordem de exibição.
- Upload seguro em storage de imagens (bucket próprio público de imagens de produtos, nunca o de comprovantes PIX); MIME allowlist png/jpeg/webp, tamanho máximo, filename aleatório, ownership/admin write; URL pronta para exibição sem autenticação.
- Exibir imagem, variante, preço e disponibilidade no catálogo antes da solicitação; fallback quando não houver foto.
- Preservar as camisas atuais como produtos/variantes compatíveis, **sem converter pedidos históricos prematuramente nem alterar RPCs existentes**. Migration aditiva somente após vistoria no Supabase real.
- Não confundir cadastro de disponibilidade com estoque físico efetivo, que continua baixando apenas na entrega.

## Integração
1. Auditar branches do webappcamisa e identificar exatamente os commits e funcionalidades que foram publicados. A main atual é e35e331d; branch dev 59f4be39 está 21 commits atrás de main. PR #5 está aberta e não mergeada. Não presumir que recursos da PR estão em produção.
2. Reunir funcionalidades já existentes, aplicar apenas incrementos selecionados e testar regressão em formulário, dashboard, financeiro, estoque, comprovantes, e-mail e entrega.
3. Decidir estratégia de integração no build Vite monorepo/shell antes de editar código de UI. NÃO incorporar via iframe como solução final; evitar duplicar lógica ou banco. A autenticação do dashboard terá de conversar com as permissões EAC.
4. Fazer cutover em lote único com calendário público, preservando Vercel Hobby e branch main.
5. Validar links internos e URLs antigas, mobile, formulário público sem login, e permissões Financeiro/admin.
6. Não publicar Preview nem produção até lote mínimo corporativo validado.

## Critérios de aceite
- Funcionamento das vendas antigas e histórico íntegro.
- Produto cadastrado com imagem aparece corretamente ao público.
- Fluxo PIX/financeiro com estados e autorização preservados.
- Financeiro confere pagamentos em visão restrita.
- Reposição, reservas, estoque e entrega não sofrem regressão.
- Um portal EAC: CTA inicial funciona para loja integrada e admin EAC Store no menu.
- Testes automatizados/typecheck/build e homologação humana.
