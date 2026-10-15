# Central de Conhecimento

Espelho estático da página pública do Notion
[Central de Conhecimento](https://planet-packet-062.notion.site/Central-de-Conhecimento-3e6b8541e0fe80da872af510a9c9167a),
publicado no GitHub Pages com o widget de chat do assistente (n8n).

O Notion não permite ser embutido em iframe, então o script `scripts/build.mjs` lê a página e todas as
subpáginas pela API pública do Notion e gera HTML estático em `dist/` (com o visual do Notion via
`react-notion-x`), baixando as imagens e injetando o chat em todas as páginas.

## Atualização

O GitHub Actions (`.github/workflows/deploy.yml`) refaz o site:

- a cada push na `main`;
- a cada 6 horas (pega edições feitas no Notion);
- manualmente em **Actions → Publicar no GitHub Pages → Run workflow**.

## Configuração

Tudo fica em `site.config.mjs`: página raiz, URL do webhook do chat, cor e textos do widget.

## Rodar localmente

```sh
npm install
npm run build
npm run preview   # abre dist/ em http://localhost:3000
```
