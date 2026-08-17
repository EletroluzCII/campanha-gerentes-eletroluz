# Comprovantes de Desenvolvimento Pessoal — Especificação de Design

Data: 17 de agosto de 2026

## 1. Objetivo

Alterar o indicador de desenvolvimento pessoal para que uma iniciativa somente gere pontos quando a filial anexar um comprovante. Os arquivos serão privados, ficarão vinculados ao lançamento histórico e poderão ser consultados apenas pela própria filial e pelo administrador.

## 2. Escopo

- Manter as quatro categorias existentes.
- Exibir os emojis somente nos nomes das categorias: 📚 Livros, 🎓 Cursos, 🏅 Certificações e 🎤 Eventos.
- Manter os ícones vetoriais estruturais do restante da interface.
- Exigir um comprovante por categoria selecionada.
- Aceitar arquivos JPG, PNG, WebP ou PDF com até 10 MB.
- Armazenar comprovantes em um bucket privado do Supabase Storage.
- Vincular os arquivos ao lançamento de métricas correspondente.
- Permitir que a filial consulte os próprios comprovantes.
- Permitir que o administrador consulte todos os comprovantes.
- Impedir que outros gerentes consultem ou descubram os caminhos privados.

Não haverá aprovação manual do administrador nesta versão. Um comprovante válido e efetivamente armazenado libera a iniciativa para o cálculo.

## 3. Experiência do gerente

Cada categoria continuará como uma opção selecionável. Ao selecionar uma categoria:

1. Um campo de upload aparece dentro do cartão da categoria.
2. O campo informa os formatos aceitos e o limite de 10 MB.
3. O usuário escolhe um arquivo e vê nome, tipo e tamanho.
4. Antes de salvar, pode substituir ou remover o arquivo.
5. A prévia da pontuação considera somente categorias selecionadas que já tenham um arquivo válido escolhido.

Se uma categoria for desmarcada, o arquivo selecionado para ela será removido do envio atual. Categorias sem comprovante mostrarão o estado textual “Comprovante necessário” e não gerarão pontos.

Ao clicar em “Revisar e salvar”, a interface validará todas as métricas e os comprovantes. Se algo estiver ausente ou inválido, o erro será exibido junto à categoria e o envio não começará.

## 4. Fluxo de envio

1. A interface cria um identificador aleatório para o lote de comprovantes.
2. Os arquivos são enviados ao bucket privado em caminhos com o formato `usuario/lote/categoria/arquivo`.
3. A interface mostra progresso e bloqueia cliques duplicados.
4. Após todos os uploads terminarem, a função segura `submit_metrics` recebe as métricas e o identificador do lote.
5. A função verifica no servidor se existe exatamente um arquivo permitido para cada categoria declarada.
6. A pontuação de desenvolvimento é calculada exclusivamente a partir dos comprovantes validados no Storage.
7. O lançamento e as referências aos comprovantes são gravados na mesma transação do banco.
8. A confirmação é exibida e o ranking é atualizado.

Se qualquer upload falhar, nenhum lançamento será criado. Os valores e arquivos escolhidos permanecerão visíveis para nova tentativa. Se a gravação no banco falhar depois dos uploads, a interface tentará remover os objetos recém-enviados; objetos órfãos também poderão ser removidos posteriormente por rotina administrativa.

## 5. Pontuação

- Cada categoria com comprovante válido conta como uma iniciativa.
- Zero comprovantes: 0 ponto.
- Um comprovante: 1,67 ponto.
- Dois comprovantes: 3,33 pontos.
- Três ou quatro comprovantes: 5 pontos.
- A quarta categoria continua registrada e comprovada, mas não ultrapassa o limite de 5 pontos.
- Booleanos enviados pelo navegador não concedem pontos por si só.
- O PostgreSQL recalcula e persiste a pontuação após verificar os arquivos.

## 6. Dados e Storage

### Bucket `development-evidence`

- Privado.
- Tipos MIME permitidos: `image/jpeg`, `image/png`, `image/webp` e `application/pdf`.
- Limite de 10 MB por objeto.
- Caminho iniciado obrigatoriamente pelo UUID do usuário autenticado.

