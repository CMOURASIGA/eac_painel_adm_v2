# US-119 - Formulário de inscrição: tamanho de camisa e colégio

## 1. Objetivo

Evoluir o formulário público de inscrição de adolescente, disponível em `/inscricao/form`, para coletar duas novas informações:

1. tamanho de camisa;
2. colégio onde o adolescente estuda.

A alteração deve preparar o cadastro para integrações futuras, principalmente com o sistema `webappcamisa`, mas nesta US não deve ser criada integração automática entre os dois sistemas.

## 2. Escopo atual identificado

O formulário atual está implementado em:

- `components/PublicInscricaoForm.tsx`
- `services/inscricoesService.ts`
- `utils/inscricaoCreate.ts`
- `api/inscricoes/create.ts`

O fluxo atual cria/relaciona registros em `pessoas`, `adolescentes`, `responsaveis`, `adolescente_responsaveis` e `inscricoes`.

A implementação desta US deve preservar esse fluxo e não alterar a `main` diretamente.

## 3. Campo Tamanho de camisa

### 3.1 Interface

Adicionar ao formulário o campo obrigatório:

`Tamanho de camisa *`

O campo deve ser uma lista suspensa, sem digitação livre.

Opções, alinhadas ao sistema `webappcamisa`:

- PP
- P
- M
- G
- GG
- XG
- XXG

Não criar nomenclaturas alternativas para os mesmos tamanhos.

### 3.2 Persistência

Para esta primeira etapa, o tamanho deve ser persistido junto ao registro da inscrição do adolescente.

Recomendação de modelagem:

`inscricoes.tamanho_camisa`

Justificativa: tamanho de camisa pode mudar entre encontros/anos e deve representar o tamanho informado naquela inscrição. Evitar tratá-lo como atributo permanente da pessoa.

Antes de criar a coluna, confirmar no schema real do Supabase se já existe coluna equivalente.

Migration sugerida somente se necessária:

```sql
alter table public.inscricoes
  add column if not exists tamanho_camisa text null;

alter table public.inscricoes
  add constraint inscricoes_tamanho_camisa_check
  check (
    tamanho_camisa is null
    or tamanho_camisa in ('PP','P','M','G','GG','XG','XXG')
  );
```

A migration final deve ser validada contra o schema real antes da execução.

### 3.3 Validação

Após implantação, o campo deve ser obrigatório para novas inscrições públicas.

Não alterar retroativamente inscrições antigas sem tamanho preenchido.

### 3.4 Preparação para integração futura

Nesta US não integrar com `webappcamisa`.

Entretanto, o dado deve ser salvo de forma estruturada para que futuramente o fluxo de solicitação de camisa consiga recuperar:

- adolescente;
- inscrição/encontro;
- tamanho de camisa previamente informado.

O sistema de camisas utiliza atualmente os tamanhos:

`PP, P, M, G, GG, XG, XXG`.

## 4. Campo Colégio

### 4.1 Interface

Adicionar ao formulário o campo:

`Onde você estuda? *`

Não usar um `select` HTML simples com centenas de registros.

Utilizar lista suspensa pesquisável/autocomplete, permitindo localizar pelo nome do colégio.

Exemplo:

```text
Onde você estuda? *

[ Digite parte do nome do colégio... ]

Colégio Salesiano Santa Rosa
Instituto GayLussac
COLUNI-UFF
...
```

### 4.2 Opção de contingência

A lista deve possuir:

`Outro / Não encontrei meu colégio`

Quando selecionada, abrir:

`Informe o nome do colégio`

Isso evita bloquear uma inscrição caso a base oficial esteja desatualizada ou o estudante esteja matriculado fora de Niterói.

## 5. Fonte da relação de colégios

A fonte principal deve ser oficial.

### Fonte primária

INEP - Catálogo de Escolas / Censo Escolar.

O Catálogo de Escolas permite filtrar por:

- UF;
- município;
- situação de funcionamento;
- dependência administrativa;
- categoria pública/privada;
- etapa/modalidade.

Para esta US, utilizar escolas de educação básica com situação ativa no município de Niterói/RJ.

Referência:

https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/

Os microdados do Censo Escolar também podem ser usados para gerar a carga inicial:

https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar

### Fonte complementar municipal

Secretaria Municipal de Educação / Fundação Municipal de Educação de Niterói.

Referência de unidades municipais de Ensino Fundamental:

https://www.educacao.niteroi.rj.gov.br/?page_id=32067

Essa fonte pode ser usada para conferência das escolas municipais.

## 6. Estratégia recomendada para catálogo de escolas

