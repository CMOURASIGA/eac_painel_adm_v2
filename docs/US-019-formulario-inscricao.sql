-- US-019 - Estrutura mínima e defaults (Supabase)
-- Ajuste/execute no Supabase (SQL Editor) conforme necessidade.

-- =========================
-- public.encontros
-- =========================
create table if not exists public.encontros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero text,
  data_inicio date not null,
  data_fim date,
  status text not null default 'PLANEJADO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Status sugeridos: PLANEJADO | ATIVO | ENCERRADO | CANCELADO
alter table public.encontros
  add constraint if not exists encontros_status_check
  check (status in ('PLANEJADO','ATIVO','ENCERRADO','CANCELADO'));

-- =========================
-- public.inscricoes
-- =========================
create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  id_encontro uuid not null,
  nome_adolescente text not null,
  data_nascimento date not null,
  idade int,
  telefone_adolescente text not null,
  nome_responsavel text not null,
  telefone_responsavel text not null,
  bairro text,
  paroquia text,
  participou_antes boolean default false,
  observacoes text,
  aceite_termos boolean,
  status_inscricao text not null default 'INSCRITO',
  origem_dado text not null default 'SISTEMA',
  criado_via_sistema boolean not null default true,
  data_inscricao timestamptz not null default now(),
  data_importacao timestamptz,
  id_origem_planilha text,
  ultima_sincronizacao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inscricoes_id_encontro_fk foreign key (id_encontro) references public.encontros(id)
);

-- Status operacionais previstos (US-019)
alter table public.inscricoes
  add constraint if not exists inscricoes_status_check
  check (status_inscricao in (
    'INSCRITO','EM_ANALISE','PRIORIZADO','FILA','CONFIRMADO','NAO_SELECIONADO','DESISTENTE','CANCELADO'
  ));

-- Aceite de termos: para não quebrar legado, aqui deixamos sem NOT NULL.
-- (A obrigatoriedade é garantida no frontend e no endpoint da US-019.)

-- updated_at helper (opcional)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists t_set_updated_at_encontros on public.encontros;
create trigger t_set_updated_at_encontros
before update on public.encontros
for each row execute procedure public.set_updated_at();

drop trigger if exists t_set_updated_at_inscricoes on public.inscricoes;
create trigger t_set_updated_at_inscricoes
before update on public.inscricoes
for each row execute procedure public.set_updated_at();

-- Anti-duplo envio (opcional, recomendado):
-- 1) por id_encontro + data_nascimento + nome_adolescente (case-insensitive)
-- 2) e/ou por id_encontro + telefone_adolescente (quando normalizado)
--
-- create unique index if not exists uq_inscricoes_encontro_nome_nasc
-- on public.inscricoes (id_encontro, lower(nome_adolescente), data_nascimento);

