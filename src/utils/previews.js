import { flagUrlFor } from './github'
import { vault } from '../vault'

const previewCache = new Map()
const HTML_IMG_RE = /<img[^>]+src="([^"]+)"/

// Country previews show the flag; matched by article filename.
function countryFlag(type, path, flagMap) {
  if (type !== 'country' || !path) return null
  const base = path.split('/').pop().replace(/\.md$/, '')
  return flagUrlFor(base, flagMap)
}

export async function fetchPreview(slug) {
  if (previewCache.has(slug)) return previewCache.get(slug)

  const flagMap = await vault.flags().catch(() => null)

  try {
    const article = await vault.article(slug)
    if (!article) return null
    const type = article.meta?.type || null
    const flag = countryFlag(type, article.path, flagMap)
    const imgMatch = HTML_IMG_RE.exec(article.html)
    // A person's drawn portrait (frontmatter `portrait:`), shown instead of an image
    const person = type === 'person' ? await vault.person(slug) : false
    const result = {
      title: article.title,
      type,
      summary: article.meta?.summary || article.summary || '',
      imageUrl: flag || (imgMatch ? imgMatch[1] : null),
      imageIsFlag: !!flag,
      portrait: person ? person.portrait : null,
    }
    previewCache.set(slug, result)
    return result
  } catch {
    return null
  }
}