Evitar manter centenas de nomes fixos dentro do componente React.

Criar um catálogo próprio no banco para permitir atualização posterior.

Tabela sugerida:

```text
escolas
- id
- codigo_inep
- nome
- rede
- bairro
- municipio
- uf
- ativo
- fonte
- atualizado_em
```

Regras:

- `codigo_inep` deve ser único quando disponível;
- `municipio = Niterói`;
- `uf = RJ`;
- incluir redes municipal, estadual, federal e privada;
- somente unidades ativas na carga padrão;
- preservar acentuação oficial do nome;
- permitir atualização anual pelo Censo Escolar.

Antes de criar a tabela, verificar se já existe entidade equivalente no schema.

## 7. Persistência do colégio na inscrição

Como o estudante pode mudar de escola ao longo do tempo, o vínculo deve representar a informação fornecida naquela inscrição.

Estratégia recomendada:

```text
inscricoes.escola_id
inscricoes.escola_nome_outro
```

Onde:

- `escola_id` aponta para o catálogo quando a escola for selecionada;
- `escola_nome_outro` somente é usado quando a opção Outro for selecionada.

Não gravar simultaneamente os dois campos.

Caso a arquitetura do domínio já possua uma entidade oficial para escolaridade do adolescente, reutilizá-la e registrar na inscrição apenas um snapshot/referência quando necessário.

## 8. Payload do formulário

O frontend deve passar, além dos campos atuais:

```json
{
  "tamanho_camisa": "M",
  "escola_id": "uuid-ou-null",
  "escola_nome_outro": null
}
```

O backend deve:

1. normalizar o tamanho;
2. validar contra a lista permitida;
3. validar se `escola_id` existe e está ativa;
4. aceitar `escola_nome_outro` apenas quando não houver `escola_id`;
5. persistir junto à inscrição;
6. retornar erro de validação por campo quando necessário.

## 9. Ordem sugerida no formulário

Sugestão de posição:

1. Nome do adolescente
2. Nome social
3. Data de nascimento
4. Sexo
5. Telefone / idade
6. E-mails
7. Responsável
8. Endereço / bairro
9. Onde você estuda?
10. Paróquia
11. Já participou antes?
12. Tamanho de camisa
13. Observações
14. Termos

O tamanho também pode ficar imediatamente após os dados pessoais. O mais importante é não escondê-lo em Observações.

## 10. Critérios de aceite

### Camisa

- [ ] Campo Tamanho de camisa aparece no formulário público.
- [ ] Campo é obrigatório para novas inscrições.
- [ ] Opções são exatamente PP, P, M, G, GG, XG e XXG.
- [ ] Valor é persistido estruturadamente no banco.
- [ ] Valor pode ser recuperado a partir da inscrição.
- [ ] Inscrições antigas sem tamanho continuam válidas.

### Colégio

- [ ] Campo Onde você estuda? aparece no formulário.
- [ ] Lista permite busca pelo nome.
- [ ] Catálogo contém escolas ativas de Niterói.
- [ ] Catálogo considera redes municipal, estadual, federal e privada.
- [ ] Fonte principal da carga é INEP/Censo Escolar.
- [ ] Existe opção Outro / Não encontrei meu colégio.
- [ ] Nome livre é permitido somente na opção Outro.
- [ ] Seleção é persistida estruturadamente.
- [ ] O formulário continua funcionando em celular.

### Regressão

- [ ] Processo atual de inscrição continua criando adolescente, responsável, vínculo e inscrição.
- [ ] Validação de idade continua funcionando.
- [ ] Regra de duplicidade continua funcionando.
- [ ] E-mail de confirmação continua funcionando.
- [ ] Tela de revisão/admin consegue exibir os novos campos quando necessário.
- [ ] Nenhuma alteração é feita diretamente em `main`.

## 11. Fora de escopo desta US

Não implementar agora:

- criação automática de solicitação no `webappcamisa`;
- reserva de estoque;
- vínculo financeiro;
- alteração automática de tamanho no sistema de camisas;
- sincronização bidirecional entre os sistemas.

A integração com o `webappcamisa` será tratada em uma etapa posterior.

## 12. Observação para implementação

O desenvolvedor deve primeiro inspecionar o schema real do Supabase e documentar:

```text
tamanho_camisa -> tabela/coluna escolhida
escola -> tabela/coluna escolhida
```

Não criar campos duplicados se já houver estrutura equivalente.

A implementação deve ocorrer a partir da `develop` ou de branch derivada dela, com Preview para Human Validation antes de qualquer promoção para produção.
