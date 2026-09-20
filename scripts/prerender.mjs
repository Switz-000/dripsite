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
//   4. writes robots.txt, and sitemap.xml with the date each page last
//      changed
//   5. on production builds, tells IndexNow which pages are new or changed
//
// /search gets dist/spa.html, the plain app shell, via the rewrites in
// vercel.json. Any other URL that isn't a file gets dist/404.html with a
// real 404 status. That page is the full app, so in the browser it still
// sorts out what it can: old base64 article links redirect to the new URL.

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { loadVault } from './vault.mjs'
import { pathToSlug } from '../src/utils/slugs.js'
import { SITE, LANDING, THEME, BLOCKED_CRAWLERS, INDEXNOW_KEY } from '../src/config.js'

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
// Written by generate_chronology.py in dripwiki. A vault without it simply
// has no chronology page.
const chronology = vault.exists('chronology.json') ? JSON.parse(vault.read('chronology.json')) : null
if (!chronology) console.warn('prerender: no chronology.json in the vault, /chronology not written')
const flagMap = new Map(flags)

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

// url -> fingerprint of what the page shows, for IndexNow (section 5).
// An article's fingerprint covers the article only, not the list of every
// other article baked into its page, so adding one article doesn't mark
// all the others as changed.
const fingerprints = {}

// `image` is the link-preview picture. `file` overrides where the page is
// written. `index: false` keeps a page out of search engines and out of
// the IndexNow and sitemap bookkeeping.
function writePage(url, { title, description, type = 'website', data, image = SITE.image, file, index = true, fingerprint = data.article ?? data }) {
  if (index) {
    fingerprints[url] = crypto.createHash('sha1')
      .update(JSON.stringify({ title, description, image, fingerprint }))
      .digest('hex').slice(0, 12)
  }
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
    image && `<meta property="og:image" content="${esc(image)}">`,
    image && `<meta name="twitter:card" content="summary_large_image">`,
    !index && `<meta name="robots" content="noindex">`,
    themeStyle,
  ].filter(Boolean).map(tag => `    ${tag}`).join('\n')

  const html = template
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', `${head}\n  </head>`)
    .replace('<div id="root"></div>',
      `<div id="root">${body}</div>\n    <script id="preload" type="application/json">${json(data)}</script>`)
  if (!html.includes('id="preload"')) throw new Error('prerender: could not find <div id="root"></div> in dist/index.html')

  file ??= url === '/' ? 'index.html' : `${url.slice(1)}/index.html`
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
      image: ssr.infoboxImageOf(article) || ssr.countryFlagOf(article, flagMap) || SITE.image,
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

// Not found page, served by Vercel with a 404 status for unknown URLs.
// The app renders its own not-found page for any URL it doesn't know.
writePage('/404', { title: shellTitle, description: null, data: { tree, flags }, file: '404.html', index: false })

// Chronology, from chronology.json rather than from CHRONOLOGY.md: the
// markdown is a rendering, the JSON is the data
if (chronology) {
  writePage('/chronology', { title: shellTitle, description: SITE.description, data: { tree, flags, chronology } })
}

// Landing page (out of universe). Written last: it replaces dist/index.html,
// which everything above used as the template.
writePage('/', {
  title: LANDING.pageTitle,
  description: LANDING.description?.startsWith('TODO') ? null : LANDING.description,
  data: { license },
  fingerprint: { license, LANDING },   // its text lives in src/config.js
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

// Last-changed dates come from the live dist/indexnow.json (section 5):
// `seen` holds each page's fingerprint and the date it first appeared.
// Same fingerprint as live, same date; otherwise the page changed today.
const live = await fetchLiveIndexNowFile()
const today = new Date().toISOString().slice(0, 10)
const seen = {}
for (const [url, fingerprint] of Object.entries(fingerprints)) {
  const before = live.seen[url]
  seen[url] = before?.[0] === fingerprint ? before : [fingerprint, today]
}

const pages = ['/', '/wiki', '/browse', '/map', ...(chronology ? ['/chronology'] : []),
  ...[...bySlug.keys()].sort().map(s => `/article/${s}`)]
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(p => `  <url><loc>${SITE.url}${p}</loc>${seen[p] ? `<lastmod>${seen[p][1]}</lastmod>` : ''}</url>`),
  '</urlset>',
  '',
].join('\n')
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap)

