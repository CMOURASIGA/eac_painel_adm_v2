-- Presença V2 - grants necessários para o backend server-side
-- O backend usa SUPABASE_SERVICE_ROLE_KEY em utils/supabaseServer.ts.
-- Esta migration não abre acesso público: concede privilégios apenas ao papel service_role.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.presenca_responsaveis_grupos to service_role;
grant select, insert, update, delete on table public.presenca_responsavel_membros to service_role;
grant select, insert, update, delete on table public.presenca_responsavel_circulos to service_role;
grant select, insert, update, delete on table public.presenca_sessoes to service_role;
grant select, insert, update, delete on table public.presenca_sessao_eventos to service_role;
grant select, insert, update, delete on table public.presenca_pendencias to service_role;
grant select, insert, update, delete on table public.presencas to service_role;
