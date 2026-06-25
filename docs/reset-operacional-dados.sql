begin;

-- Preserva os usuários do painel, mas remove o vínculo opcional com pessoas
-- para permitir a limpeza das tabelas de domínio sem quebrar FK.
update public.app_user_profiles
set pessoa_id = null
where pessoa_id is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'pessoa_id'
  ) then
    execute 'update public.usuarios set pessoa_id = null where pessoa_id is not null';
  end if;
end $$;

do $$
declare
  tables_to_clear text[] := array[
    -- Tokens / auditoria / apoio
    'public.public_interest_token_audit',
    'public.public_interest_tokens',
    'public.inscricoes_status_historico',
    'public.inscricoes_duplicidade_historico',
    'public.sync_conflitos',
    'public.importacao_erros',
    'public.importacoes_planilha',
    'public.staging_planilha_linhas',
    'public.conciliacao_duplicidades',
    'public.validacao_migracao_totais',
    'public.backend_service_execucoes',
    'public.disparo_execucoes',
    'public.disparo_destinatarios',
    'public.disparos',
    'public.agenda_disparo_controle',
    'public.logs_auditoria',

    -- Distribuição / presença / comunicação
    'public.circulos_execucao_itens',
    'public.circulos_execucoes',
    'public.distribuicao_circulos_resultado',
    'public.distribuicao_circulos_execucoes',
    'public.presencas',
    'public.comunicados',
    'public.eventos_agenda',
    'public.email_mensagens',
    'public.email_chamados',

    -- Dados operacionais principais
    'public.circulo_participantes',
    'public.circulos_participantes',
    'public.nao_inscritos',
    'public.inscricoes_prioritarias',
    'public.cadastro_oficial',
    'public.circulos',
    'public.encontreiro_equipes',
    'public.encontreiros',
    'public.usuario_permissoes',
    'public.usuarios',
    'public.adolescente_responsaveis',
    'public.inscricoes',
    'public.adolescentes',
    'public.responsaveis',
    'public.pessoa_papeis',
    'public.pessoas',
    'public.encontros'
  ];
  t text;
begin
  foreach t in array tables_to_clear loop
    if to_regclass(t) is not null then
      execute 'delete from ' || t;
      raise notice 'Limpou: %', t;
    else
      raise notice 'Ignorada (nao existe): %', t;
    end if;
  end loop;
end $$;

commit;

-- Validacao rapida apos limpeza
do $$
declare
  v_perfis bigint := 0;
  v_inscricoes bigint := 0;
  v_pessoas bigint := 0;
  v_encontros bigint := 0;
begin
  if to_regclass('public.app_user_profiles') is not null then
    execute 'select count(*) from public.app_user_profiles' into v_perfis;
  end if;
  if to_regclass('public.inscricoes') is not null then
    execute 'select count(*) from public.inscricoes' into v_inscricoes;
  end if;
  if to_regclass('public.pessoas') is not null then
    execute 'select count(*) from public.pessoas' into v_pessoas;
  end if;
  if to_regclass('public.encontros') is not null then
    execute 'select count(*) from public.encontros' into v_encontros;
  end if;

  raise notice 'Perfis preservados: %', v_perfis;
  raise notice 'Inscricoes restantes: %', v_inscricoes;
  raise notice 'Pessoas restantes: %', v_pessoas;
  raise notice 'Encontros restantes: %', v_encontros;
end $$;
