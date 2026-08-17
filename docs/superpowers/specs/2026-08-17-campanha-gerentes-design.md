# Campanha de Premiação dos Gerentes — Especificação de Design

Data: 17 de agosto de 2026

## 1. Objetivo

Criar do zero um sistema web público para a campanha interna de premiação dos gerentes da Eletroluz. Cada filial terá um acesso próprio para registrar suas métricas. O sistema calculará a pontuação, manterá o histórico das atualizações e exibirá um ranking compartilhado. Um administrador acompanhará todas as filiais em um painel separado.

O arquivo MHTML fornecido é uma referência funcional, não uma base de código. O novo projeto será independente e incorporará a logo fornecida em `C:\Users\usuario\Downloads\Logo Eletroluz.png`.

## 2. Escopo

### Incluído

- Aplicação web responsiva para computador e celular.
- Login por filial e login administrativo.
- Formulário com quatro indicadores e cálculo instantâneo da pontuação.
- Registro imutável de cada envio para formar o histórico.
- Ranking geral baseado no envio mais recente de cada filial.
- Painel administrativo de acompanhamento e consulta do histórico.
- Alteração da própria senha pelo usuário autenticado.
- Estrutura de banco, políticas de segurança e carga inicial para Supabase.
- Arquivo local com os acessos iniciais, excluído do versionamento.
- Configuração para publicação da interface no GitHub Pages.
- Documentação de instalação, configuração e publicação.

### Não incluído nesta primeira versão

- Aplicativo nativo para Android ou iOS.
- Envio de e-mail, WhatsApp ou notificações automáticas.
- Upload de comprovantes de desenvolvimento pessoal.
- Integração com ERP, folha de pagamento ou outros sistemas.
- Cadastro livre de novos usuários pela página pública.
- Edição de lançamentos históricos já enviados.

## 3. Filiais e identidades

O sistema começará com 12 filiais:

1. Eletroluz Matriz Maringá
2. Eletroluz Express Maringá
3. Eletroluz Sarandi
4. Eletroluz Campo Mourão
5. Eletroluz Apucarana
6. Eletroluz Cianorte
7. Eletroluz Umuarama
8. Eletroluz Londrina
9. Eletroluz Ponta Grossa
10. Eletroluz Presidente Prudente
11. Exceleds Iluminação
12. FOCO Distribuidora

Como os nomes dos gerentes não estão disponíveis, cada conta representa uma filial. O nome exibido no painel e no ranking será sempre o nome da filial, sem campo de gerente nesta versão.

## 4. Arquitetura escolhida

### Interface

Uma aplicação web estática será publicada pelo GitHub Pages. A interface pode ser construída, testada e versionada no GitHub sem manter um servidor próprio.

### Serviços de dados

O Supabase fornecerá:

- autenticação por usuário e senha;
- banco PostgreSQL;
- API segura para leituras e gravações;
- políticas de Row Level Security (RLS);
- atualização do ranking após novos envios.

SQLite não será usado na versão pública porque o GitHub Pages não executa um processo de servidor e não fornece armazenamento persistente para um arquivo de banco. A arquitetura escolhida mantém a facilidade operacional desejada sem expor dados ou senhas no navegador.

### Limites de confiança

- A chave pública `anon` do Supabase poderá existir na interface, como previsto pelo serviço.
- A chave `service_role` nunca será incluída no código, no GitHub Pages ou em arquivo versionado.
- Toda autorização real será aplicada pelas políticas do banco, não apenas por elementos ocultos na interface.

## 5. Papéis e permissões

### Gerente de filial

- Entrar apenas com as credenciais da própria filial.
- Ver a identificação e o último resultado da própria filial.
- Preencher e enviar novas métricas para a própria filial.
- Ver o ranking geral das 12 filiais.
- Consultar o próprio histórico de envios.
- Alterar a própria senha.
- Não ler o histórico detalhado nem gravar dados de outra filial.

