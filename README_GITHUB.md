# COOPEX Financeiro — Cloud

Este repositório contém apenas o serviço cloud e o portal. Não coloque o banco SQLite local aqui.

## Deploy sugerido
1. Crie um repositório privado no GitHub.
2. Envie estes arquivos.
3. No Render, escolha **New > Blueprint** e conecte o repositório.
4. O `render.yaml` cria:
   - serviço web Flask/Gunicorn;
   - PostgreSQL;
   - `CLOUD_API_TOKEN`.
5. Copie a URL pública do serviço.
6. No sistema LOCAL, configure:
   - Cloud API URL = URL do Render;
   - Cloud API Token = o mesmo valor do Render;
   - Site ID = `coopex-natal`.
7. Sincronize o período atual.

## Cloudflare
Use Cloudflare DNS para apontar um subdomínio para o serviço cloud, por exemplo:
`financeiro.seudominio.com.br`

O portal ficará em:
`https://financeiro.seudominio.com.br/portal`

Não é necessário Cloudflare Tunnel para o portal cloud.
