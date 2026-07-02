import { slugToPath, fetchMarkdown, imageUrl, getFlagMap, flagUrlFor } from './github'
import { parseFrontmatter, getTitle, extractSummary } from './markdown'
import { articleCache } from '../hooks/useVault'

const previewCache = new Map()
const WIKI_IMAGE_RE = /!\[\[([^\]|]+\.(?:png|jpg|jpeg|gif|webp|svg|avif))[^\]]*\]\]/i
const HTML_IMG_RE = /<img[^>]+src="([^"]+)"/

// Country previews show the flag; matched by article filename.
function countryFlag(type, path, flagMap) {
  if (type !== 'country' || !path) return null
  const base = path.split('/').pop().replace(/\.md$/, '')
  return flagUrlFor(base, flagMap)
}

export async function fetchPreview(slug, tree) {
  if (previewCache.has(slug)) return previewCache.get(slug)

  const flagMap = await getFlagMap().catch(() => null)

  // Fast path: article already fully loaded in articleCache
  if (articleCache.has(slug)) {
    const cached = articleCache.get(slug)
    const flag = countryFlag(cached.meta?.type, cached.path, flagMap)
    const imgMatch = HTML_IMG_RE.exec(cached.html)
    const result = {
      title: cached.title,
      type: cached.meta?.type || null,
      summary: cached.meta?.summary || cached.summary || '',
      imageUrl: flag || (imgMatch ? imgMatch[1] : null),
      imageIsFlag: !!flag,
    }
    previewCache.set(slug, result)
    return result
  }

  // Slow path: fetch raw markdown
  const path = slugToPath(slug, tree)
  if (!path) return null
  try {
    const raw = await fetchMarkdown(path)
    const { meta, body } = parseFrontmatter(raw)
    const title = getTitle(meta, path)
    const flag = countryFlag(meta.type, path, flagMap)
    const imgMatch = WIKI_IMAGE_RE.exec(body)
    const result = {
      title,
      type: meta.type || null,
      summary: meta.summary || extractSummary(body),
      imageUrl: flag || (imgMatch ? imageUrl(imgMatch[1]) : null),
      imageIsFlag: !!flag,
    }
    previewCache.set(slug, result)
    return result
  } catch {
    return null
  }
}