### Administrador

- Ver o ranking geral.
- Ver os valores detalhados mais recentes de todas as filiais.
- Consultar o histórico completo por filial e por período.
- Identificar filiais sem envio e a data da última atualização.
- Exportar a visão exibida em CSV no navegador.
- Não alterar nem apagar lançamentos históricos nesta primeira versão.

Recuperações de senha perdidas serão feitas por uma pessoa autorizada no painel do Supabase. Isso evita colocar poderes administrativos ou segredos elevados na aplicação pública.

## 6. Indicadores e pontuação

A pontuação máxima é 100 pontos. O navegador mostrará uma prévia, mas o resultado persistido será validado e calculado também pelo banco para impedir adulteração.

### Indicador 1 — OBZ: atingimento orçamentário (20 pontos)

- Entrada: percentual de atingimento orçamentário.
- Elegibilidade mínima: 95%.
- Abaixo de 95%: 0 ponto.
- De 95% a 100%: pontuação proporcional ao atingimento, limitada a 20 pontos (`percentual / 100 × 20`).
- Acima de 100%: 20 pontos.

### Indicador 2 — Descontos (35 pontos)

- Entrada: faixa da filial e percentual atual de desconto.
- Faixa A, média diária de vendas até R$ 500 mil: teto de 11,4%.
- Faixa B, média diária de R$ 501 mil a R$ 2 milhões: teto de 19,52%.
- Percentual igual ou inferior ao teto: 35 pontos.
- Percentual acima do teto: 0 ponto.

### Indicador 3 — Faturamento orçado (40 pontos)

- Entrada: percentual de atingimento da meta de faturamento.
- Pontuação proporcional ao atingimento, limitada a 40 pontos (`percentual / 100 × 40`).
- Atingimento igual ou superior a 100%: 40 pontos.

### Indicador 4 — Desenvolvimento pessoal (5 pontos)

- Opções: livros, cursos, certificações e eventos.
- Meta: três iniciativas concluídas.
- Cada categoria marcada conta como uma iniciativa.
- Pontuação proporcional até três iniciativas (`quantidade / 3 × 5`), limitada a 5 pontos.

### Arredondamento e desempate

- Componentes e total serão armazenados com duas casas decimais.
- O ranking ordenará primeiro pela pontuação total decrescente.
- Empates serão resolvidos, nesta ordem, por maior pontuação de faturamento, maior pontuação de descontos, maior pontuação de OBZ e envio mais antigo entre os resultados empatados.

## 7. Fluxos da aplicação

### Login

1. O usuário informa o identificador da filial e a senha.
2. A aplicação converte internamente o identificador para a identidade de autenticação configurada no Supabase.
3. Após autenticar, o perfil define a rota permitida: painel da filial ou painel administrativo.
4. Falhas usam mensagem genérica, sem revelar se o usuário existe.
5. Após várias tentativas incorretas, o serviço de autenticação aplica limitação de requisições; a interface também evita reenvio repetido enquanto a solicitação está em andamento.

### Envio de métricas

1. O gerente preenche os quatro cartões de indicadores.
2. A pontuação é atualizada imediatamente na tela.
3. Validações aparecem junto ao campo correspondente.
4. O botão de envio abre uma confirmação com resumo dos valores e pontuação.
5. Confirmado o envio, um novo registro é inserido; registros anteriores permanecem inalterados.
6. A tela apresenta confirmação, horário do envio e ranking atualizado.

### Ranking

- Usa apenas o lançamento mais recente de cada filial.
- Filiais sem lançamento aparecem após as filiais pontuadas com o estado “Sem dados”.
- A filial autenticada fica destacada sem depender somente de cor.
- As três primeiras posições recebem identificação visual e textual.
- Todos os gerentes veem nome da filial, posição, pontuação total, percentual da pontuação máxima e última atualização.
- Métricas detalhadas das outras filiais ficam restritas ao administrador.

### Histórico

