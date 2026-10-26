-- EAC ADMIN DB / HOMOLOGAÇÃO: RBAC granular do EAC Store com auditoria atômica.
-- Executar somente após revisão do schema real app_user_profiles, backup e QA.
begin;
create table if not exists public.eac_store_access_audit(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 actor_id uuid not null,
 previous_modules jsonb not null,
 next_modules jsonb not null,
 occurred_at timestamptz not null default now()
);
alter table public.eac_store_access_audit enable row level security;
revoke all on public.eac_store_access_audit from public,anon,authenticated;

create or replace function public.eac_store_set_profile_grants(
 p_target uuid,p_actor uuid,p_store_grants text[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 target record;
 previous jsonb;
 next_modules jsonb;
 old_other jsonb;
 column_type text;
 store_keys text[]:=array['eac_store','eac_store_financeiro','eac_store_financeiro_confirmar'];
begin
 if current_user <> 'service_role' then raise exception 'NOT_AUTHORIZED'; end if;
 if p_target=p_actor then raise exception 'SELF_CHANGE_FORBIDDEN'; end if;
 if exists(select 1 from unnest(p_store_grants) g where not(g=any(store_keys))) then
   raise exception 'INVALID_STORE_GRANT';
 end if;
 select * into target from public.app_user_profiles where auth_user_id=p_target for update;
 if not found or upper(target.role)='ADMIN' then raise exception 'TARGET_NOT_ALLOWED'; end if;
 previous:=coalesce(to_jsonb(target)->'allowed_modules','[]'::jsonb);
 if jsonb_typeof(previous)<>'array' then raise exception 'MODULES_NOT_ARRAY'; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into old_other
 from jsonb_array_elements_text(previous) as x where not(x=any(store_keys));
 select coalesce(jsonb_agg(distinct val),'[]'::jsonb) into next_modules
 from jsonb_array_elements_text(old_other||to_jsonb(p_store_grants)) as val;
 select data_type into column_type from information_schema.columns
 where table_schema='public' and table_name='app_user_profiles' and column_name='allowed_modules';
 if column_type='ARRAY' then
   execute 'update public.app_user_profiles set allowed_modules=$1 where auth_user_id=$2'
     using array(select jsonb_array_elements_text(next_modules)),p_target;
 elsif column_type='jsonb' then
   execute 'update public.app_user_profiles set allowed_modules=$1 where auth_user_id=$2'
     using next_modules,p_target;
 else raise exception 'UNSUPPORTED_MODULE_TYPE'; end if;
 insert into public.eac_store_access_audit(user_id,actor_id,previous_modules,next_modules)
 values(p_target,p_actor,previous,next_modules);
 return jsonb_build_object('userId',p_target,'grants',to_jsonb(p_store_grants));
end $$;
revoke all on function public.eac_store_set_profile_grants(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.eac_store_set_profile_grants(uuid,uuid,text[]) to service_role;
commit;
