-- EAC Store | instalação em base de HOMOLOGAÇÃO da loja; NÃO executar na produção sem backup.
-- Preserva as tabelas camisa_* existentes e o fluxo original. Cria a etapa financeira separada.
begin;
create table if not exists public.eac_camisa_pre_solicitacoes (
 id uuid primary key default gen_random_uuid(),
 protocolo text not null unique,
 encontro_id uuid not null references public.encontros(id),
 payload jsonb not null,
 pix_snapshot jsonb not null,
 valor_total numeric(12,2) not null check (valor_total>0),
 status text not null default 'AGUARDANDO_PAGAMENTO'
   check (status in ('AGUARDANDO_PAGAMENTO','AGUARDANDO_VALIDACAO_FINANCEIRA','CONFIRMADA','PAGAMENTO_NAO_LOCALIZADO','CANCELAMENTO_SOLICITADO','ESTORNO_PENDENTE','ESTORNADA','CANCELADA','EXPIRADA')),
 criado_em timestamptz not null default now(),
 expira_em timestamptz not null,
 pagamento_informado_em timestamptz,
 pagamento_data date,
 comprovante_path text,
 comprovante_nome text,
 confirmado_por uuid,
 confirmado_em timestamptz,
 solicitacao_oficial_id uuid unique references public.camisa_solicitacoes(id),
 cancelado_em timestamptz,
 atualizado_em timestamptz not null default now()
);
create table if not exists public.eac_camisa_financeiro_auditoria(
 id bigint generated always as identity primary key,
 pre_solicitacao_id uuid not null references public.eac_camisa_pre_solicitacoes(id),
 evento text not null,
 estado_anterior text,
 estado_novo text not null,
 ator text not null,
 detalhes jsonb not null default '{}'::jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists eac_camisa_pre_solicitacoes_status_idx on public.eac_camisa_pre_solicitacoes(status,criado_em desc);
create table if not exists public.eac_camisa_email_outbox(
 id bigint generated always as identity primary key,
 pre_solicitacao_id uuid not null references public.eac_camisa_pre_solicitacoes(id),
 evento text not null,
 destinatario text,
 estado text not null default 'PENDENTE',
 tentativas integer not null default 0,
 criado_em timestamptz not null default now(),
 unique(pre_solicitacao_id,evento)
);
alter table public.eac_camisa_pre_solicitacoes enable row level security;
alter table public.eac_camisa_financeiro_auditoria enable row level security;
alter table public.eac_camisa_email_outbox enable row level security;
revoke all on public.eac_camisa_pre_solicitacoes,public.eac_camisa_financeiro_auditoria,public.eac_camisa_email_outbox from anon,authenticated,public;
-- Operação exclusivamente via backend com credencial server-side. Nunca criar política anon para a fila financeira.
grant usage on schema private to service_role;
grant execute on function private.camisa_registrar_solicitacao(uuid,boolean,uuid,text,text,text,text,uuid,text,text,text,text,text,bigint,numeric,jsonb) to service_role;
create or replace function public.eac_camisa_confirmar_pagamento(p_id uuid,p_ator uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v public.eac_camisa_pre_solicitacoes%rowtype;
 v_result jsonb;
 v_official uuid;
begin
 if current_user <> 'service_role' then raise exception 'FORBIDDEN'; end if;
 select * into v from public.eac_camisa_pre_solicitacoes where id=p_id for update;
 if not found then raise exception 'PRE_SOLICITACAO_NAO_ENCONTRADA'; end if;
 if v.status='CONFIRMADA' and v.solicitacao_oficial_id is not null then
   return jsonb_build_object('id',v.id,'solicitacao_oficial_id',v.solicitacao_oficial_id,'already_confirmed',true);
 end if;
 if v.status<>'AGUARDANDO_VALIDACAO_FINANCEIRA' or v.comprovante_path is null then raise exception 'ESTADO_FINANCEIRO_INVALIDO'; end if;
 if (v.payload->>'valorTotal')::numeric is distinct from v.valor_total then raise exception 'VALOR_DIVERGENTE'; end if;
 -- Usa função privada existente, sob transação e lock. Não gera segundo pedido se houver tentativa repetida.
 v_result:=private.camisa_registrar_solicitacao(
   v.encontro_id,
   coalesce((v.payload->>'ehEncontreiro')::boolean,false),
   nullif(v.payload->>'solicitantePessoaId','')::uuid,
   v.payload->>'nomeSolicitante',v.payload->>'telefoneSolicitante',v.payload->>'emailSolicitante',
   v.payload->>'equipe',
   nullif(v.payload->>'beneficiarioPessoaId','')::uuid,
   v.payload->>'nomeBeneficiario',v.payload->>'observacoes',
   v.comprovante_path,v.comprovante_nome,v.payload->>'comprovanteTipo',
   nullif(v.payload->>'comprovanteTamanho','')::bigint,
   v.valor_total,v.payload->'items'
 );
 v_official:=coalesce(nullif(v_result->>'request_id','')::uuid);
 if v_official is null then raise exception 'PEDIDO_OFICIAL_NAO_RETORNADO'; end if;
 update public.eac_camisa_pre_solicitacoes
 set status='CONFIRMADA',solicitacao_oficial_id=v_official,confirmado_por=p_ator,confirmado_em=now(),atualizado_em=now()
 where id=v.id;
 insert into public.eac_camisa_financeiro_auditoria(pre_solicitacao_id,evento,estado_anterior,estado_novo,ator)
 values(v.id,'PAGAMENTO_CONFIRMADO',v.status,'CONFIRMADA',p_ator::text);
 insert into public.eac_camisa_email_outbox(pre_solicitacao_id,evento,destinatario)
 values(v.id,'PAGAMENTO_CONFIRMADO',v.payload->>'emailSolicitante') on conflict do nothing;
 return jsonb_build_object('id',v.id,'solicitacao_oficial_id',v_official,'already_confirmed',false);
end $$;
revoke all on function public.eac_camisa_confirmar_pagamento(uuid,uuid) from public,anon,authenticated;
grant execute on function public.eac_camisa_confirmar_pagamento(uuid,uuid) to service_role;
commit;

-- Campo request_id confirmado na versão main de supabase/camisas_module.sql.
-- REVISÃO EXIGIDA antes de aplicar: confirmar as funções/assinaturas instaladas
-- na base real, suas permissões e o comportamento com service_role. Exige ambiente isolado de QA e teste rollback, nunca produção direta.
