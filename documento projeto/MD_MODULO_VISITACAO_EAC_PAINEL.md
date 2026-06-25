# Módulo de Controle de Visitação - Painel EAC

## 1. Objetivo

Implementar no projeto `eac_painel_adm` um novo módulo chamado **Controle de Visitação**, voltado para acompanhar o primeiro contato e a visitação dos adolescentes classificados como **priorizados**.

O módulo deve ser complementar ao painel atual. Não deve alterar a tela atual de **Inscrições Prioritárias**, nem mudar a regra de status oficial das inscrições.

A ideia é criar uma camada operacional separada para responder perguntas como:

- Quem ainda não recebeu nenhuma ação?
- Com quem já foi feito o contato inicial?
- Quem já recebeu a visitação?
- Quem precisa de retorno ou tentativa nova?
- Quem registrou a ação?
- Quando a ação foi feita?
- Quais observações existem sobre o contato ou visita?

## 2. Regra principal

A base da tela de visitação deve ser formada somente pelos adolescentes classificados como priorizados.

A tela deve usar a mesma base de dados da tela atual de priorizados, mas sem alterar os dados originais.

Regra esperada:

```text
Mostrar somente inscrições com status de priorização ativo.
```

No Supabase, o filtro real deve seguir o campo usado hoje para identificar priorizados. Caso o campo atual seja `status_inscricao`, usar:

```sql
where status_inscricao = 'PRIORIZADO'
```

Caso o projeto use outro campo, como `status`, `status_priorizacao` ou `priorizado`, o dev deve adaptar mantendo a regra funcional:

```text
Apenas adolescentes priorizados devem aparecer no módulo de visitação.
```

## 3. O que foi identificado no projeto atual

O projeto enviado possui a seguinte estrutura relevante:

```text
App.tsx
components/Header.tsx
components/Dashboard.tsx
components/InscricoesPrioritariasPage.tsx
components/PersonCard.tsx
types.ts
app/api/inscricoes-prioritarias/route.ts
api/inscricoes-prioritarias.ts
app/api/comunicados/route.ts
```

A tela atual de priorizados está concentrada em:

```text
components/InscricoesPrioritariasPage.tsx
```

Ela já possui:

- carregamento de registros prioritários;
- filtros por nome, bairro, sexo e idade;
- indicadores por idade;
- exibição em cards usando `PersonCard`;
- abertura de drawer para ver cadastro;
- ações operacionais como despriorizar e ver cadastro;
- fallback para `/api/comunicados` com a action `GET_INSCRICOES_PRIORITARIAS`.

O projeto atual ainda mostra forte dependência do Google Apps Script por meio de `/api/comunicados`. Para a nova rotina, como a operação passou a usar Supabase, a recomendação é criar endpoints próprios para visitação usando Supabase, sem misturar com a action antiga de comunicados.

## 4. Decisão técnica recomendada

Criar um módulo novo e independente:

```text
components/VisitacaoPage.tsx
```

Criar rotas novas:

```text
app/api/visitacoes/route.ts
app/api/visitacoes/[inscricaoId]/route.ts
app/api/visitacoes/historico/[inscricaoId]/route.ts
```

Caso o deploy atual esteja usando Vite puro e não use as rotas do Next em produção, criar também os equivalentes em:

```text
api/visitacoes.ts
api/visitacoes/[inscricaoId].ts
api/visitacoes/historico/[inscricaoId].ts
```

Observação importante: o repositório possui estrutura híbrida, com `app/api` e `api`, mas o `package.json` usa scripts Vite:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Por isso, o dev precisa validar como as APIs estão sendo executadas no ambiente atual. Se estiver na Vercel com suporte às funções `api`, manter os arquivos em `api`. Se estiver usando Next App Router, manter em `app/api`.

## 5. Banco de dados no Supabase

### 5.1. Não alterar a tabela principal de inscrições

Não alterar a tabela principal onde ficam os dados dos adolescentes.

A inscrição continua sendo a fonte oficial dos dados do adolescente.

O controle de visitação deve ficar em tabelas separadas.

### 5.2. Criar tabela `visitacoes`

Tabela responsável por guardar o estado atual da visitação de cada adolescente priorizado.

