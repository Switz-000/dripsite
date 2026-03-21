// ============================================================
// REPO CONFIGURATION
// ============================================================
export const REPO_CONFIG = {
  owner:      'Switz-000',
  repo:       'dripwiki',
  branch:     'main',
  rootPath:   '',
  imagesPath: '00 - Meta/Images',
  token:      import.meta.env.VITE_GITHUB_TOKEN || null,
}

const BASE = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])

export function isImageFilename(name) {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export function imageUrl(filename) {
  const path = `${REPO_CONFIG.imagesPath}/${filename}`
  return (
    `https://raw.githubusercontent.com/` +
    `${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/` +
    path.split('/').map(encodeURIComponent).join('/')
  )
}

function authHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json' }
  if (REPO_CONFIG.token) h['Authorization'] = `Bearer ${REPO_CONFIG.token}`
  return h
}

// ── Slug encoding ─────────────────────────────────────────────
// We use URL-safe base64 to encode vault paths into clean URL slugs.
// This avoids all issues with spaces, special chars, and URL encoding.
// e.g. "01 - Susia/06 - Characters/Armadesh Versij"
//   -> "MDEgLSBTdXNpYS8wNiAtIENoYXJhY3RlcnMvQXJtYWRlc2ggVmVyc2lq"

export function pathToSlug(path) {
  // Remove .md extension, then base64 encode
  const clean = path.replace(/\.md$/, '')
  return btoa(unescape(encodeURIComponent(clean)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function slugToVaultPath(slug) {
  try {
    const padded = slug.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 ? padded + '===='.slice(padded.length % 4) : padded
    return decodeURIComponent(escape(atob(pad)))
  } catch {
    return null
  }
}

// ── File tree ─────────────────────────────────────────────────
let _treeCache = null

export async function getFileTree() {
  if (_treeCache) return _treeCache
  const url = `${BASE}/git/trees/${REPO_CONFIG.branch}?recursive=1`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`GitHub API error ${res.status} — check repo name and branch`)
  const data = await res.json()
  _treeCache = data.tree.filter(f =>
    f.type === 'blob' &&
    f.path.endsWith('.md') &&
    !f.path.startsWith('.obsidian') &&
    !f.path.includes('/.obsidian/') &&
    !f.path.startsWith('00 - Meta/')
  )
  return _treeCache
}

// ── Markdown fetching ─────────────────────────────────────────
export async function fetchMarkdown(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://raw.githubusercontent.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/${encoded}`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Could not load "${path}" (${res.status})`)
  return res.text()
}

// ── Path lookup ───────────────────────────────────────────────
export function slugToPath(slug, tree) {
  // First try decoding as base64 slug
  const decoded = slugToVaultPath(slug)
  if (decoded) {
    // Try exact match (with and without .md)
    const exact = tree.find(f =>
      f.path === decoded + '.md' || f.path === decoded
    )
    if (exact) return exact.path
  }

  // Fallback: try treating slug as a filename fragment (legacy support)
  const lower = slug.toLowerCase()
  const fuzzy = tree.find(f =>
    f.path.replace(/\.md$/, '').split('/').pop().toLowerCase() === lower
  )
  return fuzzy ? fuzzy.path : null
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
