-- US-123 - Interesse em participar da Banda do EAC
-- Cria formulário público, base própria de interessados e controles de liberação.
-- Também importa o histórico da planilha fornecida, eliminando reenvios repetidos da mesma pessoa pelo nome normalizado.

begin;

alter table public.configuracoes_formularios
  add column if not exists banda_ativo boolean not null default true,
  add column if not exists banda_responsaveis_token text;

update public.configuracoes_formularios
set banda_responsaveis_token = coalesce(nullif(banda_responsaveis_token, ''), md5(random()::text || clock_timestamp()::text || id))
where id = 'geral';

create table if not exists public.banda_interesses (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid references public.pessoas(id) on delete set null,
  cadastro_oficial_id uuid references public.cadastro_oficial(id) on delete set null,
  nome_snapshot text not null,
  telefone_snapshot text not null,
  telefone_normalizado text,
  chave_unica text not null unique,
  origem text not null default 'FORMULARIO' check (origem in ('FORMULARIO','PLANILHA','ADMIN')),
  status text not null default 'INSCRITO' check (status in ('INSCRITO','CONTATADO','ENTROU_NA_BANDA','DESISTIU')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists ux_banda_interesses_pessoa
  on public.banda_interesses(pessoa_id)
  where pessoa_id is not null and status <> 'DESISTIU';

create index if not exists ix_banda_interesses_status on public.banda_interesses(status);
create index if not exists ix_banda_interesses_criado_em on public.banda_interesses(criado_em desc);

alter table public.banda_interesses enable row level security;
revoke all on public.banda_interesses from anon, authenticated;

-- A aplicação acessa esta tabela exclusivamente pelo backend usando a service role.
-- RLS não substitui privilégios SQL; em projetos onde os default grants foram alterados,
-- a service_role pode receber "permission denied" mesmo com BYPASSRLS.
grant select, insert, update, delete on table public.banda_interesses to service_role;

insert into public.banda_interesses
  (nome_snapshot, telefone_snapshot, telefone_normalizado, chave_unica, origem, status, criado_em)
values
  ('Luisa Moreira Alves de Lima','21996730708','21996730708','legacy:luisa moreira alves de lima:21996730708','PLANILHA','INSCRITO','2025-09-21T17:21:46-03'),
  ('Gabriel Tavares Simplício','982542196','982542196','legacy:gabriel tavares simplicio:982542196','PLANILHA','INSCRITO','2025-09-21T17:22:33-03'),
  ('Beatriz de Jesus Lopes','5521975204256','5521975204256','legacy:beatriz de jesus lopes:21975204256','PLANILHA','INSCRITO','2025-09-21T17:23:03-03'),
  ('Manuela Netto dos Reys Cysneiros','21997090564','21997090564','legacy:manuela netto dos reys cysneiros:21997090564','PLANILHA','INSCRITO','2025-09-21T17:23:30-03'),
  ('Valentina Nobrega Sa capeto hammerschmidt','21559641675','21559641675','legacy:valentina nobrega sa capeto hammerschmidt:21559641675','PLANILHA','INSCRITO','2025-09-21T17:23:37-03'),
  ('Julie Furtado gonçalves de carvalho','22 21 971270112','2221971270112','legacy:julie furtado goncalves de carvalho:21971270112','PLANILHA','INSCRITO','2025-09-21T17:24:32-03'),
  ('Luiza Trindade Freire','5521974013311','5521974013311','legacy:luiza trindade freire:21974013311','PLANILHA','INSCRITO','2025-09-21T17:24:44-03'),
  ('João Lázaro Matias','5521979317874','5521979317874','legacy:joao lazaro matias:21979317874','PLANILHA','INSCRITO','2025-09-21T17:25:09-03'),
  ('Maria Eduarda de Jesus Lopes','55 21 97466-0335','5521974660335','legacy:maria eduarda de jesus lopes:21974660335','PLANILHA','INSCRITO','2025-09-21T17:25:15-03'),
  ('Maria Clara Machado Pimentel','(86) 99487150','8699487150','legacy:maria clara machado pimentel:8699487150','PLANILHA','INSCRITO','2025-09-21T17:25:57-03'),
  ('Marcela Nascimento Fontes','(21)997789395','21997789395','legacy:marcela nascimento fontes:21997789395','PLANILHA','INSCRITO','2025-09-21T17:26:23-03'),
  ('Bernardo Carvalho Barreto','978747442','978747442','legacy:bernardo carvalho barreto:978747442','PLANILHA','INSCRITO','2025-09-21T17:32:10-03'),
  ('Mariane Cantanhede Carrapatoso Souza','998830530','998830530','legacy:mariane cantanhede carrapatoso souza:998830530','PLANILHA','INSCRITO','2025-09-21T17:32:58-03'),
  ('Isabela Mattos Rodrigues','55 21 99976-8353','5521999768353','legacy:isabela mattos rodrigues:21999768353','PLANILHA','INSCRITO','2025-09-21T19:47:33-03'),
  ('Luísa Eulália Furtado da Silva','55 24 99270-7049','5524992707049','legacy:luisa eulalia furtado da silva:24992707049','PLANILHA','INSCRITO','2025-09-22T19:30:24-03'),
  ('Julia Moreira Alves de Lima','5521999491708','5521999491708','legacy:julia moreira alves de lima:21999491708','PLANILHA','INSCRITO','2025-09-27T14:54:38-03'),
  ('Isabela Jardim Dias de Paula','5521994765746','5521994765746','legacy:isabela jardim dias de paula:21994765746','PLANILHA','INSCRITO','2025-09-28T13:35:59-03'),
  ('Lucas Trotta de Souza','21 99630-8144','21996308144','legacy:lucas trotta de souza:21996308144','PLANILHA','INSCRITO','2025-09-28T22:52:25-03'),
  ('Arthur Maillard Monteiro','21994064569','21994064569','legacy:arthur maillard monteiro:21994064569','PLANILHA','INSCRITO','2025-09-30T20:09:57-03'),
  ('Juline Ferreira do Nascimento','5521987180842','5521987180842','legacy:juline ferreira do nascimento:21987180842','PLANILHA','INSCRITO','2025-09-30T20:09:58-03'),
  ('Lucas Cecchetti G. Cunha','5521975352704','5521975352704','legacy:lucas cecchetti g. cunha:21975352704','PLANILHA','INSCRITO','2026-03-01T16:18:38-03'),
  ('Heitor Salgado Simao','552197456-4361','5521974564361','legacy:heitor salgado simao:21974564361','PLANILHA','INSCRITO','2026-03-29T16:16:08-03'),
  ('Rodrigo Lisbôa de Oliveira','5521991855915','5521991855915','legacy:rodrigo lisboa de oliveira:21991855915','PLANILHA','INSCRITO','2026-05-28T19:14:15-03'),
  ('Clara Waichert Marques','5521994125053','5521994125053','legacy:clara waichert marques:21994125053','PLANILHA','INSCRITO','2026-05-28T19:15:31-03'),
  ('Heitor Nascimento dames Corrêa de Sá','5521997687586','5521997687586','legacy:heitor nascimento dames correa de sa:21997687586','PLANILHA','INSCRITO','2026-05-28T19:19:32-03'),
  ('Sophia Alvarenga Menandro Muniz','21 98826-6222 (celular da minha mãe Taiane)','21988266222','legacy:sophia alvarenga menandro muniz:21988266222','PLANILHA','INSCRITO','2026-05-28T19:34:04-03'),
  ('Júlia Medeiros Soares Rocha','5521997558646','5521997558646','legacy:julia medeiros soares rocha:21997558646','PLANILHA','INSCRITO','2026-06-11T19:26:58-03'),
  ('Clarice Carvalho Cedrola Gonçalves','+55 21 96724-7967','5521967247967','legacy:clarice carvalho cedrola goncalves:21967247967','PLANILHA','INSCRITO','2026-06-11T19:28:58-03'),
  ('Catarina Grandelle Honaiser','21999920611','21999920611','legacy:catarina grandelle honaiser:21999920611','PLANILHA','INSCRITO','2026-06-21T16:35:20-03'),
  ('Renan Marques Vianna','5521996681922','5521996681922','legacy:renan marques vianna:21996681922','PLANILHA','INSCRITO','2026-06-21T16:35:54-03'),
  ('Gabriela Reis de Seixas Diogo','+5521998909241','5521998909241','legacy:gabriela reis de seixas diogo:21998909241','PLANILHA','INSCRITO','2026-06-21T17:05:59-03'),
  ('Cecília Amâncio Corrêa','5521995256623','5521995256623','legacy:cecilia amancio correa:21995256623','PLANILHA','INSCRITO','2026-08-16T17:39:34-03'),
  ('Bernardo e Souza Ouriques','21999024010','21999024010','legacy:bernardo e souza ouriques:21999024010','PLANILHA','INSCRITO','2026-08-16T17:50:16-03'),
  ('Eduarda de Paula Antunes Postaue','21982673978','21982673978','legacy:eduarda de paula antunes postaue:21982673978','PLANILHA','INSCRITO','2026-10-01T19:57:07-03'),
  ('GUSTAVO FURTADO BARBOSA','21995625504','21995625504','legacy:gustavo furtado barbosa:21995625504','PLANILHA','INSCRITO','2026-10-01T19:59:03-03')
on conflict (chave_unica) do nothing;

commit;

-- Conferência
select status, origem, count(*) as total
from public.banda_interesses
group by status, origem
order by origem, status;

select id, banda_ativo, banda_responsaveis_token
from public.configuracoes_formularios
where id = 'geral';