```sql
create table if not exists public.visitacoes (
  id uuid primary key default gen_random_uuid(),

  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,

  status_visitacao text not null default 'NENHUMA_ACAO',

  contato_inicial_realizado boolean not null default false,
  data_contato_inicial timestamptz null,

  visitacao_realizada boolean not null default false,
  data_visitacao timestamptz null,

  responsavel_acao text null,
  observacao text null,

  origem_registro text not null default 'PAINEL',

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint visitacoes_inscricao_unique unique (inscricao_id),
  constraint visitacoes_status_check check (
    status_visitacao in (
      'NENHUMA_ACAO',
      'CONTATO_INICIAL_FEITO',
      'VISITACAO_REALIZADA',
      'NAO_CONSEGUIU_CONTATO',
      'AGUARDANDO_RETORNO',
      'NAO_DESEJA_VISITA'
    )
  )
);
```

### 5.3. Criar tabela `visitacoes_historico`

Tabela responsável por registrar cada ação feita pela equipe.

```sql
create table if not exists public.visitacoes_historico (
  id uuid primary key default gen_random_uuid(),

  visitacao_id uuid null references public.visitacoes(id) on delete set null,
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,

  tipo_acao text not null,
  status_anterior text null,
  status_novo text null,
  descricao text null,
  responsavel_acao text null,
  origem_registro text not null default 'PAINEL',

  criado_em timestamptz not null default now(),

  constraint visitacoes_historico_tipo_check check (
    tipo_acao in (
      'CONTATO_INICIAL',
      'VISITA_REALIZADA',
      'TENTATIVA_CONTATO',
      'OBSERVACAO',
      'STATUS_ALTERADO'
    )
  )
);
```

### 5.4. Criar índices

```sql
create index if not exists idx_visitacoes_inscricao_id
on public.visitacoes(inscricao_id);

create index if not exists idx_visitacoes_status
on public.visitacoes(status_visitacao);

create index if not exists idx_visitacoes_historico_inscricao_id
on public.visitacoes_historico(inscricao_id);

create index if not exists idx_visitacoes_historico_criado_em
on public.visitacoes_historico(criado_em desc);
```

### 5.5. Trigger para atualizar `atualizado_em`

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_visitacoes_updated_at
before update on public.visitacoes
for each row
execute function public.set_updated_at();
```

Se o projeto já tiver uma função semelhante, reutilizar a existente.

## 6. View para facilitar a tela

Criar uma view para entregar ao frontend os adolescentes priorizados junto com o status de visitação.

Ajustar os nomes dos campos conforme a tabela real do Supabase.

```sql
create or replace view public.vw_visitacao_priorizados as
select
  i.id as inscricao_id,

  -- Dados do adolescente
  i.nome,
  i.email,
  i.telefone,
  i.bairro,
  i.data_nascimento,
  i.idade,
  i.sexo,
  i.responsavel_nome,
  i.responsavel_telefone,
  i.responsavel_email,
  i.data_cadastro,
  i.status_inscricao,

  -- Controle de visitação
  v.id as visitacao_id,
  coalesce(v.status_visitacao, 'NENHUMA_ACAO') as status_visitacao,
  coalesce(v.contato_inicial_realizado, false) as contato_inicial_realizado,
  v.data_contato_inicial,
  coalesce(v.visitacao_realizada, false) as visitacao_realizada,
  v.data_visitacao,
  v.responsavel_acao,
  v.observacao,
  v.origem_registro,
  v.atualizado_em

from public.inscricoes i
left join public.visitacoes v
  on v.inscricao_id = i.id
