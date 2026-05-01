import { useState, useEffect } from 'react'
import {
  getFileTree,
  fetchMarkdown,
  pathToSlug,
  slugToPath,
  wikilinkToSlug as resolveWikilink,
} from '../utils/github'
import {
  renderMarkdown,
  parseFrontmatter,
  getTitle,
  extractSummary,
} from '../utils/markdown'
import { fetchClassSchemas } from '../utils/classSchema'

// Module-level caches — survive re-renders and re-mounts
export const articleCache = new Map()
export const metaCache = new Map()   // path -> frontmatter meta (lightweight)
let treeCache = null
let treePending = null   // in-flight promise, deduplicated

export function useFileTree() {
  const [tree, setTree] = useState(treeCache)
  const [loading, setLoading] = useState(!treeCache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (treeCache) {
      setTree(treeCache)
      setLoading(false)
      return
    }

    // Deduplicate simultaneous calls
    if (!treePending) {
      treePending = getFileTree()
    }

    treePending
      .then(t => {
        treeCache = t
        treePending = null
        setTree(t)
        setLoading(false)
      })
      .catch(e => {
        treePending = null
        setError(e.message)
        setLoading(false)
      })
  }, [])

  return { tree, loading, error }
}

export function useArticle(slug) {
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { tree, loading: treeLoading, error: treeError } = useFileTree()

  useEffect(() => {
    // Wait until we have the tree
    if (treeLoading) return
    if (!slug) { setLoading(false); return }

    if (treeError) {
      setError(treeError)
      setLoading(false)
      return
    }

    // Return from cache instantly
    if (articleCache.has(slug)) {
      setArticle(articleCache.get(slug))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const path = slugToPath(slug, tree)
    if (!path) {
      setError(`Article not found. The link may be outdated or the article does not exist.`)
      setLoading(false)
      return
    }

    fetchMarkdown(path)
      .then(raw => {
        const wikilinkFn = (text) => resolveWikilink(text, tree)
        const { meta, html } = renderMarkdown(raw, tree, wikilinkFn)
        const { body } = parseFrontmatter(raw)
        const result = {
          slug,
          path,
          title: getTitle(meta, path),
          meta,
          html,
          summary: extractSummary(body),
        }
        articleCache.set(slug, result)
        setArticle(result)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [slug, tree, treeLoading, treeError])

  return { article, loading, error }
}

export function useSearchIndex() {
  const { tree } = useFileTree()
  const [index, setIndex] = useState([])

  useEffect(() => {
    if (!tree) return
    setIndex(tree.map(f => ({
      slug:     pathToSlug(f.path),
      title:    f.path.split('/').pop().replace(/\.md$/, ''),
      path:     f.path,
      // Human-readable folder path for display
      folder:   f.path.split('/').slice(0, -1).map(p => p.replace(/^\d+ - /, '')).join(' / '),
    })))
  }, [tree])

  return index
}

// ── Class schemas ─────────────────────────────────────────────
export function useClassSchemas() {
  const [schemas, setSchemas] = useState(null)

  useEffect(() => {
    fetchClassSchemas()
      .then(setSchemas)
      .catch(() => setSchemas({}))
  }, [])

  return schemas  // null while loading, {} on error, { typeName: [...] } when ready
}

// ── Lightweight frontmatter fetch ─────────────────────────────
// Fetches just the frontmatter for an article path. Checks metaCache first,
// then articleCache (populated when full articles are visited), then fetches.
export async function fetchMeta(path) {
  if (metaCache.has(path)) return metaCache.get(path)

  // Reuse already-fetched full articles
  for (const article of articleCache.values()) {
    if (article.path === path) {
      metaCache.set(path, article.meta)
      return article.meta
    }
  }

  const raw = await fetchMarkdown(path)
  const { meta } = parseFrontmatter(raw)
  metaCache.set(path, meta)
  return meta
}

export { pathToSlug, slugToPath }
