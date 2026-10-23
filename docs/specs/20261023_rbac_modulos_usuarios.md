# EAC — SPEC de revisão RBAC e gestão de acessos (não administradores)
Data: 2026-10-23
Status: diagnóstico concluído; migração de permissões pendente; não publicar sem homologação.

## Problema confirmado
A tela UserManagementPage oferece 12 toggles legados e ações CRUD globais, mas a navegação ativa usa um catálogo com módulos que não aparecem nessa tela. Ex.: Triagem de Inscrições, Visitação, Encontros, Equipes, Reuniões de Presença e EAC Store. Os flags antigos são salvos pelo endpoint GET_USERS/SAVE_USER/DELETE_USER via /api/comunicados; o login alternativo mapeia parte desses flags. O login Supabase usa app_user_profiles.allowed_modules, uma origem diferente. Portanto, adicionar switches sem persistência integrada criaria falsa concessão de acesso.

## Escopo decidido
- Não modificar permissões dos usuários ADMIN nem seus papéis atuais.
- Não promover usuário VIEWER a ADMIN automaticamente.
- Gestão por catálogo de módulos da navegação real em utils/navigationRoadmap.ts, com leitura/edição e CRUD por módulo.
- Somente ADMIN altera permissões; alteração auditável, com ator, alvo, módulos anteriores/novos.
- Separação EAC Store: acesso ao dashboard geral, produtos/cadastro, financeiro/baixa PIX, estoque/reposição, entrega. Financeiro não implica acesso ao restante do EAC.
- Reuniões de Presença: acesso explícito; não conceder automaticamente pelo módulo Presença na nova política, salvo compatibilidade durante migração.
- Módulos internos não aparecem no catálogo público. Rotas e APIs precisam validar a mesma policy, não apenas ocultar o menu.
- As funções que ainda usam sistema legado de planilha precisam de bridge com os módulos/grants novos; nunca salvar permissões que backend não reconhece.

## Implementação segura em fases
1. Inventariar módulos reais (fonte de verdade: navigationRoadmap.ts), guards de UI e endpoints associados. Matriz explícita módulo → READ/CREATE/UPDATE/DELETE + ações sensíveis.
2. Definir armazenamento canônico app_user_profiles.allowed_modules + module_permissions JSON ou esquema apropriado conforme migrations existentes. Planejar migração somente para perfis não ADMIN; preservar concessões atuais e listar discrepâncias, sem sobrescrever.
3. Implementar API protegida para GET/PUT de permissões com sessão Supabase ADMIN, audit trail, negação por padrão, CAS/revisão para concorrência.
4. Implementar editor por grupos Pessoas/Encontros/Comunicação/Gestão, com toggles correspondentes à navegação e sub-ações, seleção em massa por grupo e visualização efetiva.
5. Para fluxos legados, bridge segura entre identidades; não aceitar acesso ao módulo apenas com localStorage do navegador.
6. Migrar guards de frontend E backend. Validar com perfis ADMIN, VIEWER sem permissões, financeiro somente EAC Store, responsável de presença e comunicação.
7. Homologar com contas de teste, rollback documentado e aplicação de SQL separada; somente então publicar.

## Critérios de aceite
- O cadastro de permissões lista todas as rotinas reais da navegação atual (inclui EAC Store).
- Permissões salvas reaparecem após refresh e novo login; negadas permanecem negadas.
- Backend impede operações por papel/grant mesmo com URL/chamada direta.
- Não há escalada de privilégios ao usar login legado, refresh de sessão ou editar localStorage.
- Nenhum ADMIN ou dado operacional de produção alterado durante homologação.