where i.status_inscricao = 'PRIORIZADO';
```

Se a tela atual de priorizados usa uma view ou tabela diferente, criar a view a partir da mesma origem usada por `InscricoesPrioritariasPage.tsx`.

Regra importante:

```text
Mesmo que ainda não exista registro em visitacoes, o adolescente priorizado deve aparecer com status NENHUMA_ACAO.
```

## 7. Status do módulo

Status iniciais obrigatórios:

```text
NENHUMA_ACAO
CONTATO_INICIAL_FEITO
VISITACAO_REALIZADA
```

Status preparados para evolução:

```text
NAO_CONSEGUIU_CONTATO
AGUARDANDO_RETORNO
NAO_DESEJA_VISITA
```

Labels na interface:

| Valor técnico | Label na tela |
|---|---|
| NENHUMA_ACAO | Nenhuma ação |
| CONTATO_INICIAL_FEITO | Contato inicial feito |
| VISITACAO_REALIZADA | Visitação realizada |
| NAO_CONSEGUIU_CONTATO | Não conseguiu contato |
| AGUARDANDO_RETORNO | Aguardando retorno |
| NAO_DESEJA_VISITA | Não deseja visita |

## 8. Regras de negócio

### 8.1. Nenhuma ação

Quando não existir registro na tabela `visitacoes`, a tela deve considerar:

```text
status_visitacao = NENHUMA_ACAO
contato_inicial_realizado = false
visitacao_realizada = false
```

Não precisa criar registro para todos os priorizados logo no início.

### 8.2. Contato inicial feito

Ao registrar contato inicial:

```text
status_visitacao = CONTATO_INICIAL_FEITO
contato_inicial_realizado = true
data_contato_inicial = data informada ou data atual
visitacao_realizada = false
responsavel_acao = usuário informado
observacao = observação informada
```

Também gravar histórico:

```text
tipo_acao = CONTATO_INICIAL
status_anterior = status anterior
status_novo = CONTATO_INICIAL_FEITO
```

### 8.3. Visitação realizada

Ao registrar visitação realizada:

```text
status_visitacao = VISITACAO_REALIZADA
contato_inicial_realizado = true
visitacao_realizada = true
data_visitacao = data informada ou data atual
responsavel_acao = usuário informado
observacao = observação informada
```

Também gravar histórico:

```text
tipo_acao = VISITA_REALIZADA
status_anterior = status anterior
status_novo = VISITACAO_REALIZADA
```

### 8.4. Observação sem mudança de status

Ao adicionar apenas uma observação:

```text
Não mudar o status atual.
Atualizar observacao, responsavel_acao e atualizado_em.
Gravar histórico com tipo_acao = OBSERVACAO.
```

### 8.5. Não alterar status oficial da inscrição

A rotina de visitação nunca deve alterar o status oficial da inscrição.

Exemplo correto:

```text
status_inscricao = PRIORIZADO
status_visitacao = VISITACAO_REALIZADA
```

Exemplo incorreto:

```text
Mudar automaticamente status_inscricao por causa da visitação.
```

## 9. Endpoints recomendados

### 9.1. Listar priorizados com visitação

```http
GET /api/visitacoes?status=CONTATO_INICIAL_FEITO
GET /api/visitacoes
```

Resposta esperada:

```json
{
  "success": true,
  "items": [
    {
      "inscricao_id": "uuid",
      "visitacao_id": "uuid ou null",
      "nome": "Nome do adolescente",
      "email": "email@dominio.com",
      "telefone": "21999999999",
      "bairro": "Centro",
      "idade": 15,
      "sexo": "Feminino",
      "status_visitacao": "NENHUMA_ACAO",
      "contato_inicial_realizado": false,
      "data_contato_inicial": null,
      "visitacao_realizada": false,
      "data_visitacao": null,
      "responsavel_acao": null,
      "observacao": null,
      "atualizado_em": null
    }
  ],
  "indicadores": {
    "total": 72,
    "nenhumaAcao": 30,
    "contatoInicialFeito": 25,
    "visitacaoRealizada": 17,
    "pendentesVisitacao": 25
  }
}
```

### 9.2. Atualizar status de visitação

```http
POST /api/visitacoes/[inscricaoId]
```

Payload:

```json
{
  "status_visitacao": "CONTATO_INICIAL_FEITO",
  "data_acao": "2026-06-23T18:00:00-03:00",
  "responsavel_acao": "Nome da pessoa",
  "observacao": "Contato feito com a mãe. Visita combinada para sábado.",
  "origem_registro": "PAINEL"
}
```

Resposta:

```json
{
  "success": true,
  "item": {
    "inscricao_id": "uuid",
    "status_visitacao": "CONTATO_INICIAL_FEITO"
  }
}
```

### 9.3. Buscar histórico

```http
GET /api/visitacoes/historico/[inscricaoId]
```

Resposta:

```json
{
  "success": true,
  "items": [
    {
      "tipo_acao": "CONTATO_INICIAL",
      "status_anterior": "NENHUMA_ACAO",
      "status_novo": "CONTATO_INICIAL_FEITO",
      "descricao": "Contato feito com a mãe.",
      "responsavel_acao": "Nome da pessoa",
      "criado_em": "2026-06-23T18:00:00-03:00"
    }
  ]
}
```

## 10. Instalação do Supabase no projeto

O projeto enviado não contém dependência explícita do Supabase no `package.json`.

Adicionar:

```bash
npm install @supabase/supabase-js
```

Criar arquivo de cliente para server-side:

```text
utils/supabaseServer.ts
```

Exemplo:

```ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

