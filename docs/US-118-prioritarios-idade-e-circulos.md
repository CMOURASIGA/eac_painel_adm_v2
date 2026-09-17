# US-118 - Ajustes no card de Inscrições Prioritárias

## 1. Objetivo

Adequar a tela de Inscrições Prioritárias para corrigir o tratamento da idade dos adolescentes, exibir a data de nascimento diretamente no card, tornar visível o estado da distribuição dos círculos e substituir a representação numérica dos círculos por nome e identidade visual baseada na cor.

Esta US não deve alterar o comportamento de produção sem validação prévia em Preview.

A implementação deve partir da branch `develop` ou de branch derivada de `develop`. Não implementar diretamente em `main`.

---

## 2. Contexto

A tela atual de Inscrições Prioritárias já trabalha com:

- `dataNascimento`;
- `idade`;
- filtros e agrupamentos por idade;
- distribuição automática de círculos;
- ajustes manuais de círculo;
- identificação do círculo atribuído ao adolescente.

Foram identificados quatro ajustes funcionais prioritários:

1. corrigir cálculo e apresentação da idade;
2. exibir data de nascimento no card;
3. indicar claramente quando a distribuição de círculos já foi realizada e proteger nova redistribuição;
4. exibir nome do círculo pela cor, com tag visual correspondente.

Adicionalmente, a solução deve proteger ajustes manuais realizados após uma distribuição automática.

---

## 3. Item 1 - Tratamento correto da idade

### 3.1 Problema

Foram relatados casos em que a idade exibida no sistema está incorreta.

Não é aceitável calcular idade apenas por:

```text
ano atual - ano de nascimento
```

porque esse cálculo ignora se o aniversário já ocorreu no ano corrente.

### 3.2 Regra correta

A idade deve ser calculada a partir da data completa de nascimento e da data corrente.

Regra conceitual:

```text
idade = ano atual - ano de nascimento

se o aniversário ainda não ocorreu no ano atual:
    idade = idade - 1
```

Exemplo:

```text
Data atual: 17/09/2026
Nascimento: 20/12/2010

2026 - 2010 = 16
Aniversário ainda não ocorreu
Idade correta = 15
```

### 3.3 Fonte da verdade

`data_nascimento` deve ser a fonte da verdade para idade.

A idade não deve depender de valor antigo, importado ou armazenado de forma independente quando a data de nascimento estiver disponível.

Antes da implementação, verificar:

- onde `idade` é calculada atualmente;
- se existe coluna calculada/view no Supabase;
- se a API já devolve `idade_calculada`;
- se o frontend recalcula ou apenas exibe o valor recebido;
- se há funções duplicadas de cálculo em diferentes componentes.

### 3.4 Centralização

Preferir uma única função/utilitário de cálculo de idade reutilizada pela aplicação.

Se já existir função consolidada, corrigi-la e reutilizá-la, em vez de criar uma nova implementação paralela.

### 3.5 Uso em todo o fluxo

O valor corrigido deve ser utilizado em:

- card do adolescente;
- filtros de idade;
- agrupamentos/segmentos por idade;
- relatórios da tela, quando aplicável;
- distribuição de círculos, caso a idade seja utilizada como critério;
- qualquer validação operacional que dependa da idade.

### 3.6 Casos de teste obrigatórios

Testar pelo menos:

- aniversário já ocorrido no ano;
- aniversário ainda não ocorrido;
- aniversário no dia atual;
- nascimento em 29/02;
- data em formato ISO;
- data em formato brasileiro, caso ainda exista fonte legada;
- data nula ou inválida.

Para data inválida ou ausente, não inventar idade. Exibir estado equivalente a `Sem idade` ou `Data de nascimento não informada`.

---

## 4. Item 2 - Exibir data de nascimento no card

### 4.1 Objetivo

Permitir conferência humana rápida da idade apresentada.

### 4.2 Comportamento

O card de cada adolescente na tela de Inscrições Prioritárias deve exibir a data de nascimento em formato brasileiro:

