# Briefing Unico - Migracao do Calendario Publico para Supabase

Data: 2026-06-18

## 1. Objetivo

Alterar o calendario publico web para que ele deixe de ler os eventos diretamente da planilha/Google Apps Script e passe a ler a base do Supabase.

O objetivo final e:

- manter o calendario publico consumindo uma fonte unica de dados;
- usar o mesmo repositorio de eventos do painel administrativo;
- reduzir dependencia de Google Sheets no frontend publico;
- preservar compatibilidade com o fluxo atual de importacao/sincronizacao, se ainda necessario.

## 2. Contexto tecnico atual do projeto

No projeto atual do painel EAC, o modulo de calendario ja esta preparado para trabalhar com Supabase.

Evidencias no codigo:

- leitura de eventos via acao `GET_EVENTS`;
- tabela de eventos configuravel por `EAC_SUPABASE_TABLE_EVENTS`;
- fallback legado para Google Apps Script ainda existente;
- rotina de sincronizacao/importacao `IMPORT_CALENDAR_2026_EXTERNOS`;
- endpoint protegido para sincronismo: `POST /api/sync/calendar`.

Arquivos de referencia deste comportamento:

- `components/CalendarPage.tsx`
- `app/api/comunicados/route.ts`
- `utils/supabaseActions.ts`
- `services/calendarioComunicadosService.ts`
- `.env.vercel.example`
- `docs/US-113-sync-calendario-cron-supabase.sql`

## 3. Estado atual do backend de eventos

Hoje o backend do painel ja considera Supabase como fonte preferencial para eventos.

### 3.1 Acao de leitura

A leitura e feita pela acao:

- `GET_EVENTS`

Na implementacao atual, essa acao procura eventos nestas tabelas candidatas:

1. valor configurado em `EAC_SUPABASE_TABLE_EVENTS`
2. `eventos_agenda`
3. `eventos`
4. `events`
5. `calendar_events`

### 3.2 Mapeamento de campos esperado pelo frontend

O normalizador atual de evento entrega este contrato:

```ts
{
  id?: string
  atividade: string
  tipo: string
  inicio: string
  termino: string
  local: string
  proprietario?: string
  status?: string
  encontroId?: string
  origem_dado?: string
  id_origem_planilha?: string
  data_importacao?: string
  ultima_sincronizacao?: string
  criado_via_sistema?: boolean
}
```

Aliases aceitos hoje no backend:

- `id` ou `uuid`
- `atividade` ou `title` ou `nome` ou `name`
- `tipo` ou `type`
- `inicio` ou `start` ou `inicio_iso` ou `start_at`
- `termino` ou `end` ou `termino_iso` ou `end_at`
- `local` ou `location`
- `proprietario` ou `owner`
- `encontro_id` ou `encontroId`

### 3.3 Regras de origem do dado

O projeto ja diferencia registros vindos da planilha e registros criados no sistema:

- `origem_dado = 'PLANILHA'`
- `origem_dado = 'SISTEMA'`

Campos de auditoria ja previstos:

- `origem_dado`
- `data_importacao`
- `id_origem_planilha`
- `ultima_sincronizacao`
- `criado_via_sistema`

## 4. Decisao recomendada para o calendario publico

### Recomendacao principal

O calendario publico web deve ler do Supabase, nao da planilha.

### Forma recomendada de acesso

Para o site publico, usar uma destas abordagens:

1. Recomendada: frontend publico lendo uma `view` publica no Supabase com `SUPABASE_ANON_KEY`.
2. Alternativa: frontend publico chamando um endpoint server-side proprio, que por sua vez consulta o Supabase.

### Recomendacao de arquitetura

Usar a opcao 1 se o calendario publico so precisa listar eventos publicos.

Motivos:

- menor complexidade;
- menor custo operacional;
- remove dependencia de servidor intermediario;
- mantem `SUPABASE_SERVICE_ROLE_KEY` fora do frontend.

## 5. Escopo da manutencao solicitada ao dev

O dev deve executar a manutencao abaixo.

### 5.1 No banco Supabase

1. Confirmar qual tabela real sera a fonte publica de eventos.
2. Padronizar essa tabela como:
   - `public.eventos_agenda`, ou
   - outro nome definido em `EAC_SUPABASE_TABLE_EVENTS`.
3. Garantir que os campos minimos existam:
   - `id`
   - `atividade`
   - `tipo` ou `tipo_atividade`
   - `inicio`
   - `termino`
   - `local`
   - `proprietario`
   - `status`
   - `origem_dado`
