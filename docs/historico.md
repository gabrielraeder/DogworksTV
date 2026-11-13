# Histórico do projeto

Resumo da conversa que criou este projeto, para quem continuar o trabalho, seja uma pessoa ou outra sessão do Claude. A conversa começou no repositório `c:\writechoice\laptop` e o projeto foi criado aqui em `C:\writechoice\games-list`.

## 1. Origem: a biblioteca da Epic

- O pedido inicial foi "ver os jogos da biblioteca da Epic Games".
- Não há API pública para isso. A lista foi lida do **cache local do Epic Games Launcher**: `C:\ProgramData\Epic\EpicGamesLauncher\Data\Catalog\catcache.bin`, um JSON em base64.
  - Foram encontrados ~278 títulos da categoria `games` + `applications`.
  - Nenhum jogo estava instalado: a pasta `...\Data\Manifests` estava vazia.
  - O cache inclui alguns itens que não são jogos (trilhas sonoras, artbook, betas), e pode estar desatualizado.
- Dessa lista, os jogos **co-op e multiplayer** foram separados em categorias:
  - co-op online
  - co-op local
  - PvP
  - estratégia
  - party
  - outros (multiplayer secundário)

  A classificação foi feita **com base no conhecimento do modelo**, não em dados oficiais. Por isso pode ter erros; veja [pendencias.md](pendencias.md).
- Essa curadoria virou o arquivo `scripts/seed.json`, com 108 jogos.

## 2. Primeira versão do site (estática)

- Pedido: um site para listar os jogos, marcar favoritos e adicionar jogos novos, com nome, imagem e link vindos da Steam e da Epic.
- **Steam:** as APIs públicas da loja funcionam (`storesearch` e `appdetails` com `cc=BR&l=portuguese`). O `appdetails` traz imagem, descrição, gêneros e **categorias oficiais** pelos IDs:
  - 38 = Co-op online
  - 39 = Co-op em tela dividida
  - 36 = PvP online
  - 37 = PvP em tela dividida
  - 24 = Tela dividida
  - 27 = Crossplay
  - …

  Esses IDs viram as tags dos cards e sugerem a categoria ao adicionar um jogo (`lib/steam.js`).
- **Epic:** tudo bloqueado.
  - O GraphQL da loja dá 403/404, e as páginas `store.epicgames.com/.../p/<slug>` dão 403, inclusive pelo servidor.
  - Por isso o botão da Epic abre a **busca da loja** pelo nome.
  - As imagens da Epic, usadas só quando o jogo não está na Steam, vêm do `catcache.bin`, redimensionadas com `?resize=1&w=460`.
  - O mesmo cache tinha um link para abrir o jogo no launcher (`com.epicgames.launcher://…`). Ele chegou a virar um botão ▶ nos cards, removido a pedido.
- O script `scripts/build-library.mjs` gera `public/data/games.json` a partir do `seed.json`. Alguns jogos precisaram de `steamId` fixo porque a busca por nome errava (Never Alone, Nioh, MudRunner…).
- Ficaram 7 jogos sem página na Steam: Fortnite, LEGO Fortnite Odyssey, Rocket Racing, Divine Knockout, Hood: Outlaws & Legends, Second Extinction e Wild Card Football. Eles usam a imagem da Epic.

## 3. Identidade visual (canal twitch.tv/dogworkstv)

- A página do canal foi analisada no navegador. A API interna da Twitch foi bloqueada pelo ambiente, então não foi usada.
- Elementos aproveitados:
  - **Mascote:** um cachorro cavaleiro, com elmo prateado, pelo vermelho e uma faixa de pergaminho com "DogworksTV" em letra gótica. Está em `public/assets/logo.png`.
  - **Banner:** um cenário de jogo com céu azul e floresta, usado no topo (`public/assets/banner.png`, 853×480).
  - **Painéis da Twitch:** um quadrado azul royal (`#2b36c9`) com ícone branco e sombra diagonal, ao lado de uma barra cinza-ardósia (`#565e5e`) com fonte grossa. Os títulos das categorias imitam esse estilo (`.panel`).
- Fontes (Google Fonts):
  - **Bungee:** títulos, parecida com a dos painéis
  - **Pirata One:** nome do canal, como a faixa do avatar
  - **Rubik:** texto
- Outras cores: vermelho do mascote `#b3261e`, pergaminho `#e9e1c1` e dourado `#f2c14e` para favoritos.
- Logos da Steam e da Epic nos botões: SVGs do **Simple Icons** (CC0, versão 13.21.0) em `public/assets/`, aplicados com `mask` no CSS.

## 4. Ajustes de uso

- **Botão ▶ do launcher:** removido.
- **Botões Steam/Epic:** passaram a mostrar só a logo de cada loja.
- **Adicionar jogo:** o campo aceita **nome**, **link da Steam** (preenche direto) ou **link da Epic**. Com o link da Epic, o nome é tirado do slug (`/p/borderlands-3` → "borderlands 3"), o jogo é buscado na Steam e o link da Epic é mantido.
- Quando a Steam não lista modo multiplayer para o jogo, a janela mostra um aviso.

## 5. Segunda versão: Cloudflare Workers + D1 + login Steam

Pedidos desta etapa:
- trocar a tag "Na biblioteca", que vinha da biblioteca do dono do site, por uma marcação de **"Eu tenho"** feita por cada pessoa
- criar um **modal do jogo** com preços, promoções e a **lista de quem tem**

Decisões:

