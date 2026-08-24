# Metas de rentabilidade por filial

## Objetivo

Aplicar metas próprias ao indicador mensal de rentabilidade das filiais Exceleds Iluminação e FOCO Distribuidora, que substitui o controle de descontos nessas duas filiais.

| Filial | Meta de rentabilidade | Mínimo para pontuar (95%) |
| --- | ---: | ---: |
| Exceleds Iluminação | 71,90% | 68,31% |
| FOCO Distribuidora | 38,00% | 36,10% |

## Regra de pontuação

O gerente informa apenas a rentabilidade mensal alcançada. A meta aplicável é definida internamente pela filial autenticada e não é enviada pelo navegador.

- Abaixo de 95% da meta da própria filial: `0` ponto.
- De 95% da meta até a meta: `rentabilidade informada / meta × 35`, arredondado a duas casas.
- Acima da meta: `35` pontos.

Exemplos:

- Exceleds com 68,31% recebe 33,25 pontos; com 71,90% ou mais recebe 35.
- FOCO com 36,10% recebe 33,25 pontos; com 38,00% ou mais recebe 35.

## Dados e segurança

As metas ficam centralizadas na função PostgreSQL `submit_metrics`, identificadas pelo slug da filial. O banco continua validando o período, a permissão do gerente, o tipo de indicador e todos os cálculos; nenhuma chamada direta do navegador pode escolher uma meta diferente.

Não será necessário salvar uma meta em cada lançamento. O lançamento mantém apenas o percentual informado e a pontuação resultante, preservando o histórico mensal e o cálculo de média em `Total`.

## Interface

O card `Rentabilidade` mostrará a meta específica e a elegibilidade mínima da filial:

- Exceleds: `Meta 71,90% · abaixo de 68,31% não pontua`.
- FOCO: `Meta 38,00% · abaixo de 36,10% não pontua`.

A prévia de pontos, a confirmação de envio, o histórico, o painel administrativo, o ranking e a exportação continuarão usando a pontuação do lançamento calculada com essa regra. Filiais de desconto não sofrem alteração.

## Verificação

1. Testes unitários cobrem os limites de 95%, 100% e acima da meta para Exceleds e FOCO.
2. A função do banco retorna zero abaixo do mínimo e limita a 35 pontos na meta ou acima dela.
3. Exceleds e FOCO exibem a meta correta no formulário.
4. Painel administrativo, histórico, ranking e `Total` continuam consistentes.
5. Testes e build permanecem aprovados.
