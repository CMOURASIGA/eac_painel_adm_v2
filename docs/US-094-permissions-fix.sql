-- US-094 - correcao de permissoes para fluxo de token publico
-- Execute apos US-093-094-foundation.sql

begin;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on table public.public_interest_tokens
  to anon, authenticated, service_role;

grant select, insert on table public.public_interest_token_audit
  to anon, authenticated, service_role;

grant select, insert, update on table public.cadastro_oficial
  to service_role;

commit;

