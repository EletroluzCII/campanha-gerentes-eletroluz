# Desenvolvimento pessoal semestral

## Objetivo

Transformar o indicador **Desenvolvimento Pessoal** em uma avaliação única para todo o segundo semestre de 2026. Livros, cursos, certificações e eventos continuam exigindo comprovante, mas deixam de ser repetidos nos lançamentos de julho a dezembro.

## Regra de pontuação

- OBZ (20), Faturamento (40) e Desconto/Rentabilidade (35) compõem a pontuação operacional mensal: máximo de **95 pontos**.
- Desenvolvimento Pessoal vale até **5 pontos integrais** uma única vez no semestre.
- Em `Total`, cada filial recebe: média dos meses preenchidos nos três indicadores operacionais + pontuação semestral de Desenvolvimento Pessoal. O máximo final permanece **100 pontos**.
- Em um mês específico, ranking e resumo exibem apenas os até 95 pontos daquele mês. A situação do desenvolvimento semestral aparece como informação complementar, sem ser reaplicada no resultado mensal.
- A divisão permanece proporcional a três iniciativas comprovadas: 1 iniciativa = 1,67 ponto; 2 = 3,33; 3 ou 4 = 5 pontos.

## Experiência da filial

O painel exibirá uma seção própria, independente do filtro Julho–Dezembro/Total, com identificação explícita:

> **Indicador semestral · Julho a Dezembro**  
> Esta pontuação é registrada uma única vez para todo o semestre e entra integralmente no resultado Total. Ela não se repete em cada mês.

A filial pode marcar Livros 📚, Cursos 🎓, Certificações 🏅 e Eventos 🎤. Cada item selecionado exige imagem ou PDF. Um novo salvamento altera o mesmo registro semestral, preservando ou substituindo comprovantes conforme a escolha da filial.

No filtro mensal, o cabeçalho passa a informar `Pontuação prevista do mês / 95 pts`. No filtro `Total`, o cartão explica a composição `Média mensal / 95 + Desenvolvimento semestral / 5`.

## Painel administrativo

O painel admin mostrará, em todos os períodos, um resumo de Desenvolvimento Pessoal com:

- pontuação semestral de cada filial;
- quantidade de iniciativas comprovadas;
- acesso aos arquivos privados;
- data da última atualização.

Em `Total`, esse valor entra diretamente no ranking final. Em meses individuais, ele é informado separadamente e não altera a classificação mensal.

## Dados e segurança

Uma tabela `semester_development` terá um único registro por filial, protegido por `unique (branch_id)`. Os comprovantes serão movidos para uma tabela própria, com a mesma política de acesso do armazenamento privado atual: a filial vê os seus, e o administrador vê todos.

O banco calculará os 5 pontos e validará que cada iniciativa selecionada possui exatamente um comprovante válido. Uma RPC exclusiva permitirá à filial criar ou editar apenas o seu próprio registro. Os campos mensais de desenvolvimento existentes permanecerão apenas como legado sem influenciar os cálculos novos.

As RPCs de ranking e métricas administrativas serão atualizadas para combinar, somente em `Total`, a média operacional mensal e a pontuação semestral. O histórico continuará exibindo os lançamentos mensais e ganhará uma entrada/seção identificada como `Desenvolvimento semestral`.

## Verificação

1. Os cálculos mensais não ultrapassam 95 pontos.
2. A média Total soma os até 5 pontos semestrais apenas uma vez.
3. Uma filial consegue editar o desenvolvimento semestral sem criar duplicidade.
4. Arquivo ausente impede pontuação; arquivo privado só abre para a filial ou admin.
5. Gerente e admin veem a identificação de indicador semestral em desktop e celular.
6. Testes unitários, build e migration do Supabase passam.
