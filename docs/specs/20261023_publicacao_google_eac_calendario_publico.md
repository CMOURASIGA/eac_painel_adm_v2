# EAC — SPEC: autorização de publicação Google EAC no calendário público
Data: 23/10/2026
Status: PREPARADO PARA IMPLEMENTAÇÃO. Sem autorização de produção.

## Regra de negócio aprovada
- Eventos internos do EAC seguem a política vigente de publicação pública.
- Eventos da agenda GOOGLE_EAC **não** serão publicados por padrão.
- ADMIN no painel pode autorizar ou revogar individualmente a publicação.
- Eventos GOOGLE_PAROQUIA nunca poderão ser publicados pelo fluxo.
- Não expor descrições privadas, convidados, e-mails ou credenciais.

## Fluxo operacional
1. O administrador entra em Calendário, escolhe origem **Google EAC**.
2. O evento apresenta selo **Não publicado**, **Publicado** ou **Revogado**.
3. Ação **Aprovar para o calendário público** requer confirmação.
4. Backend valida sessão Supabase, role ADMIN e que a identidade do evento deriva da agenda Google EAC permitida.
5. Persiste projeção pública idempotente por (calendar_id,event_id) com aprovado_por/aprovado_em.
6. O calendário público lê só linhas publicadas, por RLS; status PENDENTE/REVOGADO nunca sai ao usuário anônimo.
7. **Revogar publicação** remove visibilidade no próximo fetch, sem apagar histórico de aprovação.
8. Mudanças/cancelamentos Google exigem reconciliação com preservação da decisão de publicação; se excluído, deixar não publicado.

## Requisitos de arquitetura
- Reutilizar endpoints Serverless existentes; não exceder limite Hobby.
- Repositório público: CMOURASIGA/webappcalendariopublicoeac branch feat/google-eac-public-approval.
- Migration de projeção pública proposta nesse repositório; requer aplicação humana depois de verificação do projeto Supabase correto.
- Nunca conceder INSERT/UPDATE/DELETE de projeção para anon/authenticated.
- Backend usa service-role só no servidor, com validação explícita do ator.
- Compatibilidade: o app público atual usa Supabase vw_public_calendar_events; não substituir sua fonte nem expor Google direto no navegador.

## Critérios de aceite
- Anônimo não recebe eventos Google EAC pendentes, revogados ou da paróquia (RLS testado).
- Somente ADMIN autenticado autoriza/revoga, com auditoria.
- Aprovação, revogação e atualização refletem no site público sem redeploy.
- Testar paginação, recorrência, timezone America/Sao_Paulo, duplicidade e falhas externas.
- Typecheck, lint quando disponível, build e visual mobile/desktop PASS antes de Preview.
- Nenhum deployment parcial em produção.
