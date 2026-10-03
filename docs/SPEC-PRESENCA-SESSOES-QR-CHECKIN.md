# SPEC — Novo fluxo de presença por sessão, QR Code e check-in

## 1. Objetivo

Redesenhar o fluxo público de presença do EAC para que o registro seja simples, rápido e confiável, sem depender de seleção manual de evento, círculo ou tipo de público pelo adolescente.

A experiência desejada é próxima de um check-in de transporte: a pessoa lê um QR Code da reunião, identifica-se por nome ou telefone, seleciona o próprio cadastro e confirma a presença em poucos segundos.

O mesmo motor deverá atender:

- Pós-Encontro;
- reuniões de círculo;
- outros eventos que venham a utilizar presença no futuro.

Esta SPEC documenta o desenho aprovado em discussão funcional. **A implementação ainda não deve ser iniciada enquanto não estiver disponível a relação confiável entre adolescentes, círculos e tios responsáveis.**

---

## 2. Problemas do fluxo atual

O formulário público atual permite registrar presença sem existir uma sessão formal de reunião associada ao momento do check-in. Isso gera riscos e limitações:

1. um link antigo pode continuar sendo usado para registrar uma presença fora do contexto real;
2. o adolescente pode precisar selecionar informações que o sistema deveria conhecer;
3. círculo e papel podem ser informados ou interpretados de forma incorreta;
4. a busca por pessoa precisa tolerar diferenças de grafia, acentuação e sobrenomes;
5. entradas manuais livres de nome geram registros difíceis de conciliar;
6. não existe uma entidade própria representando a reunião/sessão que originou a presença;
7. a presença precisa guardar contexto histórico do círculo e responsáveis existentes naquele momento.

---

## 3. Princípios aprovados

### 3.1. O QR identifica a reunião, não a pessoa

Não haverá QR individual obrigatório para cada adolescente.

Cada reunião terá um QR Code próprio. O QR deverá carregar apenas um identificador/token seguro da sessão de presença.

Exemplo conceitual:

```
/form?s=<TOKEN_DA_SESSAO>
```

Nenhum dado pessoal deve ser exposto no QR.

### 3.2. O aparelho não limita o número de pessoas

O bloqueio de duplicidade deve ser por **pessoa + sessão**, e não por celular, navegador, cookie, IP ou device fingerprint.

Um mesmo aparelho poderá:

- registrar a presença do próprio adolescente;
- ajudar um amigo sem celular;
- ser usado por um tio para auxiliar várias pessoas.

A regra é:

```
uma pessoa + uma sessão = no máximo uma presença
```

A proteção deve existir também no banco de dados, não apenas no frontend.

### 3.3. O público não escolhe o evento

Ao abrir o QR, o formulário já deve saber:

- qual é o evento/reunião;
- qual é o encontro de origem;
- se é Pós-Encontro ou reunião de círculo;
- qual círculo está relacionado, quando aplicável;
- quem criou/é responsável pela sessão;
- se a sessão está aberta ou encerrada.

O adolescente não deve escolher essas informações.

### 3.4. Encerramento é manual

O QR/sessão **não expira automaticamente por horário**.

A sessão fica válida enquanto estiver em estado `ABERTA`.

Somente o responsável autorizado poderá encerrá-la manualmente.

Após o encerramento:

- o QR continua podendo ser lido;
- a tela identifica a reunião;
- novos registros são bloqueados;
- deve aparecer mensagem clara de presença encerrada.

### 3.5. Sessão encerrada não reabre

Uma sessão encerrada não deve ser reaberta.

Se o responsável encerrou por engano ou precisar continuar recebendo presenças, deve criar **uma nova sessão vinculada ao mesmo evento/reunião**.

Isso precisa ficar explícito antes do encerramento:

> Depois de encerrar, este QR Code deixará de aceitar novos registros. Esta sessão não poderá ser reaberta. Se precisar continuar recebendo presenças, será necessário criar uma nova sessão para esta mesma reunião.

Após o encerramento, a interface deve oferecer:

> Criar nova sessão

sem obrigar o responsável a recriar todos os dados do evento.

---

## 4. Rotas propostas

### 4.1. `/form`

Acesso público de presença.

Responsabilidades:

- receber token da sessão;
- carregar dados públicos da reunião;
- validar se a sessão está aberta;
- permitir busca de pessoa;
- permitir cadastro rápido quando necessário;
- registrar presença;
- informar quando a pessoa já registrou;
- informar quando a sessão estiver encerrada.

### 4.2. `/form/admin`

Área autenticada para os responsáveis.

Responsabilidades:

- login;
- listar eventos/reuniões do usuário;
- criar reunião/evento;
- abrir sessão de presença;
- gerar e reexibir QR Code;
- acompanhar presenças;
- encerrar sessão;
- consultar histórico.

Usuários comuns não devem visualizar reuniões de outros usuários.

Administradores podem ter visão global e ação excepcional para suporte/gestão.

---

## 5. Conceitos de domínio

### 5.1. Evento/Reunião

Representa a reunião cadastrada pelo responsável.

Exemplos:

- Pós-Encontro do 37º EAC;
- Reunião do Círculo Azul;
- Reunião do Círculo Roxo.

O evento pode existir sem presença aberta.

### 5.2. Sessão de presença

Representa a janela operacional de check-in de um evento.

Estados mínimos:

```
RASCUNHO
ABERTA
ENCERRADA
```

Um evento pode ter mais de uma sessão ao longo de sua vida, principalmente quando uma sessão anterior foi encerrada e o responsável precisa continuar recebendo presenças.

### 5.3. Presença

É o registro de uma pessoa em uma sessão específica.

A presença deve carregar o contexto histórico necessário para auditoria, inclusive snapshots do papel/círculo/responsáveis quando aplicável.

---

## 6. Estrutura de dados proposta

Os nomes finais devem ser validados contra o schema existente antes de qualquer migration.

### 6.1. `presenca_eventos`

Campos conceituais:

```
id
tipo
titulo
encontro_id
circulo_id
local
observacao
created_by
created_at
updated_at
```

Tipos iniciais:

```
POS_ENCONTRO
REUNIAO_CIRCULO
```

### 6.2. `presenca_sessoes`

```
id
evento_id
token_publico
status
aberta_em
encerrada_em
created_by
created_at
```

### 6.3. `presencas`

Revisar tabela atual e evoluir sem perda de histórico.

Campos conceituais adicionais:

```
sessao_id
pessoa_id
adolescente_id
registrado_em
papel_snapshot
circulo_id_snapshot
circulo_nome_snapshot
responsaveis_snapshot
origem_checkin
```

Deve existir restrição de unicidade equivalente a:

```
UNIQUE (sessao_id, pessoa_id)
```

O desenho final da migration deve considerar os registros históricos já existentes.

---

## 7. Fluxo do Pós-Encontro

### 7.1. Responsável

1. acessa `/form/admin`;
2. autentica;
3. cria o evento do tipo `POS_ENCONTRO`;
4. informa os dados necessários da reunião;
5. abre a sessão;
6. sistema gera QR Code;
7. QR pode ser exibido em celular, TV, projetor ou impresso;
8. acompanha as presenças;
9. encerra manualmente quando desejar.

### 7.2. Adolescente/encontreiro

1. lê o QR;
2. abre `/form?s=<token>`;
3. vê os dados da reunião;
4. pesquisa por nome ou telefone;
5. seleciona o próprio cadastro;
6. confirma;
7. recebe sucesso ou aviso de presença já registrada.

---

## 8. Fluxo de reunião de círculo

Reuniões de círculo não possuem calendário fixo e podem ocorrer em dias aleatórios.

Por isso, a reunião deve ser criada pelo responsável autenticado quando necessário.

### 8.1. Responsável do círculo

1. acessa `/form/admin`;
2. autentica;
3. cria reunião de círculo;
4. seleciona somente círculos para os quais possui permissão;
5. informa data/local/observação, quando aplicável;
6. abre a sessão;
7. gera o QR;
8. apresenta o QR aos participantes;
9. acompanha os check-ins;
10. encerra manualmente.

### 8.2. Busca pública

Em uma sessão de reunião de círculo:

- a busca deve priorizar membros vinculados àquele círculo;
- deve existir alternativa para procurar em toda a base quando a pessoa não aparecer;
- participar de uma reunião de outro círculo **não altera automaticamente o círculo cadastral da pessoa**;
- o registro pode guardar que a pessoa participou como visitante de outro círculo.

---

## 9. Login, propriedade e autorização

Cada evento/reunião deve ser vinculado ao usuário que o criou.

### Usuário responsável

Pode:

- ver suas próprias reuniões;
- editar dados permitidos;
- abrir sessão;
- gerar/reexibir QR;
- consultar presenças;
- encerrar sua sessão;
- criar nova sessão no mesmo evento.

Não pode:

- visualizar reuniões de outro usuário;
- operar círculos para os quais não possui autorização.

### Administrador

Pode:

- visualizar todos os eventos/sessões;
- atuar em suporte;
- encerrar sessão excepcionalmente quando necessário;
- auditar histórico.

A política final deve ser implementada também via RLS/autorização backend, não apenas escondendo elementos na interface.

