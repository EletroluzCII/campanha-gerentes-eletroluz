# Campanha de Gerentes Eletroluz

Sistema web para registrar os indicadores das 12 filiais, calcular a pontuação da campanha, preservar o histórico e exibir o ranking. A interface é publicada no GitHub Pages e usa Supabase para autenticação e banco PostgreSQL.

## Funcionalidades

- Conta separada para cada filial e uma conta administrativa.
- Quatro indicadores com cálculo imediato e validação no banco.
- Ranking compartilhado com destaque da filial conectada.
- Histórico imutável de todos os lançamentos.
- Comprovantes privados para livros, cursos, certificações e eventos.
- Painel administrativo com métricas detalhadas, filtros e exportação CSV.
- Alteração da própria senha.
- Layout responsivo e acessível.

## Pré-requisitos

- Node.js 22 ou mais recente.
- Uma conta no Supabase.
- Um repositório no GitHub para a publicação pública.

## Visualização local

```powershell
npm install
npm run dev
```

Acesse a URL exibida pelo Vite. Antes de configurar o Supabase, é possível inspecionar as telas somente em `localhost`:

- Gerente: `http://localhost:5173/?demo=manager`
- Administrador: `http://localhost:5173/?demo=admin`

O modo de demonstração usa dados fictícios, não autentica e nunca é habilitado fora de `localhost`.

## Configuração do Supabase

1. Selecione o projeto Supabase que receberá a campanha. As migrations usam o schema isolado `campaign_gerentes_2026` e não alteram tabelas existentes no schema `public`.
2. Abra o **SQL Editor** e execute, nesta ordem:
   - [`supabase/migrations/202608170001_initial.sql`](supabase/migrations/202608170001_initial.sql)
   - [`supabase/migrations/202608170002_development_evidence.sql`](supabase/migrations/202608170002_development_evidence.sql)
3. Em **Project Settings > API > Exposed schemas**, acrescente `campaign_gerentes_2026` sem remover os schemas existentes.
4. Copie `.env.example` para `.env`.
5. Em **Project Settings > API**, preencha no `.env`:
   - `VITE_SUPABASE_URL`: URL do projeto.
   - `VITE_SUPABASE_ANON_KEY`: chave pública `anon`/`publishable`.
   - `SUPABASE_URL`: a mesma URL, usada pelo script local.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave `service_role`, usada somente localmente.
6. Confirme que `ACESSOS_INICIAIS.txt` existe na raiz. Ele já está no `.gitignore`.
7. Crie as 13 contas e associe os perfis:

```powershell
npm run create-users
```

O script pode ser executado novamente: contas existentes são reutilizadas e os perfis são sincronizados. Ele não imprime senhas no terminal.

> Nunca coloque a `SUPABASE_SERVICE_ROLE_KEY` no GitHub, no código da interface ou em um segredo com prefixo `VITE_`. Tudo que usa `VITE_` entra no pacote público do navegador.

## Testes e build

```powershell
npm test
npm run build
npm run preview
```

O build final fica em `dist/`.

## Publicação no GitHub Pages

O workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) testa, gera e publica a aplicação.

1. Crie um repositório no GitHub e envie este projeto.
2. Em **Settings > Secrets and variables > Actions**, crie os segredos:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Em **Settings > Pages**, escolha **GitHub Actions** como origem.
4. Envie um commit para `main` ou `master`, ou execute manualmente o workflow “Publicar no GitHub Pages”.
5. No Supabase, adicione a URL publicada em **Authentication > URL Configuration > Site URL** e em **Redirect URLs**.

O arquivo de acessos, `.env`, banco e chave administrativa nunca são publicados.

## Entrega dos acessos

O arquivo local `ACESSOS_INICIAIS.txt` contém os 12 usuários de filial e o administrador. Entregue a cada unidade apenas a própria linha. Recomenda-se alterar a senha após o primeiro acesso e guardar o arquivo fora do repositório.

## Estrutura principal

```text
src/
  main.js          Telas, navegação e interações
  services.js      Acesso ao Supabase e modo de demonstração
  scoring.js       Cálculos e validações compartilháveis
  styles.css       Sistema visual e responsividade
supabase/
  migrations/      Banco, funções e políticas RLS
scripts/
  create-users.mjs Criação local das contas iniciais
tests/
  scoring.test.js  Testes dos limites de pontuação
public/
  logo-eletroluz.png
```

## Regras de pontuação

- OBZ: 20 pontos, elegibilidade mínima de 95% e limite em 100%.
- Faturamento: 40 pontos proporcionais, limitados em 100%.
- Descontos: 35 pontos quando o percentual está dentro do teto da faixa.
- Desenvolvimento pessoal: 5 pontos proporcionais até três iniciativas comprovadas. Marcar uma atividade sem anexar o arquivo não concede pontos.

O navegador mostra a prévia, mas a função `submit_metrics` recalcula tudo no PostgreSQL. Valores enviados manualmente pelo navegador não conseguem definir a própria pontuação.

## Segurança

- Senhas ficam somente no Supabase Auth, armazenadas com hash.
- Row Level Security separa os dados das filiais.
- O gerente lê apenas o próprio histórico; o ranking expõe somente o resumo de todas as filiais.
- O administrador lê todos os lançamentos, sem poder alterá-los pela aplicação.
- Não existem políticas de atualização ou exclusão para o histórico.
- Comprovantes ficam no bucket privado `campaign-gerentes-2026-evidence`, limitado a JPG, PNG, WebP e PDF de até 10 MB.
- Somente a filial proprietária e o administrador podem gerar links temporários para os comprovantes.
- A função do banco confirma a existência de cada objeto antes de calcular os pontos de desenvolvimento.
- A chave administrativa é usada apenas pelo script local de configuração.
- Todos os objetos relacionais ficam agrupados no schema `campaign_gerentes_2026`, isolados das tabelas do sistema Morpheus.

Para recuperar uma conta sem acesso, redefina a senha pelo painel administrativo do Supabase. Não exponha a chave `service_role` para criar uma recuperação dentro do GitHub Pages.