- O gerente vê os próprios lançamentos em ordem decrescente de data.
- O administrador escolhe uma filial ou todas e pode filtrar por intervalo de datas.
- Cada linha apresenta os valores informados, pontos por indicador, total e data/hora.
- Horários são gravados em UTC e exibidos no fuso de America/Sao_Paulo.

## 8. Modelo de dados

### `branches`

- `id`: UUID, chave primária.
- `slug`: identificador único estável.
- `name`: nome exibido.
- `display_order`: ordem administrativa inicial.
- `is_active`: estado da filial.
- `created_at`: data de criação.

### `profiles`

- `id`: UUID igual ao usuário de `auth.users`.
- `branch_id`: filial associada; nulo para administrador.
- `role`: `manager` ou `admin`.
- `display_name`: nome da conta.
- `created_at`: data de criação.

Regras: uma conta gerente pertence exatamente a uma filial; apenas uma conta gerente inicial será criada por filial.

### `metric_submissions`

- `id`: UUID, chave primária.
- `branch_id`: filial dona do lançamento.
- `submitted_by`: usuário autenticado que realizou o envio.
- `obz_percentage` e `obz_points`.
- `revenue_percentage` e `revenue_points`.
- `discount_band`, `discount_percentage` e `discount_points`.
- quatro booleanos das iniciativas de desenvolvimento e `development_points`.
- `total_points`.
- `created_at`: data/hora imutável do envio.

Restrições impedirão percentuais negativos, pontuações fora do peso de cada indicador, filial divergente do perfil autenticado e atualização ou exclusão por gerente.

### Consultas consolidadas

- Uma função ou view segura selecionará o lançamento mais recente de cada filial.
- Uma função de ranking retornará somente os campos públicos para gerentes.
- Uma consulta administrativa retornará os detalhes completos somente quando `profiles.role = 'admin'`.

## 9. Segurança

- Senhas iniciais aleatórias, longas e exclusivas por conta.
- Senhas armazenadas apenas pelo Supabase Auth com hash.
- Arquivo `ACESSOS_INICIAIS.txt` presente somente no ambiente local e listado no `.gitignore`.
- Nenhuma credencial real será incluída em exemplos, documentação ou commits.
- Sessão mantida pelo cliente oficial do Supabase e encerrada explicitamente no logout.
- Proteção de rotas na interface e RLS em todas as tabelas expostas.
- Inserções de gerente limitadas à filial vinculada no token/perfil.
- Histórico imutável para preservar auditoria.
- Valores e pontuações recalculados no banco por função controlada.
- Cabeçalhos de segurança compatíveis com hospedagem estática serão documentados; limitações do GitHub Pages serão registradas.
- Dependências fixadas e sem bibliotecas desnecessárias.

O arquivo de acessos iniciais é um meio de distribuição e deve ser guardado fora do repositório. Depois de entregar as credenciais, recomenda-se apagar cópias desnecessárias e solicitar troca de senha no primeiro uso.

## 10. Direção visual

### Identidade

- Branco como base predominante.
- Azul profundo para navegação, cabeçalhos e elementos estruturais.
- Vermelho da marca apenas em chamadas principais, estados importantes e destaques controlados.
- Logo fornecida na tela de login e no cabeçalho da aplicação.

### Páginas

- **Login:** composição centralizada, logo, campos com rótulos visíveis e estado de carregamento.
- **Painel da filial:** cabeçalho compacto, resumo de posição/pontuação, quatro cartões de métricas, confirmação de envio, ranking e histórico próprio.
- **Painel administrativo:** resumo de participação, ranking, tabela das métricas mais recentes e histórico filtrável.
- **Alterar senha:** formulário curto com requisitos de senha e confirmação clara.

### Experiência e acessibilidade

