# TODO

Ideias de funcionalidades para o site, em ordem de prioridade. Para tarefas de configuração e conteúdo (chaves, deploy, revisão da lista), veja [docs/pendencias.md](docs/pendencias.md).

## Prioridade

- [x] **Privacidade e excluir conta.** Aviso no login de que nome e avatar da Steam aparecem em "Quem tem", e botão **Opções → Apagar minha conta** (`DELETE /api/me`). Apaga o usuário, as marcações, os favoritos, os jogos adicionados e as sessões.
- [ ] **"Dá pra jogar com quem?"** Escolher algumas pessoas e ver só os jogos que todas têm. O banco já sabe quem tem cada jogo, então é quase só tela.
- [ ] **Link direto para um jogo.** `games.dogworkstv.com/?jogo=deep-rock-galactic` abre o modal do jogo, com um botão "Copiar link".
  - Depois: uma página por jogo com prévia no Discord (Open Graph) e um comando de bot na Twitch (`!jogo deep rock`).
- [ ] **Promoções.** Selo "-60%" nos cards e filtro "Em promoção", consultando vários jogos de uma vez no IsThereAnyDeal e guardando em cache por algumas horas.
  - Junto: imagem automática para jogos só da Epic, usando as imagens do IsThereAnyDeal (`assets.banner400`).
- [ ] **Lista do canal editável pelo site.** Só o dono (pelo Steam ID) adiciona, edita e remove jogos que aparecem para todo mundo, sem mexer no `seed.json` nem fazer deploy. Os jogos adicionados pelas outras pessoas viram sugestões para o dono aprovar.
- [ ] **Lista de desejos da Steam.** Ler a lista de cada pessoa, como já é feito com a biblioteca. Funciona para quem tem os detalhes de jogos públicos no perfil Steam.
  - "Quem quer" no modal do jogo, ao lado de "Quem tem"
  - Selo "Na sua lista de desejos" e filtro
  - Avisar quando um jogo da lista de desejos estiver em promoção (combina com o item de promoções)
  - No "Dá pra jogar com quem?": mostrar também os jogos que uma pessoa tem e as outras querem

## Outras ideias

- [ ] **"Quero jogar"**: cada pessoa marca os jogos que quer jogar na live, com um ranking dos mais pedidos.
- [ ] **Selo "ao vivo"** quando o canal estiver no ar. Precisa registrar um app na Twitch.
- [ ] **Amigos da Steam** que têm cada jogo. Só funciona para quem deixa a lista de amigos pública.
