# Lote de integração EAC Store e artes — critérios finais
Data: 2026-10-23
Estado: EM DESENVOLVIMENTO; não apto à produção.

## EAC Store — contrato inegociável
- Os componentes originais src/components/Form.tsx e src/components/Dashboard.tsx da webappcamisa/main são a referência operacional. Não reduzir perguntas, regras de PIX, upload de comprovante, carrinho de itens, beneficiário, busca de encontreiro, e-mail de confirmação, reposição, estoque ou entrega.
- Loja pública em /publico/loja abre diretamente o formulário completo, com título "Solicitação de Camisas — EAC Store".
- Permissões do EAC administram acesso ao dashboard, mas NÃO substituem a proteção Supabase das rotinas internas. O login duplicado não pode ser removido antes de implementar gateway validando sessão EAC, papel/grants e operações da loja no servidor; sem token de serviço exposto ao browser.
- Não modificar o schema/histórico do sistema webappcamisa. Alterações de catálogo são aditivas.
- Para RBAC, fonte canônica deve ter autorização efetiva nos endpoints, além de menu; administradores preservados.

## Folder — linha editorial aprovada para implementação
- Referência: colagem editorial EAC com textura kraft, recortes de papel, fita adesiva, cabeçalho azul profundo, tipografia marcante branca/amarela, datas em selos coloridos, símbolos simples, ilustração/elementos juvenis, CTA com QR.
- Três formatos automáticos separados: feed 1080x1350; story 1080x1920; WhatsApp 1200x675. Quadrado opcional 1080x1080.
- Modelos selecionáveis: colagem, clean, destaque; NÃO mudar apenas cor para fingir que são modelos diferentes. Componentização independente por estilo e breakpoints de layout.
- Renderizar foto/logo oficial a partir de asset local aprovado; nunca usar logos geradas sinteticamente nem URL de terceiros como fonte final; manter espaço reservado se falta asset.
- Usar somente dados dinâmicos dos eventos aprovados. Não inventar datas, links ou QR. Link curto definitivo somente após definição do domínio; nunca imprimir o hostname aleatório do Preview como CTA. No Preview, QR gerado para URL corrente apenas durante teste.
- Títulos e datas sem truncar, paginação inteligente quando excesso de eventos, contraste AA e margem de segurança para Story/Status.
- Testes de imagens: render real 1080x1350, 1080x1920, 1200x675; garantir QR legível e nenhuma informação cortada.

## Critérios de liberação
- Formulário original integral e sem regressões com transação de teste controlada.
- Dashboard único EAC sem senha secundária E sem enfraquecimento da RLS da loja.
- Perfil VIEWER sem permissão não pode acessar endpoints ou ver dados de pagamento.
- Drawer produto com imagem e tabela RLS aprovados.
- Artes aprovadas pelo responsável mediante imagem exportada real por formato.
- CI e testes de integração completos antes de um único Preview consolidado.
