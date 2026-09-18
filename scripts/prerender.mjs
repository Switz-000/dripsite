// ============================================================
// PRERENDER (runs after `vite build`, see "build" in package.json)
// ============================================================
// Turns the single-page app into real HTML pages that crawlers, link
// previews and AI fetchers can read without running any JavaScript:
//
//   1. loads the dripwiki vault (scripts/vault.mjs)
//   2. compiles src/entry-server.jsx so Node can render the site's own
//      React components
//   3. renders the landing page, the wiki home, browse, the map and every
//      article into dist/, each with its own title, description and canonical link,
//      and with the data it was built from baked in, so the app starts
//      from what's on screen instead of fetching it again
//   4. writes robots.txt and sitemap.xml
//
// Everything that isn't prerendered (/search, old links, unknown URLs)
// gets dist/spa.html, the plain app shell, via the rewrites in vercel.json.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { loadVault } from './vault.mjs'
import { pathToSlug } from '../src/utils/slugs.js'
import { SITE, LANDING, THEME, BLOCKED_CRAWLERS } from '../src/config.js'

const started = Date.now()
const DIST = path.resolve('dist')
const SHELL = path.join(DIST, 'index.html')
if (!fs.existsSync(SHELL)) throw new Error('dist/index.html not found. Run `vite build` first.')

// ── 1. Vault ──────────────────────────────────────────────────
const vault = await loadVault()

// slug -> vault path. When two articles share a slug, the first one wins,
// which is also what the site does when it resolves a URL.
const bySlug = new Map()
for (const p of vault.articles) {
  const slug = pathToSlug(p)
  if (bySlug.has(slug)) {
    console.warn(`prerender: "${p}" has the same slug as "${bySlug.get(slug)}" (/article/${slug}); only the first is reachable`)
    continue
  }
  bySlug.set(slug, p)
}

// ── 2. Server-side renderer ───────────────────────────────────
await build({
  logLevel: 'warn',
  build: { ssr: 'src/entry-server.jsx', outDir: '.ssr', emptyOutDir: true },
})
const ssr = await import(pathToFileURL(path.resolve('.ssr/entry-server.js')).href)

const tree = vault.articles
const treeObjects = tree.map(p => ({ path: p, type: 'blob' }))
const flags = [...ssr.buildFlagMap(vault.files.map(p => ({ path: p, type: 'blob' })))]
const license = vault.exists('LICENSE') ? vault.read('LICENSE') : null

// ── 3. Pages ──────────────────────────────────────────────────
const template = fs.readFileSync(SHELL, 'utf8')
const shellTitle = template.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? SITE.name

// The theme colours normally arrive with main.jsx; inlining them stops a
// flash of the default light palette before the JS loads
const themeStyle = '<style>:root{' + Object.entries(THEME)
  .filter(([, v]) => v !== null && v !== undefined)
  .map(([k, v]) => `--${k}:${v}`)
  .join(';') + '}</style>'

// The plain shell, for every URL that isn't prerendered
fs.writeFileSync(path.join(DIST, 'spa.html'), template.replace('</head>', `  ${themeStyle}\n  </head>`))

function writePage(url, { title, description, type = 'website', data }) {
  ssr.primeVault(data)
  const body = ssr.render(url)
  const canonical = SITE.url + url
  const head = [
    `<title>${esc(title)}</title>`,
    description && `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    themeStyle,
  ].filter(Boolean).map(tag => `    ${tag}`).join('\n')

  const html = template
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', `${head}\n  </head>`)
    .replace('<div id="root"></div>',
      `<div id="root">${body}</div>\n    <script id="preload" type="application/json">${json(data)}</script>`)
  if (!html.includes('id="preload"')) throw new Error('prerender: could not find <div id="root"></div> in dist/index.html')

  const file = url === '/' ? 'index.html' : `${url.slice(1)}/index.html`
  fs.mkdirSync(path.dirname(path.join(DIST, file)), { recursive: true })
  fs.writeFileSync(path.join(DIST, file), html)
}

// Articles
let written = 0
const failed = []
for (const [slug, articlePath] of bySlug) {
  try {
    const article = ssr.buildArticle(slug, articlePath, vault.read(articlePath), treeObjects)
    writePage(`/article/${slug}`, {
      title: `${article.title} — ${SITE.name}`,   // same format as ArticlePage
      description: describe(article),
      type: 'article',
      data: { tree, flags, article },
    })
    written++
  } catch (e) {
    // One broken article shouldn't take the site down; its URL falls back
    // to the app shell, which renders it in the browser as before
    failed.push(`${articlePath}: ${e.message}`)
  }
}
if (failed.length) console.warn(`prerender: ${failed.length} article(s) left to the browser:\n  ` + failed.join('\n  '))
if (written === 0) throw new Error('prerender: no article could be rendered')

// Wiki home (in-universe)
writePage('/wiki', { title: shellTitle, description: SITE.description, data: { tree, flags } })

// Browse (every article, grouped) and the map (every country): the pages a
// reader without JavaScript, like an AI fetcher, uses to find everything else
writePage('/browse', { title: shellTitle, description: SITE.description, data: { tree, flags } })
writePage('/map', { title: shellTitle, description: SITE.description, data: { tree, flags } })

// Landing page (out of universe). Written last: it replaces dist/index.html,
// which everything above used as the template.
writePage('/', {
  title: LANDING.pageTitle,
  description: LANDING.description?.startsWith('TODO') ? null : LANDING.description,
  data: { license },
})

// ── 4. robots.txt and sitemap.xml ─────────────────────────────
const robots = [
  '# Generated at build time by scripts/prerender.mjs',
  '# AI training crawlers are blocked, in line with the text and data',
  '# mining reservation in the LICENSE of the dripwiki repository.',
  '',
  ...BLOCKED_CRAWLERS.map(bot => `User-agent: ${bot}`),
  'Disallow: /',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${SITE.url}/sitemap.xml`,
  '',
].join('\n')
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots)

const pages = ['/', '/wiki', '/browse', '/map', ...[...bySlug.keys()].sort().map(s => `/article/${s}`)]
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(p => `  <url><loc>${SITE.url}${p}</loc></url>`),
  '</urlset>',
  '',
].join('\n')
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap)

console.log(`prerender: ${written} of ${bySlug.size} articles, plus /, /wiki, /browse and /map, in ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(`prerender: robots.txt (${BLOCKED_CRAWLERS.length} crawlers blocked), sitemap.xml (${pages.length} URLs)`)

// ── helpers ───────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// JSON that is safe inside <script>: no "</script>" can close it early
function json(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

// A plain-text description of an article for search results and previews
function describe(article) {
  const source = typeof article.meta.summary === 'string' && article.meta.summary.trim()
    ? article.meta.summary
    : article.summary
  if (!source) return null
  const text = String(source)
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')   // [[Target|Label]] -> Label
    .replace(/<[^>]+>/g, '')                          // stray HTML
    .replace(/[*_`#>]/g, '')                          // markdown marks
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length <= 160 ? text : text.slice(0, 157).replace(/\s+\S*$/, '') + '...'
}
