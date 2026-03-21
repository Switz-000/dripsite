import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Fuse from 'fuse.js'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading } from '../components/Loading'

function buildIndex(tree) {
  if (!tree) return []
  return tree.map(f => ({
    slug:   pathToSlug(f.path),
    title:  f.path.split('/').pop().replace(/\.md$/, '').replace(/^\d+ - /, ''),
    path:   f.path,
    folder: f.path.split('/').slice(0, -1).map(p => p.replace(/^\d+ - /, '')).join(' / '),
  }))
}

export default function SearchPage() {
  const { tree, loading } = useFileTree()
  const [searchParams, setSearchParams] = useSearchParams()
  // Pre-fill from URL on mount
  const [query, setQuery] = useState(searchParams.get('q') || '')

  const index = useMemo(() => buildIndex(tree), [tree])

  const fuse = useMemo(() => new Fuse(index, {
    keys: [
      { name: 'title',  weight: 2 },
      { name: 'folder', weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
  }), [index])

  const results = useMemo(() => {
    if (!query.trim() || !index.length) return []
    return fuse.search(query.trim()).slice(0, 50)
  }, [query, fuse, index])

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim()) setSearchParams({ q: query.trim() })
    else setSearchParams({})
  }

  return (
    <div className="page-inner">
      <div className="breadcrumb"><span>Search</span></div>

      <form onSubmit={handleSubmit} className="search-bar-large">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the encyclopedia..."
          type="search"
        />
      </form>

      {loading && <Loading message="Building search index..." />}

      {!loading && query.trim() && results.length === 0 && (
        <p className="search-no-results">
          No results for <em>"{query}"</em>.
        </p>
      )}

      {results.map(({ item, score }) => (
        <div className="search-result" key={item.slug}>
          <div className="search-result-title">
            <Link to={`/article/${item.slug}`}>{item.title}</Link>
          </div>
          <div className="search-result-path">{item.folder}</div>
        </div>
      ))}

      {!loading && !query.trim() && (
        <p className="search-hint">
          Searching {index.length} articles by title and folder path.
        </p>
      )}
    </div>
  )
}
