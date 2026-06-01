# US-023 - Guia de Homologação

## Status: EM PREPARAÇÃO

Data: 2026-05-04

---

## Etapas de Homologação

### FASE 1: Preparação do Banco de Dados

#### 1.1 - Aplicar SQL no Supabase

**Ação Manual Obrigatória:**

1. Abra o Supabase Console: https://app.supabase.com
2. Vá para o projeto `eac-painel-adm`
3. Clique em **SQL Editor** → **New Query**
4. Cole o conteúdo de: `docs/US-023-alterar-status-inscricao.sql`
5. Clique em **Run**
6. Confirme que não houve erros

**Arquivo SQL:**
```
docs/US-023-alterar-status-inscricao.sql
```

**O que será criado:**
- Tabela: `public.inscricoes_status_historico`
- Colunas em `public.inscricoes`: `status_alterado_em`, `status_alterado_por`, `status_alterado_por_nome`
- Função RPC: `public.fn_alterar_status_inscricao(...)`
- Grant execute para `service_role`

**Validação:** Após executar, verifique no Supabase SQL Editor:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'inscricoes_status_historico';
```

Resultado esperado: Uma linha com `public | inscricoes_status_historico`

---

### FASE 2: Testes Automatizados

#### 2.1 - Preparar Ambiente

**Pré-requisitos:**
- [ ] Next.js server rodando em `http://localhost:3001`
- [ ] Frontend Vite rodando em `http://localhost:3000`
- [ ] `.env.local` configurado com:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_API_PROXY=http://localhost:3001`

**Verificar:**
```bash
# Terminal 1: Verificar se o servidor Next está rodando
curl http://localhost:3001/api/inscricoes/admin -X GET

# Terminal 2: Verificar conectividade Supabase
node -e "const s=require('@supabase/supabase-js').createClient('YOUR_URL','YOUR_KEY'); console.log('OK')"
```

#### 2.2 - Executar Script de Testes

```bash
cd "c:\Projetos\eac_painel_adm-main (3)\eac_painel_adm-main"
node scripts/test-us023-homolog.mjs
```

**Saída esperada:**
```
================================================================================
🚀 HOMOLOGAÇÃO US-023 - Alterar Status da Inscrição
================================================================================

📦 PREPARAÇÃO DO BANCO DE DADOS

✅ SQL aplicado com sucesso
✅ Tabela inscricoes_status_historico validada
✅ RPC fn_alterar_status_inscricao existe e é acessível

🧪 PREPARAÇÃO DE TESTE

✅ Encontro selecionado: EAC - ImportaÃ§Ã£o Inicial... (6781a087-...)
✅ Inscrição de teste criada: 12345678-...
✅ Status inicial: INSCRITO

🔄 TESTES DE MUDANÇA DE STATUS

[TEST 1] Alterar INSCRITO → EM_ANALISE
✅ Status alterado: INSCRITO → EM_ANALISE
  Status no DB: EM_ANALISE ✓

[TEST 2] Alterar EM_ANALISE → PRIORIZADO
✅ Status alterado: EM_ANALISE → PRIORIZADO
  Status no DB: PRIORIZADO ✓

[TEST 3] Alterar PRIORIZADO → CANCELADO (sem justificativa - deve falhar)
✅ Erro esperado recebido: JUSTIFICATIVA_OBRIGATORIA
✅ Histórico não aumentou (contagem: 2)

[TEST 4] Alterar PRIORIZADO → CANCELADO (com justificativa)
✅ Status alterado: PRIORIZADO → CANCELADO
  Status no DB: CANCELADO ✓

[TEST 5] Status inválido (CANCELADO → APROVADO)
✅ Erro esperado recebido: STATUS_INVALIDO
✅ Histórico não aumentou

[TEST 6] Inscrição inexistente
✅ Erro esperado recebido: INSCRICAO_NAO_ENCONTRADA

[TEST 7] Mesmo status (CANCELADO → CANCELADO)
✅ Erro esperado recebido: STATUS_SEM_ALTERACAO
✅ Histórico não alterado (contagem: 3)

📊 VALIDAÇÃO FINAL

✅ Total de registros no histórico: 3
  1. INSCRITO → EM_ANALISE (Teste Admin)
  2. EM_ANALISE → PRIORIZADO (Teste Admin)
  3. PRIORIZADO → CANCELADO (Teste Admin)

🧹 LIMPEZA

✅ Dados de teste removidos

================================================================================
✅ HOMOLOGAÇÃO CONCLUÍDA
================================================================================
```

---

### FASE 3: Testes Visuais na Tela Administrativa

#### 3.1 - Acessar a Tela de Revisão de Inscrições

**URL:** http://localhost:3000/inscricoes/revisao

**Ações:**
1. [ ] A tela carrega corretamente
2. [ ] Consegue buscar inscrições
3. [ ] Consegue abrir drawer de detalhes
4. [ ] Bloco "Alterar status" está visível

#### 3.2 - Criar Inscrição Manual de Teste

Se o script não criou automaticamente, criar manualmente:

**URL:** http://localhost:3000/inscricoes/criar

