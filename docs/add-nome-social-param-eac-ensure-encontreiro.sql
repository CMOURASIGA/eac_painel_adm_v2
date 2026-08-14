-- Adiciona o parametro p_nome_social (com default null, para nao quebrar
-- nenhum chamador existente da funcao) e passa a gravar/atualizar a coluna
-- encontreiros.nome_social, que ate agora era ignorada por essa funcao.
CREATE OR REPLACE FUNCTION public.eac_ensure_encontreiro(p_pessoa_id uuid, p_nome_completo text, p_data_nascimento date, p_idade text, p_email text, p_celular_whatsapp text, p_endereco_completo text, p_responsavel_contato text, p_bairro text, p_frequenta_missas text, p_onde_missas text, p_participa_movimento text, p_movimento_paroquia text, p_paroquia_fez_eac text, p_ja_trabalhou_eac text, p_ja_coordenou_equipe text, p_pais_fizeram_encontro text, p_possui_alergia text, p_toma_remedio text, p_alimentacao_especial text, p_sugestao_ultimo_encontro text, p_dica_pos_encontro text, p_classificacao text, p_nome_social text default null)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
      ultima_sincronizacao,
      nome_social
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
      now(),
      nullif(btrim(coalesce(p_nome_social, '')), '')
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
           atualizado_em = now(),
           nome_social = coalesce(nullif(p_nome_social, ''), nome_social)
     where id = v_id;
  end if;

  return v_id;
end;
$function$