- Layout mobile-first e sem rolagem horizontal.
- Alvos interativos com pelo menos 44 × 44 px.
- Texto base de 16 px e contraste mínimo adequado.
- Estados de foco sempre visíveis e navegação completa por teclado.
- Erros junto ao campo, resumo de confirmação antes do envio e feedback de sucesso.
- Ícones vetoriais acompanhados de rótulo ou nome acessível; sem emojis como ícones de interface.
- Informação não dependerá somente de cor.
- Transições entre 150 e 300 ms e respeito a `prefers-reduced-motion`.
- Tabelas viram cartões legíveis em telas estreitas.

## 11. Tratamento de falhas

- Falha de rede: preservar valores preenchidos na tela e oferecer nova tentativa.
- Sessão expirada: informar o usuário e retornar ao login sem perder silenciosamente um envio confirmado.
- Envio duplicado por clique repetido: botão bloqueado durante a requisição e chave de idempotência no fluxo.
- Dados inválidos: recusar no cliente e no banco com mensagem compreensível.
- Falha ao atualizar o ranking depois de um envio bem-sucedido: confirmar o salvamento e permitir atualizar somente o ranking.
- Perfil ausente ou inconsistente: negar acesso e orientar contato com o administrador.
- Estado vazio: explicar que a filial ainda não enviou métricas, em vez de mostrar zeros como resultado válido.

## 12. Testes e critérios de aceite

### Cálculos

- Testar limites inferiores, metas exatas e valores acima da meta.
- Testar 94,99%, 95% e 100% no OBZ.
- Testar valores exatamente no teto e acima do teto nas duas faixas de desconto.
- Testar faturamento em 0%, abaixo, igual e acima de 100%.
- Testar zero a quatro iniciativas de desenvolvimento.
- Confirmar total máximo de 100 pontos e arredondamento consistente.

### Autenticação e autorização

- Login correto e incorreto.
- Gerente sem acesso a inserção ou histórico de outra filial, inclusive por chamada direta à API.
- Gerente sem acesso a consultas administrativas.
- Administrador com leitura completa.
- Usuário desconectado sem acesso às páginas internas.
- Alteração de senha e encerramento de sessão.

### Histórico e ranking

- Dois envios da mesma filial permanecem no histórico.
- Somente o mais recente entra no ranking.
- Filiais sem dados aparecem corretamente.
- Critérios de desempate produzem ordem estável.
- Datas aparecem no fuso correto.

### Interface

- Uso em larguras móveis e de computador.
- Navegação por teclado, foco, rótulos e mensagens acessíveis.
- Estados de carregamento, sucesso, erro e lista vazia.
- Logo com proporção preservada e texto alternativo.

### Critério final

O sistema será considerado pronto quando as 13 contas iniciais conseguirem autenticar, cada filial puder inserir apenas os próprios dados, o administrador puder acompanhar todas, o histórico for preservado, o ranking refletir os lançamentos mais recentes e a publicação puder ser reproduzida seguindo a documentação.

## 13. Entregáveis

- Código-fonte completo da interface.
- Arquivos SQL de esquema, funções, views, gatilhos, RLS e carga das 12 filiais.
- Script administrativo local para criar as contas iniciais de forma segura no Supabase.
- `ACESSOS_INICIAIS.txt` gerado localmente e ignorado pelo Git.
- Logo otimizada dentro dos arquivos públicos do projeto.
- Testes automatizados dos cálculos e fluxos críticos que possam ser executados sem segredos reais.
- `.env.example` sem credenciais.
- Instruções para configurar o Supabase, criar os usuários e publicar no GitHub Pages.

## 14. Decisões operacionais

- A primeira versão terá uma campanha ativa e contínua; cada novo envio substitui apenas a posição corrente no ranking, preservando todos os anteriores.
- Não haverá exclusão pela interface.
- Mudanças futuras nos pesos ou regras exigirão nova versão controlada do esquema de cálculo para não reinterpretar lançamentos antigos.
- A geração das credenciais será feita localmente durante a configuração; a publicação pública só exigirá a URL e a chave pública do projeto Supabase.
