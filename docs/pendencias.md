# O que falta fazer

Lista do que ficou para o dono do site fazer, por ordem. Para o contexto de cada decisão, veja [historico.md](historico.md).

## Para colocar no ar

- [x] **Criar a chave da Steam Web API:** <https://steamcommunity.com/dev/apikey>
  - A Steam pede um nome de domínio. Use o domínio onde o site vai ficar (pode ser o `*.workers.dev` e trocar depois).
  - Sem ela, o login funciona, mas a biblioteca Steam não é detectada.
- [x] **Criar a chave do IsThereAnyDeal:** app `dogworks-games` registrado em <https://isthereanydeal.com/apps/14279/>.
  - Use a **API Key** (seção "API Keys") como `ITAD_API_KEY`. O OAuth não é necessário.
  - Sem ela, o modal mostra só o preço da Steam.
- [x] **Testar localmente com as chaves:**
  1. Copie `.dev.vars.example` para `.dev.vars` e preencha.
  2. Rode `npm install` e `npm run dev`.
  3. Abra <http://localhost:8787>.
  4. Teste o **login real com a Steam**, o "Eu tenho" e o modal de preços. O login real ainda não foi testado.
- [ ] **Publicar:**
  ```bash
  npx wrangler login
  npm run deploy                          # cria o D1 no primeiro deploy e aplica as migrations
  npx wrangler secret put STEAM_API_KEY
  npx wrangler secret put ITAD_API_KEY
  ```
- [x] **Commit e push.** O repositório está ligado ao GitHub: cada push na `main` refaz o deploy (`npm run deploy`, que aplica as migrations e depois publica).
  - Não versione o `.dev.vars`, que já está no `.gitignore`.
  - O `database_id` do D1 já está fixado no `wrangler.jsonc`.
- [x] **Domínio próprio:** o site está em <https://games.dogworkstv.com/> (Workers & Pages → `dogworks-games` → Settings → Domains & Routes).
  - Com domínio próprio, o cache de preços e da busca na Steam passa a funcionar. No `workers.dev`, o Cache API não tem efeito.
  - A chave da Steam foi renovada em 13/11/2026. Se trocar de domínio, o domínio da chave não precisa mudar: a Steam não limita o uso por domínio.

## Revisar conteúdo

- [ ] **Conferir a classificação dos jogos** em `scripts/seed.json`. As categorias foram definidas por conhecimento geral, não por dados oficiais. Depois de editar, rode `npm run build:data`.
- [ ] **Conferir jogos que podem ter os servidores desligados ou ter sido retirados das lojas:** Second Extinction, Divine Knockout, Hood: Outlaws & Legends, Wild Card Football e NBA 2K21. O Spellbreak já foi deixado de fora.
- [ ] **Jogos com poucas tags da Steam:** por exemplo, o Borderlands 2 aparece só como "Multijogador". Dá para ajustar à mão no site (Editar) ou no seed.

## Manutenção

- [ ] **Atualizar a lista base** quando a biblioteca da Epic mudar. Rode `npm run build:data:refresh` no PC com o Epic Games Launcher instalado.

Ideias de funcionalidades (lista do canal, promoções, lista de desejos…) estão no [TODO.md](../TODO.md).
