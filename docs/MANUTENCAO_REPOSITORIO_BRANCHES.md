# Manutenção do repositório e limpeza de branches

## Objetivo

Antes de iniciar novas implementações no `eac_painel_adm_v2`, executar uma revisão das branches antigas do repositório e remover referências que não possuem mais utilidade, preservando qualquer código que ainda não tenha sido incorporado ao fluxo atual.

## Contexto levantado em 10/09/2026

Branches identificadas durante a revisão:

- `main`
- `develop`
- `backup/develop-presenca-20260825`
- `claude/eac-home-reconstruction-3djdp1`
- `claude/encontristas-validation-edit-52y78q`
- `claude/project-audit-menu-restructure-ytjg40`

Também foi identificado um Codespace chamado `ideal spoon`, associado à branch `claude/encontristas-validation-edit-52y78q`, com indicação de alterações locais não commitadas ou não enviadas ao remoto.

### Branch já analisada

`claude/encontristas-validation-edit-52y78q`

Na comparação realizada contra o commit `334090a667265fe3a736ed4c4520561abdf7cd84`, utilizado no deploy de `develop` observado em produção/preview na Vercel em 04/09/2026, a branch apresentou:

- `ahead_by: 0`
- `behind_by: 16`
- status: `behind`

Portanto, não há commits exclusivos dessa branch no GitHub que precisem ser incorporados ao estado mais recente. A branch remota pode ser removida após a checagem indicada abaixo.

ATENÇÃO: o Codespace associado apresentou sinalização de alterações locais não commitadas. Essas alterações não são visíveis no repositório remoto. Se o Codespace ainda existir e for possível acessá-lo, verificar `git status` e `git diff` antes de excluí-lo. Se o Codespace já tiver expirado ou sido descartado, registrar essa condição e seguir com a limpeza da branch remota.

## Trabalho solicitado ao desenvolvedor

### 1. Atualizar referências

Antes de qualquer decisão de exclusão:

```bash
git fetch --all --prune
git checkout develop
git pull origin develop
```

Não assumir que os SHAs registrados neste documento continuam sendo os mais recentes.

### 2. Auditar cada branch auxiliar

Comparar com `develop` e identificar:

- commits exclusivos;
- arquivos alterados;
- funcionalidades ainda não incorporadas;
- correções que já existem em `develop` por outro commit;
- código obsoleto;
- possíveis conflitos;
- PRs abertos ou históricos associados.

Branches prioritárias para auditoria:

- `backup/develop-presenca-20260825`
- `claude/eac-home-reconstruction-3djdp1`
- `claude/project-audit-menu-restructure-ytjg40`

### 3. Não fazer merge automático

Se uma branch possuir commits exclusivos, NÃO realizar merge somente para permitir a exclusão.

Primeiro avaliar se o conteúdo ainda faz sentido para a versão atual. Caso exista código útil, criar PR específico ou reaplicar somente as alterações necessárias sobre uma branch atualizada a partir de `develop`.

### 4. Remover branches obsoletas

Após a auditoria, remover branches que:

- não possuem commits exclusivos úteis;
- já foram integralmente incorporadas;
- foram substituídas por implementações posteriores;
- sejam apenas branches temporárias de agentes ou desenvolvimento concluído.

A branch `claude/encontristas-validation-edit-52y78q` já está autorizada para remoção remota, ressalvada apenas a verificação do conteúdo local do Codespace caso ainda esteja acessível.

### 5. Preservar branches estruturais

Manter obrigatoriamente:

- `main`
- `develop`

A branch `backup/develop-presenca-20260825` deve ser removida somente após comprovação de que não contém recuperação necessária ou código exclusivo ainda relevante.

### 6. Codespaces

Após resolver qualquer alteração local pendente, excluir Codespaces antigos que não estejam mais sendo utilizados. Codespaces não devem ser tratados como armazenamento permanente de código.

Toda alteração válida deve terminar em commit e push para uma branch remota apropriada.

## Critério de conclusão

A manutenção será considerada concluída quando:

- todas as branches auxiliares tiverem sido comparadas com `develop`;
- nenhum código útil estiver apenas em branch antiga ou Codespace;
- branches obsoletas tiverem sido removidas;
- `main` e `develop` permanecerem preservadas;
- branches auxiliares restantes tiverem propósito atual e documentado;
- não houver Codespaces antigos contendo trabalho pendente conhecido;
- o desenvolvedor registrar no PR ou commit de manutenção quais branches foram mantidas, removidas e o motivo.

## Regra para trabalhos futuros

Para novas demandas:

1. partir de `develop` atualizado;
2. criar branch específica para a demanda;
3. manter commits pequenos e identificáveis;
4. abrir PR para `develop` quando aplicável;
5. após incorporação e validação, remover a branch temporária;
6. nunca deixar trabalho importante somente dentro de um Codespace.
