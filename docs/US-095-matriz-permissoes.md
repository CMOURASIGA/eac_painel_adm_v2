# US-095 - Matriz de perfis e permissões por módulo

## Objetivo
Definir uma matriz inicial de perfis para o painel EAC, compatível com o modelo atual em `public.app_user_profiles` (`role`, `allowed_modules`, `metadata`).

## Perfis
- `ADMIN`: acesso total operacional e administrativo.
- `COORD`: coordenação operacional com escrita nos módulos de rotina.
- `OPERADOR`: execução operacional com escopo reduzido e sem administração.
- `VIEWER`: leitura essencial (perfil legado já suportado pelo backend).

## Convenções
- `allowed_modules`: controla navegação permitida por usuário.
- `metadata.canCreate|canEdit|canDelete`: permissões globais de escrita.
- `metadata.<modulo>`: permissões granulares por módulo quando necessário.
- `status`: `ATIVO` ou `INATIVO`.

## Matriz proposta (v1)

| Módulo/Ação | ADMIN | COORD | OPERADOR | VIEWER |
|---|---|---|---|---|
| dashboard (visualizar) | Sim | Sim | Sim | Sim |
| members (cadastro encontrista) | Sim | Sim | Sim | Sim |
| inscricoes_review (triagem) | Sim | Sim | Sim | Sim |
| inscricoes_prioritarias | Sim | Sim | Sim | Sim |
| inscricoes_prioritarias_circulos | Sim | Sim | Sim | Sim |
| encontreiros (visualização) | Sim | Sim | Sim | Sim |
| encontreiros (dados sensíveis) | Sim | Sim | Não | Não |
| presence | Sim | Sim | Sim | Sim |
| calendar | Sim | Sim | Sim | Não |
| comunicados | Sim | Sim | Sim | Não |
| dispatches | Sim | Sim | Não | Não |
| logs | Sim | Sim | Não | Não |
| users | Sim | Não | Não | Não |
| settings | Sim | Não | Não | Não |
| help | Sim | Sim | Sim | Sim |
| CRUD global (criar/editar/excluir) | Sim | Sim | Parcial | Não |

## Política inicial por perfil
- `ADMIN`: CRUD total + todos módulos.
- `COORD`: CRUD total nos módulos operacionais; sem `users` e `settings`.
- `OPERADOR`: sem `canDelete` global; sem `dispatches`, `logs`, `users`, `settings`.
- `VIEWER`: leitura; sem ações de escrita.

## Compatibilidade com backend atual
- O login atual em `api/auth/login.ts` ainda classifica role efetiva em `ADMIN` ou `VIEWER`.
- A matriz desta US já prepara `COORD` e `OPERADOR` para a próxima etapa (US-097), quando a autorização server-side for expandida para papéis intermediários.

## Evidência da US-095
- Matriz documentada neste arquivo.
- Seed inicial em `docs/US-095-seed-inicial-permissoes.sql`.
