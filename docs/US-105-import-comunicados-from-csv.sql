-- US-105 - Import de comunicados a partir de CSV legado (Apps Script)
-- Origem: Planilha sem título - Página1 (1).csv
-- Alvo: public.comunicados

begin;

with src as (
  select *
  from (
    values
      (
        '99'::text,
        'Calendario Publico EAC'::text,
        'Calendario Publico EAC'::text,
        $$<p>Olá! 👋</p>

<p>Pensando em facilitar o acompanhamento das atividades do <strong>EAC</strong>, disponibilizamos um
<strong>Calendário Público</strong> onde os pais e participantes podem consultar todas as datas e eventos ligados ao encontro.</p>

<p>Nesse calendário você poderá acompanhar:</p>

<ul>
  <li>📅 Datas de pós-encontros</li>
  <li>🍞 Cantinas e eventos de arrecadação</li>
  <li>🙏 Atividades da comunidade</li>
  <li>✨ Outras programações relacionadas ao EAC</li>
</ul>

<p>Assim, sempre que quiser saber quando teremos um evento, basta acessar o calendário.</p>

<p style="text-align:center; margin:25px 0;">
  <a href="https://webappcalendariopublicoeac.vercel.app/"
     style="background-color:#2c7be5;color:#ffffff;padding:14px 22px;
     text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
     📆 Acessar o Calendário do EAC
  </a>
</p>

<p>Recomendamos que você <strong>salve esse link nos seus favoritos</strong> ou no seu celular para consultar sempre que precisar.</p>

<p>O calendário será atualizado sempre que novas atividades forem programadas.</p>

<p>Contamos com sua presença nos próximos momentos do EAC! 💛</p>

<p><strong>Equipe EAC</strong></p>$$,
        'ATIVO'::text,
        null::timestamptz
      ),
      (
        '1'::text,
        'Confirmação de Inscrição'::text,
        'Confirmação de Inscrição'::text,
        $$<p>Recebemos sua inscrição! <strong>Aguarde a confirmação de sua participação.</strong></p>

<p>Este é um dos nossos canais de comunicação dos eventos do EAC da Porciúncula. Vamos através dele mandar notícias e comunicados importantes! É um grande prazer tê-los conosco.</p>

<p>Aproveite também para nos acompanhar pelo Instagram e ficar por dentro de todas as novidades e eventos! Basta seguir: <a href="https://www.instagram.com/eacporciunculadesantana/" target="_blank">@eacporciunculadesantana</a></p>

<p>Paz e Bem!</p>$$,
        'ATIVO'::text,
        null::timestamptz
      )
  ) as t(codigo_externo, titulo, assunto, corpo_html, status, data_agendada)
),
payload as (
  select
    s.codigo_externo,
    s.titulo,
    s.assunto,
    s.corpo_html,
    trim(regexp_replace(s.corpo_html, '<[^>]*>', ' ', 'g')) as corpo_texto,
    case upper(coalesce(s.status, ''))
      when 'ATIVO' then 'RASCUNHO'
      when 'RASCUNHO' then 'RASCUNHO'
      when 'INATIVO' then 'RASCUNHO'
      when 'ARQUIVADO' then 'RASCUNHO'
      else 'RASCUNHO'
    end as status,
    s.data_agendada,
    'PLANILHA'::text as origem_dado
  from src s
),
updated as (
  update public.comunicados c
  set
    titulo = p.titulo,
    assunto = p.assunto,
    corpo_html = p.corpo_html,
    corpo_texto = p.corpo_texto,
    status = p.status,
    data_agendada = p.data_agendada,
    origem_dado = p.origem_dado
  from payload p
  where c.codigo_externo = p.codigo_externo
  returning c.codigo_externo
)
insert into public.comunicados (
  codigo_externo,
  titulo,
  assunto,
  corpo_html,
  corpo_texto,
  status,
  data_agendada,
  origem_dado
)
select
  p.codigo_externo,
  p.titulo,
  p.assunto,
  p.corpo_html,
  p.corpo_texto,
  p.status,
  p.data_agendada,
  p.origem_dado
from payload p
where not exists (
  select 1 from updated u where u.codigo_externo = p.codigo_externo
)
and not exists (
  select 1 from public.comunicados c where c.codigo_externo = p.codigo_externo
);

commit;
