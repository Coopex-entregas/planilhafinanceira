# COOPEX Financeiro — Cloudflare Workers + D1

Projeto cloud do Controle Financeiro COOPEX.

## Arquitetura

- `src/index.js`: Cloudflare Worker/API e portal mobile.
- `migrations/0001.sql`: estrutura do banco D1.
- `wrangler.jsonc`: configuração do Worker.
- `package.json`: Wrangler e scripts de deploy.

Este repositório **não usa mais Render, Flask, Gunicorn ou PostgreSQL**.

## Deploy Cloudflare

O projeto pode ser conectado ao Cloudflare Workers diretamente pelo GitHub.

Comando de deploy: `npx wrangler deploy`

## Banco D1

Crie um banco D1 chamado `coopex-financeiro` e vincule ao Worker com o nome de binding:

`DB`

Depois execute no console do D1 o conteúdo de `migrations/0001.sql`.

## Segredo

No Worker, crie o Secret:

`CLOUD_API_TOKEN`

O mesmo token deve ser configurado no sistema LOCAL/OFFLINE.

## URLs

- `/health` — diagnóstico do Worker/D1.
- `/portal` — portal único dos cooperados.
- `/api/sync/push` — recebimento da sincronização do sistema local.
- `/api/sync/snapshot` — consulta dos eventos sincronizados.

## Segurança

Nunca envie ao GitHub banco SQLite local, arquivos `.env`, tokens, backups ou dados operacionais privados.