Variáveis necessárias no ambiente:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

A chave `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no backend. Nunca expor no frontend.

## 11. Implementação dos endpoints

### 11.1. `app/api/visitacoes/route.ts`

Responsável por listar os priorizados com status de visitação.

Pseudo implementação:

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const STATUS_VALIDOS = new Set([
  'NENHUMA_ACAO',
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
]);

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(req.url);
    const status = String(url.searchParams.get('status') || '').trim();

    let query = supabase
      .from('vw_visitacao_priorizados')
      .select('*')
      .order('nome', { ascending: true });

    if (status && STATUS_VALIDOS.has(status)) {
      query = query.eq('status_visitacao', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const items = data || [];

    const indicadores = {
      total: items.length,
      nenhumaAcao: items.filter((i) => i.status_visitacao === 'NENHUMA_ACAO').length,
      contatoInicialFeito: items.filter((i) => i.status_visitacao === 'CONTATO_INICIAL_FEITO').length,
      visitacaoRealizada: items.filter((i) => i.status_visitacao === 'VISITACAO_REALIZADA').length,
      pendentesVisitacao: items.filter((i) => i.status_visitacao === 'CONTATO_INICIAL_FEITO').length,
    };

    return NextResponse.json({ success: true, items, indicadores });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}
```

### 11.2. `app/api/visitacoes/[inscricaoId]/route.ts`

Responsável por registrar contato, visita ou observação.

Regras:

- validar se `inscricaoId` existe;
- validar se a inscrição está priorizada;
- buscar registro atual em `visitacoes`;
- fazer upsert em `visitacoes`;
- gravar linha em `visitacoes_historico`;
- retornar item atualizado.

Pseudo implementação:

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const STATUS_VALIDOS = new Set([
  'NENHUMA_ACAO',
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
]);

function resolverTipoAcao(status: string) {
  if (status === 'CONTATO_INICIAL_FEITO') return 'CONTATO_INICIAL';
  if (status === 'VISITACAO_REALIZADA') return 'VISITA_REALIZADA';
  return 'STATUS_ALTERADO';
}

