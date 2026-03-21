// ============================================================
// CONFIGURE YOUR REPO HERE
// ============================================================
export const REPO_CONFIG = {
  owner: 'Switz-000',
  repo:  'dripwiki',
  branch: 'main',
  rootPath: '',
  token: import.meta.env.VITE_GITHUB_TOKEN || null,
}

const BASE = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`

function headers() {
  const h = { Accept: 'application/vnd.github.v3+json' }
  if (REPO_CONFIG.token) h['Authorization'] = `Bearer ${REPO_CONFIG.token}`
  return h
}

// Fetch the full recursive file tree once and cache it.
let _treeCache = null

export async function getFileTree() {
  if (_treeCache) return _treeCache
  const url = `${BASE}/git/trees/${REPO_CONFIG.branch}?recursive=1`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json()
  // Filter to markdown files only, exclude Obsidian internals
  _treeCache = data.tree
    .filter(f =>
      f.type === 'blob' &&
      f.path.endsWith('.md') &&
      !f.path.startsWith('.obsidian') &&
      !f.path.includes('/.obsidian/') &&
      !f.path.startsWith('00 - Meta/') // exclude meta/templates
    )
  return _treeCache
}

// Fetch raw markdown content for a given file path
export async function fetchMarkdown(path) {
  const rawUrl = `https://raw.githubusercontent.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/${encodeURIComponent(path)}`
  const res = await fetch(rawUrl, { headers: headers() })
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

// Build a slug from a file path: strip extension, replace path separators
export function pathToSlug(path) {
  return path
    .replace(/\.md$/, '')
    .replace(/\//g, '__')
}

export function slugToPath(slug, tree) {
  // Direct match first
  const directMatch = tree.find(f => pathToSlug(f.path) === slug)
  if (directMatch) return directMatch.path
  // Try matching just by filename (for [[wikilinks]] that don't include path)
  const filename = slug.split('__').pop().toLowerCase()
  const fuzzy = tree.find(f => {
    const fname = f.path.replace(/\.md$/, '').split('/').pop().toLowerCase()
    return fname === filename
  })
  return fuzzy ? fuzzy.path : null
}

// Resolve a [[wikilink]] text to a slug
export function wikilinkToSlug(linkText, tree) {
  // Strip alias: [[Page Name|Alias]] -> "Page Name"
  const name = linkText.split('|')[0].trim()
  const nameLower = name.toLowerCase()

  // Try exact filename match first
  const exact = tree.find(f => {
    const fname = f.path.replace(/\.md$/, '').split('/').pop()
    return fname.toLowerCase() === nameLower
  })
  if (exact) return pathToSlug(exact.path)

  // Try partial path match
  const partial = tree.find(f =>
    f.path.replace(/\.md$/, '').toLowerCase().endsWith('/' + nameLower)
  )
  if (partial) return pathToSlug(partial.path)

  return null
}
