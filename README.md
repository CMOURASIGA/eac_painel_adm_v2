# Painel EAC - Operação, Cadastro e Distribuição

Painel administrativo do EAC com integração ao Google Apps Script/Google Sheets para gestão de adolescentes, priorização, distribuição de círculos, presença, calendários, comunicados e auditoria operacional.

## Tecnologias

- Frontend: React + TypeScript + Vite
- Estilo: Tailwind CSS
- Exportação de imagem: `html2canvas`
- Backend de integração: Next API Route (`/api/comunicados`) + Google Apps Script
- Persistência local de sessão e preferências: `localStorage`

## Principais funcionalidades

### 1) Cadastro de Encontrista
- Lista e manutenção do cadastro de encontrista.
- Busca com filtros e paginação no backend (`SEARCH_MEMBERS`).
- Ações de inclusão, edição e exclusão.

### 2) Não inscritos e priorização
- Leitura da aba de não inscritos com indicadores.
- Atualização incremental/full de não inscritos.
- Priorização com cópia para `Inscricoes_Prioritarias`.
- Controle de interesse/recado e status de priorização.

### 3) Inscrições Prioritárias
- Tela com filtros aplicados por botão `Pesquisar` (não realtime).
- Abertura de detalhamento por card.
- Ações para distribuir círculos e abrir subtela de distribuição.

### 4) Distribuição de Círculos
- Geração de distribuição via `novaDistribuicaoCirculos()`.
- Leitura da aba `Círculos_Distribuídos` agrupada por círculo.
- Cards por círculo com cores fixas e contadores.
- Divisão visual por sexo (meninos/meninas), nomes ordenados.
- Botão para gerar imagem da distribuição (`html2canvas`) com download.

### 5) Cadastro de Encontreiros
- Tela padronizada em cards (`PersonCard`), com filtros e busca por `Pesquisar`.
- Indicadores operacionais (total e novos no semestre).
- Ações por card: WhatsApp, visualizar, editar, excluir.
- Exportação CSV e modal completo de cadastro/edição.

### 6) Controle de Presença
- Subtela em Cadastro de Encontrista (`/cadastro/presenca`) com painel operacional.
- Indicadores com contagem única de adolescentes presentes (sem duplicidade por múltiplas presenças).
- Filtros por nome, círculo e ano (extraído do carimbo de data/hora).
- Check-in rápido por telefone e ação de marcar presença por card.
- Resumo por círculo e exportação CSV.

### 7) Disparos, comunicados e agenda
- Execução de rotinas de disparo (comunicados, aniversariantes, eventos e fila).
- Gerenciamento de comunicados.
- Agenda/calendário com CRUD de eventos.

### 8) Auditoria e operação segura
- Logs de execução e respostas.
- Confirmações de ação para operações críticas.
- Tela de ajuda atualizada com rotinas e fluxo operacional.

## Rotas principais

- `/cadastro`
- `/cadastro/presenca`
- `/prioritarios`
- `/distribuicao-circulos`
- `/encontreiros`

## Como rodar

1. Instale dependências: `npm install`
2. Configure `.env.local`
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (leitura operacional via Supabase)
   - Opcional (legado): `VITE_GOOGLE_WEBAPP_URL` / `GOOGLE_WEBAPP_URL` (operações ainda dependentes do Apps Script)
3. Rode em desenvolvimento: `npm run dev`
4. Build de produção: `npm run build`

## Integração Google Apps Script

As ações da interface chamam o endpoint local `/api/comunicados`, que repassa `action + payload` para o Web App do Apps Script (`google-script/code.gs`), responsável por leitura/gravação nas planilhas.
