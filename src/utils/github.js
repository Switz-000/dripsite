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

// Which vault files count as articles. One rule for the browser and the
// build, applied by the vault module (src/vault).
export function isArticlePath(path) {
  return (
    path.endsWith('.md') &&
    !path.split('/').some(part => part.startsWith('.')) &&   // .obsidian, .github, .trash
    !path.startsWith('00 - Meta/')
  )
}

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

// ── Slugs ─────────────────────────────────────────────────────
// Slug logic lives in ./slugs.js (no browser or Vite dependencies, so the
// prerender script can use it). Re-exported here so existing imports work.
export { pathToSlug, slugToPath }

// ── Country flags ─────────────────────────────────────────────
// Map of lowercase country name -> raw image URL, built from the
// contents of "00 - Meta/Images/Country Flags" in the vault repo.
// Reading the vault itself (file list, article text) is src/vault's job.
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

export function flagUrlFor(name, flagMap) {
  if (!name || !flagMap) return null
  return flagMap.get(String(name).toLowerCase().trim()) || null
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