```text
Nascimento: 20/12/2010
```

A data deve ficar visível sem necessidade de abrir modal ou detalhe do cadastro.

### 4.3 Apresentação sugerida

Exemplo:

```text
15 anos
Nascimento: 20/12/2010
```

ou em tags separadas:

```text
[ 15 anos ] [ Nascimento: 20/12/2010 ]
```

O importante é que idade e nascimento fiquem próximos visualmente para facilitar conferência.

### 4.4 Formatação

Usar `dd/mm/aaaa`.

Não permitir que conversão de timezone altere o dia de nascimento.

Datas de nascimento são datas civis, não eventos de horário. Evitar transformar `YYYY-MM-DD` em UTC e produzir deslocamento de dia.

---

## 5. Item 3 - Status da distribuição dos círculos

### 5.1 Problema

Hoje o usuário pode acessar a tela de Inscrições Prioritárias sem perceber que uma distribuição de círculos já foi realizada.

Uma nova execução automática pode alterar uma distribuição que já está operacionalmente pronta ou que já recebeu ajustes manuais.

### 5.2 Requisito principal

A tela deve indicar claramente se já existe distribuição realizada.

Exemplo:

```text
Distribuição de círculos
Status: DISTRIBUIÇÃO JÁ REALIZADA
```

Preferencialmente exibir também informações disponíveis, como:

- quantidade de adolescentes com círculo;
- data/hora da última distribuição, quando disponível;
- quantidade de ajustes manuais, quando possível identificar;
- responsável/origem da última ação, quando o modelo atual permitir.

### 5.3 Detecção de distribuição existente

Não usar `localStorage` como fonte oficial para decidir se uma distribuição já existe.

A existência da distribuição deve ser determinada pelos dados persistidos no backend/Supabase.

Regra mínima:

```text
se existem vínculos de círculos persistidos para os priorizados do encontro:
    distribuição = existente
```

A implementação deve identificar qual tabela ou relacionamento representa oficialmente o vínculo adolescente -> círculo.

### 5.4 Proteção contra redistribuição acidental

Se já existir distribuição e o usuário tentar executar a distribuição automática novamente, bloquear a execução imediata e apresentar confirmação explícita.

Exemplo:

```text
Já existe uma distribuição de círculos realizada.

Executar novamente poderá alterar os círculos atualmente atribuídos aos adolescentes, inclusive ajustes manuais feitos após a distribuição automática.

Deseja continuar?

[ Cancelar ]
[ Refazer distribuição ]
```

A ação destrutiva não deve ser o botão principal visual do diálogo.

### 5.5 Não redistribuir por engano

Ao entrar na tela ou aplicar filtros, nenhuma redistribuição deve ocorrer automaticamente.

A distribuição só pode ser executada por ação explícita do usuário.

### 5.6 Ajustes manuais

Alterações manuais continuam permitidas após distribuição automática.

O sistema deve evitar que uma nova distribuição automática apague silenciosamente esses ajustes.

---

## 6. Proteção dos vínculos manuais

### 6.1 Objetivo

Diferenciar distribuição automática de ajustes manuais para permitir evolução segura do processo.

### 6.2 Origem do vínculo

Se o schema já possuir informação equivalente, reutilizá-la.

Caso não exista, avaliar incluir no vínculo do círculo um campo equivalente a:

```text
origem_vinculo = AUTOMATICO | MANUAL
```

ou estrutura equivalente compatível com o modelo atual.

Não criar coluna antes de inspecionar o schema real.

### 6.3 Comportamento recomendado para nova distribuição

Quando houver vínculos manuais, o usuário deve ser informado antes de redistribuir.

A solução preferencial é permitir opção futura ou já nesta US, se viável:

```text
[ ] Preservar ajustes manuais
```

Comportamento recomendado:

- vínculos automáticos podem ser recalculados;
- vínculos manuais permanecem preservados;
- adolescentes com vínculo manual entram como bloqueados/reservados no algoritmo;
- a distribuição automática considera as vagas remanescentes.

