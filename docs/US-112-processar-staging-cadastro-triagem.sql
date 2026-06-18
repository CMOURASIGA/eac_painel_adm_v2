-- US-112 - Processamento de staging para Cadastro Oficial + Triagem
--
-- Objetivo
-- 1) Processar a aba "Cadastro Oficial" como base mestre do cadastro de encontristas.
-- 2) Processar a aba "Respostas ao formulário 1" apenas para quem AINDA NAO consta
--    no cadastro oficial ativo, enviando esses casos para triagem.
--
-- Observacao importante
-- - Este script NAO trata "nao inscritos", "priorizados", "circulos" ou "presenca".
-- - A base de encontreiros precisa de mapeamento proprio da aba/origem correspondente.
-- - O script assume as tabelas operacionais ja existentes no projeto atual.

begin;

drop function if exists public.eac_pick_text(jsonb, text[]);
drop function if exists public.eac_norm_text(text);
drop function if exists public.eac_norm_digits(text);
drop function if exists public.eac_parse_date(text);
drop function if exists public.eac_is_yes(text);
drop function if exists public.eac_parse_bool(text);
drop function if exists public.eac_origem_planilha(text, integer);
drop function if exists public.eac_find_pessoa(text, text, text, date);
drop function if exists public.eac_upsert_pessoa(text, text, text, date, text, text, text, text, boolean);
drop function if exists public.eac_ensure_papel(uuid, text, text);
drop function if exists public.eac_ensure_adolescente(uuid, boolean, boolean, text);
drop function if exists public.eac_ensure_responsavel(uuid, text, text, text, text);
drop function if exists public.eac_ensure_vinculo_responsavel(uuid, uuid, text, text);
drop function if exists public.eac_find_cadastro_oficial_match(text, text, text, date);
drop function if exists public.eac_ensure_cadastro_oficial(uuid, uuid, text, text, text);
drop function if exists public.eac_ensure_inscricao(uuid, uuid, text, text, text, text, text);
drop function if exists public.eac_ensure_encontreiro(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.fn_processar_staging_cadastro_oficial(uuid, uuid, text);
drop function if exists public.fn_processar_staging_cadastro_oficial(uuid, uuid, uuid, integer, text);
drop function if exists public.fn_processar_staging_respostas_triagem(uuid, uuid, text);
drop function if exists public.fn_processar_staging_encontreiros(uuid, text);
drop function if exists public.fn_processar_staging_cadastro_e_triagem(uuid, uuid, uuid);
drop function if exists public.fn_processar_staging_cadastro_e_triagem(uuid, uuid, uuid, integer, uuid, uuid);

create or replace function public.eac_pick_text(payload jsonb, keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  if payload is null then
    return null;
  end if;

  foreach k in array keys loop
    v := nullif(btrim(coalesce(payload ->> k, '')), '');
    if v is not null then
      return v;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.eac_norm_text(v text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(v, ''))), '')
$$;

create or replace function public.eac_norm_digits(v text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(v, ''), '\D', '', 'g'), '')
$$;

create or replace function public.eac_parse_date(v text)
returns date
language plpgsql
immutable
as $$
declare
  raw text := nullif(btrim(coalesce(v, '')), '');
begin
  if raw is null then
    return null;
  end if;

  if raw ~ '^\d{4}-\d{2}-\d{2}' then
    return left(raw, 10)::date;
  end if;

  if raw ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(raw, 'DD/MM/YYYY');
  end if;

  if raw ~ '^\d{4}/\d{2}/\d{2}$' then
    return to_date(raw, 'YYYY/MM/DD');
  end if;

  begin
    return raw::date;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.eac_is_yes(v text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(btrim(v)), '') in ('sim', 's', 'yes', 'y', 'true', '1')
$$;

create or replace function public.eac_parse_bool(v text)
returns boolean
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(v, '')), '') is null then null
    when lower(btrim(v)) in ('sim', 's', 'yes', 'y', 'true', '1') then true
    when lower(btrim(v)) in ('nao', 'não', 'n', 'no', 'false', '0') then false
    else true
  end
$$;

create or replace function public.eac_origem_planilha(nome_aba text, numero_linha integer)
returns text
language sql
immutable
as $$
  select concat_ws(':', nullif(btrim(nome_aba), ''), numero_linha::text)
$$;

