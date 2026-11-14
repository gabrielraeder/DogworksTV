# DogworksTV

Projetos do canal [twitch.tv/dogworkstv](https://www.twitch.tv/dogworkstv). Cada pasta é um projeto independente, com o próprio `package.json` e o próprio deploy.

| Pasta | O que é | Endereço |
| --- | --- | --- |
| [`games/`](games/) | Lista de jogos co-op e multiplayer do canal (Cloudflare Workers + D1) | <https://dogworkstv.com/games/> |
| [`raulzilla/`](raulzilla/) | Página do Raul (Raulzilla), antes em raulzilla.carrd.co (arquivos estáticos) | <https://dogworkstv.com/raulzilla/> |

## Novo projeto

1. Crie uma pasta na raiz com o projeto dentro (`package.json`, `wrangler.jsonc` etc.).
2. No Cloudflare, ligue o Worker a este repositório e defina **Root directory** = nome da pasta (Settings → Build).
3. Para publicar em `dogworkstv.com/<pasta>`, adicione a rota `dogworkstv.com/<pasta>*` no Worker (Settings → Domains & Routes).

O `.gitignore` da raiz vale para todas as pastas (`node_modules`, `.wrangler`, `.dev.vars`).
