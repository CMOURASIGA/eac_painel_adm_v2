# 🚀 US-023 - Guia de Homologação Manual

## FASE 1: Aplicar SQL no Supabase ⚠️ OBRIGATÓRIO

### 1. Abrir Supabase Console

1. Acesse: https://app.supabase.com
2. Selecione o projeto `eac-painel-adm`
3. Clique em **SQL Editor** → **New Query**

### 2. Copiar SQL

Abra o arquivo: `docs/US-023-alterar-status-inscricao.sql`

Copie todo o conteúdo SQL.

### 3. Colar e Executar

1. Cole o SQL no Supabase SQL Editor
2. Clique no botão **Run** (ou Ctrl+Enter)
3. Aguarde a confirmação de sucesso

**Esperado:**
```
✓ Query executed successfully
```

### 4. Validar Criação

Execute no Supabase SQL Editor para confirmar que a tabela foi criada:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public' 
  and table_name = 'inscricoes_status_historico';
```

**Resultado esperado:**
```
table_schema | table_name
---------------------------
public       | inscricoes_status_historico
```

Se não retornar nada, o SQL falhou. Verifique os erros no painel do Supabase.

---

## FASE 2: Preparar Ambiente Local

### 1. Verificar Servidores

Abra dois terminais:

**Terminal 1 - Backend (porta 3001):**
```powershell
cd "c:\Projetos\eac_painel_adm-main (3)\eac_painel_adm-main"
npm run dev
```

Resultado esperado:
```
✓ Ready in 1226ms
```

**Terminal 2 - Frontend (porta 3000):**
```powershell
cd "c:\Projetos\eac_painel_adm-main (3)\eac_painel_adm-main"
npx vite
```

Resultado esperado:
```
  VITE v6.4.1  ready in 646 ms
  ➜  Local:   http://localhost:3000/
```

### 2. Validar Conectividade

```powershell
curl http://localhost:3001/api/inscricoes/admin
```

Você deve receber uma resposta JSON com dados de inscrições.

---

## FASE 3: Executar Testes Automatizados

### 1. Abrir Novo Terminal

```powershell
cd "c:\Projetos\eac_painel_adm-main (3)\eac_painel_adm-main"
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
node scripts/test-us023-manual.mjs
```

### 2. Seguir as Instruções

O script solicitará que você confirme quando o SQL foi aplicado:

```
⚠️  PREPARAÇÃO MANUAL OBRIGATÓRIA

[STEP 1] Aplicar SQL da US-023 no Supabase
ℹ️  ⚠️  SQL deve ser aplicado manualmente no Supabase Console
ℹ️  URL: https://app.supabase.com
ℹ️  1. Selecione o projeto
ℹ️  2. SQL Editor → New Query
ℹ️  3. Cole o conteúdo de: docs/US-023-alterar-status-inscricao.sql
ℹ️  4. Clique Run

Após aplicar o SQL, pressione Enter para continuar com os testes...
```

**Ação:** Pressione Enter quando o SQL estiver aplicado.

### 3. Acompanhar os Testes

O script executará automaticamente:

- ✅ Validação da tabela
- ✅ Obtenção de encontro para teste
- ✅ Criação de inscrição de teste
- ✅ Validação de status inicial
- ✅ 7 testes de alteração de status
- ✅ Limpeza de dados de teste

### 4. Interpretar Resultados

Resultado bem-sucedido:
```
================================================================================
✅ HOMOLOGAÇÃO CONCLUÍDA
================================================================================

📊 RESUMO FINAL

