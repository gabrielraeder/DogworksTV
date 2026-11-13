# TODO

Ideias de funcionalidades para o site, em ordem de prioridade. Para tarefas de configuração e conteúdo (chaves, deploy, revisão da lista), veja [docs/pendencias.md](docs/pendencias.md).

## Prioridade

- [x] **Privacidade e excluir conta.** Aviso no login de que nome e avatar da Steam aparecem em "Quem tem", e botão **Opções → Apagar minha conta** (`DELETE /api/me`). Apaga o usuário, as marcações, os favoritos, os jogos adicionados e as sessões.
- [x] **"Dá pra jogar com quem?"** Botão **Jogar com** na barra de filtros: escolha as pessoas e a lista mostra só os jogos que todas têm (marcados à mão ou na biblioteca Steam pública).
- [x] **Link direto para um jogo.** `games.dogworkstv.com/?jogo=deep-rock-galactic` abre o modal do jogo, e o modal tem o botão **Copiar link**. Jogos adicionados por alguém usam `?jogo=steam-<appid>`.
  - [ ] Depois: uma página por jogo com prévia no Discord (Open Graph) e um comando de bot na Twitch (`!jogo deep rock`).
- [x] **Promoções.** Selo "-90%" nos cards (com preço, loja e data de fim no tooltip), filtro **Em promoção** e ordenação **Maior desconto**. Uma consulta ao IsThereAnyDeal para a lista toda (`POST /api/deals`), com cache de 1 hora.
  - [x] Imagem automática para jogos que não estão na Steam, como os exclusivos da Epic (`GET /api/itad/image`).
- [x] **Lista do canal editável pelo site.** O dono (Steam ID em `OWNER_STEAM_IDS`) adiciona, edita, tira e restaura jogos que aparecem para todo mundo, sem mexer no `seed.json` nem fazer deploy. Em **Opções → Sugestões do pessoal**, vê os jogos que as pessoas adicionaram e põe na lista do canal com um clique.
- [x] **Lista de desejos da Steam.** Lida no login e no **Sincronizar biblioteca**, como a biblioteca. Funciona para quem tem os detalhes de jogos públicos no perfil Steam.
  - [x] "Quem quer" no modal do jogo, abaixo de "Quem tem"
  - [x] Selo de coração nos jogos da sua lista e filtro **Lista de desejos**
  - [x] Aviso no topo de quantos jogos da sua lista estão em promoção
  - [ ] No "Dá pra jogar com quem?": mostrar também os jogos que uma pessoa tem e as outras querem

- [x] **Biblioteca da Epic.** Não há API pública para ler a biblioteca de outra pessoa. Em **Opções → Marcar meus jogos**, a pessoa importa o cache do Epic Games Launcher (`catcache.bin`, lido só no navegador) ou marca vários jogos de uma vez em qualquer plataforma.

## Outras ideias

- [ ] **"Quero jogar"**: cada pessoa marca os jogos que quer jogar na live, com um ranking dos mais pedidos.
- [ ] **Selo "ao vivo"** quando o canal estiver no ar. Precisa registrar um app na Twitch.
- [ ] **Amigos da Steam** que têm cada jogo. Só funciona para quem deixa a lista de amigos pública.
