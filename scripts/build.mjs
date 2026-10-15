// Gera um site estático a partir da página pública do Notion e injeta o widget de chat (n8n).
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotionAPI } from 'notion-client'
import { getAllPagesInSpace, getBlockTitle, getPageProperty, defaultMapImageUrl, uuidToId } from 'notion-utils'
import { NotionRenderer } from 'react-notion-x'
import { Code } from 'react-notion-x/third-party/code'
import { Collection } from 'react-notion-x/third-party/collection'
import config from '../site.config.mjs'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'dist')
const ASSETS = path.join(OUT, 'assets')

const api = new NotionAPI()
const rootId = uuidToId(config.rootPageId)

const unwrap = (rec) => rec?.value?.value ?? rec?.value

// Notion às vezes devolve registros com valor aninhado ({ value: { value, role } }); o renderer espera um nível só.
function normalize(recordMap) {
  for (const table of ['block', 'collection', 'collection_view', 'notion_user']) {
    for (const [id, rec] of Object.entries(recordMap[table] ?? {})) {
      recordMap[table][id] = { ...rec, value: unwrap(rec) }
    }
  }
  return recordMap
}

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Pagina'

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ---------- crawl ----------
console.log('Buscando páginas no Notion...')
const pages = await getAllPagesInSpace(rootId, undefined, (id) => api.getPage(id).then(normalize), { concurrency: 3 })

// Mesmo formato de URL do notion.site ("Titulo-<id>"), então dá para trocar só o domínio.
const slugFor = new Map() // pageId (sem hífens) -> caminho sem extensão
for (const [id, recordMap] of Object.entries(pages)) {
  if (!recordMap) continue
  const pid = uuidToId(id)
  const block = recordMap.block[id]?.value
  slugFor.set(pid, pid === rootId ? 'index' : `${slugify(getBlockTitle(block, recordMap) || '')}-${pid}`)
}
const fileFor = (pid) => `${slugFor.get(pid)}.html`

// O GitHub Pages serve "Pagina.html" em "/Pagina", então os links ficam sem extensão.
const mapPageUrl = (id) => {
  const pid = uuidToId(id)
  if (pid === rootId) return './'
  return slugFor.has(pid) ? `./${slugFor.get(pid)}` : `https://www.notion.so/${pid}`
}

// ---------- imagens: baixa tudo para dist/assets para não depender de URLs assinadas que expiram ----------
const imageJobs = new Map() // url remota -> nome local
const imageExt = new Map() // nome local -> extensão descoberta

function mapImageUrl(url, block) {
  if (!url) return url
  if (url.startsWith('data:')) return url
  if (url.startsWith('/icons/') || url.startsWith('/images/')) url = `https://www.notion.so${url}`
  const remote = defaultMapImageUrl(url, block) ?? url
  if (!/^https?:/.test(remote)) return remote
  const name = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
  imageJobs.set(remote, name)
  return imageExt.has(name) ? `./assets/${name}${imageExt.get(name)}` : remote
}

const extFromType = (t = '') =>
  ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif' })[t.split(';')[0].trim()] ?? '.img'

async function downloadImages() {
  await fs.mkdir(ASSETS, { recursive: true })
  for (const [remote, name] of imageJobs) {
    if (imageExt.has(name)) continue
    try {
      const res = await fetch(remote)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ext = extFromType(res.headers.get('content-type'))
      await fs.writeFile(path.join(ASSETS, name + ext), Buffer.from(await res.arrayBuffer()))
      imageExt.set(name, ext)
    } catch (err) {
      console.warn(`  ! imagem não baixada (${err.message}): ${remote.slice(0, 100)}`)
    }
  }
}

// ---------- render ----------
function renderPage(recordMap) {
  return renderToStaticMarkup(
    React.createElement(NotionRenderer, {
      recordMap,
      fullPage: true,
      darkMode: false,
      rootPageId: rootId,
      rootDomain: undefined,
      previewImages: false,
      showTableOfContents: false,
      mapPageUrl,
      mapImageUrl,
      components: { Code, Collection, nextLink: undefined },
    })
  )
}

// Widget próprio (static/chat.js) que fala com o Chat Trigger do n8n; textos em site.config.mjs.
const chatWidget = `
<script>window.CHAT_CONFIG = ${JSON.stringify(config.chat).replace(/</g, '\\u003c')}</script>
<script src="./assets/chat.js" defer></script>`