4. Criar uma `view` publica somente com os campos necessarios ao calendario publico.
5. Criar politicas de leitura publica apenas nessa `view`, nunca na tabela inteira se houver risco de exposicao indevida.

### 5.2 No calendario publico web

1. Remover leitura direta da planilha/Google Apps Script.
2. Adicionar cliente Supabase de leitura publica.
3. Buscar eventos da `view` publica.
4. Ordenar por `inicio`.
5. Filtrar somente eventos publicaveis.
6. Normalizar status e datas no frontend.
7. Tratar timezone `America/Sao_Paulo`.
8. Prever fallback visual de erro, sem quebrar a pagina.

### 5.3 No fluxo de dados

Se a planilha continuar sendo a origem operacional por algum periodo, manter:

- planilha -> importacao/sync -> Supabase -> calendario publico

Ou seja: a planilha deixa de ser fonte de leitura do site publico, mas pode continuar como origem de alimentacao temporaria do banco.

## 6. Entrega tecnica esperada

O dev deve entregar:

1. leitura do calendario publico via Supabase;
2. variaveis de ambiente configuradas;
3. `view`/politicas de acesso criadas no Supabase;
4. remocao da dependencia da URL do Google Script no calendario publico;
5. validacao de datas e timezone;
6. checklist de homologacao.

## 7. Acessos do Supabase que o dev vai precisar

Voce deve fornecer ao dev estes dados:

### 7.1 Acessos obrigatorios

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- nome do schema: normalmente `public`
- nome da tabela real de eventos
- nome da `view` publica, se ja existir

### 7.2 Acessos obrigatorios apenas para backend/admin

- `SUPABASE_SERVICE_ROLE_KEY`

Observacao:

- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ir para frontend publico.
- Ela so pode ser usada em backend, script de importacao, cron, API route ou ambiente seguro.

### 7.3 Acessos opcionais, se o sync continuar existindo

- `EAC_CRON_SYNC_TOKEN`
- `EAC_GOOGLE_SHEET_CALENDAR_ID`
- `EAC_GOOGLE_SHEET_CALENDAR_GID`
- `GOOGLE_WEBAPP_URL`

## 8. Variaveis de ambiente relevantes

Com base no projeto atual, estas sao as variaveis que importam para essa manutencao.

### 8.1 Ja existentes no projeto

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_SCHEMA=public
EAC_SUPABASE_TABLE_EVENTS=
EAC_CRON_SYNC_TOKEN=
EAC_GOOGLE_SHEET_CALENDAR_ID=
EAC_GOOGLE_SHEET_CALENDAR_GID=0
GOOGLE_WEBAPP_URL=
NEXT_PUBLIC_GOOGLE_WEBAPP_URL=
VITE_GOOGLE_WEBAPP_URL=
EAC_ALLOW_SHEETS_FALLBACK_READ=false
```

### 8.2 Variaveis recomendadas para o calendario publico

Se o calendario publico for um projeto separado, padronizar:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_SCHEMA=public
NEXT_PUBLIC_SUPABASE_EVENTS_VIEW=vw_public_calendar_events
```

Se nao houver `NEXT_PUBLIC_SUPABASE_SCHEMA`, assumir `public`.

## 9. Estrutura recomendada no Supabase

### 9.1 Tabela base

Preferencialmente:

```sql
public.eventos_agenda
```

### 9.2 Colunas minimas recomendadas

```sql
id uuid or text primary key
atividade text not null
tipo text null
inicio timestamptz not null
termino timestamptz not null
local text null
proprietario text null
status text null
origem_dado text null
id_origem_planilha text null
data_importacao timestamptz null
ultima_sincronizacao timestamptz null
criado_via_sistema boolean null
updated_at timestamptz null
created_at timestamptz null
```

### 9.3 View publica recomendada

Criar uma view enxuta, por exemplo:

```sql
create or replace view public.vw_public_calendar_events as
select
  id,
  atividade,
  coalesce(tipo, tipo_atividade) as tipo,
  inicio,
  termino,
  local,
  proprietario,
  status
from public.eventos_agenda
where coalesce(status, '') <> 'CANCELADO'
order by inicio asc;
```

Observacao:

- se `tipo_atividade` for o nome real da coluna, o dev deve ajustar a `view`;
- se houver regra para exibir cancelados, remover esse filtro.

## 10. Politica de seguranca recomendada

### Regra principal

Nao expor a tabela operacional inteira ao frontend publico.

### Recomendacao

1. habilitar RLS na tabela base;
2. nao liberar `select` irrestrito na tabela bruta;
3. expor somente a `view` publica ou um endpoint server-side;
4. usar `anon key` somente para leitura publica;
5. manter `service role` apenas no backend.

