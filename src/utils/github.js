import { pathToSlug, slugToPath } from './slugs.js'

// ============================================================
// REPO CONFIGURATION
// ============================================================
export const REPO_CONFIG = {
  owner:      'Switz-000',
  repo:       'dripwiki',
  branch:     'main',
  rootPath:   '',
  imagesPath: '00 - Meta/Images',
  // import.meta.env only exists inside Vite; the ?. keeps this file
  // importable from the plain-Node build scripts in scripts/
  token:      import.meta.env?.VITE_GITHUB_TOKEN || null,
}

// Which vault files count as articles. Shared by the browser (the file
// tree below) and the build scripts, so both see the same set.
export function isArticlePath(path) {
  return (
    path.endsWith('.md') &&
    !path.split('/').some(part => part.startsWith('.')) &&   // .obsidian, .github, .trash
    !path.startsWith('00 - Meta/')
  )
}

const BASE = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])

export function isImageFilename(name) {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export function rawFileUrl(path) {
  return (
    `https://raw.githubusercontent.com/` +
    `${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/` +
    path.split('/').map(encodeURIComponent).join('/')
  )
}

export function imageUrl(filename) {
  return rawFileUrl(`${REPO_CONFIG.imagesPath}/${filename}`)
}

function authHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json' }
  if (REPO_CONFIG.token) h['Authorization'] = `Bearer ${REPO_CONFIG.token}`
  return h
}

// ── Slugs ─────────────────────────────────────────────────────
// Slug logic lives in ./slugs.js (no browser or Vite dependencies, so the
// prerender script can use it). Re-exported here so existing imports work.
export { pathToSlug, slugToPath }

// ── File tree ─────────────────────────────────────────────────
// One recursive tree fetch feeds both the markdown file tree and the
// country flag map (images live under 00 - Meta/, which the md filter drops).
let _treeCache = null
let _flagMapCache = null
let _rawTreePending = null

export const FLAGS_PATH = `${REPO_CONFIG.imagesPath}/Country Flags`

export function buildFlagMap(rawTree) {
  const map = new Map()
  for (const f of rawTree) {
    if (f.type !== 'blob') continue
    if (!f.path.startsWith(FLAGS_PATH + '/')) continue
    const filename = f.path.slice(FLAGS_PATH.length + 1)
    if (filename.includes('/') || !isImageFilename(filename)) continue
    const name = filename.slice(0, filename.lastIndexOf('.'))
    map.set(name.toLowerCase().trim(), rawFileUrl(f.path))
  }
  return map
}

async function loadTrees() {
  if (!_rawTreePending) {
    const url = `${BASE}/git/trees/${REPO_CONFIG.branch}?recursive=1`
    _rawTreePending = fetch(url, { headers: authHeaders() })
      .then(res => {
        if (!res.ok) throw new Error(`GitHub API error ${res.status} — check repo name and branch`)
        return res.json()
      })
      .then(data => {
        _flagMapCache = buildFlagMap(data.tree)
        _treeCache = data.tree.filter(f => f.type === 'blob' && isArticlePath(f.path))
      })
      .catch(e => {
        _rawTreePending = null
        throw e
      })
  }
  return _rawTreePending
}

export async function getFileTree() {
  if (_treeCache) return _treeCache
  await loadTrees()
  return _treeCache
}

// ── Country flags ─────────────────────────────────────────────
// Map of lowercase country name -> raw image URL, built from the
// contents of "00 - Meta/Images/Country Flags" in the vault repo.
export async function getFlagMap() {
  if (_flagMapCache) return _flagMapCache
  await loadTrees()
  return _flagMapCache
}

export function flagUrlFor(name, flagMap) {
  if (!name || !flagMap) return null
  return flagMap.get(String(name).toLowerCase().trim()) || null
}

// ── Markdown fetching ─────────────────────────────────────────
export async function fetchMarkdown(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://raw.githubusercontent.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/${encoded}`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Could not load "${path}" (${res.status})`)
  return res.text()
}

// ── Wikilink resolution ───────────────────────────────────────
export function wikilinkToSlug(linkText, tree) {
  const name = linkText.split('|')[0].trim()
  const nameLower = name.toLowerCase()

  // Exact filename match
  const exact = tree.find(f => {
    const fname = f.path.replace(/\.md$/, '').split('/').pop()
    return fname.toLowerCase() === nameLower
  })
  if (exact) return pathToSlug(exact.path)

  // Partial path match (ends with /name)
  const partial = tree.find(f =>
    f.path.replace(/\.md$/, '').toLowerCase().endsWith('/' + nameLower)
  )
  if (partial) return pathToSlug(partial.path)

  return null
}
