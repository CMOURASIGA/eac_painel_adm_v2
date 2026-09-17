# US-117 - Visitação como revisão e complementação cadastral

## 1. Objetivo

Evoluir o módulo de visitação para que a visita ao adolescente/família seja também uma etapa formal de conferência, correção e complementação do cadastro oficial.

Hoje o módulo de visitação registra principalmente status, responsável, observação e um questionário reduzido em `visitacoes.respostas_questionario`. A partir desta US, a tela de visitação deve carregar todas as informações já conhecidas do adolescente, indicar o que está preenchido e o que ainda está pendente, permitir correções e novos preenchimentos durante a visita e persistir cada informação na tabela oficial correspondente.

A tabela `visitacoes` continuará representando o evento de visitação. Ela não deve se tornar a fonte oficial de dados cadastrais.

Princípio da solução:

```text
Cadastro oficial = tabelas normalizadas do domínio
Visitação = evento operacional
Histórico da visitação = fotografia e trilha do que aconteceu
```

---

## 2. Contexto atual

O fluxo atual possui:

- `components/VisitacaoForm.tsx`
- `components/VisitacaoPage.tsx`
- `components/VisitacaoQuestionarioFields.tsx`
- `utils/visitacaoQuestionario.ts`
- `services/visitacaoBusinessService.ts`
- `services/visitacaoService.ts`
- `api/visitacoes.ts`
- `docs/US-115-visitacao-foundation.sql`
- `docs/US-116-visitacao-questionario.sql`

O questionário implementado em US-116 possui atualmente apenas:

- Já participou de algum encontro?
- É batizado?
- É crismado?

As respostas são persistidas em JSONB em `visitacoes.respostas_questionario` e `visitacoes_historico.respostas_questionario`.

Essa estratégia deve ser preservada apenas como histórico/fotografia da visita, não como cadastro oficial.

---

## 3. Referência funcional da ficha de visitação

A nova tela deve contemplar, no mínimo, as informações presentes na ficha operacional utilizada pelo EAC:

### Identificação

- Nome completo do adolescente
- Como gostaria de ser chamado no EAC
- Data de nascimento
- Idade

### Família

- Nome do pai
- Nome da mãe
- Responsável principal, quando houver

### Endereço e contato

- Endereço completo
- Bairro
- Cidade
- Estado
- Telefone
- Celular, quando houver distinção

### Vida escolar

- Escola em que estuda
- Turno
- Série
- Grau

### Histórico de encontros

- Já participou de algum encontro?
- Qual encontro?
- Quem convidou para o EAC?
- Pais já fizeram ECC?

### Vida religiosa

- É batizado?
- Fez Primeira Comunhão?
- É crismado?
- Qual paróquia pertence?

### Aptidões e informações pessoais

- Toca algum instrumento musical?
- Se sim, qual instrumento, caso essa informação exista no modelo
- Gosta de cantar?
- Por que quer fazer o encontro?
- Alguém da família pertence a outra doutrina não católica?

### Saúde e alimentação

- Possui restrição alimentar?
- Se sim, qual?

### Dados operacionais da visitação

- Status da visitação
- Data da ação
- Responsável pela ação
- Observações
- Data efetiva da visita, quando aplicável

---

## 4. Novo fluxo funcional

### 4.1 Seleção do adolescente

A tela inicial de visitação continua permitindo localizar adolescente priorizado por nome ou telefone.

A ação principal deverá ser algo equivalente a:

```text
[ João da Silva ]
[ Realizar visitação ]
```

As perguntas cadastrais não devem aparecer antes da seleção do adolescente.

### 4.2 Abertura da visitação

Ao clicar em `Realizar visitação`, o sistema deve:

1. identificar `inscricao_id`, `adolescente_id` e `pessoa_id`;
2. buscar o cadastro completo disponível nas tabelas oficiais;
3. buscar responsáveis e vínculos familiares;
4. buscar dados específicos da inscrição/encontro;
5. buscar última visitação e histórico, quando houver;
6. montar um único modelo de tela para conferência e complementação.

### 4.3 Exibição dos dados

Cada campo deve apresentar o valor atual conhecido.

Exemplo:

