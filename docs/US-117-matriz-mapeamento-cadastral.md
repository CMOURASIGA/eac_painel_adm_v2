# US-117 - Matriz de mapeamento cadastral

Base funcional: `5f6d112e4446b19508b4a7873613f8ba0f05557d`

## Regra

A visitação atualiza a fonte oficial do dado. `visitacoes.respostas_questionario` e `visitacoes_historico` permanecem como snapshot e trilha operacional.

| Campo funcional | Tabela oficial | Coluna |
| --- | --- | --- |
| Nome completo | pessoas | nome_completo |
| Nome social/apelido | pessoas | nome_social |
| Data de nascimento | pessoas | data_nascimento |
| Idade | calculada | reutiliza `calculateAgeFromBirthDate`; não é editável |
| Sexo | pessoas | sexo |
| Telefone | pessoas | telefone / telefone_normalizado |
| E-mail | pessoas | email |
| Endereço | pessoas | endereco |
| Bairro | pessoas | bairro |
| Cidade | pessoas | cidade |
| Estado | pessoas | estado |
| Responsável principal | responsaveis | nome |
| Telefone responsável | responsaveis | telefone / telefone_normalizado |
| E-mail responsável | responsaveis | email |
| Tamanho de camisa | inscricoes | tamanho_camisa |
| Escola selecionada | inscricoes | escola_id |
| Escola manual | inscricoes | escola_nome_outro |
| Nome da escola | escolas | nome, leitura por escola_id |
| Turno escolar | adolescentes | turno_escolar |
| Série escolar | adolescentes | serie_escolar |
| Grau escolar | adolescentes | grau_escolar |
| Encontro anterior | adolescentes | encontro_anterior |
| Quem convidou | adolescentes | convidado_por |
| Pais fizeram ECC | adolescentes | pais_fizeram_ecc |
| Primeira Comunhão | adolescentes | primeira_comunhao |
| Paróquia | adolescentes | paroquia |
| Toca instrumento | adolescentes | toca_instrumento |
| Instrumento | adolescentes | instrumento |
| Gosta de cantar | adolescentes | gosta_cantar |
| Motivação | adolescentes | motivacao |
| Outra doutrina na família | adolescentes | outra_doutrina_familia |
| Detalhe outra doutrina | adolescentes | outra_doutrina_descricao |
| Restrição alimentar | adolescentes | restricao_alimentar |
| Detalhe restrição | adolescentes | restricao_alimentar_descricao |
| Status/data/responsável da visita | visitacoes | campos operacionais existentes |
| Snapshot | visitacoes | respostas_questionario |
| Histórico operacional | visitacoes_historico | campos existentes |
| Auditoria cadastral | visitacoes_historico | alteracoes_cadastrais |

## Compatibilidade

- Campos novos são enviados somente quando a coluna existe no banco.
- Campo vazio não apaga valor oficial existente.
- Tamanho de camisa e escola incorporam a US-119.
- Idade reutiliza a regra única consolidada pela US-118.
- O formulário público continua exigindo o token já configurado.
- A migration da US-117 é idempotente e está em `docs/migrations/20260929_us117_visitacao_revisao_cadastral.sql`.