export async function POST(req: Request, context: { params: { inscricaoId: string } }) {
  try {
    const supabase = getSupabaseServerClient();
    const inscricaoId = context.params.inscricaoId;
    const body = await req.json();

    const status = String(body?.status_visitacao || '').trim();
    const responsavel = String(body?.responsavel_acao || '').trim();
    const observacao = String(body?.observacao || '').trim();
    const origem = String(body?.origem_registro || 'PAINEL').trim();
    const dataAcao = body?.data_acao || new Date().toISOString();

    if (!STATUS_VALIDOS.has(status)) {
      return NextResponse.json({ success: false, error: 'Status de visitação inválido.' }, { status: 400 });
    }

    if (!responsavel) {
      return NextResponse.json({ success: false, error: 'Informe o responsável pela ação.' }, { status: 400 });
    }

    const { data: atual } = await supabase
      .from('visitacoes')
      .select('*')
      .eq('inscricao_id', inscricaoId)
      .maybeSingle();

    const statusAnterior = atual?.status_visitacao || 'NENHUMA_ACAO';

    const payload: any = {
      inscricao_id: inscricaoId,
      status_visitacao: status,
      responsavel_acao: responsavel,
      observacao,
      origem_registro: origem,
    };

    if (status === 'CONTATO_INICIAL_FEITO') {
      payload.contato_inicial_realizado = true;
      payload.data_contato_inicial = dataAcao;
      payload.visitacao_realizada = false;
    }

    if (status === 'VISITACAO_REALIZADA') {
      payload.contato_inicial_realizado = true;
      payload.visitacao_realizada = true;
      payload.data_visitacao = dataAcao;
      if (!atual?.data_contato_inicial) {
        payload.data_contato_inicial = dataAcao;
      }
    }

    const { data: saved, error: saveError } = await supabase
      .from('visitacoes')
      .upsert(payload, { onConflict: 'inscricao_id' })
      .select('*')
      .single();

    if (saveError) {
      return NextResponse.json({ success: false, error: saveError.message }, { status: 500 });
    }

    await supabase.from('visitacoes_historico').insert({
      visitacao_id: saved.id,
      inscricao_id: inscricaoId,
      tipo_acao: resolverTipoAcao(status),
      status_anterior: statusAnterior,
      status_novo: status,
      descricao: observacao,
      responsavel_acao: responsavel,
      origem_registro: origem,
    });

    return NextResponse.json({ success: true, item: saved });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}
```

### 11.3. `app/api/visitacoes/historico/[inscricaoId]/route.ts`

```ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: { inscricaoId: string } }) {
  try {
    const supabase = getSupabaseServerClient();
    const inscricaoId = context.params.inscricaoId;

    const { data, error } = await supabase
      .from('visitacoes_historico')
      .select('*')
      .eq('inscricao_id', inscricaoId)
      .order('criado_em', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, items: data || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Erro interno.' }, { status: 500 });
  }
}
```

## 12. Alterações no frontend

### 12.1. Atualizar `types.ts`

Adicionar a nova view:

```ts
export type View =
  | 'dashboard'
  | 'members'
  | 'inscricoes_prioritarias'
  | 'inscricoes_prioritarias_circulos'
  | 'visitacao'
  | 'encontreiros'
  | 'presence'
  | 'dispatches'
  | 'calendar'
  | 'comunicados'
  | 'logs'
  | 'users'
  | 'settings'
  | 'help';
```

Adicionar tipos do módulo:

```ts
export type VisitacaoStatus =
  | 'NENHUMA_ACAO'
  | 'CONTATO_INICIAL_FEITO'
  | 'VISITACAO_REALIZADA'
  | 'NAO_CONSEGUIU_CONTATO'
  | 'AGUARDANDO_RETORNO'
  | 'NAO_DESEJA_VISITA';

export interface VisitacaoPriorizado {
  inscricao_id: string;
  visitacao_id?: string | null;
  nome?: string;
  email?: string;
  telefone?: string;
  bairro?: string;
  data_nascimento?: string;
  idade?: string | number;
  sexo?: string;
  responsavel_nome?: string;
  responsavel_telefone?: string;
  responsavel_email?: string;
  data_cadastro?: string;
  status_inscricao?: string;
  status_visitacao: VisitacaoStatus;
  contato_inicial_realizado: boolean;
  data_contato_inicial?: string | null;
  visitacao_realizada: boolean;
  data_visitacao?: string | null;
  responsavel_acao?: string | null;
  observacao?: string | null;
  atualizado_em?: string | null;
}

export interface VisitacaoIndicadores {
  total: number;
  nenhumaAcao: number;
  contatoInicialFeito: number;
  visitacaoRealizada: number;
  pendentesVisitacao: number;
}

export interface VisitacaoHistoricoItem {
  id: string;
  tipo_acao: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  descricao?: string | null;
  responsavel_acao?: string | null;
  criado_em: string;
}
```

### 12.2. Atualizar `App.tsx`

Importar a nova tela:

```ts
import VisitacaoPage from './components/VisitacaoPage.tsx';
```

Adicionar rota amigável:

```ts
const viewPathMap: Partial<Record<View, string>> = {
  members: '/cadastro',
  presence: '/cadastro/presenca',
  inscricoes_prioritarias: '/prioritarios',
  inscricoes_prioritarias_circulos: '/distribuicao-circulos',
  visitacao: '/visitacao',
  encontreiros: '/encontreiros',
};

const pathViewMap: Record<string, View> = {
  '/cadastro': 'members',
  '/cadastro/presenca': 'presence',
  '/prioritarios': 'inscricoes_prioritarias',
  '/distribuicao-circulos': 'inscricoes_prioritarias_circulos',
  '/visitacao': 'visitacao',
  '/encontreiros': 'encontreiros',
};
```

Adicionar em `allowedViews`:

```ts
'visitacao'
```

Adicionar em `viewsThatNeedSync`, se quiser recarregar ao navegar:

```ts
'visitacao'
```

Adicionar controle de permissão:

```ts
if (currentView === 'visitacao' && !allowed.includes('visitacao')) {
  setCurrentView('dashboard');
  showToast('Seu usuário não possui acesso ao módulo Controle de Visitação.', 'error');
  return;
}
```

Adicionar renderização:

```tsx
{currentView === 'visitacao' && (
  <VisitacaoPage user={user} />
)}
```

### 12.3. Atualizar `Header.tsx`

Adicionar item de menu:

```ts
{ label: 'Visitação', view: 'visitacao' },
```

Adicionar no filtro de permissão:

```ts
if (item.view === 'visitacao') return allowed.includes('visitacao');
```

### 12.4. Atualizar `LoginPage.tsx`

No usuário local de desenvolvimento, adicionar:

```ts
'visitacao'
```

Exemplo:

```ts
allowedModules: [
  'dashboard',
  'dispatches',
  'calendar',
  'comunicados',
  'logs',
  'users',
  'settings',
  'help',
  'members',
  'inscricoes_prioritarias',
  'inscricoes_prioritarias_circulos',
  'visitacao',
  'encontreiros',
  'presence'
]
```

Na montagem do usuário autenticado:

```ts
const hasVisitacaoConfigured = toCleanString(u.visitacao) !== '';
if (isAdmin || boolSim(u.visitacao) || (!hasVisitacaoConfigured && boolSim(u.prioritarios))) {
  pushUnique('visitacao');
}
```

Se o controle de usuários ainda vier do Google Apps Script, será necessário criar a coluna `visitacao` na origem de usuários ou tratar por herança do módulo `prioritarios`.

Recomendação inicial:

```text
Quem tem acesso a Inscrições Prioritárias também pode acessar Visitação.
```

Depois, se quiser controle fino, criar permissão própria.

## 13. Nova tela `components/VisitacaoPage.tsx`

A tela deve seguir visualmente o padrão de `InscricoesPrioritariasPage.tsx`, usando cards, filtros e `PersonCard`.

### 13.1. Layout esperado

Topo:

```text
Controle de Visitação
Acompanhamento do primeiro contato e visitação dos adolescentes priorizados.
```

Cards de indicadores:

```text
Total priorizados
Nenhuma ação
Contato inicial feito
Visitação realizada
Pendentes de visitação
```

Filtros:

```text
Nome
Telefone
Bairro
Sexo
Status da visitação
Responsável pela ação
```

Listagem:

Usar o mesmo padrão dos cards de priorizados.

Cada card deve mostrar:

- idade;
- nome;
- bairro;
- data de cadastro;
- status da visitação;
- interesse, se vier da base;
- sexo;
- responsável da última ação;
- data da última ação, se existir.

Ações por card:

```text
Ver cadastro
Registrar contato inicial
Registrar visitação realizada
Adicionar observação
Ver histórico
```

### 13.2. Regras dos filtros por indicador

Se nenhum indicador/status estiver selecionado:

```text
Mostrar todos os adolescentes priorizados.
```

Se um indicador for selecionado:

```text
Mostrar somente registros daquele status.
```

Se mais de um indicador for selecionado:

```text
Mostrar registros que pertençam a qualquer um dos status selecionados.
```

### 13.3. Mapeamento visual dos status

```ts
const STATUS_VISITACAO_UI = {
  NENHUMA_ACAO: {
    label: 'Nenhuma ação',
    badge: 'bg-slate-50 text-slate-700 border border-slate-200',
    dot: 'bg-slate-400',
  },
  CONTATO_INICIAL_FEITO: {
    label: 'Contato inicial feito',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
  },
  VISITACAO_REALIZADA: {
    label: 'Visitação realizada',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
  },
  NAO_CONSEGUIU_CONTATO: {
    label: 'Não conseguiu contato',
    badge: 'bg-rose-50 text-rose-700 border border-rose-200',
    dot: 'bg-rose-500',
  },
  AGUARDANDO_RETORNO: {
    label: 'Aguardando retorno',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
  },
  NAO_DESEJA_VISITA: {
    label: 'Não deseja visita',
    badge: 'bg-zinc-50 text-zinc-700 border border-zinc-200',
    dot: 'bg-zinc-500',
  },
};
```

## 14. Modal de atualização da visitação

Criar um modal ou drawer para registrar a ação.

Campos:

| Campo | Tipo | Obrigatório |
|---|---|---|
| Status da ação | select | Sim |
| Data da ação | datetime-local | Sim |
| Responsável pela ação | texto | Sim |
| Observação | textarea | Não |

Opções do select:

```text
Contato inicial feito
Visitação realizada
Não conseguiu contato
Aguardando retorno
Não deseja visita
```

Botões rápidos no card podem abrir o modal já com o status preenchido:

```text
Registrar contato inicial -> abre modal com CONTATO_INICIAL_FEITO
Registrar visita realizada -> abre modal com VISITACAO_REALIZADA
```

Ao salvar:

```text
POST /api/visitacoes/[inscricaoId]
```

Após salvar:

- fechar modal;
- exibir mensagem de sucesso;
- recarregar a lista;
- atualizar indicadores.

## 15. Histórico da visitação

Criar drawer ou modal para histórico.

Ação:

```text
GET /api/visitacoes/historico/[inscricaoId]
```

Exibir em timeline simples:

```text
23/06/2026 18:30
Contato inicial feito
Responsável: Ana
Observação: Contato feito com a mãe. Visita combinada para sábado.
```

## 16. Formulário público ou semi-interno de visitação

Além da tela dentro do painel, criar um formulário para a equipe alimentar o controle em campo.

Sugestão de rota:

```text
/visitacao/form
```

Ou por query param, seguindo o padrão já existente do projeto para formulário de interesse:

```text
?mode=visitacao_form
```

Como o projeto já tem `PublicInterestForm.tsx` acionado por:

```text
?mode=interest_form
```

O caminho de menor impacto é criar:

```text
components/VisitacaoForm.tsx
```

E no `App.tsx` adicionar:

```tsx
if (queryParams.mode === 'visitacao_form') {
  return (
    <div className="min-h-screen bg-slate-50">
      <VisitacaoForm />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {dialogNode}
    </div>
  );
}
```

### 16.1. Campos do formulário

| Campo | Tipo | Regra |
|---|---|---|
| Buscar adolescente | input pesquisável | Buscar por nome ou telefone |
| Adolescente selecionado | select/lista | Somente priorizados |
| Tipo de ação | select | Obrigatório |
| Data da ação | datetime-local | Obrigatório |
| Responsável | texto | Obrigatório |
| Observação | textarea | Opcional |

### 16.2. Regras do formulário

- Só permitir selecionar adolescentes priorizados.
- Não permitir criar adolescente novo pelo formulário.
- O formulário apenas registra ação de visitação.
- O formulário grava nas mesmas tabelas `visitacoes` e `visitacoes_historico`.
- O formulário deve usar o mesmo endpoint `POST /api/visitacoes/[inscricaoId]`.

### 16.3. Segurança do formulário

Não deixar o formulário totalmente aberto sem proteção.

Opções:

1. exigir login do painel;
2. usar um token simples na URL;
3. criar um código de acesso para a equipe de visitação.

Exemplo com token:

```text
/visitacao/form?token=CODIGO_INTERNO
```

O backend valida:

```env
VISITACAO_FORM_TOKEN=
```

Se o token estiver ausente ou inválido, negar gravação.

## 17. Sugestão de componente `VisitacaoPage.tsx`

Estrutura recomendada:

```text
components/VisitacaoPage.tsx
```

Responsabilidades:

- buscar dados em `/api/visitacoes`;
- manter estado de loading, erro e info;
- calcular filtros locais ou usar filtro do backend;
- renderizar indicadores;
- renderizar cards;
- abrir modal de atualização;
- abrir modal de histórico;
- salvar ação;
- recarregar dados após salvar.

Estados principais:

```ts
const [items, setItems] = useState<VisitacaoPriorizado[]>([]);
const [indicadores, setIndicadores] = useState<VisitacaoIndicadores | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const [info, setInfo] = useState('');
const [selectedStatuses, setSelectedStatuses] = useState<VisitacaoStatus[]>([]);
const [filters, setFilters] = useState({ nome: '', telefone: '', bairro: '', sexo: '', responsavel: '' });
const [selectedItem, setSelectedItem] = useState<VisitacaoPriorizado | null>(null);
const [actionModalOpen, setActionModalOpen] = useState(false);
const [historyModalOpen, setHistoryModalOpen] = useState(false);
```

## 18. Dashboard

Opcional, mas recomendado após validar o módulo.

Adicionar no `Dashboard.tsx` um card pequeno:

```text
Visitação
```

Indicadores possíveis:

```text
Nenhuma ação
Contato feito
Visitação realizada
```

Porém, para a primeira entrega, não é obrigatório mexer no dashboard.

## 19. Compatibilidade com a tela atual de priorizados

Não mexer em:

```text
components/InscricoesPrioritariasPage.tsx
```

A única exceção aceitável seria adicionar um botão de atalho:

```text
Abrir Controle de Visitação
```

Mas a recomendação inicial é manter separado.

## 20. Permissões

### 20.1. Primeira versão

Permitir acesso ao módulo de visitação para:

```text
ADMIN
Usuários com acesso ao módulo de Inscrições Prioritárias
```

### 20.2. Versão com permissão própria

Adicionar uma permissão chamada:

```text
visitacao
```

No `LoginPage.tsx`, usar:

```ts
if (isAdmin || boolSim(u.visitacao)) pushUnique('visitacao');
```

No `UserManagementPage.tsx`, se o controle de usuários continuar vindo da origem atual, incluir campo `visitacao` no formulário de permissões.

## 21. Critérios de aceite

O módulo será considerado pronto quando atender aos pontos abaixo:

### 21.1. Banco

- Tabela `visitacoes` criada.
- Tabela `visitacoes_historico` criada.
- View `vw_visitacao_priorizados` criada.
- Índices criados.
- Trigger de `atualizado_em` funcionando.

### 21.2. Backend

- `GET /api/visitacoes` lista somente adolescentes priorizados.
- Registros sem visitação aparecem como `NENHUMA_ACAO`.
- `POST /api/visitacoes/[inscricaoId]` cria ou atualiza o controle.
- Toda alteração grava histórico.
- `GET /api/visitacoes/historico/[inscricaoId]` retorna timeline da ação.

### 21.3. Frontend

- Menu mostra item `Visitação`.
- Tela carrega os priorizados.
- Cards de indicadores aparecem corretamente.
- Se nenhum filtro de indicador estiver marcado, mostra todos.
- Se um filtro estiver marcado, mostra apenas aquele status.
- A busca por nome funciona.
- O filtro por telefone funciona.
- O filtro por bairro funciona.
- O botão `Registrar contato inicial` grava corretamente.
- O botão `Registrar visitação realizada` grava corretamente.
- O histórico aparece corretamente.
- A tela atual de priorizados continua funcionando sem mudança.

### 21.4. Formulário

- Formulário permite buscar adolescente priorizado.
- Formulário grava contato inicial.
- Formulário grava visitação realizada.
- Formulário grava observação.
- Formulário não altera a inscrição oficial.

## 22. Sequência recomendada de entrega

### Etapa 1 - Banco

Criar:

```text
visitacoes
visitacoes_historico
vw_visitacao_priorizados
```

Validar com query manual no Supabase.

### Etapa 2 - Backend

Criar endpoints:

```text
GET /api/visitacoes
POST /api/visitacoes/[inscricaoId]
GET /api/visitacoes/historico/[inscricaoId]
```

Validar pelo navegador/Postman/Insomnia.

### Etapa 3 - Frontend do painel

Criar:

```text
components/VisitacaoPage.tsx
```

Alterar:

```text
types.ts
App.tsx
components/Header.tsx
components/LoginPage.tsx
```

### Etapa 4 - Formulário

Criar:

```text
components/VisitacaoForm.tsx
```

Adicionar modo:

```text
?mode=visitacao_form
```

### Etapa 5 - Permissões

Na primeira versão, liberar para quem já acessa prioritários.

Depois, criar permissão própria `visitacao`.

## 23. Atenções importantes

1. Não alterar a lógica atual de `InscricoesPrioritariasPage.tsx`.
2. Não alterar o status oficial da inscrição por causa da visitação.
3. Não criar registros de visitação em massa sem necessidade.
4. Usar `NENHUMA_ACAO` via view quando ainda não houver registro.
5. Toda alteração feita pela equipe deve gerar histórico.
6. O formulário deve alimentar a mesma tabela usada pelo painel.
7. Não expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
8. Validar se o deploy atual usa `api` ou `app/api`, pois o projeto está híbrido.

## 24. Resultado esperado para a coordenação

Com esse módulo, a coordenação conseguirá abrir o painel e ver rapidamente:

```text
Quantos adolescentes priorizados existem.
Quantos ainda não tiveram nenhuma ação.
Quantos já receberam contato inicial.
Quantos já receberam visita.
Quem está pendente.
Quem fez cada ação.
Quando a ação foi feita.
Qual observação foi registrada.
```

Isso cria controle operacional sem comprometer a base oficial de inscrições.

## 25. Resumo final para execução

Implementar um novo módulo `Visitação` no painel EAC, usando Supabase, com tabelas separadas para controle e histórico. A tela deve listar apenas adolescentes priorizados, usando os mesmos dados já exibidos na tela de priorizados, adicionando os campos de controle de visitação. O módulo deve permitir filtrar por indicadores, registrar contato inicial, registrar visitação realizada, adicionar observações e consultar histórico. Também deve existir um formulário para a equipe alimentar o controle. Nenhuma rotina deve alterar a inscrição oficial ou o funcionamento atual da tela de priorizados.
