# Duas faixas de controle de descontos

## Objetivo

Substituir a seleção única de faixa de desconto das filiais padrão por dois campos no mesmo card. Cada campo representa uma faixa de valor e compõe uma parte independente dos 35 pontos do indicador `Controle de descontos`.

Esta alteração vale para as dez filiais que já usam controle de descontos. Exceleds Iluminação e FOCO Distribuidora continuam usando `Rentabilidade` e não recebem esses campos.

## Regra de negócio

O card de controle de descontos terá os dois campos percentuais abaixo:

| Faixa | Meta de desconto | Pontuação |
| --- | ---: | ---: |
| Até R$ 500 | Até 11,40% | 18 pontos |
| De R$ 501 a R$ 2.000 | Até 19,52% | 17 pontos |

Cada faixa é avaliada de forma binária e independente:

- percentual menor ou igual à meta: recebe todos os pontos da faixa;
- percentual acima da meta: recebe zero ponto na faixa.

O indicador pode, portanto, totalizar 0, 17, 18 ou 35 pontos. Não haverá proporcionalidade, média ou compensação entre faixas. Os valores `500` e `2.000` são valores em reais, sem a interpretação de milhares ou milhões.

## Dados e cálculos

O lançamento mensal de uma filial padrão armazenará separadamente:

- `discount_under_500_percentage` e `discount_under_500_points`;
- `discount_501_to_2000_percentage` e `discount_501_to_2000_points`.

`discount_points` permanecerá como a soma das duas pontuações, para preservar os resumos, ranking e total mensal existentes. A faixa única antiga deixará de ser usada nos novos lançamentos. A função de gravação do PostgreSQL continuará sendo a fonte de verdade para validar percentuais e calcular pontos; o navegador apenas apresenta a prévia.

O modo `Total` continuará calculando a média dos lançamentos mensais existentes. Para o indicador de descontos, a média será aplicada à pontuação mensal total (máximo de 35), como ocorre com os demais indicadores mensais.

## Interface

No card `Controle de descontos`, serão exibidos lado a lado (ou empilhados em telas estreitas) dois campos numéricos com rótulos e metas visíveis:

- `Até R$ 500 — desconto (%) · meta até 11,40%`;
- `R$ 501 a R$ 2.000 — desconto (%) · meta até 19,52%`.

O resumo do card mostrará os pontos previstos por faixa e o total, por exemplo `18 + 17 = 35 pts`. Os dois valores são obrigatórios para salvar um lançamento mensal de filial padrão. Mensagens de validação indicam precisamente qual faixa está ausente ou fora do intervalo permitido.

O painel administrativo, o histórico da filial e a exportação passam a exibir as duas porcentagens e sua respectiva pontuação. Exceleds e FOCO mantêm a visualização atual de rentabilidade, sem campos vazios de desconto.

## Segurança e compatibilidade

As políticas RLS e a separação entre filial e administrador não mudam. A migration preservará compatibilidade de leitura com quaisquer registros existentes de desconto único, mas novos envios usarão exclusivamente os campos de duas faixas. As RPCs de histórico, ranking, administração e exportação retornarão os campos adicionais sem permitir ao cliente informar pontos diretamente.

## Verificação

1. Testes de pontuação cobrem os quatro resultados possíveis: 0, 17, 18 e 35 pontos.
2. Uma filial padrão só salva quando informar as duas faixas.
3. Cada faixa acima da própria meta zera apenas seus pontos; a outra mantém sua pontuação quando atingir a meta.
4. Exceleds e FOCO continuam salvando e exibindo rentabilidade.
5. Histórico, painel administrativo, exportação e `Total` mostram resultados coerentes.
6. Build e testes automatizados permanecem aprovados.
