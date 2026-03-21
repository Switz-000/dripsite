import { useState, useEffect, useCallback } from 'react'
import { getFileTree, fetchMarkdown, pathToSlug, slugToPath, wikilinkToSlug as resolveWikilink } from '../utils/github'
import { renderMarkdown, parseFrontmatter, getTitle, extractSummary } from '../utils/markdown'

// Global cache so we don't refetch on every navigation
const articleCache = new Map()
let treeCache = null

export function useFileTree() {
  const [tree, setTree] = useState(treeCache)
  const [loading, setLoading] = useState(!treeCache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (treeCache) { setTree(treeCache); setLoading(false); return }
    getFileTree()
      .then(t => { treeCache = t; setTree(t); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  return { tree, loading, error }
}

export function useArticle(slug) {
  const [article, setArticle] = useState(articleCache.get(slug) || null)
  const [loading, setLoading] = useState(!articleCache.has(slug))
  const [error, setError] = useState(null)
  const { tree } = useFileTree()

  useEffect(() => {
    if (!slug || !tree) return
    if (articleCache.has(slug)) {
      setArticle(articleCache.get(slug))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const path = slugToPath(slug, tree)
    if (!path) {
      setError('Article not found')
      setLoading(false)
      return
    }

    fetchMarkdown(path)
      .then(raw => {
        const wikilinkFn = (text, t) => resolveWikilink(text, t || tree)
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
  }, [slug, tree])

  return { article, loading, error }
}

// Build a searchable index from the file tree
export function useSearchIndex() {
  const { tree } = useFileTree()
  const [index, setIndex] = useState([])

  useEffect(() => {
    if (!tree) return
    // Build lightweight index: title + path + type from filename
    const entries = tree.map(f => ({
      slug: pathToSlug(f.path),
      title: f.path.split('/').pop().replace(/\.md$/, ''),
      path: f.path,
      // Rough category from folder structure
      category: f.path.split('/')[0] || 'General',
    }))
    setIndex(entries)
  }, [tree])

  return index
}

export { pathToSlug, slugToPath }
