# Operação no Supabase compartilhado

## Identificadores exclusivos

- Projeto atual: `Morpheus-Eletroluz JV`
- Referência do projeto: `gdjfbxhosugcckmuuumt`
- Schema: `campaign_gerentes_2026`
- Bucket: `campaign-gerentes-2026-evidence`
- Identificador nos usuários: `app_metadata.campaign_id = gerentes_2026`
- Domínio interno: `@campanha-gerentes-2026.eletroluz.local`

Esses identificadores separam a campanha do restante do sistema Morpheus. Não use tabelas do schema `public` para dados da campanha.

## Migração futura

1. Coloque a aplicação em manutenção e interrompa novos lançamentos.
2. Exporte somente o schema `campaign_gerentes_2026`.
3. Copie os objetos do bucket `campaign-gerentes-2026-evidence`, preservando os caminhos.
4. Aplique as migrations no projeto de destino.
5. Recrie as 13 contas com `npm run create-users` e o arquivo local `ACESSOS_INICIAIS.txt`.
6. Importe os lançamentos e comprovantes ajustando os UUIDs de usuários quando necessário.
7. Atualize os Secrets do GitHub Pages para o novo projeto.
8. Valide login, ranking, histórico, RLS e URLs assinadas antes de desativar a origem.

## Exclusão futura

A exclusão não é executada automaticamente por este projeto. Antes de remover qualquer item, faça backup e confirme que a aplicação já aponta para outro ambiente.

Alvos exclusivos da campanha:

1. objetos do bucket `campaign-gerentes-2026-evidence`;
2. o próprio bucket `campaign-gerentes-2026-evidence`;
3. usuários cujo `app_metadata.campaign_id` seja exatamente `gerentes_2026`;
4. schema `campaign_gerentes_2026`;
5. entrada `campaign_gerentes_2026` na lista de schemas expostos pelo Data API.

Não remova usuários apenas pelo domínio de e-mail e não execute `drop schema` antes de confirmar a exportação. As tabelas e configurações do schema `public` pertencem ao Morpheus e ficam fora do procedimento.
