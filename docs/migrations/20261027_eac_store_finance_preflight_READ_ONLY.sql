-- EAC Store Financeiro | Preflight SOMENTE LEITURA | executar em niagdoowqmngxjcrmstd
-- Não cria objetos, não concede permissões e não movimenta pedidos.
SELECT current_database() AS database_name, current_schema() AS current_schema;
SELECT to_regclass('public.eac_camisa_pre_solicitacoes') IS NOT NULL AS pre_solicitacoes,
       to_regclass('public.eac_camisa_financeiro_auditoria') IS NOT NULL AS auditoria,
       to_regclass('public.eac_camisa_email_outbox') IS NOT NULL AS email_outbox,
       to_regclass('public.camisa_solicitacoes') IS NOT NULL AS pedidos_existentes,
       to_regclass('public.encontros') IS NOT NULL AS encontros;
SELECT n.nspname AS esquema,p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_executa
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='private' AND p.proname='camisa_registrar_solicitacao')
   OR (n.nspname='public' AND p.proname IN
        ('eac_camisa_confirmar_pagamento','eac_camisa_transicao_financeira','eac_camisa_expirar_pendentes','eac_store_set_profile_grants'))
ORDER BY esquema,funcao;
SELECT c.relname AS objeto,c.relkind AS tipo,
       has_table_privilege('service_role',c.oid,'SELECT') AS pode_ler,
       has_table_privilege('service_role',c.oid,'INSERT') AS pode_inserir,
       has_table_privilege('service_role',c.oid,'UPDATE') AS pode_atualizar
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
('eac_camisa_pre_solicitacoes','eac_camisa_financeiro_auditoria','eac_camisa_email_outbox','camisa_solicitacoes')
ORDER BY objeto;
SELECT column_name,data_type,udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='app_user_profiles'
AND column_name IN ('auth_user_id','role','status','allowed_modules')
ORDER BY column_name;
SELECT id,name,public,file_size_limit
FROM storage.buckets WHERE id='camisas-comprovantes';
