# US-019 — Formulário público de inscrição (Supabase)

Data: 2026-04-30

## Decisões definitivas (resumo)

- Fonte oficial: `public.inscricoes`
- Relacionamento: `public.inscricoes.id_encontro` → `public.encontros.id`
- Não usar `public.nao_inscritos` como destino principal do formulário novo.
- Idade: calculada pela `data_inicio` do encontro.
- Defaults no banco:
  - `status_inscricao = 'INSCRITO'`
  - `origem_dado = 'SISTEMA'`
  - `criado_via_sistema = true`
  - `data_inscricao = now()`
  - `created_at = now()`
  - `updated_at = now()`

## Como abrir o formulário

O formulário é exibido via modo público do SPA:

- `?mode=inscricao_form`
- opcional: `?mode=inscricao_form&id_encontro=<uuid>`

## Fluxo técnico

Frontend:

- `components/PublicInscricaoForm.tsx`
- chama `services/inscricoesService.ts` → `createInscricao(payload)`

Backend (server-side):

- `POST /api/inscricoes/create` (usa `SUPABASE_SERVICE_ROLE_KEY` via `utils/supabaseServer.ts`)
- `GET /api/encontros/abertos` (lista encontros com status `ATIVO` ou `PLANEJADO`)

## Validações (US-019)

Antes de inserir:

- `id_encontro` obrigatório e encontro existente
- encontro com status `ATIVO` ou `PLANEJADO`
- campos obrigatórios: `nome_adolescente`, `data_nascimento`, `telefone_adolescente`, `nome_responsavel`, `telefone_responsavel`, `aceite_termos`
- data de nascimento válida
- anti-duplo envio (dedupe leve) por:
  - `id_encontro + telefone_adolescente` (quando possível)
  - `id_encontro + nome_adolescente + data_nascimento`

## Observação (sincronização Sheets → Supabase)

Registros criados pelo formulário devem nascer como:

- `origem_dado='SISTEMA'`
- `criado_via_sistema=true`

Isso viabiliza a regra anti-sobrescrita definida na US-018.5 (o sync não deve atualizar registros de origem SISTEMA).