## 11. SQL minimo sugerido para o dev

Exemplo base de permissao publica via view:

```sql
create or replace view public.vw_public_calendar_events as
select
  id,
  atividade,
  coalesce(tipo, tipo_atividade) as tipo,
  inicio,
  termino,
  local,
  proprietario,
  status
from public.eventos_agenda
where coalesce(status, '') <> 'CANCELADO';

grant usage on schema public to anon, authenticated;
grant select on public.vw_public_calendar_events to anon, authenticated;
```

Se o projeto usar RLS diretamente em tabela em vez de `view`, o dev deve documentar a politica aplicada.

## 12. Regras funcionais que devem ser preservadas

1. Eventos devem aparecer em ordem cronologica.
2. Datas devem respeitar o timezone local.
3. Eventos sem titulo nao devem ser exibidos.
4. Eventos cancelados devem seguir a regra de negocio definida.
5. O calendario publico nao deve depender de autenticacao para consulta.
6. O calendario publico nao deve expor chaves sensiveis.

## 13. Regras de compatibilidade com o painel atual

Como o painel atual ja usa Supabase para `GET_EVENTS`, o ideal e que o calendario publico consuma a mesma estrutura logica de dados.

Padrao desejado:

- painel admin e calendario publico lendo o mesmo conjunto de eventos no Supabase;
- CRUD administrativo continua no painel;
- site publico apenas consome leitura.

## 14. Se a planilha continuar como origem temporaria

Nesse caso, o dev deve manter o fluxo:

1. usuario/operacao atualiza a planilha;
2. rotina de importacao sincroniza para Supabase;
3. calendario publico le do Supabase.

Nao e recomendado manter:

1. painel lendo Supabase;
2. site publico lendo planilha;
3. cada interface usando uma fonte diferente.

Isso gera divergencia de dados.

## 15. Checklist de implementacao para o dev

### Banco

- confirmar nome real da tabela de eventos;
- confirmar colunas reais;
- criar `view` publica;
- aplicar permissoes corretas;
- validar ordenacao e filtro;

### Frontend publico

- instalar/configurar cliente Supabase;
- criar service de leitura;
- trocar origem da consulta;
- mapear campos da resposta;
- tratar loading e erro;
- validar timezone e formatacao;

### Infra

- cadastrar variaveis de ambiente no deploy;
- validar acesso com `anon key`;
- garantir que nenhuma chave sensivel foi para bundle publico;

### Homologacao

- comparar quantidade de eventos entre Supabase e calendario atual;
- validar meses com maior volume;
- validar eventos de um dia e com horario;
- validar cancelados;
- validar performance inicial da tela;

## 16. Criterios de aceite

Considerar a manutencao concluida quando:

1. o calendario publico nao consultar mais Google Sheets nem Google Apps Script;
2. a leitura acontecer a partir do Supabase;
3. os eventos exibidos baterem com a base oficial no Supabase;
4. as variaveis de ambiente estiverem documentadas;
5. nao houver exposicao de `SUPABASE_SERVICE_ROLE_KEY` no frontend;
6. a pagina funcionar em homologacao e producao.

## 17. Solucao recomendada resumida para execucao

Implementar assim:

1. usar `public.eventos_agenda` como base oficial;
2. criar `public.vw_public_calendar_events`;
3. liberar `select` nessa `view` para `anon`;
4. configurar o calendario publico para usar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
5. remover a leitura da planilha no frontend publico;
6. manter, se necessario, a sincronizacao planilha -> Supabase via cron/importador.

## 18. Informacoes que faltam preencher antes de enviar ao dev

Preencha estes itens no documento antes de repassar:

- URL real do projeto Supabase: `________________`
- nome real da tabela de eventos: `________________`
- nome da view publica: `________________`
- `SUPABASE_ANON_KEY`: `________________`
- `SUPABASE_SERVICE_ROLE_KEY` para backend: `________________`
- URL do deploy do calendario publico: `________________`
- confirmar se eventos cancelados aparecem ou nao: `________________`
- confirmar se a planilha continuara como origem temporaria: `SIM / NAO`

## 19. Observacao importante

Se o calendario publico for um projeto separado do painel admin, o dev nao deve reaproveitar automaticamente as variaveis `GOOGLE_WEBAPP_URL`, `NEXT_PUBLIC_GOOGLE_WEBAPP_URL` ou `VITE_GOOGLE_WEBAPP_URL`.

Essas variaveis pertencem ao fluxo legado com Google Apps Script e devem ser removidas do calendario publico quando a migracao para Supabase for concluida.