```text
Nome completo
João da Silva

Data de nascimento
14/03/2011

Escola
[ não informado ]
```

O responsável pela visita deve poder:

- confirmar informação existente;
- corrigir informação existente;
- preencher informação ausente.

### 4.4 Estados visuais recomendados

A interface deve diferenciar claramente:

- `Preenchido`: dado já disponível no cadastro oficial;
- `Alterado`: dado existente modificado durante a visita;
- `Pendente`: dado ainda sem informação.

A implementação visual pode usar cores, badges, ícones ou combinação destes recursos, desde que não dependa exclusivamente de cor para comunicar o estado.

Sugestão:

- verde: preenchido/confirmado;
- amarelo: alterado na visita atual;
- neutro/vermelho leve: pendente.

### 4.5 Indicador de completude

Exibir um resumo do cadastro ao iniciar a visitação.

Exemplo:

```text
Cadastro: 68% completo
12 informações preenchidas
6 informações pendentes
```

A regra de cálculo deve considerar apenas os campos definidos como relevantes para a visitação.

---

## 5. Organização sugerida da tela

A tela deve ser dividida em blocos ou seções expansíveis para funcionar bem em desktop e celular.

### Bloco 1 - Identificação

- Nome completo
- Nome pelo qual deseja ser chamado
- Data de nascimento
- Idade calculada

### Bloco 2 - Família e contato

- Pai
- Mãe
- Responsável principal
- Telefone(s)
- E-mail, caso faça parte do cadastro oficial

### Bloco 3 - Endereço

- Endereço
- Bairro
- Cidade
- Estado

### Bloco 4 - Escola

- Escola
- Turno
- Série
- Grau

### Bloco 5 - Histórico e vínculo com o EAC

- Já participou de encontro?
- Qual?
- Quem convidou?
- Pais fizeram ECC?

### Bloco 6 - Vida religiosa

- Batizado
- Primeira Comunhão
- Crismado
- Paróquia

### Bloco 7 - Informações pessoais

- Instrumento musical
- Gosta de cantar
- Motivo para fazer o encontro
- Outra doutrina na família

### Bloco 8 - Saúde e alimentação

- Restrição alimentar
- Detalhamento da restrição

### Bloco 9 - Registro da visita

- Tipo/status da ação
- Data da ação
- Responsável pela visita
- Observações

### Rodapé de ações

```text
[ Salvar rascunho ]
[ Concluir visitação ]
```

`Salvar rascunho` é recomendado caso a arquitetura atual permita sua inclusão sem ampliar excessivamente o escopo. Caso não seja implementado nesta US, registrar como evolução posterior.

---

## 6. Regra principal de persistência

Ao concluir a visitação, o sistema NÃO deve apenas persistir o formulário completo dentro de `visitacoes.respostas_questionario`.

Cada informação deve ser gravada na fonte oficial correspondente.

Exemplo conceitual:

```text
nome / nascimento / telefone / endereço -> pessoas ou tabela oficial equivalente
vínculo adolescente -> adolescentes
pai/mãe/responsável -> responsaveis + adolescente_responsaveis
informações da inscrição -> inscricoes ou entidade de domínio correspondente
status/data/responsável da visita -> visitacoes
histórico -> visitacoes_historico
```

O mapeamento definitivo de campo -> tabela -> coluna deve ser realizado pelo desenvolvedor após inspecionar o schema real do Supabase.

Não criar coluna nova apenas para evitar localizar a fonte correta de um dado já existente.

---

## 7. Mapeamento obrigatório antes da implementação

Antes de alterar banco ou frontend, criar uma matriz no próprio desenvolvimento contendo:

| Campo funcional | Tabela atual | Coluna atual | Existe? | Ação necessária |
| --- | --- | --- | --- | --- |
| Nome completo | `pessoas` | a confirmar | sim/não | reutilizar/criar |
| Nome social/apelido | a confirmar | a confirmar | sim/não | reutilizar/criar |
| Data nascimento | `pessoas` | `data_nascimento` | sim | reutilizar |
| Telefone | `pessoas` | `telefone` | sim | reutilizar |
| Bairro | `pessoas` | `bairro` | sim | reutilizar |
| Nome do pai | a confirmar | a confirmar | a confirmar | mapear vínculo |
| Nome da mãe | a confirmar | a confirmar | a confirmar | mapear vínculo |
| Escola | a confirmar | a confirmar | a confirmar | mapear |
| Turno | a confirmar | a confirmar | a confirmar | mapear |
| Série | a confirmar | a confirmar | a confirmar | mapear |
| Grau | a confirmar | a confirmar | a confirmar | mapear |
| Participou de encontro | a confirmar | a confirmar | a confirmar | mapear |
| Qual encontro | a confirmar | a confirmar | a confirmar | mapear |
| Pais fizeram ECC | a confirmar | a confirmar | a confirmar | mapear |
| Batizado | a confirmar | a confirmar | a confirmar | mapear |
| Primeira Comunhão | a confirmar | a confirmar | a confirmar | mapear |
| Crismado | a confirmar | a confirmar | a confirmar | mapear |
| Paróquia | a confirmar | a confirmar | a confirmar | mapear |
| Instrumento | a confirmar | a confirmar | a confirmar | mapear |
| Gosta de cantar | a confirmar | a confirmar | a confirmar | mapear |
| Motivo para fazer EAC | a confirmar | a confirmar | a confirmar | mapear |
| Outra doutrina na família | a confirmar | a confirmar | a confirmar | mapear |
| Restrição alimentar | a confirmar | a confirmar | a confirmar | mapear |
| Detalhe restrição | a confirmar | a confirmar | a confirmar | mapear |

Essa matriz deverá fazer parte da PR de implementação ou ser adicionada neste documento durante o desenvolvimento.

---

## 8. Estratégia para campos ainda sem coluna oficial

Quando uma informação da ficha não tiver representação no schema atual:

1. confirmar que realmente não existe campo equivalente;
2. avaliar a entidade correta do domínio;
3. criar coluna/tabela somente no domínio correto;
4. criar migration SQL versionada;
5. atualizar tipos, services e consultas;
6. não usar `visitacoes.respostas_questionario` como atalho para cadastro permanente.

---

## 9. Histórico e auditoria

A atualização cadastral durante a visita deve gerar trilha de auditoria.

O sistema deve conseguir registrar, no mínimo:

- campo alterado;
- valor anterior;
- valor novo;
- `inscricao_id`;
- `adolescente_id` quando disponível;
- pessoa/responsável afetado quando aplicável;
- responsável pela ação;
- data/hora;
- origem `VISITACAO` ou equivalente.

Exemplo:

```text
Visitação realizada por: Maria
Data: 20/09/2026

Telefone
Anterior: (21) 98888-1111
Novo: (21) 99999-2222

Escola
Anterior: não informado
Novo: Colégio X

Batizado
Anterior: não informado
Novo: Sim
```

Preferir integração com a infraestrutura de auditoria já existente no projeto, quando aplicável, em vez de criar mecanismo paralelo sem necessidade.

`visitacoes_historico` deve continuar registrando o evento operacional da visita.

---

## 10. Snapshot da visitação

Mesmo atualizando as tabelas oficiais, manter em `visitacoes.respostas_questionario` e/ou `visitacoes_historico.respostas_questionario` uma fotografia resumida das respostas da visita é aceitável e recomendado para rastreabilidade.

Porém:

- o JSON não deve ser a fonte oficial;
- consultas futuras do cadastro devem ler as tabelas normalizadas;
- o snapshot deve representar o que foi informado naquele momento.

---

## 11. Regras de atualização

### 11.1 Campo não alterado

Não executar update desnecessário.

### 11.2 Campo alterado

Persistir novo valor e registrar auditoria.

### 11.3 Campo anteriormente vazio

Persistir informação recebida e registrar como complementação cadastral.

### 11.4 Valor vazio enviado pelo usuário

Não apagar automaticamente um dado oficial existente apenas porque o campo chegou vazio.

Caso seja necessária exclusão/limpeza de informação já existente, exigir ação explícita do usuário e registrar auditoria.

### 11.5 Campos calculados

Idade deve continuar calculada a partir de data de nascimento, não deve se tornar um dado manual independente.

---

## 12. Validações

Aplicar validações compatíveis com os tipos oficiais do cadastro.

No mínimo:

- data de nascimento válida;
- idade compatível com a regra do encontro, sem duplicar regra já existente em outro ponto do sistema;
- telefone normalizado conforme padrão já adotado;
- campos Sim/Não tratados como boolean/enum adequado;
- campos condicionais obrigatórios quando aplicável.

Exemplos:

- se `possui_restricao_alimentar = SIM`, detalhamento da restrição deve ser solicitado;
- se `ja_participou_encontro = SIM`, habilitar/preferencialmente exigir `qual_encontro`;
- se `toca_instrumento = SIM`, solicitar instrumento quando o modelo de dados comportar essa informação.

---

## 13. Compatibilidade com o fluxo atual

Preservar:

- busca de priorizados;
- status atuais de visitação;
- formulário público protegido por token;
- `visitacoes`;
- `visitacoes_historico`;
- indicadores do painel;
- histórico de ações;
- origem do registro;
- funcionamento das telas administrativas existentes.

A implementação não deve quebrar US-115 ou US-116.

US-117 substitui apenas o conceito de questionário isolado por uma experiência de conferência cadastral integrada.

---

## 14. API sugerida

Evitar fazer o frontend coordenar atualizações independentes em várias tabelas.

Criar um endpoint/service transacional ou uma função de negócio centralizada para concluir a visitação.

Exemplo conceitual:

```text
POST /api/visitacoes/:inscricaoId/concluir
```

Payload sugerido:

```json
{
  "status_visitacao": "VISITACAO_REALIZADA",
  "data_acao": "2026-09-20T18:00:00-03:00",
  "responsavel_acao": "Maria",
  "observacao": "Família recebeu a equipe.",
  "cadastro": {
    "...": "somente campos editáveis da visitação"
  },
  "snapshot": {
    "...": "fotografia das respostas"
  }
}
```

O backend deve:

1. validar a inscrição priorizada;
2. carregar estado atual;
3. validar alterações permitidas;
4. identificar diferenças;
5. atualizar as entidades oficiais;
6. registrar auditoria;
7. atualizar `visitacoes`;
8. inserir `visitacoes_historico`;
9. retornar cadastro atualizado.

Sempre que possível, executar as operações de persistência de forma atômica/transacional.

---

## 15. Segurança

A implementação deve respeitar os controles existentes de acesso e RLS.

O formulário público de visitação não pode ganhar acesso genérico às tabelas cadastrais.

A leitura e atualização devem ocorrer exclusivamente por fluxo autorizado no backend/service, com payload restrito aos campos permitidos.

Nunca aceitar do cliente IDs arbitrários para alterar pessoa/responsável sem validar que pertencem à inscrição selecionada.

---

## 16. Tipos e contratos

Revisar `types.ts` para evitar transformar a nova ficha inteira em um `Record<string, any>`.

Criar tipos explícitos para:

- dados cadastrais apresentados na visitação;
- alterações permitidas;
- snapshot da visita;
- resposta da API;
- diferenças/auditoria, se necessário.

Manter os tipos de status atuais.

---

## 17. Componentização sugerida

Evitar crescimento excessivo de `VisitacaoForm.tsx` e `VisitacaoPage.tsx`.

Sugestão de decomposição:

```text
VisitacaoCadastroForm
  VisitacaoIdentificacaoSection
  VisitacaoFamiliaSection
  VisitacaoEnderecoSection
  VisitacaoEscolaSection
  VisitacaoHistoricoEacSection
  VisitacaoVidaReligiosaSection
  VisitacaoInformacoesPessoaisSection
  VisitacaoSaudeSection
  VisitacaoRegistroSection
  VisitacaoCompletenessSummary
```

A nomenclatura pode ser ajustada ao padrão atual do projeto.

---

## 18. Critérios de aceite

A US será considerada concluída quando:

- [ ] Ao selecionar um adolescente priorizado, a tela carrega as informações cadastrais existentes.
- [ ] Informações existentes aparecem preenchidas.
- [ ] Informações ausentes aparecem claramente como pendentes.
- [ ] O responsável pode preencher dados ausentes.
- [ ] O responsável pode corrigir dados existentes.
- [ ] Alterações feitas na visita são visualmente identificáveis antes da conclusão.
- [ ] Ao concluir, os dados são persistidos nas tabelas oficiais correspondentes.
- [ ] `visitacoes` continua representando o evento operacional.
- [ ] `visitacoes_historico` continua registrando a evolução da visitação.
- [ ] Existe trilha de auditoria das alterações cadastrais.
- [ ] O sistema não apaga informação existente por envio de campo vazio.
- [ ] O questionário não permanece limitado às três perguntas atuais.
- [ ] A interface funciona em desktop e mobile.
- [ ] O formulário público continua protegido pelo token configurado.
- [ ] Não ocorre regressão nas telas de visitação existentes.
- [ ] Não ocorre regressão no painel de inscrições prioritárias.
- [ ] As informações atualizadas passam a ser refletidas nas demais telas que consultam o mesmo cadastro oficial.
- [ ] Build, typecheck e testes do projeto permanecem aprovados.

---

## 19. Cenários mínimos de homologação

### Cenário A - Cadastro incompleto

Adolescente possui nome, telefone e nascimento, mas não possui escola e informações religiosas.

Esperado:

- tela mostra dados existentes;
- escola e dados religiosos aparecem pendentes;
- responsável preenche;
- conclusão atualiza cadastro oficial e visitação.

### Cenário B - Correção de telefone

Telefone já existe, mas família informa número novo.

Esperado:

- valor atual aparece;
- novo valor é marcado como alteração;
- cadastro oficial recebe novo telefone;
- auditoria registra anterior e novo;
- demais telas passam a exibir o telefone novo.

### Cenário C - Nenhuma alteração cadastral

Todas as informações estão corretas.

Esperado:

- usuário confirma a visita;
- não são executados updates cadastrais desnecessários;
- evento de visitação e histórico são gravados normalmente.

### Cenário D - Tentativa de apagar informação por campo vazio

Campo oficial contém escola preenchida e formulário envia string vazia.

Esperado:

- escola não é apagada automaticamente;
- exclusão exige ação explícita, caso suportada.

### Cenário E - Restrição alimentar

Família informa que existe restrição alimentar.

Esperado:

- detalhamento é solicitado;
- informação é persistida na entidade oficial correta;
- demais módulos que utilizem a informação passam a receber o novo dado.

### Cenário F - Formulário público

Responsável acessa fluxo de visitação por token válido.

Esperado:

- visualiza somente os adolescentes permitidos pelo fluxo atual;
- consegue completar cadastro somente pelos campos autorizados;
- não consegue manipular IDs para alterar outro adolescente;
- token inválido continua bloqueado.

---

## 20. Entregáveis esperados do desenvolvimento

1. Matriz final campo -> tabela -> coluna.
2. Migration SQL somente para campos realmente inexistentes.
3. Atualização da view/consulta usada pela visitação para retornar os dados necessários.
4. Service de leitura do cadastro para visitação.
5. Service de conclusão/atualização cadastral.
6. Auditoria das alterações.
7. Refatoração da UI da visitação.
8. Atualização dos tipos TypeScript.
9. Testes dos cenários principais.
10. Documentação de homologação contendo campos alterados e tabelas impactadas.

---

## 21. Fora do escopo desta US

Não incluir sem necessidade comprovada:

- redesign completo do painel administrativo;
- alteração das regras de priorização;
- alteração do processo de distribuição de círculos;
- mudança de autenticação do sistema;
- criação de novo cadastro paralelo de adolescentes;
- migração de dados históricos não relacionada à visitação;
- exclusão das US-115/US-116 ou de seus históricos existentes.

---

## 22. Orientação final ao desenvolvedor

Antes de codificar a nova tela, inspecionar o schema real do Supabase e identificar onde cada informação já existe.

A solução deve evitar duas fontes oficiais para o mesmo dado.

Exemplo de situação que não pode ocorrer:

```text
pessoas.telefone = telefone antigo
visitacoes.respostas_questionario.telefone = telefone novo
```

Após a conclusão da visitação, deve existir uma única informação oficial atualizada, com o evento e o histórico registrando quando e por quem ela foi modificada.

A implementação deve ser feita como evolução do módulo atual, preservando compatibilidade com US-115 e US-116 e mantendo o fluxo existente operacional durante a mudança.