---

## 10. Busca inteligente de pessoa

A busca precisa reduzir drasticamente a chance de o usuário achar que não existe.

### Requisitos mínimos

Ignorar:

- maiúsculas/minúsculas;
- acentuação;
- pontuação;
- formatação de telefone.

Aceitar:

- nome completo;
- parte do nome;
- primeiro e segundo nome;
- combinações de tokens do nome;
- telefone completo;
- telefone sem DDD quando for seguro;
- últimos dígitos do telefone, com critério para evitar colisão;
- similaridade textual.

Exemplo real que motivou a regra:

```
digitado: Guilherme Pereira Machado
cadastro existente: Guilherme Pereira da Silva
```

A busca pode apresentar candidatos próximos, mas **não deve realizar conciliação automática apenas por similaridade de nome**.

A pessoa deve escolher o candidato correto.

### Dados mínimos de confirmação

Ao listar candidatos, mostrar apenas informação suficiente para reduzir homônimo sem expor dados excessivos, por exemplo:

```
Nome
Círculo, quando houver
final do telefone
```

---

## 11. Cadastro rápido quando a pessoa realmente não existir

Não deve existir mais entrada livre de nome gerando presença sem cadastro.

Se a pessoa não for localizada, oferecer:

> Não encontrou seu cadastro? Faça um cadastro rápido.

Campos mínimos aprovados para discussão final:

```
Nome completo *
Data de nascimento *
WhatsApp *
E-mail
```

Antes de criar uma nova pessoa, o backend deve repetir validações de duplicidade por:

- telefone;
- nome + nascimento;
- outros identificadores disponíveis.

Se encontrar possível cadastro existente, oferecer o candidato antes de criar duplicata.

### Papel inicial

Para pessoa criada durante um Pós-Encontro/reunião de continuidade, a regra proposta é cadastrá-la como `ENCONTREIRO`, e não como `ENCONTRISTA` automaticamente.

A participação em um EAC como encontrista precisa permanecer sustentada pelo cadastro/encontro oficial correspondente.

---

## 12. Enriquecimento cadastral durante o check-in

O check-in pode ser aproveitado para completar dados faltantes, mas não deve virar um formulário longo.

Regra proposta:

- no máximo **uma pergunta adicional por check-in**;
- somente perguntar algo relevante e ausente;
- não repetir a mesma pergunta se o dado já estiver confirmado.

Ordem sugerida:

1. WhatsApp;
2. e-mail;
3. escola;
4. bairro/endereço incompleto;
5. outros campos definidos posteriormente.

Exemplo:

> Encontramos você. Só falta uma informação no seu cadastro: qual é o seu e-mail?

Depois:

> Confirmar presença

Se o cadastro estiver completo, não fazer pergunta adicional.

---

## 13. Círculo e tios responsáveis

Este é um pré-requisito para a implementação completa.

O sistema precisa conhecer de forma estruturada:

- qual adolescente pertence a qual círculo;
- qual encontro originou esse vínculo;
- quais tios/responsáveis estão vinculados a cada círculo;
- validade/histórico do vínculo quando aplicável.

O usuário solicitou uma planilha externa com a relação de adolescentes e tios por círculo.

**Não iniciar a implementação desta SPEC até receber e auditar essa planilha.**

Quando a planilha chegar:

1. comparar com as tabelas atuais;
2. identificar se já existe estrutura equivalente;
3. decidir entre atualizar tabelas existentes ou criar estrutura nova;
4. normalizar vínculos;
5. validar duplicidades;
6. confirmar os seis círculos e seus responsáveis;
7. somente depois desenhar a migration definitiva.

Estrutura conceitual possível:

```
circulos
circulo_membros
circulo_responsaveis
```

ou reaproveitamento de tabelas existentes, se forem suficientes.

---

## 14. Snapshot histórico da presença

Não depender somente do cadastro atual da pessoa.

Ao registrar presença, guardar o contexto daquele momento:

- papel;
- círculo;
- encontro;
- responsáveis/tios;
- tipo da sessão.

Motivo: uma pessoa pode mudar de círculo ou papel posteriormente. O histórico de presença deve continuar respondendo corretamente como ela estava vinculada na data da reunião.

---

## 15. Experiência pública desejada

### Tela 1

```
Pós-Encontro do 37º EAC
03/10/2026

Digite seu nome ou telefone
[____________________________]
```

### Tela 2

```
João Guilherme Braga do Espírito Santo
Círculo Azul
Telefone final •••• 5182

[ CONFIRMAR MINHA PRESENÇA ]
```

### Sucesso

```
Presença registrada ✅
```