console.log(`prerender: ${written} of ${bySlug.size} articles, plus /, /wiki, /browse, /map${chronology ? ' and /chronology' : ''}, in ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(`prerender: robots.txt (${BLOCKED_CRAWLERS.length} crawlers blocked), sitemap.xml (${pages.length} URLs)`)

// ── 5. IndexNow ───────────────────────────────────────────────
// IndexNow tells Bing (and DuckDuckGo, which uses Bing's index, plus
// Yandex, Seznam and Naver) which URLs are new, changed or gone, so they
// get crawled first. Unlike Google's "Request indexing" it has no daily cap.
//
// Every build saves a fingerprint of each page in dist/indexnow.json. A
// production build downloads the live copy of that file, from the build
// it is about to replace, and submits only the URLs whose fingerprint
// differs, plus the ones that disappeared. With no usable live copy,
// everything counts as new.
//
// If IndexNow doesn't accept the submission, this build ships the live
// fingerprints for those URLs instead of the new ones, so the next build
// sees them as still changed and tries again. A new key always fails once
// like this (HTTP 403), because its key file only goes live with the build
// that submits it.
//
// The file is { v: 2, pages: { url: fingerprint }, seen: { url: [fingerprint,
// date] } }. `pages` is what IndexNow has accepted, `seen` feeds the
// sitemap dates (section 4). The first version was a plain map and was
// saved even though its submission failed, so a live file without v: 2
// counts as nothing submitted yet.
//
// Submitting never fails the build: if IndexNow is down, the pages still
// ship and the next build retries.
const INDEXNOW_FILE = path.join(DIST, 'indexnow.json')
fs.writeFileSync(path.join(DIST, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY)
fs.writeFileSync(INDEXNOW_FILE, JSON.stringify({ v: 2, pages: fingerprints, seen }))

if (process.env.VERCEL_ENV === 'production') {
  await submitToIndexNow().catch(e => console.warn(`indexnow: nothing submitted, ${e.message}`))
} else {
  console.log(`indexnow: ${Object.keys(fingerprints).length} fingerprints saved, nothing submitted (not a production build)`)
}

// The live site's indexnow.json, from the build this one is about to replace
async function fetchLiveIndexNowFile() {
  try {
    const res = await fetch(`${SITE.url}/indexnow.json`, { signal: AbortSignal.timeout(10_000) })
    const file = res.ok ? await res.json() : null
    if (file?.v === 2) return { pages: file.pages, seen: file.seen ?? {} }
  } catch {
    // Not there yet, or not reachable: start from nothing
  }
  return { pages: {}, seen: {} }
}

async function submitToIndexNow() {
  const submitted = live.pages
  const changed = Object.keys(fingerprints).filter(url => submitted[url] !== fingerprints[url])
  const removed = Object.keys(submitted).filter(url => !(url in fingerprints))
  if (!changed.length && !removed.length) {
    console.log('indexnow: no page changed since the live build, nothing submitted')
    return
  }

  let status
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(SITE.url).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE.url}/${INDEXNOW_KEY}.txt`,
        urlList: [...changed, ...removed].map(url => SITE.url + url),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
  } catch (e) {
    status = e.message
  }

  // 200 accepted, 202 accepted but the key is still being checked
  const counts = `${changed.length} new or changed and ${removed.length} removed URL(s)`
  const reason = typeof status === 'number' ? `HTTP ${status}` : status
  if (status === 200 || status === 202) {
    console.log(`indexnow: ${counts} submitted, ${reason}`)
    return
  }
  const kept = { ...fingerprints }
  for (const url of changed) {
    if (url in submitted) kept[url] = submitted[url]
    else delete kept[url]
  }
  for (const url of removed) kept[url] = submitted[url]
  fs.writeFileSync(INDEXNOW_FILE, JSON.stringify({ v: 2, pages: kept, seen }))
  console.warn(`indexnow: ${counts} not accepted (${reason}), the next build tries them again`)
}

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
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')           // table separator rows
    .replace(/\|/g, ' ')                               // table cells -> plain text
    .replace(/<[^>]+>/g, '')                          // stray HTML
    .replace(/[*_`#>]/g, '')                          // markdown marks
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length <= 160 ? text : text.slice(0, 157).replace(/\s+\S*$/, '') + '...'
}
