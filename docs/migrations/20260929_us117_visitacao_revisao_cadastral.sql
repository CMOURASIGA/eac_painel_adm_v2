-- US-117 | Visitação como revisão e complementação cadastral
-- Idempotente. Aplicar somente após homologação do schema no projeto EAC.

begin;

-- Dados de endereço ainda não representados de forma explícita em pessoas.
alter table public.pessoas
  add column if not exists cidade text,
  add column if not exists estado text;

-- Dados permanentes do adolescente levantados/confirmados durante a visita.
alter table public.adolescentes
  add column if not exists batizado boolean,
  add column if not exists crismado boolean,
  add column if not exists turno_escolar text,
  add column if not exists serie_escolar text,
  add column if not exists grau_escolar text,
  add column if not exists encontro_anterior text,
  add column if not exists convidado_por text,
  add column if not exists pais_fizeram_ecc boolean,
  add column if not exists primeira_comunhao boolean,
  add column if not exists paroquia text,
  add column if not exists toca_instrumento boolean,
  add column if not exists instrumento text,
  add column if not exists gosta_cantar boolean,
  add column if not exists outra_doutrina_familia boolean,
  add column if not exists outra_doutrina_descricao text,
  add column if not exists restricao_alimentar boolean,
  add column if not exists restricao_alimentar_descricao text;

-- Auditoria estruturada das diferenças cadastrais geradas por cada ação.
alter table public.visitacoes_historico
  add column if not exists alteracoes_cadastrais jsonb not null default '[]'::jsonb;

comment on column public.visitacoes_historico.alteracoes_cadastrais is
  'Diferenças cadastrais da visita: campo, valor anterior e valor novo. A fonte oficial continua nas tabelas normalizadas.';

create index if not exists idx_visitacoes_historico_alteracoes_gin
  on public.visitacoes_historico using gin (alteracoes_cadastrais);

commit;