### Tabela `submission_evidence`

- `id`: UUID.
- `submission_id`: lançamento proprietário.
- `branch_id`: filial proprietária.
- `category`: `books`, `courses`, `certifications` ou `events`.
- `storage_path`: caminho único do objeto privado.
- `original_name`: nome original higienizado para exibição.
- `mime_type`: tipo validado.
- `size_bytes`: tamanho validado.
- `created_at`: data e hora.

Haverá no máximo um comprovante por categoria e lançamento. A referência ficará imutável assim como o lançamento.

## 7. Segurança e permissões

- Gerentes podem enviar arquivos somente dentro do próprio prefixo de usuário.
- Gerentes podem ler somente comprovantes ligados à própria filial.
- Administradores podem ler todos os comprovantes.
- Usuários anônimos e gerentes de outras filiais não têm permissão de leitura.
- Links de visualização serão assinados e terão validade curta; o bucket não fornecerá URLs públicas.
- O nome original do arquivo será higienizado e não será usado como identidade do objeto.
- Extensão, MIME type e tamanho serão verificados no navegador, nas regras do bucket e na função do banco.
- A chave `service_role` não será usada no navegador.

## 8. Histórico e administração

O histórico do gerente exibirá quantos comprovantes cada lançamento contém e um botão “Ver comprovantes”. O botão abrirá uma lista com categoria, nome do arquivo e ação para abrir em uma URL assinada.

O histórico administrativo terá a mesma ação para qualquer filial. A visualização não exporá comprovantes no ranking público nem nas métricas detalhadas vistas por outros gerentes.

## 9. Acessibilidade e interface

- Emojis serão decorativos e acompanhados por texto; leitores de tela receberão apenas o nome da categoria para evitar repetição.
- O seletor de arquivo terá rótulo visível e suporte a teclado.
- Estados de vazio, arquivo selecionado, upload, sucesso e erro serão textuais e não dependerão somente de cor.
- O botão de remoção terá nome acessível contendo a categoria.
- Durante o upload, o formulário informará progresso por arquivo e estado geral.
- Erros de formato, tamanho ou ausência aparecerão junto ao campo correspondente.

## 10. Tratamento de falhas

- Arquivo maior que 10 MB: rejeitar antes do upload.
- Tipo não permitido: rejeitar antes do upload e novamente no Storage.
- Falha de rede: manter seleção e permitir tentar novamente.
- Sessão expirada: cancelar o envio, solicitar novo login e não criar lançamento.
- Upload parcial: remover os arquivos já enviados quando possível e não registrar pontuação.
- Lote reutilizado ou adulterado: rejeitar na função do banco.
- Arquivo de outro usuário: rejeitar pelo prefixo, políticas de Storage e verificação do servidor.
- Falha ao gerar URL assinada: informar que o comprovante existe, mas não pôde ser aberto naquele momento.

## 11. Testes e critérios de aceite

- Os quatro emojis aparecem somente nas categorias de desenvolvimento.
- Marcar uma categoria sem arquivo não altera a pontuação.
- Anexar um arquivo válido libera a pontuação correspondente.
- Remover ou substituir o arquivo atualiza a prévia.
- Formatos e tamanhos inválidos são rejeitados.
- O envio grava exatamente um comprovante para cada categoria declarada.
- A função do banco recusa pontuação sem objeto existente.
- Uma filial não consegue listar, assinar ou abrir arquivo de outra.
- O administrador consegue abrir comprovantes de todas as filiais.
- O gerente vê seus comprovantes no histórico.
- Três ou quatro comprovantes resultam em no máximo 5 pontos.
- Falha durante upload não cria lançamento parcial.
- O fluxo funciona em desktop e celular e permanece navegável por teclado.

## 12. Arquivos afetados

- Interface do formulário e histórico em `src/main.js`.
- Estado e operações de upload em `src/services.js`.
- Cálculo e validações em `src/scoring.js`.
- Estilos responsivos em `src/styles.css`.
- Migração adicional do Supabase com tabela, bucket, funções e políticas.
- Dados de demonstração e testes automatizados.
- Documentação de configuração no `README.md`.
