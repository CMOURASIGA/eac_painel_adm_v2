# SPEC — Calendário Unificado EAC + Google Calendar

Estado: **IMPLEMENTAÇÃO PARCIAL NA DEVELOP — HOMOLOGAÇÃO PENDENTE** (23/10/2026).

## Escopo implementado
- Calendário existente e ações CRUD do EAC preservados.
- Alternância de visualização entre mês, semana e lista (a visão semanal usa os dias próximos ao selecionado; ainda necessita validação de comportamento).
- Filtro por origem: Todos, EAC, Paróquia; status e tipo continuam disponíveis.
- Origem da paróquia destacada; eventos Google sem botões de editar/excluir.
- Rota `GET /api/calendar/google?year=YYYY&month=M` que consulta **somente leitura** a agenda compartilhada pelo OAuth da conta EAC, suporta recorrência expandida (`singleEvents=true`), paginação, eventos cancelados removidos e cache de 60 s.
- Eventos do Google são apresentados sob demanda e **não são gravados nas tabelas** da agenda EAC.

## Configuração necessária antes de ativar
Variáveis **somente no servidor**: `EAC_GOOGLE_CALENDAR_ENABLED=true`, `EAC_GOOGLE_CLIENT_ID`, `EAC_GOOGLE_CLIENT_SECRET`, `EAC_GOOGLE_REFRESH_TOKEN`, `EAC_PAROQUIA_CALENDAR_ID`. O token deve pertencer à conta Google do EAC, autorizado com escopo `https://www.googleapis.com/auth/calendar.readonly` e acesso à agenda paroquial. Não colocar esses valores no front-end, repositório ou logs.

**Bloqueio de segurança:** a rota reutiliza `authorizeRequest()`, cuja identidade atual deriva do header `x-eac-user-email`. Esse header não é prova criptográfica de sessão. **Não configurar `EAC_GOOGLE_CALENDAR_ENABLED=true` em produção ou em preview acessível externamente** antes de substituir a autenticação por validação de sessão assinada no servidor e revisar o RLS/permissões. A página mostra a agenda própria quando a integração está desligada.

## Validação obrigatória
1. `npm run typecheck`, `npm run build`, testes automatizados e smoke test responsivo; nenhum desses foi executado nesta implementação.
2. Testar filtros por origem, mês, semana, lista, status/tipo, seleção de dia, eventos recorrentes, dia inteiro e cancelamento.
3. Com a API protegida por sessão real, autenticar conta EAC, confirmar leitura de uma agenda compartilhada e ausência de permissão de edição.
4. Confirmar que conta deslogada, header falsificado e usuário sem módulo calendar não conseguem acessar a rota.
5. Conferir duplicidade entre agendas e regra de precedência de eventos homônimos antes do rollout.
6. Validar cache, indisponibilidade Google e limites de API; verificar datas com timezone America/Sao_Paulo.

Não publicar na Vercel sem o gate da política de 6 correções ou exceção expressa.

## Fluxo OAuth de configuração (implementado, ainda sem homologação)
- `POST /api/calendar/google/oauth/start` exige o cabeçalho privado `x-eac-oauth-setup-key` igual à variável `EAC_GOOGLE_OAUTH_SETUP_KEY` (valor aleatório com 32+ caracteres). **Não usar chave em URL, GitHub nem chat.** A resposta inclui URL de autorização e define cookie HttpOnly de estado assinado por HMAC, válido por 10 minutos.
- `GET /api/calendar/google/oauth/callback` recebe código e estado, exige cookie igual ao estado assinado e troca o código por tokens. O refresh token é retornado **uma única vez ao navegador que concluiu a autorização**, em resposta `no-store`. O operador deve gravá-lo na variável secreta `EAC_GOOGLE_REFRESH_TOKEN` da Vercel sem compartilhar. Não é enviado para banco ou GitHub.
- Configurar `EAC_GOOGLE_OAUTH_REDIRECT_URI` com `https://<DOMINIO_ESTAVEL_DO_PREVIEW>/api/calendar/google/oauth/callback`; adicionar exatamente essa URI no cliente OAuth no Google Cloud. O domínio deve ser o mesmo do endereço que inicia a autorização.
- Verificar que a conta Google autorizada é a conta do EAC. **Não expor endpoint de setup em ambientes de produção:** provisionar setup key somente no Preview restrito e excluir a chave depois de concluída a autorização.
- Não inserir `EAC_GOOGLE_CALENDAR_ENABLED=true` até corrigir a autenticação do GET e aprovar os testes. Os endpoints OAuth de setup são separados da leitura de eventos e não corrigem a identidade baseada em header da rota de consulta.

