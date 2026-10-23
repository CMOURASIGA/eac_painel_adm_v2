# Política de publicação Vercel – EAC Painel ADM V2

**Decisão do responsável (22/10/2026):** somente autorizar um novo deploy Vercel quando existir um lote de **mais de 5 correções**, isto é, **pelo menos 6 correções distintas, concluídas e verificadas**. A regra vale para deploys manuais e automáticos de produção e preview; alterações documentais que não alterem a aplicação não contam. Não confundir número de commits com número de correções. Incidentes críticos de segurança ou indisponibilidade exigem autorização expressa para exceção.

## Gate obrigatório antes de cada deploy

1. Inventariar as correções distintas, com ID, descrição, evidência de implementação e teste.
2. Se houver menos de 6, **não disparar deployment, redeploy ou promoção**; acumular no próximo lote.
3. Se houver 6 ou mais, validar build, testes relevantes, permissões, revisão do diff, branch/SHA e alvo de Vercel.
4. Verificar a cota e a disponibilidade de Vercel antes de tentar publicar. Se bloqueado, não repetir chamadas até o próximo horário permitido.
5. Publicar apenas o SHA validado e conferir READY, endereço de produção, funcionalidades e logs.
6. Notificar o responsável somente após confirmar produção; falhas ou bloqueios devem ser relatados separadamente, sem alegar sucesso.

**Atenção:** esta política escrita NÃO substitui um bloqueio técnico em CI/Vercel. Para garanti-la em todos os caminhos, a automação de deploy ou workflow precisa ser configurada para verificar o gate. Até lá, não considerar a regra tecnicamente imposta pela plataforma.

## Lote observado em 22/10/2026

Solicitações da issue #52: renomear tela; acelerar processamento; pesquisa somente sob demanda; reconciliar indicador 373/374; detalhar cadastro de adultos. Total máximo elegível até avaliação dos testes: **5 solicitações**, não 6 correções homologadas. Correções auxiliares do mesmo requisito não contam automaticamente como correções independentes.

O PR #53 permanece sem merge e o deploy deve ser barrado enquanto a contagem for inferior a 6 ou os testes estiverem pendentes.

## Diagnóstico de performance – tela Montagem de Equipe

Código investigado: `components/EncontreiroMontagemPanel.tsx`, branch `fix/montagem-busca-adultos-auditoria`.

- Abertura ainda dispara **três consultas paralelas**: lista completa de encontreiro, encontros e analytics, além de **consulta separada da equipe selecionada** após a seleção inicial. Medir duração individual e payload antes de afirmar ganho.
- Antes do PR #53, carregava a composição de **todos os encontros em paralelo na abertura**; após o PR, migrou para a primeira pesquisa, mas apenas deslocou o custo, ainda executando N consultas históricas simultâneas.
- O cadastro de pessoas retorna toda a base para contar adultos, vincular adolescentes e mostrar detalhes. O carregamento inicial poderia usar endpoint agregado com contadores e abrir a lista/ficha adulta sob demanda; exige contrato de API específico.
- Cálculo de `people` e `filtered` é executado a cada renderização; converter em `useMemo` com dependências explícitas.
- Melhorias sugeridas em fases: (1) instrumentar tempos de API, tamanho da resposta e latência percebida; (2) remover consulta redundante de composição; (3) endpoint único de resumos; (4) histórico em uma única consulta agregada ou por lote; (5) paginação no servidor.
- Testar desktop e mobile, consistência de indicadores, filtros e permissão de campos, com medições antes/depois em condições equivalentes. **Sem medição real neste momento**.

## Publicação programada
Verificações solicitadas: **22/10/2026 às 16:00 (America/Sao_Paulo)** e, caso a primeira não conclua a publicação, **19:00**. Em ambas, a política de seis correções, os testes e a disponibilidade da plataforma continuam mandatórios. Nunca interpretar o agendamento como autorização para ignorar os gates.

## Exceção expressa de publicação — 22/10/2026

O responsável autorizou expressamente, nesta data, **uma publicação em produção** da versão consolidada da `develop`, apesar do lote inferior a seis correções verificadas e da ausência de execução completa de testes automatizados para o SHA final. A exceção é **pontual**, não revoga a política geral, nem autoriza publicações futuras sem os gates. Escopo: Montagem de Equipe, nomenclatura, pesquisa, indicadores, filtros e ficha de adultos homologados pelo responsável. Exigir confirmação do SHA publicado e do estado READY; se houver erro, declarar o bloqueio sem alegar sucesso.


## Regra de entrega integral antes do Preview (23/10/2026)
Uma funcionalidade iniciada deve ser tratada como entrega **vertical completa**: interfaces, integrações externas, sessão e autorização, tratamento de erros, configuração, migração/credenciais, documentação, testes e roteiro de homologação. Não classificar como concluída enquanto a jornada real de ponta a ponta não puder ser exercitada. Consolidar as mudanças numa única janela de deploy após verificações locais/CI; manter o gate anterior de seis correções verificadas ou exceção explícita, e evitar deploys intermediários apenas para inspecionar interface. Dependências que exigem ação externa do operador devem ser identificadas no início, sem prometer validação integral antes delas. Não usar as cotas diárias da Vercel para testes evitáveis de código.
