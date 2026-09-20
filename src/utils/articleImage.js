// The picture that stands for an article: the first image in its body,
// which is what the infobox shows, or for a country its flag. Used by the
// article page and by the prerender for link previews (og:image).
import { flagUrlFor } from './github'

const HTML_IMG_RE = /<img[^>]+src="([^"]+)"/

export function infoboxImageOf(article) {
  return HTML_IMG_RE.exec(article.html)?.[1] ?? null
}

// Matched by filename first, then by title, against the "Country Flags" images
export function countryFlagOf(article, flags) {
  if (article.meta.type !== 'country') return null
  const baseName = article.path.split('/').pop().replace(/\.md$/, '')
  return flagUrlFor(baseName, flags) || flagUrlFor(article.title, flags)
}
