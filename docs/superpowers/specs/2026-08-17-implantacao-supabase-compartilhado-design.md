# Implantação isolada no Supabase compartilhado

## Objetivo

Publicar a Campanha de Gerentes Eletroluz no GitHub Pages e usar o projeto Supabase existente `Morpheus-Eletroluz JV`, sem alterar nem depender das tabelas, funções, políticas ou dados atuais do sistema Morpheus. A estrutura deve ser fácil de identificar, auditar, migrar e remover futuramente.

## Decisão de arquitetura

A campanha usará um schema PostgreSQL dedicado chamado `campaign_gerentes_2026`. Todas as tabelas, funções, índices e políticas da campanha ficarão dentro desse schema. O schema será adicionado à lista de schemas expostos pelo Data API do Supabase e o cliente web será configurado para utilizá-lo explicitamente.

Objetos fora desse schema que não podem ser isolados dessa forma receberão nomes exclusivos:

- bucket privado: `campaign-gerentes-2026-evidence`;
- domínio interno dos usuários: `@campanha-gerentes-2026.eletroluz.local`;
- metadado dos usuários: `campaign_id = gerentes_2026`;
- repositório: `EletroluzCII/campanha-gerentes-eletroluz`.

Essa abordagem é preferível a tabelas prefixadas no schema `public` porque cria uma fronteira clara e permite exportar ou remover todos os objetos relacionais da campanha por schema, sem selecionar tabelas individualmente.

## Componentes do banco

O schema `campaign_gerentes_2026` conterá:

- `branches`: as 12 filiais participantes;
- `profiles`: o vínculo entre usuários do Supabase Auth, filial e papel de gerente ou administrador;
- `metric_submissions`: histórico imutável de lançamentos;
- `submission_evidence`: metadados dos comprovantes vinculados aos lançamentos;
- funções de autorização, ranking, painel administrativo e envio seguro de métricas;
- políticas RLS que limitam cada gerente à própria filial e dão leitura global somente ao administrador.

As funções terão `search_path` restrito e usarão nomes totalmente qualificados. Nenhuma função genérica do projeto piloto será substituída.

## Autenticação e contas

Os usuários continuarão no Supabase Auth do projeto compartilhado, pois o Auth é global por projeto. Para evitar colisões:

- os 13 usuários usarão o domínio interno exclusivo da campanha;
- o script de criação adicionará `campaign_id = gerentes_2026` nos metadados;
- os perfis da aplicação existirão somente em `campaign_gerentes_2026.profiles`;
- o script nunca atualizará usuários sem o identificador da campanha.

As senhas permanecem apenas no arquivo local ignorado pelo Git. A chave `service_role` será utilizada somente durante a configuração e nunca será incluída no frontend ou no repositório.

## Comprovantes

Os comprovantes serão enviados ao bucket privado `campaign-gerentes-2026-evidence`. Os caminhos começarão pelo UUID do usuário e serão protegidos por políticas que validam o perfil dentro do schema dedicado.

O banco só concederá pontos de desenvolvimento quando localizar o objeto real no Storage e registrar o vínculo imutável com o lançamento. Gerentes poderão abrir apenas arquivos da própria filial; o administrador poderá abrir todos por URLs assinadas de curta duração.

## Fluxo da aplicação

1. O usuário entra com o identificador da filial e a senha correspondente.
2. O frontend autentica pelo Supabase Auth e busca o perfil no schema da campanha.
3. Consultas de histórico, ranking e administração usam somente funções e tabelas desse schema.
4. No envio, o frontend carrega os comprovantes no bucket exclusivo.
5. A função de banco confirma objetos e metadados, recalcula os pontos e grava lançamento e vínculos em uma transação.
6. Se o registro falhar, o frontend tenta remover os arquivos ainda não vinculados.

## GitHub e publicação

O código será enviado para um repositório público chamado `campanha-gerentes-eletroluz` na conta `EletroluzCII`. O GitHub Actions executará os testes, gerará o build e publicará o diretório `dist` no GitHub Pages.

Somente `VITE_SUPABASE_URL` e a chave pública anon/publishable serão configuradas como Secrets do repositório. Credenciais administrativas, senhas e tokens pessoais continuarão fora do Git.

## Exclusão e migração futuras

O projeto incluirá um roteiro de desativação com alvos explícitos:

1. exportar o schema `campaign_gerentes_2026` e os objetos do bucket;
2. recriar os usuários no novo projeto com o script e o arquivo local de acessos;
3. importar o schema e os comprovantes;
4. validar contagens, ranking e acesso aos arquivos;
5. remover o bucket exclusivo;
6. remover somente usuários com `campaign_id = gerentes_2026`;
7. executar `drop schema campaign_gerentes_2026 cascade` apenas após a validação final.

Nenhuma etapa de exclusão será automatizada durante a implantação. O roteiro servirá para uma ação futura, deliberada e revisável.

## Tratamento de erros e segurança operacional

- Antes da migração será feita uma inspeção somente leitura dos objetos existentes.
- A migração abortará se o schema dedicado já existir parcialmente em estado inesperado.
- Alterações no Data API preservarão os schemas já expostos e apenas acrescentarão o schema da campanha.
- Criação de usuários será idempotente apenas para contas marcadas como pertencentes à campanha.
- Uploads órfãos serão removidos quando o lançamento falhar.
- Nenhuma tabela atual do Morpheus receberá `ALTER`, `DROP`, políticas ou dados da campanha.

## Verificação

A implantação será considerada concluída quando:

- testes unitários e build de produção passarem;
- o schema e o bucket exclusivos existirem no projeto piloto;
- as 12 contas de filial e a conta administrativa funcionarem;
- cada gerente enxergar apenas seu histórico e comprovantes;
- o administrador enxergar todos os lançamentos e comprovantes;
- o ranking compartilhado funcionar;
- o repositório não contiver segredos;
- o GitHub Pages carregar a aplicação configurada para o Supabase real.
