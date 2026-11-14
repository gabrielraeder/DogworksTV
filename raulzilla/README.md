# Raulzilla

Página do Raul Gutierrez (Raulzilla): apresentação, portfolios, Estúdio Raed Wulf, Warriors & Castles, lives, redes sociais e o projeto Aunoh. Recriada a partir de <https://raulzilla.carrd.co/>, com os mesmos textos, imagens, cores e fontes, em HTML e CSS próprios (sem o Carrd).

Endereço: <https://dogworkstv.com/raulzilla/>

## Estrutura

- `public/raulzilla/index.html`: a página.
- `public/raulzilla/styles.css`: o visual.
- `public/raulzilla/assets/`: imagens. `bg.svg` é o fundo animado de blocos, e `card.jpg` é a imagem de prévia ao compartilhar o link.
- `public/index.html`: só leva de `/` para `/raulzilla/` no endereço `workers.dev`.

Os arquivos ficam em `public/raulzilla/` para que a rota `dogworkstv.com/raulzilla*` sirva cada arquivo no mesmo caminho, sem código no Worker.

Para mudar um texto ou link, edite o `index.html`. Os botões são links `<a class="btn">`, e o ícone vem de `<use href="#i-…">`, desenhado no `<svg class="sprite">` no começo da página.

## Rodar e publicar

```bash
cd raulzilla
npm install
npm run dev      # http://localhost:8787/raulzilla/
npm run deploy   # publica o Worker dogworks-raulzilla
```

No Cloudflare (uma vez):

1. Workers & Pages → Create → Import a repository → `DogworksTV`, com **Root directory** = `raulzilla` e **Deploy command** = `npm run deploy`.
2. No Worker `dogworks-raulzilla` → Settings → Domains & Routes → Add → Route `dogworkstv.com/raulzilla*`, zona `dogworkstv.com`.