| Tema | Escolha | Motivo |
|---|---|---|
| Identidade dos usuários | **Login com Steam** (OpenID 2.0) | Pedido do dono. Não precisa registrar app. Com a Steam Web API key, também dá para detectar a biblioteca sozinho |
| Banco | **Cloudflare D1** | Pedido do dono |
| Ferramenta | **Wrangler 4.162** (local, em `devDependencies`) | O CLI `cf` (v0.15, beta) foi testado e descartado: depende de Vite/plugin beta e o dono já usa Wrangler |
| Preços | **Steam `appdetails`** + **IsThereAnyDeal** | A Epic não tem API pública. O ITAD cobre Steam (shop 61) e Epic (shop 16) com `country=BR`, mais o menor preço histórico |
| Hospedagem | Cloudflare Workers com static assets (`public/`) | Site, API e banco no mesmo lugar, no plano grátis. As funções da Vercel e o `server.mjs` foram removidos |

### Arquitetura atual

- `wrangler.jsonc`:
  - os assets de `public/` são servidos direto
  - `run_worker_first: ["/api/*"]` manda só a API para o Worker
  - binding `DB` (D1 `dogworks-games`) sem `database_id`, que é criado sozinho no primeiro deploy
- Rotas (`src/worker.js`):
  - `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`
  - `GET /api/me` (inclui `library`: favoritos, adicionados, edições, ocultos), `POST /api/me/sync` (sincroniza a biblioteca Steam)
  - `POST /api/library/flag` `{ id, flag: 'favorite' | 'hidden', on }`, `POST /api/library/game` `{ id, custom, data }`, `POST /api/library/remove` `{ id }`, `POST /api/library/import` `{ mode: 'merge' | 'replace', favorites, hidden, custom, overrides }`
  - `POST /api/ownership` `{ key, platform, owned }`
  - `GET /api/owners?key=…`, `POST /api/owners/counts` `{ keys }`
  - `GET /api/steam/search?q=…`, `GET /api/steam/details?appid=…`
  - `GET /api/prices?appid=…` ou `?title=…`
- Banco (`migrations/0001_init.sql`):
  - `users`: a biblioteca Steam fica em `steam_appids`, um array JSON, consultado com `json_each`
  - `sessions`
  - `ownership`: `platform` ∈ `steam | epic | outra`
  - `user_games` (`migrations/0002_user_games.sql`): uma linha por usuário × jogo, com `favorite`, `hidden`, `custom` e `data` (JSON do jogo adicionado ou dos campos editados de um jogo base)
- **Chave do jogo** (`game_key`): `steam:<appid>` quando há link da Steam, senão `name:<nome normalizado>`. É ela que liga o mesmo jogo entre usuários diferentes.
- **Segurança:**
  - o OpenID é validado com `check_authentication`, e `op_endpoint`, `return_to` e `claimed_id` são conferidos
  - a sessão usa um token aleatório em cookie `HttpOnly; Secure; SameSite=Lax`; no D1 fica só o SHA-256
  - mutações exigem `Content-Type: application/json` e `Origin` igual ao do site
  - URLs exibidas passam por `safeUrl` (só http/https)
  - o D1 aceita no máximo 100 parâmetros por query, então as consultas são feitas em lotes de 90
- **Segredos** (opcionais): `STEAM_API_KEY` e `ITAD_API_KEY`. No local ficam em `.dev.vars`; em produção, use `wrangler secret put`.
  - Sem a da Steam: nome e avatar vêm do XML público do perfil, e a biblioteca não é detectada.
  - Sem a do ITAD: aparece só o preço da Steam.
- **No navegador** (localStorage, chave `dogworks-games:v1`): preferências de exibição (ordenação, filtros) e, só para quem não está logado, favoritos, jogos adicionados, edições e ocultos. No primeiro login, esses dados são enviados para a conta (`/api/library/import` com `merge`) e apagados do navegador.

## 5.1. Favoritos e jogos adicionados na conta (D1)

- Pedido: levar para o banco o que ainda ficava só no navegador.
- Mantido o mesmo comportamento de antes, só que guardado na conta: cada pessoa tem os próprios favoritos, jogos adicionados, edições e ocultos. Uma lista de jogos compartilhada, controlada pelo dono do site, ficou como ideia em [pendencias.md](pendencias.md).
- O site salva cada alteração na hora (uma requisição por vez, para não chegar fora de ordem). Se o servidor recusar, a lista é recarregada da conta e aparece um aviso.
- Importar backup e "Restaurar lista original" substituem a lista da conta quando a pessoa está logada.
- Limites por conta: 2000 jogos marcados e 500 adicionados. Campos e URLs são validados no servidor.
- Testado no `wrangler dev` com um usuário de teste (apagado depois): migração do navegador para a conta, favoritar, adicionar, editar jogo base, remover e desfazer, sair e entrar de novo, restaurar lista.

### Testes feitos

- **API local** (`wrangler dev`):
  - `/api/me`, contagens, donos e preços: preço da Steam em R$ com desconto OK
  - marcar "Eu tenho" sem login → 401
  - POST sem JSON → 415
  - callback de login falsificado → `/?login=erro`
- **Navegador**, com usuários de teste inseridos no D1 local e apagados depois:
  - selos "Você tem" e contador de donos nos cards
  - modal com preços
  - Steam detectado e travado
  - marcar Epic
  - lista "Quem tem"
- Layout de celular (390px) sem rolagem horizontal.
- `wrangler deploy --dry-run` OK.
- **Não testado:**
  - o login real pela Steam (o redirecionamento sai certo, mas a volta com uma conta de verdade não foi testada)
  - o ITAD com chave real
  - o deploy de verdade

## 6. Estado no fim da conversa

- Nenhum commit. O repositório tem o remote `origin` configurado, mas ainda nenhum commit.
- O servidor local pode ter ficado rodando em `http://localhost:8787`.
- Próximos passos: veja [pendencias.md](pendencias.md).
