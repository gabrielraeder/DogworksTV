# DogworksTV · Jogos Co-op & Multiplayer

Site com a lista de jogos co-op e multiplayer (<https://games.dogworkstv.com/>), com o visual do canal [twitch.tv/dogworkstv](https://www.twitch.tv/dogworkstv). Roda no **Cloudflare Workers**, com banco **D1**.

> Como o projeto foi construído e por quê: [docs/historico.md](docs/historico.md) · O que falta configurar: [docs/pendencias.md](docs/pendencias.md) · Ideias: [TODO.md](TODO.md)

## O que tem

- Filtros por categoria (co-op online, co-op local, PvP, estratégia, party, outros), busca e ordenação
- ★ Favoritos
- **Login com Steam**
- **Eu tenho**: cada pessoa marca em quais plataformas tem o jogo (Steam, Epic, outra). Os jogos da Steam são detectados sozinhos quando a biblioteca da pessoa é pública.
- **Modal do jogo** (clique no card): descrição, preços na Steam e na Epic em R$, promoções, menor preço já registrado e a lista de **quem tem** o jogo
- **Adicionar jogos**: digite o nome ou cole um link da Steam ou da Epic. Nome, imagem, links e modos co-op/PvP são preenchidos pela Steam.
- Editar e ocultar jogos; backup em JSON
- **Promoções**: selo de desconto nos cards, filtro **Em promoção** e ordenação por desconto (Steam e Epic, via IsThereAnyDeal)
- **Link direto** para cada jogo (`?jogo=<id>`), com o botão **Copiar link** no modal
- **Jogar com quem?**: escolha algumas pessoas e veja só os jogos que todas têm
- **Privacidade:** aviso no login e **Opções → Apagar minha conta**

### O que fica onde

| Dado | Onde fica |
|---|---|
| Lista base de jogos | `public/data/games.json` (igual para todo mundo) |
| Favoritos, jogos adicionados, edições, ocultos | Na conta Steam da pessoa (banco D1), quando ela está logada. Sem login, ficam no navegador e vão para a conta no primeiro login. **Opções → Exportar backup** continua disponível |
| Ordenação e filtros escolhidos | No navegador (localStorage) |
| Login, "Eu tenho", quem tem cada jogo | Banco D1 da Cloudflare (compartilhado) |

## Chaves de API (opcionais, mas recomendadas)

| Chave | Para que serve | Sem ela |
|---|---|---|
| `STEAM_API_KEY` | Nome e avatar do perfil e detecção automática da biblioteca Steam | O login funciona e o nome/avatar vêm do perfil público, mas os jogos precisam ser marcados à mão |
| `ITAD_API_KEY` | Preço da Epic, menor preço histórico, selos e filtro de promoção, imagem de jogos fora da Steam | Só aparece o preço da Steam no modal; sem selos de promoção |

- **Steam:** crie em <https://steamcommunity.com/dev/apikey>. A Steam pede um nome de domínio; use o domínio do site.
- **IsThereAnyDeal:** crie uma conta, registre um app em <https://isthereanydeal.com/apps/my/> e copie a *API key*.

## Rodar localmente

Precisa de Node 20 ou mais novo.

```bash
npm install
cp .dev.vars.example .dev.vars   # e preencha as chaves (opcional)
npm run dev                       # aplica as migrations no D1 local e abre em http://localhost:8787
```

O login com Steam funciona no `localhost`, porque a Steam redireciona de volta para o mesmo endereço.

## Publicar na Cloudflare

1. Entre na sua conta (abre o navegador uma vez):
   ```bash
   npx wrangler login
   ```
2. Publique. O `npm run deploy` aplica as migrations no D1 (`database_id` fixado no `wrangler.jsonc`) e depois publica o Worker, para o código novo nunca rodar sem as tabelas de que precisa. O site também é publicado sozinho a cada push na `main`, pela integração com o GitHub:
   ```bash
   npm run deploy
   ```
3. Configure as chaves (cada comando pede o valor no terminal):
   ```bash
   npx wrangler secret put STEAM_API_KEY
   npx wrangler secret put ITAD_API_KEY
   ```

O site fica em `https://dogworks-games.<sua-conta>.workers.dev`. Para usar um domínio próprio, adicione em **Workers & Pages → dogworks-games → Settings → Domains & Routes**. No domínio próprio, o cache de preços e da busca na Steam também passa a funcionar.

## Atualizar a lista base

A lista base fica em `public/data/games.json`. Ela é gerada a partir de `scripts/seed.json`:

```bash
npm run build:data          # usa o cache da Steam (scripts/.steam-cache.json)
npm run build:data:refresh  # consulta a Steam de novo
```

Cada item do `seed.json` aceita:

| Campo      | Para que serve                                                          |
|------------|-------------------------------------------------------------------------|
| `name`     | Nome exibido                                                            |
| `category` | `coop-online`, `coop-local`, `pvp`, `estrategia`, `party` ou `outros`   |
| `note`     | Observação curta exibida no card                                        |
| `steam`    | Nome para buscar na Steam, quando é diferente do `name`                 |
| `steamId`  | ID do app na Steam, quando a busca por nome falha                       |
| `epic`     | Título exato no catálogo da Epic, quando é diferente do `name`          |
| `epicUrl`  | Link direto da página na Epic (sem ele, o botão abre a busca da loja)   |

As imagens da Epic (usadas quando o jogo não está na Steam) vêm do cache local do Epic Games Launcher (`C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog\catcache.bin`), então esse passo só funciona no PC com o launcher instalado.

A Epic bloqueia a leitura das páginas da loja e não tem API pública. Por isso, quando você cola um link da Epic no site, ele pega o nome do jogo do próprio link e busca os dados na Steam. Os preços da Epic vêm do IsThereAnyDeal.

## Estrutura

```
public/            site estático (index.html, styles.css, app.js, assets/, data/games.json)
src/worker.js      rotas /api/* do Worker
src/auth.js        login com Steam (OpenID) e sessões
src/owners.js      "Eu tenho" e quem tem cada jogo
src/prices.js      preços (Steam + IsThereAnyDeal)
lib/steam.js       acesso à Steam (usado pelo Worker e pelo script da lista)
migrations/        schema do banco D1
scripts/           seed.json e o gerador da lista base
wrangler.jsonc     configuração do Worker
```
