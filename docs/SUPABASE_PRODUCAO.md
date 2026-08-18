# Operação no Supabase de produção

## Projeto dedicado

- Projeto atual: `Campanha Gerentes Eletroluz 2026`
- Referência: `zdbtlwihfcdfhsrzycrr`
- Região: `sa-east-1` (São Paulo)
- Organização: `Eletroluz CII's Org`
- Schema: `campaign_gerentes_2026`
- Bucket privado: `campaign-gerentes-2026-evidence`
- Identificador dos usuários: `app_metadata.campaign_id = gerentes_2026`
- Domínio interno: `@campanha-gerentes-2026.eletroluz.local`

O projeto é dedicado à campanha. O cadastro público está bloqueado; somente as contas criadas pelo script administrativo podem entrar.

## Migração realizada em 18/08/2026

A campanha foi copiada do projeto compartilhado `Morpheus-Eletroluz JV` (`gdjfbxhosugcckmuuumt`) para o projeto dedicado acima.

Na origem foram encontrados e migrados:

1. 12 filiais;
2. 13 contas de autenticação;
3. 13 perfis, sendo 12 gerentes e um administrador;
4. nenhuma submissão de métricas;
5. nenhum comprovante armazenado.

Os mesmos usuários e senhas do arquivo local `ACESSOS_INICIAIS.txt` foram mantidos. Um backup da origem foi criado na pasta local ignorada `.migration-backup/` antes da troca.

## Manutenção

1. Use `supabase/config.toml` para os schemas expostos e as URLs autorizadas.
2. Aplique novas alterações do banco somente por migrations versionadas.
3. Execute `npm run create-users` com as variáveis administrativas locais para sincronizar os acessos.
4. Mantenha somente a URL e a chave publicável nos Secrets do GitHub.
5. Nunca envie a chave `service_role`, a senha do banco ou `ACESSOS_INICIAIS.txt` ao repositório.

O projeto Supabase antigo deve permanecer disponível até a confirmação de que o site publicado funciona integralmente com o novo ambiente.
