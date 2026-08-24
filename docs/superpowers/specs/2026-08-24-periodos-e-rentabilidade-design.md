# Períodos mensais e rentabilidade por filial

## Objetivo

Permitir que cada filial registre e corrija suas métricas mensalmente, de julho a dezembro, visualizar a média dos meses preenchidos em `Total` e substituir o indicador de desconto por rentabilidade para Exceleds Iluminação e FOCO Distribuidora.

## Experiência de uso

### Filtro de período

Um seletor `Período` será incluído na faixa do cabeçalho de novo lançamento, ao lado do total previsto. As opções são `Julho`, `Agosto`, `Setembro`, `Outubro`, `Novembro`, `Dezembro` e `Total`.

- Em um mês, gerente e administrador consultam os dados daquele período.
- Para gerente, o formulário mostra o lançamento existente do mês e o salvamento cria ou atualiza o único lançamento da filial naquele mês.
- Em `Total`, o gerente fica em modo de consulta e não pode enviar dados. Os cards, resumo e ranking usam a média dos meses efetivamente preenchidos; meses sem lançamento não contam como zero.
- Para administrador, o filtro controla os cards, a tabela detalhada e o ranking. Em `Total`, a tabela exibe as médias por filial.

O filtro não aparece em login, histórico ou alteração de senha.

### Indicador de rentabilidade

As filiais `Exceleds Iluminação` e `FOCO Distribuidora` usam `Rentabilidade` no quarto peso estratégico de 35 pontos, substituindo `Controle de descontos`.

- O gerente informa `Rentabilidade (%)`.
- A pontuação é proporcional: `min(percentual, 100) / 100 × 35`, arredondada a duas casas.
- As demais dez filiais mantêm Faixa de venda e Controle de descontos, com a regra atual.
- O painel administrativo identifica a natureza do indicador no cabeçalho e em cada linha, sem tentar comparar um percentual de desconto com um percentual de rentabilidade como se fossem a mesma métrica.

## Modelo de dados

Uma migration acrescenta um período canônico aos lançamentos, restrito a julho–dezembro de 2026. O banco garante `unique (branch_id, metric_period)`, preservando um único registro por filial e mês.

O registro de lançamento passa a comportar, de forma mutuamente exclusiva por filial:

- `discount_band`, `discount_percentage` e `discount_points` para filiais padrão;
- `profitability_percentage` e `profitability_points` para Exceleds e FOCO.

As funções do schema `campaign_gerentes_2026` recebem o período e a métrica aplicável. A validação, os cálculos e a identificação do tipo da filial ocorrem no PostgreSQL; o navegador não define a pontuação.

As consultas de ranking, histórico administrativo e resumo recebem o período selecionado. Para `Total`, retornam médias calculadas sobre os lançamentos existentes, incluindo as pontuações por indicador e a pontuação final. A tabela de histórico conserva a informação mensal e ordena por período.

Como ainda não existem lançamentos no projeto de produção, a migration não exige conversão de dados anteriores.

## Interface e acessibilidade

- O banner oficial aprovado em `2026-08-24-banner-campanha-design.md` aparece antes do `pageHeading` nos dashboards de gerente e administrador.
- O seletor recebe `label` visível e funciona por teclado.
- O banner terá texto alternativo `Campanha de premiação Imersão EUA — segundo semestre`, largura integral da área de conteúdo, sem corte e sem clique.
- O layout do filtro e do total se organiza em coluna em telas estreitas, sem rolagem horizontal.
- Em `Total`, o formulário exibe mensagem de consulta e desabilita os controles de edição e salvamento.

## Segurança e integridade

- RLS continua limitando gerente à própria filial e administrador a todos os dados.
- A restrição única impede duplicidade de meses mesmo com chamadas diretas à API.
- O banco rejeita rentabilidade fora de 0–999,99, indicadores incompatíveis com a filial e envio em `Total`.
- Comprovantes de desenvolvimento continuam vinculados ao lançamento mensal e seguem privados.

## Verificação

1. Testes unitários cobrem pontuação proporcional de rentabilidade e média Total.
2. Uma filial padrão salva/edita um mês e mantém desconto.
3. Exceleds e FOCO salvam/editam um mês usando rentabilidade.
4. Tentativas de dois lançamentos para a mesma filial e mês não criam duplicidade.
5. Total mostra a média apenas dos meses preenchidos e não permite salvar.
6. Gerente e administrador veem dados coerentes ao alternar mês e Total.
7. Banner aparece em ambos os dashboards, com responsividade e texto alternativo.
8. Build e testes continuam aprovados.
