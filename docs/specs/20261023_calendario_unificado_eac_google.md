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