create or replace function public.eac_find_pessoa(
  p_nome text,
  p_email text,
  p_telefone text,
  p_data_nascimento date
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_email_norm text := public.eac_norm_text(p_email);
  v_tel_norm text := public.eac_norm_digits(p_telefone);
  v_nome_norm text := public.eac_norm_text(p_nome);
begin
  if v_email_norm is not null then
    select p.id
      into v_id
      from public.pessoas p
     where lower(coalesce(p.email, '')) = v_email_norm
     order by p.id
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_tel_norm is not null then
    select p.id
      into v_id
      from public.pessoas p
     where regexp_replace(coalesce(p.telefone_normalizado, p.telefone, ''), '\D', '', 'g') = v_tel_norm
     order by p.id
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if v_nome_norm is not null and p_data_nascimento is not null then
    select p.id
      into v_id
      from public.pessoas p
     where lower(coalesce(p.nome_normalizado, p.nome_completo, '')) = v_nome_norm
       and p.data_nascimento = p_data_nascimento
     order by p.id
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.eac_upsert_pessoa(
  p_nome text,
  p_email text,
  p_telefone text,
  p_data_nascimento date,
  p_sexo text,
  p_bairro text,
  p_observacoes text,
  p_origem text default 'PLANILHA',
  p_criado_via_sistema boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_email_norm text := public.eac_norm_text(p_email);
  v_tel_norm text := public.eac_norm_digits(p_telefone);
begin
  v_id := public.eac_find_pessoa(p_nome, p_email, p_telefone, p_data_nascimento);

  if v_id is not null then
    update public.pessoas
       set nome_completo = coalesce(nullif(p_nome, ''), nome_completo),
           nome_normalizado = coalesce(public.eac_norm_text(p_nome), nome_normalizado),
           data_nascimento = coalesce(p_data_nascimento, data_nascimento),
           sexo = coalesce(nullif(p_sexo, ''), sexo),
           telefone = coalesce(nullif(p_telefone, ''), telefone),
           telefone_normalizado = coalesce(v_tel_norm, telefone_normalizado),
           email = coalesce(nullif(lower(coalesce(p_email, '')), ''), email),
           email_normalizado = coalesce(v_email_norm, email_normalizado),
           bairro = coalesce(nullif(p_bairro, ''), bairro),
           observacoes = coalesce(nullif(p_observacoes, ''), observacoes),
           origem_dado = coalesce(origem_dado, p_origem),
           criado_via_sistema = coalesce(criado_via_sistema, p_criado_via_sistema),
           ultima_sincronizacao = now()
     where id = v_id;

    return v_id;
  end if;

  insert into public.pessoas (
    nome_completo,
    nome_normalizado,
    data_nascimento,
    sexo,
    telefone,
    telefone_normalizado,
    email,
    email_normalizado,
    bairro,
    observacoes,
    origem_dado,
    criado_via_sistema,
    data_importacao,
    ultima_sincronizacao
  ) values (
    p_nome,
    public.eac_norm_text(p_nome),
    p_data_nascimento,
    nullif(p_sexo, ''),
    p_telefone,
    v_tel_norm,
    lower(nullif(p_email, '')),
    v_email_norm,
    p_bairro,
    p_observacoes,
    p_origem,
    p_criado_via_sistema,
    now(),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.eac_ensure_papel(
  p_pessoa_id uuid,
  p_papel text,
  p_origem text default 'PLANILHA'
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.pessoa_papeis
   where pessoa_id = p_pessoa_id
     and papel = p_papel
   limit 1;

  if v_id is null then
    insert into public.pessoa_papeis (pessoa_id, papel, ativo)
    values (p_pessoa_id, p_papel, true);
  else
    update public.pessoa_papeis
       set ativo = true,
           atualizado_em = now()
     where id = v_id;
  end if;
end;
$$;

create or replace function public.eac_ensure_adolescente(
  p_pessoa_id uuid,
  p_aceite_normas boolean default true,
  p_ja_fez_eac boolean default false,
  p_origem text default 'PLANILHA'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.adolescentes
   where pessoa_id = p_pessoa_id
   limit 1;

  if v_id is null then
    insert into public.adolescentes (
      pessoa_id,
      aceite_normas,
      ja_fez_eac,
      origem_dado,
      criado_via_sistema,
      data_importacao
    ) values (
      p_pessoa_id,
      coalesce(p_aceite_normas, true),
      coalesce(p_ja_fez_eac, false),
      p_origem,
      false,
      now()
    )
    returning id into v_id;
  else
    update public.adolescentes
       set aceite_normas = coalesce(aceite_normas, p_aceite_normas, true),
           ja_fez_eac = coalesce(ja_fez_eac, p_ja_fez_eac, false),
           origem_dado = coalesce(origem_dado, p_origem)
     where id = v_id;
  end if;

  perform public.eac_ensure_papel(p_pessoa_id, 'ENCONTRISTA', p_origem);
  return v_id;
end;
$$;

create or replace function public.eac_ensure_responsavel(
  p_pessoa_id uuid,
  p_nome text,
  p_email text,
  p_telefone text,
  p_origem text default 'PLANILHA'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.responsaveis
   where pessoa_id = p_pessoa_id
   limit 1;

  if v_id is null then
    insert into public.responsaveis (
      pessoa_id,
      nome,
      telefone,
      telefone_normalizado,
      email,
      email_normalizado,
      origem_dado,
      criado_via_sistema,
      data_importacao
    ) values (
      p_pessoa_id,
      p_nome,
      p_telefone,
      public.eac_norm_digits(p_telefone),
      lower(nullif(p_email, '')),
      public.eac_norm_text(p_email),
      p_origem,
      false,
      now()
    )
    returning id into v_id;
  else
    update public.responsaveis
       set nome = coalesce(nullif(p_nome, ''), nome),
           telefone = coalesce(nullif(p_telefone, ''), telefone),
           telefone_normalizado = coalesce(public.eac_norm_digits(p_telefone), telefone_normalizado),
           email = coalesce(lower(nullif(p_email, '')), email),
           email_normalizado = coalesce(public.eac_norm_text(p_email), email_normalizado),
           origem_dado = coalesce(origem_dado, p_origem)
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.eac_ensure_vinculo_responsavel(
  p_adolescente_id uuid,
  p_responsavel_id uuid,
  p_grau_parentesco text default 'Pai/Mãe',
  p_origem text default 'PLANILHA'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.adolescente_responsaveis
   where adolescente_id = p_adolescente_id
     and responsavel_id = p_responsavel_id
   limit 1;

  if v_id is null then
    insert into public.adolescente_responsaveis (
      adolescente_id,
      responsavel_id,
      principal,
      grau_parentesco,
      origem_dado,
      criado_via_sistema,
      data_importacao
    ) values (
      p_adolescente_id,
      p_responsavel_id,
      true,
      p_grau_parentesco,
      p_origem,
      false,
      now()
    )
    returning id into v_id;
  else
    update public.adolescente_responsaveis
       set principal = true,
           grau_parentesco = coalesce(nullif(p_grau_parentesco, ''), grau_parentesco),
           origem_dado = coalesce(origem_dado, p_origem)
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.eac_find_cadastro_oficial_match(
  p_nome text,
  p_email text,
  p_telefone text,
  p_data_nascimento date
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_email_norm text := public.eac_norm_text(p_email);
  v_tel_norm text := public.eac_norm_digits(p_telefone);
  v_nome_norm text := public.eac_norm_text(p_nome);
begin
  select co.id
    into v_id
    from public.cadastro_oficial co
    join public.pessoas p on p.id = co.pessoa_id
   where co.ativo = true
     and (
       (v_email_norm is not null and lower(coalesce(p.email, '')) = v_email_norm)
       or (v_tel_norm is not null and regexp_replace(coalesce(p.telefone_normalizado, p.telefone, ''), '\D', '', 'g') = v_tel_norm)
       or (
         v_nome_norm is not null
         and p_data_nascimento is not null
         and lower(coalesce(p.nome_normalizado, p.nome_completo, '')) = v_nome_norm
         and p.data_nascimento = p_data_nascimento
       )
     )
   order by co.id
   limit 1;

  return v_id;
end;
$$;

create or replace function public.eac_ensure_cadastro_oficial(
  p_pessoa_id uuid,
  p_encontro_id uuid default null,
  p_status text default 'ATIVO',
  p_observacoes text default null,
  p_origem text default 'PLANILHA'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.cadastro_oficial
   where pessoa_id = p_pessoa_id
     and ativo = true
   limit 1;

  if v_id is null then
    insert into public.cadastro_oficial (
      pessoa_id,
      encontro_id,
      origem,
      status,
      elegivel_encontreiro,
      observacoes,
      ativo
    ) values (
      p_pessoa_id,
      p_encontro_id,
      p_origem,
      p_status,
      false,
      p_observacoes,
      true
    )
    returning id into v_id;
  else
    update public.cadastro_oficial
       set encontro_id = coalesce(encontro_id, p_encontro_id),
           origem = coalesce(origem, p_origem),
           status = coalesce(nullif(p_status, ''), status),
           observacoes = coalesce(nullif(p_observacoes, ''), observacoes),
           atualizado_em = now(),
           ultima_sincronizacao = now()
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.eac_ensure_inscricao(
  p_encontro_id uuid,
  p_adolescente_id uuid,
  p_status text,
  p_email_adolescente text,
  p_email_responsavel text,
  p_id_origem_planilha text,
  p_origem text default 'PLANILHA'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.inscricoes
   where encontro_id = p_encontro_id
     and adolescente_id = p_adolescente_id
   order by id
   limit 1;

  if v_id is null then
    insert into public.inscricoes (
      encontro_id,
      adolescente_id,
      email_adolescente_snapshot,
      email_responsavel_snapshot,
      email_destino_snapshot,
      status,
      origem_dado,
      criado_via_sistema,
      data_inscricao,
      data_importacao,
      id_origem_planilha,
      ultima_sincronizacao,
      criado_em,
      atualizado_em
    ) values (
      p_encontro_id,
      p_adolescente_id,
      lower(nullif(p_email_adolescente, '')),
      lower(nullif(p_email_responsavel, '')),
      lower(nullif(coalesce(nullif(p_email_responsavel, ''), nullif(p_email_adolescente, '')), '')),
      p_status,
      p_origem,
      false,
      now(),
      now(),
      p_id_origem_planilha,
      now(),
      now(),
      now()
    )
    returning id into v_id;
  else
    update public.inscricoes
       set email_adolescente_snapshot = coalesce(lower(nullif(p_email_adolescente, '')), email_adolescente_snapshot),
           email_responsavel_snapshot = coalesce(lower(nullif(p_email_responsavel, '')), email_responsavel_snapshot),
           email_destino_snapshot = coalesce(
             lower(nullif(coalesce(nullif(p_email_responsavel, ''), nullif(p_email_adolescente, '')), '')),
             email_destino_snapshot
           ),
           status = coalesce(nullif(p_status, ''), status),
           id_origem_planilha = coalesce(nullif(p_id_origem_planilha, ''), id_origem_planilha),
           ultima_sincronizacao = now(),
           atualizado_em = now()
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.eac_ensure_encontreiro(
  p_pessoa_id uuid,
  p_nome_completo text,
  p_data_nascimento date,
  p_idade text,
  p_email text,
  p_celular_whatsapp text,
  p_endereco_completo text,
  p_responsavel_contato text,
  p_bairro text,
  p_frequenta_missas text,
  p_onde_missas text,
  p_participa_movimento text,
  p_movimento_paroquia text,
  p_paroquia_fez_eac text,
  p_ja_trabalhou_eac text,
  p_ja_coordenou_equipe text,
  p_pais_fizeram_encontro text,
  p_possui_alergia text,
  p_toma_remedio text,
  p_alimentacao_especial text,
  p_sugestao_ultimo_encontro text,
  p_dica_pos_encontro text,
  p_classificacao text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_classificacao_raw text := lower(btrim(coalesce(p_classificacao, '')));
  v_classificacao text := case
    when v_classificacao_raw in ('adolescente', 'teen', 'menor') then 'ADOLESCENTE'
    when v_classificacao_raw in ('adulto', 'adulta', 'adult') then 'ADULTO'
    when v_classificacao_raw in ('outro', 'outra') then 'OUTRO'
    when nullif(btrim(coalesce(p_idade, '')), '') ~ '^\d+$' and p_idade::int <= 17 then 'ADOLESCENTE'
    when nullif(btrim(coalesce(p_idade, '')), '') ~ '^\d+$' then 'ADULTO'
    else 'OUTRO'
  end;
  v_frequenta_missas boolean := public.eac_parse_bool(p_frequenta_missas);
  v_participa_movimento boolean := public.eac_parse_bool(p_participa_movimento);
  v_ja_trabalhou_eac boolean := public.eac_parse_bool(p_ja_trabalhou_eac);
  v_ja_coordenou_equipe boolean := public.eac_parse_bool(p_ja_coordenou_equipe);
  v_pais_fizeram_encontro boolean := public.eac_parse_bool(p_pais_fizeram_encontro);
  v_possui_alergia boolean := public.eac_parse_bool(p_possui_alergia);
  v_toma_remedio boolean := public.eac_parse_bool(p_toma_remedio);
  v_alimentacao_especial boolean := public.eac_parse_bool(p_alimentacao_especial);
  v_observacoes text := nullif(concat_ws(' | ',
    nullif(btrim(coalesce(p_nome_completo, '')), ''),
    nullif('Nascimento=' || coalesce(p_data_nascimento::text, ''), 'Nascimento='),
    nullif('Idade=' || btrim(coalesce(p_idade, '')), 'Idade='),
    nullif('Email=' || btrim(coalesce(p_email, '')), 'Email='),
    nullif('WhatsApp=' || btrim(coalesce(p_celular_whatsapp, '')), 'WhatsApp='),
    nullif('Endereco=' || btrim(coalesce(p_endereco_completo, '')), 'Endereco='),
    nullif('Responsavel=' || btrim(coalesce(p_responsavel_contato, '')), 'Responsavel='),
    nullif('Bairro=' || btrim(coalesce(p_bairro, '')), 'Bairro=')
  ), '');
begin
  select id
    into v_id
    from public.encontreiros
   where pessoa_id = p_pessoa_id
   limit 1;

  if v_id is null then
    insert into public.encontreiros (
      pessoa_id,
      frequenta_missas,
      onde_frequenta_missas,
      participa_movimento,
      movimento_paroquia,
      paroquia_fez_eac,
      ja_trabalhou_eac,
      ja_coordenou_equipe,
      pais_fizeram_encontro,
      possui_alergia,
      alergia_descricao,
      toma_remedio,
      remedio_descricao,
      alimentacao_especial,
      alimentacao_descricao,
      sugestao_ultimo_encontro,
      dica_pos_encontro,
      classificacao,
      status,
      observacoes,
      origem,
      origem_dado,
      criado_via_sistema,
      data_importacao,
      ultima_sincronizacao
    ) values (
      p_pessoa_id,
      coalesce(v_frequenta_missas, false),
      nullif(p_onde_missas, ''),
      coalesce(v_participa_movimento, false),
      p_movimento_paroquia,
      p_paroquia_fez_eac,
      coalesce(v_ja_trabalhou_eac, false),
      coalesce(v_ja_coordenou_equipe, false),
      coalesce(v_pais_fizeram_encontro, false),
      coalesce(v_possui_alergia, false),
      case when coalesce(v_possui_alergia, false) then nullif(p_possui_alergia, '') else null end,
      coalesce(v_toma_remedio, false),
      case when coalesce(v_toma_remedio, false) then nullif(p_toma_remedio, '') else null end,
      coalesce(v_alimentacao_especial, false),
      case when coalesce(v_alimentacao_especial, false) then nullif(p_alimentacao_especial, '') else null end,
      p_sugestao_ultimo_encontro,
      p_dica_pos_encontro,
      v_classificacao,
      'DISPONIVEL',
      v_observacoes,
      'PLANILHA',
      'PLANILHA',
      false,
      now(),
      now()
    )
    returning id into v_id;
  else
    update public.encontreiros
       set frequenta_missas = coalesce(v_frequenta_missas, frequenta_missas),
           onde_frequenta_missas = coalesce(nullif(p_onde_missas, ''), onde_frequenta_missas),
           participa_movimento = coalesce(v_participa_movimento, participa_movimento),
           movimento_paroquia = coalesce(nullif(p_movimento_paroquia, ''), movimento_paroquia),
           paroquia_fez_eac = coalesce(nullif(p_paroquia_fez_eac, ''), paroquia_fez_eac),
           ja_trabalhou_eac = coalesce(v_ja_trabalhou_eac, ja_trabalhou_eac),
           ja_coordenou_equipe = coalesce(v_ja_coordenou_equipe, ja_coordenou_equipe),
           pais_fizeram_encontro = coalesce(v_pais_fizeram_encontro, pais_fizeram_encontro),
           possui_alergia = coalesce(v_possui_alergia, possui_alergia),
           alergia_descricao = case
             when v_possui_alergia is true then coalesce(nullif(p_possui_alergia, ''), alergia_descricao)
             else alergia_descricao
           end,
           toma_remedio = coalesce(v_toma_remedio, toma_remedio),
           remedio_descricao = case
             when v_toma_remedio is true then coalesce(nullif(p_toma_remedio, ''), remedio_descricao)
             else remedio_descricao
           end,
           alimentacao_especial = coalesce(v_alimentacao_especial, alimentacao_especial),
           alimentacao_descricao = case
             when v_alimentacao_especial is true then coalesce(nullif(p_alimentacao_especial, ''), alimentacao_descricao)
             else alimentacao_descricao
           end,
           sugestao_ultimo_encontro = coalesce(nullif(p_sugestao_ultimo_encontro, ''), sugestao_ultimo_encontro),
           dica_pos_encontro = coalesce(nullif(p_dica_pos_encontro, ''), dica_pos_encontro),
           classificacao = coalesce(nullif(v_classificacao, ''), classificacao),
           observacoes = coalesce(v_observacoes, observacoes),
           origem = coalesce(origem, 'PLANILHA'),
           origem_dado = coalesce(origem_dado, 'PLANILHA'),
           ultima_sincronizacao = now(),
           atualizado_em = now()
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.fn_processar_staging_cadastro_oficial(
  p_encontro_id_antes_corte uuid default null,
  p_encontro_id_apos_corte uuid default null,
  p_numero_linha_corte integer default null,
  p_importacao_id uuid default null,
  p_nome_aba text default 'Cadastro Oficial'
)
returns table (
  linhas_processadas integer,
  cadastros_criados_ou_atualizados integer,
  inscricoes_criadas_ou_atualizadas integer,
  erros integer
)
language plpgsql
security definer
as $$
declare
  r record;
  v_nome text;
  v_email text;
  v_telefone text;
  v_sexo text;
  v_bairro text;
  v_nascimento date;
  v_sexo text;
  v_observacoes text;
  v_resp_nome text;
  v_resp_email text;
  v_resp_tel text;
  v_pessoa_id uuid;
  v_adolescente_id uuid;
  v_cadastro_id uuid;
  v_inscricao_id uuid;
  v_resp_pessoa_id uuid;
  v_resp_id uuid;
  v_encontro_id_linha uuid;
begin
  linhas_processadas := 0;
  cadastros_criados_ou_atualizados := 0;
  inscricoes_criadas_ou_atualizadas := 0;
  erros := 0;

  for r in
    select *
      from public.staging_planilha_linhas
     where nome_aba = p_nome_aba
       and coalesce(status_processamento, 'PENDENTE') = 'PENDENTE'
       and (p_importacao_id is null or importacao_id = p_importacao_id)
     order by numero_linha
  loop
    begin
      v_nome := public.eac_pick_text(r.payload, array['Nome', 'nome', 'Nome completo', 'nome_completo']);
      v_email := public.eac_pick_text(r.payload, array['E-mail', 'email', 'Email']);
      v_telefone := public.eac_pick_text(r.payload, array['Telefone', 'telefone', 'Telefone de contato', 'whatsapp']);
      v_bairro := public.eac_pick_text(r.payload, array['Bairro', 'bairro']);
      v_nascimento := public.eac_parse_date(public.eac_pick_text(r.payload, array['Nascimento', 'nascimento', 'Data de nascimento (DD/MM/AAAA)', 'data_nascimento']));
      v_sexo := public.eac_pick_text(r.payload, array['Sexo', 'sexo', 'genero', 'gênero']);
      v_resp_nome := public.eac_pick_text(r.payload, array['Responsavel Nome', 'responsavelNome', 'Nome do responsável']);
      v_resp_email := public.eac_pick_text(r.payload, array['Responsavel E-mail', 'responsavelEmail', 'E-mail do responsável']);
      v_resp_tel := public.eac_pick_text(r.payload, array['Responsavel Telefone', 'responsavelTel', 'Telefone do responsável']);
      v_observacoes := public.eac_pick_text(r.payload, array['Tempo de Paroquia', 'tempoParoquia', 'Participa de algum grupo ou ministério? Qual?', 'Quais suas expectativas para o encontro?']);

      if v_nome is null then
        raise exception 'Linha sem nome suficiente para carga do cadastro oficial.';
      end if;

      v_encontro_id_linha := case
        when p_numero_linha_corte is not null
          and p_encontro_id_apos_corte is not null
          and r.numero_linha >= p_numero_linha_corte
        then p_encontro_id_apos_corte
        else p_encontro_id_antes_corte
      end;

      v_pessoa_id := public.eac_upsert_pessoa(
        v_nome,
        v_email,
        v_telefone,
        v_nascimento,
        v_sexo,
        v_bairro,
        v_observacoes,
        'PLANILHA',
        false
      );

      v_adolescente_id := public.eac_ensure_adolescente(
        v_pessoa_id,
        true,
        false,
        'PLANILHA'
      );

      if coalesce(v_resp_nome, v_resp_email, v_resp_tel) is not null then
        v_resp_pessoa_id := public.eac_upsert_pessoa(
          coalesce(v_resp_nome, 'Responsável de ' || v_nome),
          v_resp_email,
          v_resp_tel,
          null,
          null,
          null,
          null,
          'PLANILHA',
          false
        );

        v_resp_id := public.eac_ensure_responsavel(
          v_resp_pessoa_id,
          coalesce(v_resp_nome, 'Responsável de ' || v_nome),
          v_resp_email,
          v_resp_tel,
          'PLANILHA'
        );

        perform public.eac_ensure_vinculo_responsavel(
          v_adolescente_id,
          v_resp_id,
          'Pai/Mãe',
          'PLANILHA'
        );
      end if;

      v_cadastro_id := public.eac_ensure_cadastro_oficial(
        v_pessoa_id,
        v_encontro_id_linha,
        'ATIVO',
        'Carga via staging - Cadastro Oficial',
        'PLANILHA'
      );
      cadastros_criados_ou_atualizados := cadastros_criados_ou_atualizados + 1;

      if v_encontro_id_linha is not null then
        v_inscricao_id := public.eac_ensure_inscricao(
          v_encontro_id_linha,
          v_adolescente_id,
          'INSCRITO',
          v_email,
          v_resp_email,
          public.eac_origem_planilha(r.nome_aba, r.numero_linha),
          'PLANILHA'
        );
        if v_inscricao_id is not null then
          inscricoes_criadas_ou_atualizadas := inscricoes_criadas_ou_atualizadas + 1;
        end if;
      end if;

      update public.staging_planilha_linhas
         set status_processamento = 'PROCESSADO',
             entidade_destino = 'CADASTRO_OFICIAL',
             entidade_destino_id = v_cadastro_id,
             mensagem_erro = null,
             processado_em = now()
       where id = r.id;

      linhas_processadas := linhas_processadas + 1;
    exception
      when others then
        update public.staging_planilha_linhas
           set status_processamento = 'ERRO',
               entidade_destino = null,
               entidade_destino_id = null,
               mensagem_erro = left(sqlerrm, 1000),
               processado_em = now()
         where id = r.id;

        erros := erros + 1;
    end;
  end loop;

  return next;
end;
$$;

create or replace function public.fn_processar_staging_respostas_triagem(
  p_encontro_id uuid,
  p_importacao_id uuid default null,
  p_nome_aba text default 'Respostas ao formulário 1'
)
returns table (
  linhas_enviadas_para_triagem integer,
  linhas_ignoradas_por_cadastro_oficial integer,
  inscricoes_criadas_ou_atualizadas integer,
  erros integer
)
language plpgsql
security definer
as $$
declare
  r record;
  v_nome text;
  v_email text;
  v_telefone text;
  v_bairro text;
  v_nascimento date;
  v_sexo text;
  v_resp_nome text;
  v_resp_email text;
  v_resp_tel text;
  v_aceite boolean;
  v_ja_fez boolean;
  v_cadastro_oficial_match uuid;
  v_pessoa_id uuid;
  v_adolescente_id uuid;
  v_resp_pessoa_id uuid;
  v_resp_id uuid;
  v_inscricao_id uuid;
begin
  linhas_enviadas_para_triagem := 0;
  linhas_ignoradas_por_cadastro_oficial := 0;
  inscricoes_criadas_ou_atualizadas := 0;
  erros := 0;

  for r in
    select *
      from public.staging_planilha_linhas
     where nome_aba = p_nome_aba
       and coalesce(status_processamento, 'PENDENTE') = 'PENDENTE'
       and (p_importacao_id is null or importacao_id = p_importacao_id)
     order by numero_linha
  loop
    begin
      v_nome := public.eac_pick_text(r.payload, array['Nome completo', 'nome_completo', 'Nome']);
      v_email := public.eac_pick_text(r.payload, array['E-mail', 'email', 'Email']);
      v_telefone := public.eac_pick_text(r.payload, array['Telefone de contato', 'telefone', 'Telefone']);
      v_bairro := public.eac_pick_text(r.payload, array['Bairro', 'bairro']);
      v_nascimento := public.eac_parse_date(public.eac_pick_text(r.payload, array['Data de nascimento (DD/MM/AAAA)', 'data_nascimento', 'Nascimento']));
      v_sexo := public.eac_pick_text(r.payload, array['Sexo', 'sexo', 'genero', 'gênero']);
      v_resp_nome := public.eac_pick_text(r.payload, array['Nome do responsável', 'Responsavel Nome', 'responsavelNome']);
      v_resp_email := public.eac_pick_text(r.payload, array['E-mail do responsável', 'Responsavel E-mail', 'responsavelEmail']);
      v_resp_tel := public.eac_pick_text(r.payload, array['Telefone do responsável', 'Responsavel Telefone', 'responsavelTel']);
      v_aceite := public.eac_is_yes(public.eac_pick_text(r.payload, array['Estou ciente e concordo com as normas do evento.', 'concordaNormas']));
      v_ja_fez := public.eac_is_yes(public.eac_pick_text(r.payload, array['Já fez o EAC', 'ja_fez_eac', 'jaFezEac']));

      if v_nome is null or v_nascimento is null then
        if coalesce(v_nome, v_nascimento::text, v_email, v_telefone, v_resp_nome, v_resp_email, v_resp_tel) is null then
          update public.staging_planilha_linhas
             set status_processamento = 'PROCESSADO',
                 entidade_destino = 'IGNORADO',
                 entidade_destino_id = null,
                 mensagem_erro = 'Linha residual ignorada por ausência de dados mínimos.',
                 processado_em = now()
           where id = r.id;

          continue;
        end if;

        raise exception 'Linha sem nome ou data de nascimento suficiente para triagem.';
      end if;

      v_cadastro_oficial_match := public.eac_find_cadastro_oficial_match(
        v_nome,
        coalesce(v_email, v_resp_email),
        coalesce(v_telefone, v_resp_tel),
        v_nascimento
      );

      if v_cadastro_oficial_match is not null then
        update public.staging_planilha_linhas
           set status_processamento = 'PROCESSADO',
               entidade_destino = 'CADASTRO_OFICIAL_EXISTENTE',
               entidade_destino_id = v_cadastro_oficial_match,
               mensagem_erro = 'Registro já contemplado no cadastro oficial; não enviado para triagem.',
               processado_em = now()
         where id = r.id;

        linhas_ignoradas_por_cadastro_oficial := linhas_ignoradas_por_cadastro_oficial + 1;
        continue;
      end if;

      v_pessoa_id := public.eac_upsert_pessoa(
        v_nome,
        v_email,
        v_telefone,
        v_nascimento,
        v_sexo,
        v_bairro,
        'Carga via staging - Respostas ao formulário 1',
        'PLANILHA',
        false
      );

      v_adolescente_id := public.eac_ensure_adolescente(
        v_pessoa_id,
        coalesce(v_aceite, true),
        coalesce(v_ja_fez, false),
        'PLANILHA'
      );

      if coalesce(v_resp_nome, v_resp_email, v_resp_tel) is not null then
        v_resp_pessoa_id := public.eac_upsert_pessoa(
          coalesce(v_resp_nome, 'Responsável de ' || v_nome),
          v_resp_email,
          v_resp_tel,
          null,
          null,
          null,
          null,
          'PLANILHA',
          false
        );

        v_resp_id := public.eac_ensure_responsavel(
          v_resp_pessoa_id,
          coalesce(v_resp_nome, 'Responsável de ' || v_nome),
          v_resp_email,
          v_resp_tel,
          'PLANILHA'
        );

        perform public.eac_ensure_vinculo_responsavel(
          v_adolescente_id,
          v_resp_id,
          'Pai/Mãe',
          'PLANILHA'
        );
      end if;

      v_inscricao_id := public.eac_ensure_inscricao(
        p_encontro_id,
        v_adolescente_id,
        'EM_ANALISE',
        v_email,
        v_resp_email,
        public.eac_origem_planilha(r.nome_aba, r.numero_linha),
        'PLANILHA'
      );

      update public.staging_planilha_linhas
         set status_processamento = 'PROCESSADO',
             entidade_destino = 'INSCRICAO_TRIAGEM',
             entidade_destino_id = v_inscricao_id,
             mensagem_erro = null,
             processado_em = now()
       where id = r.id;

      linhas_enviadas_para_triagem := linhas_enviadas_para_triagem + 1;
      inscricoes_criadas_ou_atualizadas := inscricoes_criadas_ou_atualizadas + 1;
    exception
      when others then
        update public.staging_planilha_linhas
           set status_processamento = 'ERRO',
               entidade_destino = null,
               entidade_destino_id = null,
               mensagem_erro = left(sqlerrm, 1000),
               processado_em = now()
         where id = r.id;

        erros := erros + 1;
    end;
  end loop;

  return next;
end;
$$;

create or replace function public.fn_processar_staging_encontreiros(
  p_importacao_id uuid default null,
  p_nome_aba text default 'Encontreiros'
)
returns table (
  linhas_processadas integer,
  encontreiros_criados_ou_atualizados integer,
  erros integer
)
language plpgsql
security definer
as $$
declare
  r record;
  v_nome text;
  v_email text;
  v_telefone text;
  v_bairro text;
  v_endereco text;
  v_nascimento date;
  v_idade text;
  v_resp_contato text;
  v_frequenta_missas text;
  v_onde_missas text;
  v_participa_movimento text;
  v_movimento_paroquia text;
  v_paroquia_fez_eac text;
  v_ja_trabalhou_eac text;
  v_ja_coordenou_equipe text;
  v_pais_fizeram_encontro text;
  v_possui_alergia text;
  v_toma_remedio text;
  v_alimentacao_especial text;
  v_sugestao text;
  v_dica text;
  v_classificacao text;
  v_pessoa_id uuid;
  v_encontreiro_id uuid;
begin
  linhas_processadas := 0;
  encontreiros_criados_ou_atualizados := 0;
  erros := 0;

  for r in
    select *
      from public.staging_planilha_linhas
     where (p_nome_aba is null or nome_aba = p_nome_aba)
       and coalesce(status_processamento, 'PENDENTE') = 'PENDENTE'
       and (p_importacao_id is null or importacao_id = p_importacao_id)
     order by numero_linha
  loop
    begin
      v_nome := public.eac_pick_text(r.payload, array['nome_completo', 'nomeCompleto', 'Nome completo', 'Nome', 'nome']);
      v_email := public.eac_pick_text(r.payload, array['email', 'E-mail', 'Email']);
      v_telefone := public.eac_pick_text(r.payload, array['celular_whatsapp', 'celularWhatsapp', 'Celular / WhatsApp', 'Telefone / WhatsApp', 'Telefone', 'whatsapp']);
      v_sexo := public.eac_pick_text(r.payload, array['Sexo', 'sexo', 'genero', 'gênero']);
      v_bairro := public.eac_pick_text(r.payload, array['bairro', 'Bairro', 'Bairro onde mora']);
      v_endereco := public.eac_pick_text(r.payload, array['endereco_completo', 'enderecoCompleto', 'Endereço completo', 'Endereco completo']);
      v_nascimento := public.eac_parse_date(public.eac_pick_text(r.payload, array['data_nascimento', 'dataNascimento', 'Data de nascimento', 'Nascimento']));
      v_idade := public.eac_pick_text(r.payload, array['idade', 'Idade']);
      v_resp_contato := public.eac_pick_text(r.payload, array['responsavel_contato', 'responsavelContato', 'Responsável / Contato', 'Responsavel / Contato', 'Responsável / Grau de Parentesco e Contato (caso menor de idade)']);
      v_frequenta_missas := public.eac_pick_text(r.payload, array['frequenta_missas', 'frequentaMissas', 'Frequenta missas?']);
      v_onde_missas := public.eac_pick_text(r.payload, array['onde_missas', 'ondeMissas', 'Onde participa das missas?', 'Se sim, onde?']);
      v_participa_movimento := public.eac_pick_text(r.payload, array['participa_movimento', 'participaMovimento', 'Participa de movimento?', 'Participa de algum movimento da igreja?']);
      v_movimento_paroquia := public.eac_pick_text(r.payload, array['movimento_paroquia', 'movimentoParoquia', 'Qual movimento ou pastoral?', 'Se sim, qual e em qual paróquia?', 'Se sim, qual e em qual paroquia?']);
      v_paroquia_fez_eac := public.eac_pick_text(r.payload, array['paroquia_fez_eac', 'paroquiaFezEac', 'Paróquia onde fez EAC', 'Paroquia onde fez EAC', 'Paróquia onde você fez o EAC', 'Paroquia onde voce fez o EAC']);
      v_ja_trabalhou_eac := public.eac_pick_text(r.payload, array['ja_trabalhou_eac', 'jaTrabalhouEac', 'Já trabalhou no EAC?', 'Ja trabalhou no EAC?', 'Já trabalhou em algum EAC?', 'Ja trabalhou em algum EAC?']);
      v_ja_coordenou_equipe := public.eac_pick_text(r.payload, array['ja_coordenou_equipe', 'jaCoordenouEquipe', 'Já coordenou equipe?', 'Ja coordenou equipe?', 'Já coordenou alguma equipe?', 'Ja coordenou alguma equipe?']);
      v_pais_fizeram_encontro := public.eac_pick_text(r.payload, array['pais_fizeram_encontro', 'paisFizeramEncontro', 'Pais fizeram encontro?', 'Seus pais já fizeram algum encontro?', 'Seus pais ja fizeram algum encontro?']);
      v_possui_alergia := public.eac_pick_text(r.payload, array['possui_alergia', 'possuiAlergia', 'Possui alergia?', 'Possui alguma alergia? Se sim, qual?']);
      v_toma_remedio := public.eac_pick_text(r.payload, array['toma_remedio', 'tomaRemedio', 'Toma remédio?', 'Toma remedio?', 'Toma algum remédio? Se sim, qual?', 'Toma algum remedio? Se sim, qual?']);
      v_alimentacao_especial := public.eac_pick_text(r.payload, array['alimentacao_especial', 'alimentacaoEspecial', 'Alimentação especial', 'Alimentacao especial', 'Possui alguma alimentação especial?', 'Possui alguma alimentacao especial?']);
      v_sugestao := public.eac_pick_text(r.payload, array['sugestao_ultimo_encontro', 'sugestaoUltimoEncontro', 'Sugestão para o último encontro', 'Sugestao para o ultimo encontro', 'Se você trabalhou no nosso último encontro, tem alguma sugestão para melhorarmos?', 'Se voce trabalhou no nosso ultimo encontro, tem alguma sugestao para melhorarmos?']);
      v_dica := public.eac_pick_text(r.payload, array['dica_pos_encontro', 'dicaPosEncontro', 'Dica pós encontro', 'Dica pos encontro', 'Nos dê uma dica sobre o que você gostaria que acontecesse em algum pós-encontro.', 'Nos de uma dica sobre o que voce gostaria que acontecesse em algum pos-encontro.']);
      v_classificacao := public.eac_pick_text(r.payload, array['classificacao', 'Classificação', 'Classificacao']);

      if v_nome is null then
        raise exception 'Linha sem nome suficiente para carga de encontreiros.';
      end if;

      v_pessoa_id := public.eac_upsert_pessoa(
        v_nome,
        v_email,
        v_telefone,
        v_nascimento,
        v_sexo,
        v_bairro,
        coalesce(v_classificacao, 'Carga via staging - Encontreiros'),
        'PLANILHA',
        false
      );

      perform public.eac_ensure_papel(v_pessoa_id, 'ENCONTREIRO', 'PLANILHA');

      v_encontreiro_id := public.eac_ensure_encontreiro(
        v_pessoa_id,
        v_nome,
        v_nascimento,
        v_idade,
        v_email,
        v_telefone,
        v_endereco,
        v_resp_contato,
        v_bairro,
        v_frequenta_missas,
        v_onde_missas,
        v_participa_movimento,
        v_movimento_paroquia,
        v_paroquia_fez_eac,
        v_ja_trabalhou_eac,
        v_ja_coordenou_equipe,
        v_pais_fizeram_encontro,
        v_possui_alergia,
        v_toma_remedio,
        v_alimentacao_especial,
        v_sugestao,
        v_dica,
        v_classificacao
      );

      update public.staging_planilha_linhas
         set status_processamento = 'PROCESSADO',
             entidade_destino = 'ENCONTREIRO',
             entidade_destino_id = v_encontreiro_id,
             mensagem_erro = null,
             processado_em = now()
       where id = r.id;

      linhas_processadas := linhas_processadas + 1;
      encontreiros_criados_ou_atualizados := encontreiros_criados_ou_atualizados + 1;
    exception
      when others then
        update public.staging_planilha_linhas
           set status_processamento = 'ERRO',
               entidade_destino = null,
               entidade_destino_id = null,
               mensagem_erro = left(sqlerrm, 1000),
               processado_em = now()
         where id = r.id;

        erros := erros + 1;
    end;
  end loop;

  return next;
end;
$$;

create or replace function public.fn_processar_staging_cadastro_e_triagem(
  p_encontro_id_antes_corte uuid,
  p_encontro_id_apos_corte uuid default null,
  p_numero_linha_corte integer default null,
  p_encontro_id_triagem uuid default null,
  p_importacao_cadastro_oficial uuid default null,
  p_importacao_respostas uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_cadastro record;
  v_triagem record;
begin
  select *
    into v_cadastro
    from public.fn_processar_staging_cadastro_oficial(
      p_encontro_id_antes_corte => p_encontro_id_antes_corte,
      p_encontro_id_apos_corte => p_encontro_id_apos_corte,
      p_numero_linha_corte => p_numero_linha_corte,
      p_importacao_id => p_importacao_cadastro_oficial,
      p_nome_aba => 'Cadastro Oficial'
    );

  select *
    into v_triagem
    from public.fn_processar_staging_respostas_triagem(
      p_encontro_id => coalesce(p_encontro_id_triagem, p_encontro_id_apos_corte, p_encontro_id_antes_corte),
      p_importacao_id => p_importacao_respostas,
      p_nome_aba => 'Respostas ao formulário 1'
    );

  return jsonb_build_object(
    'cadastro_oficial', to_jsonb(v_cadastro),
    'triagem', to_jsonb(v_triagem)
  );
end;
$$;

grant execute on function public.fn_processar_staging_cadastro_oficial(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.fn_processar_staging_respostas_triagem(uuid, uuid, text) to service_role;
grant execute on function public.fn_processar_staging_encontreiros(uuid, text) to service_role;
grant execute on function public.fn_processar_staging_cadastro_e_triagem(uuid, uuid, integer, uuid, uuid, uuid) to service_role;

commit;

-- Exemplo de uso
-- 1) Garantir que a aba "Cadastro Oficial" foi carregada para staging.
-- 2) Executar a carga base e, depois, a triagem filtrada contra o cadastro oficial:
--
-- select public.fn_processar_staging_cadastro_e_triagem(
--   p_encontro_id_antes_corte => 'UUID_ENCONTRO_35'::uuid,
--   p_encontro_id_apos_corte => 'UUID_ENCONTRO_36'::uuid,
--   p_numero_linha_corte => 74,
--   p_encontro_id_triagem => 'UUID_ENCONTRO_36'::uuid,
--   p_importacao_cadastro_oficial => null,
--   p_importacao_respostas => null
-- );
