// Gera um site estático a partir da página pública do Notion e injeta o widget de chat do n8n.
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
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'pagina'

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ---------- crawl ----------
console.log('Buscando páginas no Notion...')
const pages = await getAllPagesInSpace(rootId, undefined, (id) => api.getPage(id).then(normalize), { concurrency: 3 })

const fileFor = new Map() // pageId (sem hífens) -> nome do arquivo
for (const [id, recordMap] of Object.entries(pages)) {
  if (!recordMap) continue
  const pid = uuidToId(id)
  const block = recordMap.block[id]?.value
  fileFor.set(pid, pid === rootId ? 'index.html' : `${slugify(getBlockTitle(block, recordMap) || '')}-${pid.slice(0, 8)}.html`)
}

const mapPageUrl = (id) => {
  const pid = uuidToId(id)
  return fileFor.has(pid) ? `./${fileFor.get(pid)}` : `https://www.notion.so/${pid}`
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

const chatWidget = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@n8n/chat@${config.chat.version}/dist/style.css" />
<style>
  :root {
    --chat--color-primary: ${config.chat.primaryColor};
    --chat--color-primary-shade-50: ${config.chat.primaryColor};
    --chat--color-primary-shade-100: ${config.chat.primaryColor};
    --chat--toggle--background: ${config.chat.primaryColor};
    --chat--toggle--hover--background: ${config.chat.primaryColor};
    --chat--toggle--active--background: ${config.chat.primaryColor};
    --chat--window--width: 400px;
    --chat--window--height: 600px;
  }
</style>
<script type="module">
  import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat@${config.chat.version}/dist/chat.bundle.es.js'
  createChat(${JSON.stringify({
    webhookUrl: config.chat.webhookUrl,
    mode: 'window',
    showWelcomeScreen: false,
    defaultLanguage: 'en',
    loadPreviousSession: true,
    initialMessages: config.chat.initialMessages,
    i18n: { en: config.chat.i18n },
  }, null, 2)})
</script>`

function htmlDocument({ title, body, description, favicon }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}" />` : ''}
<link rel="stylesheet" href="./assets/notion.css" />
<link rel="stylesheet" href="./assets/prism.css" />
<link rel="stylesheet" href="./assets/site.css" />
</head>
<body>
${body}
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
    await fs.writeFile(path.join(OUT, fileFor.get(pid)), html)
    console.log(`  ✓ ${fileFor.get(pid)}`)
  }

  await fs.copyFile(require.resolve('react-notion-x/styles.css'), path.join(ASSETS, 'notion.css'))
  await fs.copyFile(require.resolve('prismjs/themes/prism-coy.css'), path.join(ASSETS, 'prism.css'))
  await fs.copyFile(path.join(ROOT, 'static', 'site.css'), path.join(ASSETS, 'site.css'))
  await fs.writeFile(path.join(OUT, '.nojekyll'), '')
  console.log(`Pronto: ${fileFor.size} páginas em dist/`)
}

await build()