Se essa preservação não puder ser implementada nesta US sem ampliar demasiadamente o escopo, a redistribuição deve exigir confirmação forte e o risco deve estar explícito.

### 6.4 Auditoria

Registrar alteração manual de círculo sempre que a infraestrutura atual permitir:

- adolescente;
- círculo anterior;
- círculo novo;
- usuário/responsável;
- data/hora;
- origem `MANUAL`.

---

## 7. Item 4 - Nome e cor do círculo

### 7.1 Problema

Hoje o sistema utiliza representação numérica, como:

```text
Círculo 1
Círculo 2
Círculo 3
```

O usuário operacional precisa visualizar o círculo pela sua identidade real:

```text
Círculo Azul
Círculo Verde
Círculo Amarelo
```

### 7.2 Fonte da verdade

Antes de implementar uma conversão fixa no frontend, verificar se existe entidade/tabela de círculos com:

- id;
- número;
- nome;
- cor;
- encontro;
- ordem.

Se essa informação já existir no banco, o frontend deve consumir essa fonte.

Evitar mapa hardcoded como solução definitiva se o domínio já comporta configuração de círculos.

### 7.3 Caso o modelo atual possua apenas número

Se o banco realmente não armazenar nome/cor, criar migration versionada no domínio correto para permitir configuração explícita.

Exemplo conceitual:

```text
id
numero
nome
cor
```

A implementação deve evitar quebrar vínculos existentes que hoje utilizam número/id.

### 7.4 Apresentação no card

O círculo deve aparecer em uma tag visual.

Exemplo:

```text
[ Círculo Azul ]
```

Regras:

- fundo da tag correspondente à cor do círculo;
- texto com contraste adequado;
- para azul, verde, vermelho, roxo e cores escuras, preferir texto branco;
- para amarelo e outras cores claras, usar texto escuro se necessário para acessibilidade;
- não depender somente da cor: o nome textual deve sempre estar presente.

### 7.5 Consistência

A mesma nomenclatura deve ser utilizada em:

- card de Inscrições Prioritárias;
- tela de círculos distribuídos;
- modais de movimentação manual;
- relatórios/exportações destinados a humanos, quando aplicável;
- qualquer outro ponto onde o círculo seja exibido ao usuário.

O identificador técnico interno pode continuar numérico/UUID. A mudança é de representação funcional e, se necessário, de cadastro do domínio.

---

## 8. Fluxo esperado na tela

Exemplo conceitual de card:

```text
JOÃO DA SILVA

[ 15 anos ] [ Nascimento: 20/12/2010 ]
[ Círculo Azul ]

Bairro: Icaraí
Sexo: Masculino
...
```

Área de distribuição:

```text
Distribuição de círculos

[ Distribuição já realizada ]
36 adolescentes distribuídos
4 ajustes manuais

[ Visualizar círculos ]
[ Ajustar manualmente ]
[ Refazer distribuição ]
```

Se ainda não houver distribuição:

```text
Distribuição de círculos

[ Ainda não realizada ]

[ Distribuir automaticamente ]
```

---

## 9. Regras de banco e segurança

Antes de qualquer migration:

1. inspecionar schema real do Supabase;
2. localizar tabela oficial de círculos;
3. localizar tabela de vínculo adolescente/inscrição com círculo;
4. localizar histórico/auditoria existente;
5. reutilizar estruturas atuais sempre que possível;
6. não duplicar informação em nova tabela/coluna sem necessidade;
7. preservar RLS e permissões existentes.

Não utilizar `localStorage` como fonte oficial de estado de distribuição.

---

## 10. Arquivos a revisar

No mínimo, revisar:

- `components/InscricoesPrioritariasPage.tsx`;
- `components/memberAge.ts`;
- serviços/API de inscrições prioritárias;
- API de distribuição de círculos;
- componentes/tela de círculos distribuídos;
- tipos compartilhados;
- funções/utilitários de idade;
- schema/migrations relacionados aos círculos.

