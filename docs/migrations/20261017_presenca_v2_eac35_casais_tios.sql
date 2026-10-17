-- Presença V2
-- EAC 35: consolida os responsáveis históricos em casais de tios.
-- Mantém os seis grupos HISTORICO_CIRCULO existentes apenas como histórico.
-- As novas reuniões usam apenas grupos do tipo TIOS.

begin;

-- 1) Casal Azul + Amarelo: Paloma + Vinícius
insert into public.presenca_responsaveis_grupos
  (encontro_id, codigo, tipo, nome_exibicao, ativo)
select
  h.encontro_id,
  'EAC35-TIOS-AZUL-AMARELO',
  'TIOS',
  'Tios Paloma e Vinícius',
  false
from public.presenca_responsaveis_grupos h
where h.codigo = 'EAC35-HIST-AZUL'
  and not exists (
    select 1 from public.presenca_responsaveis_grupos x
    where x.codigo = 'EAC35-TIOS-AZUL-AMARELO'
  );

insert into public.presenca_responsavel_membros
  (grupo_id, nome_snapshot, papel_snapshot, ativo)
select g.id, v.nome, 'TIO_RESPONSAVEL', false
from public.presenca_responsaveis_grupos g
cross join (values ('Paloma'), ('Vinícius')) as v(nome)
where g.codigo = 'EAC35-TIOS-AZUL-AMARELO'
  and not exists (
    select 1 from public.presenca_responsavel_membros m
    where m.grupo_id = g.id
      and lower(trim(m.nome_snapshot)) = lower(trim(v.nome))
  );

insert into public.presenca_responsavel_circulos
  (grupo_id, circulo_historico_id)
select g.id, c.id
from public.presenca_responsaveis_grupos g
join public.eac_circulos_historicos c
  on c.edicao = 35 and c.cor in ('Azul', 'Amarelo')
where g.codigo = 'EAC35-TIOS-AZUL-AMARELO'
  and not exists (
    select 1 from public.presenca_responsavel_circulos rc
    where rc.grupo_id = g.id
      and rc.circulo_historico_id = c.id
  );

-- 2) Casal Roxo + Laranja: Ana Paula + Gustavo
insert into public.presenca_responsaveis_grupos
  (encontro_id, codigo, tipo, nome_exibicao, ativo)
select
  h.encontro_id,
  'EAC35-TIOS-ROXO-LARANJA',
  'TIOS',
  'Tios Ana Paula e Gustavo',
  false
from public.presenca_responsaveis_grupos h
where h.codigo = 'EAC35-HIST-ROXO'
  and not exists (
    select 1 from public.presenca_responsaveis_grupos x
    where x.codigo = 'EAC35-TIOS-ROXO-LARANJA'
  );

insert into public.presenca_responsavel_membros
  (grupo_id, nome_snapshot, papel_snapshot, ativo)
select g.id, v.nome, 'TIO_RESPONSAVEL', false
from public.presenca_responsaveis_grupos g
cross join (values ('Ana Paula'), ('Gustavo')) as v(nome)
where g.codigo = 'EAC35-TIOS-ROXO-LARANJA'
  and not exists (
    select 1 from public.presenca_responsavel_membros m
    where m.grupo_id = g.id
      and lower(trim(m.nome_snapshot)) = lower(trim(v.nome))
  );

insert into public.presenca_responsavel_circulos
  (grupo_id, circulo_historico_id)
select g.id, c.id
from public.presenca_responsaveis_grupos g
join public.eac_circulos_historicos c
  on c.edicao = 35 and c.cor in ('Roxo', 'Laranja')
where g.codigo = 'EAC35-TIOS-ROXO-LARANJA'
  and not exists (
    select 1 from public.presenca_responsavel_circulos rc
    where rc.grupo_id = g.id
      and rc.circulo_historico_id = c.id
  );

-- 3) Casal Vermelho + Verde: Cynthia + Adriano
insert into public.presenca_responsaveis_grupos
  (encontro_id, codigo, tipo, nome_exibicao, ativo)
select
  h.encontro_id,
  'EAC35-TIOS-VERMELHO-VERDE',
  'TIOS',
  'Tios Cynthia e Adriano',
  false
from public.presenca_responsaveis_grupos h
where h.codigo = 'EAC35-HIST-VERMELHO'
  and not exists (
    select 1 from public.presenca_responsaveis_grupos x
    where x.codigo = 'EAC35-TIOS-VERMELHO-VERDE'
  );

insert into public.presenca_responsavel_membros
  (grupo_id, nome_snapshot, papel_snapshot, ativo)
select g.id, v.nome, 'TIO_RESPONSAVEL', false
from public.presenca_responsaveis_grupos g
cross join (values ('Cynthia'), ('Adriano')) as v(nome)
where g.codigo = 'EAC35-TIOS-VERMELHO-VERDE'
  and not exists (
    select 1 from public.presenca_responsavel_membros m
    where m.grupo_id = g.id
      and lower(trim(m.nome_snapshot)) = lower(trim(v.nome))
  );

insert into public.presenca_responsavel_circulos
  (grupo_id, circulo_historico_id)
select g.id, c.id
from public.presenca_responsaveis_grupos g
join public.eac_circulos_historicos c
  on c.edicao = 35 and c.cor in ('Vermelho', 'Verde')
where g.codigo = 'EAC35-TIOS-VERMELHO-VERDE'
  and not exists (
    select 1 from public.presenca_responsavel_circulos rc
    where rc.grupo_id = g.id
      and rc.circulo_historico_id = c.id
  );

commit;