**Dados:**
```
Nome: Teste Visual US023
Data Nascimento: 2012-01-15
Telefone: 21999990023
Nome Responsável: Responsável Teste
Telefone Responsável: 21988880023
Bairro: Bairro Teste
Paróquia: Paróquia Teste
Encontro: (selecione um)
```

**Registrar após criar:**
- `inscricao_id`: _______________
- `adolescente_id`: _______________

#### 3.3 - Testar Alteração de Status Simples

**Na tela de detalhes da inscrição:**

1. [ ] Status atual exibido: `INSCRITO`
2. [ ] Selecionar novo status: `EM_ANALISE`
3. [ ] Campo de justificativa visível (opcional)
4. [ ] Clicar "Atualizar status"
5. [ ] Mensagem de sucesso exibida
6. [ ] Status atualizado no drawer
7. [ ] Status atualizado na tabela/listagem
8. [ ] Voltar a abrir drawer e confirmar persistência

#### 3.4 - Testar Erro de Justificativa Obrigatória

**Na tela de detalhes da inscrição (status atual: EM_ANALISE):**

1. [ ] Selecionar novo status: `NAO_SELECIONADO`
2. [ ] Campo de justificativa aparece
3. [ ] Deixar justificativa em branco
4. [ ] Clicar "Atualizar status"
5. [ ] Erro exibido: "Justificativa obrigatória"
6. [ ] Status não se altera
7. [ ] Fechar drawer e reabrir para confirmar

#### 3.5 - Testar Alteração com Justificativa

**Na tela de detalhes (status atual: EM_ANALISE):**

1. [ ] Selecionar novo status: `NAO_SELECIONADO`
2. [ ] Preencher justificativa: "Não se encaixa nos critérios"
3. [ ] Clicar "Atualizar status"
4. [ ] Mensagem de sucesso exibida
5. [ ] Status atualizado para `NAO_SELECIONADO`
6. [ ] Reabrir drawer e confirmar

---

## Checklist de Validações

### SQL e Banco de Dados

- [ ] Tabela `inscricoes_status_historico` criada
- [ ] Colunas adicionadas em `inscricoes`
- [ ] RPC `fn_alterar_status_inscricao` existe
- [ ] Grant execute para `service_role` aplicado

### Testes Automatizados

- [ ] Teste 1: INSCRITO → EM_ANALISE (sucesso)
- [ ] Teste 2: EM_ANALISE → PRIORIZADO (sucesso)
- [ ] Teste 3: Sem justificativa em NAO_SELECIONADO (falha correta)
- [ ] Teste 4: Com justificativa em NAO_SELECIONADO (sucesso)
- [ ] Teste 5: Status inválido (falha correta)
- [ ] Teste 6: Inscrição inexistente (falha correta)
- [ ] Teste 7: Mesmo status (falha correta)

### Histórico

- [ ] Histórico criado para mudanças bem-sucedidas
- [ ] Histórico NÃO criado para mudanças falhadas
- [ ] Status anterior registrado
- [ ] Justificativa registrada quando preenchida
- [ ] Timestamp registrado

### Tela Administrativa

- [ ] Tela de revisão carrega corretamente
- [ ] Drawer de detalhes exibe status
- [ ] Bloco de alteração de status visível
- [ ] Justificativa obrigatória validada
- [ ] Feedback de sucesso exibido
- [ ] Feedback de erro exibido
- [ ] Tabela atualiza após alteração
- [ ] Drawer atualiza após alteração

### Segurança

- [ ] Frontend chama endpoint PATCH via `fetch`, não RPC
- [ ] Endpoint usa `SUPABASE_SERVICE_ROLE_KEY` no servidor
- [ ] Service role key nunca aparece no bundle
- [ ] Alterações rastreadas com `alterado_por` e `alterado_por_nome`

### Atomicidade

- [ ] Cenários inválidos: status NÃO altera
- [ ] Cenários inválidos: histórico NÃO criado
- [ ] Cenários válidos: status altera E histórico criado

---

## Limpeza dos Dados de Teste

Após validação, os dados foram removidos automaticamente pelo script.

**Para verificar manualmente:**

```sql
select count(*) as total_teste
from public.pessoas
where nome_completo ilike '%Teste US023%'
   or nome_completo ilike '%Responsável US023%'
   or telefone_normalizado like '%21999990023%'
   or telefone_normalizado like '%21988880023%';
```

Resultado esperado: `0`

---

## Status de Homologação

| Etapa | Status | Data | Obs |
|-------|--------|------|-----|
| SQL Aplicado | ⏳ | | |
| Tabela Validada | ⏳ | | |
| RPC Validada | ⏳ | | |
| Testes Automatizados | ⏳ | | |
| Testes Visuais | ⏳ | | |
| Segurança Validada | ⏳ | | |
| Limpeza Completa | ⏳ | | |

---

## Próximos Passos

1. **Executar SQL no Supabase** (Manual)
2. **Executar script de testes** (Automatizado)
3. **Executar testes visuais** (Manual)
4. **Validar segurança** (Manual)
5. **Confirmar limpeza** (Manual)
6. **Marcar US-023 como HOMOLOGADA**