## 23/10/2026 — conclusão da implementação para três fontes (pendente homologação)

- Três origens independentes na UI: `EAC`, `Paróquia`, `Google EAC`, além do filtro `Todos`.
- Leitura `GOOGLE_PAROQUIA` usa `EAC_PAROQUIA_CALENDAR_ID`; leitura `GOOGLE_EAC` usa `EAC_GOOGLE_EAC_CALENDAR_ID` (padrão `primary`). Ambas utilizam a mesma conta OAuth, com escopo somente leitura.
- API `/api/calendar/google` é roteada via função existente `/api/auth/login` e verifica cookie HttpOnly emitido pelo login Supabase, com validação de identidade remota e autorização de módulo. Usuários que entram por login legado Google Script não possuem sessão Supabase verificável e não podem consultar a API até migração formal de autenticação.
- O fluxo OAuth de configuração inicial requer `EAC_GOOGLE_OAUTH_SETUP_KEY` **somente no Preview**. Para iniciar, a ferramenta de administração deve efetuar POST com header privado e abrir a `authorizationUrl` na mesma origem da página que recebeu cookie; no callback, o `refreshToken` aparece uma vez e deve ser salvo em variável sensível `EAC_GOOGLE_REFRESH_TOKEN`, nunca em logs ou chat. Ainda não há interface guiada de administração no painel.
- `EAC_GOOGLE_CALENDAR_ENABLED=false` até a autorização ser concluída e cenários 200, 401, 403, 503 e falhas Google serem testados.
- **Atenção:** o OAuth do Google com app externo em modo TESTING pode gerar refresh token que expira após sete dias para escopo Calendar; avaliar publicação do consentimento e políticas Google antes de produção.
- Há 12 entradas `api/*.ts` sob o limite Hobby, mas um novo Preview só deve ser publicado após validação estática e de execução consolidada. Não confundir build Vite com typecheck.
- Conferir se variável de setup foi realmente removida de Production antes de qualquer disponibilização de fluxo OAuth em produção.

## Refinamento UX fiel ao protótipo aprovado — execução iniciada em 23/10/2026

- Protótipo aprovado pelo responsável: cabeçalho reduzido, legenda EAC azul / Paróquia laranja / Google EAC verde, grade mensal densa com números legíveis e indicador +N, visão semanal real em sete colunas, lista cronológica agrupada por dia, painel do dia com indicadores por origem, layout responsivo.
- Implementação inicial na `develop`: modo Semana em grade de sete colunas com blocos de horário, modo Lista agrupado por data, barra de origens, contadores por origem para o dia selecionado, tipografia reforçada, cores unificadas e calendário compacto no celular.
- **Não homologado:** conferir build + typecheck, alternância mensal/semanal/lista, seleção de dias, controle de overflow em 1280x600 e 768x1024, comportamento mobile 390x844, três filtros de origem, eventos Google sem edição/exclusão, calendário lotado e datas em limites do mês. Não publicar Preview apenas para correção isolada; agrupar verificações antes do deploy.

## Revisão técnica complementar — 23/10/2026
- Corrigida consistência da apresentação de horas no fuso America/Sao_Paulo e classificação do dia (evitando deslocamento entre datas UTC e horário local).
- Corrigida identificação por origem no chip do painel lateral, ordenação cronológica de eventos no dia e largura mínima da coluna principal.
- Revisão estática: componentes semana, mês, lista e filtros estão presentes no código. **Não houve execução de typecheck, build, nem testes por viewport; estes critérios permanecem PENDING, não PASS.**
- Não realizar outro deploy antes de passar typecheck/build, confirmar URLs OAuth, variáveis e cenários visuais 1280x600, 768x1024, 390x844; respeitar lote.