### Duplicidade

```
Sua presença já foi registrada nesta reunião.
```

### Sessão encerrada

```
Presença encerrada

Esta reunião não está mais recebendo registros.
```

---

## 16. Experiência do responsável

### `/form/admin`

Após login:

```
Minhas reuniões

[ + CRIAR REUNIÃO ]

Reunião Círculo Azul
Sessão aberta
10 presentes
[ VER QR ] [ ACOMPANHAR ] [ ENCERRAR ]

Pós-Encontro 37º EAC
Encerrada
61 presentes
[ VER HISTÓRICO ]
```

### Confirmação obrigatória antes de encerrar

```
Encerrar presença?

Depois de encerrar, este QR Code deixará de aceitar novos registros.

Esta sessão não poderá ser reaberta.
Se precisar continuar recebendo presenças depois, será necessário criar uma nova sessão para esta mesma reunião.

[ CANCELAR ] [ ENCERRAR PRESENÇA ]
```

### Após encerramento

```
Presença encerrada.

Este QR Code não aceita mais registros.

Precisa continuar recebendo presenças?
[ CRIAR NOVA SESSÃO ]
```

---

## 17. Dashboard operacional futuro

Com círculo e tios normalizados, o módulo poderá exibir durante o Pós:

```
Azul      10 / 12
Laranja   11 / 12
Verde      9 / 12
Vermelho  10 / 12
Amarelo   11 / 12
Roxo      10 / 12
```

E permitir responder:

- quem chegou;
- quem ainda não chegou;
- de qual círculo;
- quem são os tios;
- presença por círculo;
- presença individual ao longo de várias reuniões;
- visitantes de outros círculos.

---

## 18. Estado atual homologado antes desta SPEC

Antes do desenvolvimento deste novo fluxo, o formulário atual recebeu correções já validadas:

- pessoa presente tanto como encontrista quanto encontreiro passa a ser classificada como `AMBOS`;
- o filtro de encontreiro volta a localizar essas pessoas corretamente;
- entrada manual livre de nome foi removida;
- o usuário precisa selecionar uma pessoa existente na lista;
- o saneamento histórico de presença foi concluído com 477 registros conciliados.

Essas correções são independentes desta SPEC e podem ser promovidas para uso no próximo Pós enquanto o novo modelo não está pronto.

---

## 19. Bloqueios para início do desenvolvimento

Status: **AGUARDANDO DADOS DE CÍRCULOS/TIOS**.

Não iniciar migration nem implementação funcional completa até:

- receber a planilha adolescente x círculo x tio;
- auditar o conteúdo;
- comparar com o schema atual;
- definir a fonte oficial do vínculo;
- validar permissões de usuário/tio;
- confirmar a estratégia de login em `/form/admin`.

---

## 20. Ordem recomendada de implementação após desbloqueio

1. auditar estrutura atual de círculos e responsáveis;
2. importar/normalizar relação adolescente x círculo x tio;
3. definir autenticação e autorização do responsável;
4. criar entidade de evento/reunião;
5. criar entidade de sessão;
6. criar token público/QR;
7. adaptar `/form` para sessão;
8. criar `/form/admin`;
9. implementar busca inteligente;
10. implementar unicidade pessoa + sessão;
11. implementar cadastro rápido;
12. implementar enriquecimento cadastral de uma pergunta;
13. implementar snapshot histórico;
14. implementar dashboard operacional;
15. Human Validation completa;
16. promoção gradual para `develop` e depois `main`.

---

## 21. Critérios de aceite principais

A futura implementação só deve ser considerada homologada quando:

- um QR de sessão aberta permite check-in;
- o mesmo aparelho registra pessoas diferentes;
- a mesma pessoa não registra duas vezes na mesma sessão;
- busca ignora caixa e acentos;
- busca por telefone funciona com normalização;
- candidatos aproximados podem ser encontrados sem conciliação automática perigosa;
- sessão encerrada bloqueia novos registros;
- sessão só é encerrada manualmente;
- usuário comum vê apenas reuniões próprias;
- responsável de círculo só opera círculos permitidos;
- administrador possui visão global;
- reunião encerrada não reabre;
- nova sessão pode ser criada reaproveitando o mesmo evento;
- círculo e tios são derivados da base oficial;
- presença mantém snapshot histórico;
- pessoa realmente inexistente pode fazer cadastro rápido;
- entrada manual livre sem cadastro não volta a existir.

---

## 22. Observação de implantação

Até esta SPEC ser desenvolvida e homologada, deve permanecer disponível o formulário atual com as correções já validadas, garantindo operação mínima para o próximo Pós-Encontro.