Também procurar qualquer cálculo de idade duplicado no projeto.

---

## 11. Critérios de aceite

### CA-01 - Idade correta

Dado adolescente com data de nascimento válida, a idade exibida deve considerar dia, mês e ano e refletir corretamente se o aniversário já ocorreu no ano atual.

### CA-02 - Data de nascimento visível

Cada card deve exibir a data de nascimento no formato `dd/mm/aaaa` sem necessidade de abrir detalhe.

### CA-03 - Consistência de idade

Filtros, agrupamentos e distribuição que dependam de idade devem utilizar a mesma regra corrigida.

### CA-04 - Distribuição existente visível

Se houver círculos já vinculados aos adolescentes, a tela deve informar claramente que a distribuição já foi realizada.

### CA-05 - Redistribuição protegida

Nenhuma nova distribuição automática pode sobrescrever a existente sem confirmação explícita.

### CA-06 - Ajustes manuais protegidos

Se houver ajustes manuais, o usuário deve ser alertado antes de qualquer ação que possa alterá-los.

### CA-07 - Círculo pelo nome

O usuário deve visualizar `Círculo Azul`, `Círculo Verde` etc., não apenas `Círculo 1`, `Círculo 2`.

### CA-08 - Identidade visual

A tag deve utilizar a cor correspondente ao círculo e manter contraste legível do texto.

### CA-09 - Fonte oficial

Nome/cor do círculo e estado da distribuição devem vir do backend/modelo oficial, não de estado local do navegador.

### CA-10 - Sem regressão

As funcionalidades atuais de priorização, filtros, distribuição, movimentação manual e consulta de círculos devem continuar funcionando.

---

## 12. Cenários de homologação

### Cenário A - aniversário ainda não ocorreu

- nascimento: 20/12/2010;
- data de teste: 17/09/2026;
- esperado: 15 anos.

### Cenário B - aniversário já ocorreu

- nascimento: 10/01/2010;
- data de teste: 17/09/2026;
- esperado: 16 anos.

### Cenário C - nascimento visível

- abrir Inscrições Prioritárias;
- localizar adolescente;
- esperado: idade e nascimento visíveis no mesmo card.

### Cenário D - primeira distribuição

- encontro sem vínculos de círculo;
- esperado: status `Ainda não realizada` e ação de distribuição disponível.

### Cenário E - distribuição já existente

- encontro com vínculos persistidos;
- esperado: status `Distribuição já realizada`.

### Cenário F - tentativa de redistribuição

- distribuição existente;
- clicar em refazer/distribuir novamente;
- esperado: confirmação explícita antes de qualquer alteração.

### Cenário G - ajuste manual

- mover um adolescente manualmente para outro círculo;
- esperado: novo vínculo persistido e, se suportado, origem marcada como manual.

### Cenário H - círculo colorido

- adolescente vinculado ao círculo azul;
- esperado: tag `Círculo Azul`, fundo azul e texto legível.

---

## 13. Estratégia de implementação e deploy

Fluxo obrigatório para esta US:

```text
develop
  -> branch da US ou desenvolvimento direto em develop
  -> Preview Vercel
  -> homologação funcional
  -> somente após aprovação, promoção para Production
```

Não fazer commit desta especificação nem implementação diretamente em `main` enquanto `main` estiver configurada como branch de produção automática na Vercel.

`main` deve receber apenas código já homologado para produção.

---

## 14. Entrega esperada do desenvolvedor

Antes de implementar, devolver no PR ou comentário técnico:

1. onde a idade é calculada hoje;
2. qual será a função/fonte única de idade;
3. tabela oficial dos círculos;
4. tabela oficial dos vínculos círculo/adolescente ou círculo/inscrição;
5. como será detectado que já existe distribuição;
6. se existe hoje informação que diferencie vínculo manual e automático;
7. migrations necessárias, se houver;
8. impacto em filtros, relatórios e tela de círculos.

Somente após esse mapeamento deve iniciar mudança estrutural de banco.