✅ 7/7 testes passaram
```

Se algum teste falhar, o script indicará qual foi o problema.

---

## FASE 4: Testes Visuais Opcionais

Se você quiser testar a interface gráfica:

### 1. Acessar Tela de Revisão de Inscrições

URL: http://localhost:3000/inscricoes/revisao

### 2. Procurar Inscrição de Teste

Procure por: `Teste US023 Status`

### 3. Abrir Drawer de Detalhes

Clique na inscrição para abrir o painel lateral.

### 4. Alterar Status

1. Veja o status atual (deve ser CANCELADO após os testes automatizados)
2. Selecione um novo status (ex: FILA)
3. Se o status requer justificativa, preencha
4. Clique "Atualizar Status"
5. Veja a mensagem de sucesso
6. Confirme que o status foi atualizado

### 5. Testar Erro de Validação

1. Tente selecionar NAO_SELECIONADO
2. Deixe a justificativa em branco
3. Clique "Atualizar Status"
4. Veja a mensagem de erro
5. Confirme que o status NÃO foi alterado

---

## Checklist de Validação

### SQL e Banco

- [ ] SQL aplicado com sucesso no Supabase
- [ ] Tabela `inscricoes_status_historico` criada
- [ ] Colunas em `inscricoes` adicionadas
- [ ] RPC `fn_alterar_status_inscricao` existe

### Testes Automatizados

- [ ] Teste 1: INSCRITO → EM_ANALISE ✅
- [ ] Teste 2: EM_ANALISE → PRIORIZADO ✅
- [ ] Teste 3: Falha por falta de justificativa ✅
- [ ] Teste 4: Com justificativa funciona ✅
- [ ] Teste 5: Status inválido é bloqueado ✅
- [ ] Teste 6: Inscrição inexistente é bloqueada ✅
- [ ] Teste 7: Mesmo status é bloqueado ✅

### Histórico

- [ ] Histórico criado para mudanças bem-sucedidas
- [ ] Histórico NÃO criado para falhas
- [ ] Status anterior registrado
- [ ] Justificativa registrada quando fornecida

### Tela Administrativa

- [ ] Tela carrega corretamente
- [ ] Drawer de detalhes exibe status
- [ ] Bloco de alteração de status visível
- [ ] Alteração funciona na interface
- [ ] Erro de validação é exibido

### Atomicidade

- [ ] Status não altera em cenários inválidos
- [ ] Histórico não cria em cenários inválidos
- [ ] Transação é atômica (tudo ou nada)

---

## Resultados Esperados

### Se Tudo Passar ✅

```
================================================================================
🚀 HOMOLOGAÇÃO US-023 - Alterar Status da Inscrição
================================================================================

🧪 TESTES AUTOMATIZADOS

[STEP 2] Validar tabela inscricoes_status_historico
✅ Tabela inscricoes_status_historico validada

[STEP 3] Obter encontro para teste
✅ Encontro selecionado: EAC - ImportaÃ§Ã£o Inicial... (...)

[STEP 4] Criar inscrição de teste
✅ Inscrição criada: 12345678-abcd-efgh-ijkl-mnopqrstuvwx

[STEP 5] Validar status inicial
✅ Status inicial: INSCRITO

🔄 TESTES DE ALTERAÇÃO

[TEST 1] Alterar para EM_ANALISE
✅ Status alterado para EM_ANALISE
ℹ️  Resposta: status_anterior=INSCRITO, historico_id=...
  Status no DB: EM_ANALISE ✓

[TEST 2] Alterar para PRIORIZADO
✅ Status alterado para PRIORIZADO
ℹ️  Resposta: status_anterior=EM_ANALISE, historico_id=...
  Status no DB: PRIORIZADO ✓

[TEST 3] Alterar para CANCELADO (sem justificativa - deve falhar)
✅ Erro esperado recebido: JUSTIFICATIVA_OBRIGATORIA
✅ Histórico não alterado (2 registros)

[TEST 4] Alterar para CANCELADO (com justificativa)
✅ Status alterado para CANCELADO
ℹ️  Resposta: status_anterior=PRIORIZADO, historico_id=...
  Status no DB: CANCELADO ✓

[TEST 5] Alterar para APROVADO (status inválido)
✅ Erro esperado recebido: STATUS_INVALIDO
✅ Histórico não alterado (3 registros)

[TEST 6] Inscrição inexistente
✅ Erro esperado recebido: INSCRICAO_NAO_ENCONTRADA

[TEST 7] Mesmo status (CANCELADO → CANCELADO)
✅ Erro esperado recebido: STATUS_SEM_ALTERACAO
✅ Histórico final: 3 registros

📊 RESUMO FINAL

✅ 7/7 testes passaram

🧹 LIMPEZA

✅ Dados removidos

================================================================================
✅ HOMOLOGAÇÃO CONCLUÍDA
================================================================================
```

---

## Se Houver Erro ❌

### Erro: "Tabela não foi criada"

**Solução:**
1. Volte ao Supabase Console
2. Verifique se o SQL foi realmente executado
3. Procure por mensagens de erro no painel
4. Tente executar novamente

### Erro: "Falha ao criar inscrição"

**Solução:**
1. Verifique se o servidor Next.js está rodando em localhost:3001
2. Verifique se há um encontro disponível no banco
3. Confirme que `.env.local` está configurado

### Erro: "Esperava sucesso, mas falhou"

**Solução:**
1. Verifique os logs do servidor Next.js
2. Confirme que a RPC foi criada
3. Verifique as permissões da service role
4. Tente aplicar novamente o SQL

---

## Próximos Passos Após Sucesso

1. ✅ Documentar resultados
2. ✅ Fazer print-screens da interface (opcional)
3. ✅ Marcar US-023 como **HOMOLOGADA**
4. ✅ Fazer deploy para produção
5. ✅ Comunicar stakeholders

---

## Contato em Caso de Dúvidas

Se algo não funcionar:

1. Verifique os logs do servidor
2. Confira as credenciais do Supabase
3. Valide que o SQL foi completamente aplicado
4. Tente novamente a partir do passo de homologação que falhou

