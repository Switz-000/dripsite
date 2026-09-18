// ============================================================
// ARTICLE URL SLUGS
// ============================================================
// An article's URL comes from its filename, not its folder, so moving a
// file between folders never changes its URL:
//   "01 - Susia/06 - Characters/Armadesh Versij.md"  ->  "armadesh-versij"
//   "Žartonnistan.md"                                 ->  "zartonnistan"
//
// This assumes article names are unique across the vault, which is the
// same assumption [[wikilinks]] already make.
//
// Nothing in this file touches the browser or Vite, so the build-time
// prerender script can import it from Node as well.

export function slugify(name) {
  return name
    .normalize('NFD')                 // "ž" becomes "z" plus a separate combining caron
    .replace(/[̀-ͯ]/g, '')  // drop the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')      // any run of spaces or punctuation becomes one hyphen
    .replace(/^-+|-+$/g, '')          // no hyphens at either end
}

export function pathToSlug(path) {
  const name = path.replace(/\.md$/, '').split('/').pop()
  return slugify(name)
}

// URL slug -> vault path, or null when nothing matches.
export function slugToPath(slug, tree) {
  // 1. Current format. Running slugify() on the incoming slug as well means
  //    hand-typed URLs like /article/Armadesh%20Versij resolve too.
  const wanted = slugify(safeDecode(slug))
  const match = tree.find(f => pathToSlug(f.path) === wanted)
  if (match) return match.path

  // 2. Old format (base64 of the full vault path), so links shared before
  //    the switch keep working. ArticlePage then swaps in the new URL.
  const decoded = legacySlugToVaultPath(slug)
  if (decoded) {
    const exact = tree.find(f => f.path === decoded + '.md' || f.path === decoded)
    if (exact) return exact.path
  }

  return null
}

function safeDecode(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

function legacySlugToVaultPath(slug) {
  try {
    const b64 = slug.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.length % 4 ? b64 + '===='.slice(b64.length % 4) : b64
    return decodeURIComponent(escape(atob(padded)))
  } catch {
    return null
  }
}