// ---------- tema claro/escuro ----------
// Aplicado antes da primeira pintura para não piscar: preferência salva > tema do sistema.
const themeInit = `<script>
  (function () {
    var t
    try { t = localStorage.getItem('theme') } catch (e) {}
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = t
  })()
</script>`

const sunIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
const moonIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'

const themeToggle = `
<button type="button" class="theme-toggle" aria-label="Alternar tema claro/escuro">
  <span class="theme-toggle-dark">${moonIcon}</span><span class="theme-toggle-light">${sunIcon}</span>
</button>
<script>
  (function () {
    var root = document.documentElement
    var btn = document.querySelector('.theme-toggle')
    function apply(t) {
      root.dataset.theme = t
      btn.title = t === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'
      // Ícones nativos do Notion têm versões por tema
      document.querySelectorAll('img[src*="/icons/"][src*="mode="]').forEach(function (img) {
        img.src = img.src.replace(/mode=(light|dark)/, 'mode=' + t)
      })
    }
    apply(root.dataset.theme)
    btn.addEventListener('click', function () {
      var t = root.dataset.theme === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('theme', t) } catch (e) {}
      apply(t)
    })
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      var saved
      try { saved = localStorage.getItem('theme') } catch (err) {}
      if (!saved) apply(e.matches ? 'dark' : 'light')
    })
  })()
</script>`

// Prefixa cada seletor de um CSS simples (sem aninhamento além de @media) com um escopo.
const scopeCss = (css, scope) =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[{}])(\s*)([^{}@]+?)\s*\{/g, (_, brace, ws, selectors) =>
    `${brace}${ws}${selectors.split(',').map((s) => `${scope} ${s.trim()}`).join(', ')} {`)

async function writeStyles() {
  // O CSS do react-notion-x usa a classe .dark-mode; trocamos pelo atributo no <html> para alternar sem re-render.
  const notionCss = await fs.readFile(require.resolve('react-notion-x/styles.css'), 'utf8')
  await fs.writeFile(path.join(ASSETS, 'notion.css'), notionCss.replaceAll('.dark-mode', 'html[data-theme="dark"]'))

  const prismLight = await fs.readFile(require.resolve('prismjs/themes/prism-coy.css'), 'utf8')
  const prismDark = await fs.readFile(require.resolve('prismjs/themes/prism-tomorrow.css'), 'utf8')
  await fs.writeFile(path.join(ASSETS, 'prism.css'),
    scopeCss(prismLight, 'html:not([data-theme="dark"])') + '\n' + scopeCss(prismDark, 'html[data-theme="dark"]'))

  for (const f of ['site.css', 'chat.css', 'chat.js']) await fs.copyFile(path.join(ROOT, 'static', f), path.join(ASSETS, f))
}

function htmlDocument({ title, body, description, favicon }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(title)}</title>
${themeInit}
${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}" />` : ''}
<link rel="stylesheet" href="./assets/notion.css" />
<link rel="stylesheet" href="./assets/prism.css" />
<link rel="stylesheet" href="./assets/site.css" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="./assets/chat.css" />
</head>
<body>
${body}
${themeToggle}
${chatWidget}
</body>
</html>
`
}

async function build() {
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(ASSETS, { recursive: true })

  // Passo 1: renderiza para coletar as imagens; passo 2: renderiza com os caminhos locais.
  for (const recordMap of Object.values(pages)) if (recordMap) renderPage(recordMap)
  console.log(`Baixando ${imageJobs.size} imagens...`)
  await downloadImages()

  for (const [id, recordMap] of Object.entries(pages)) {
    if (!recordMap) continue
    const pid = uuidToId(id)
    const block = recordMap.block[id]?.value
    const title = getBlockTitle(block, recordMap) || config.siteName
    const icon = block?.format?.page_icon
    const favicon = icon && !/^\p{Extended_Pictographic}/u.test(icon) ? mapImageUrl(icon, block) : undefined
    const html = htmlDocument({
      title: pid === rootId ? title : `${title} · ${config.siteName}`,
      description: getPageProperty('Description', block, recordMap) || config.description,
      favicon,
      body: renderPage(recordMap),
    })
    await fs.writeFile(path.join(OUT, fileFor(pid)), html)
    console.log(`  ✓ ${fileFor(pid)}`)
  }

  await writeStyles()
  await fs.writeFile(path.join(OUT, '.nojekyll'), '')
  console.log(`Pronto: ${slugFor.size} páginas em dist/`)
}

await build()
