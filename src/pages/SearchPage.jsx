import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Fuse from 'fuse.js'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading } from '../components/Loading'

function buildIndex(tree) {
  if (!tree) return []
  return tree.map(f => ({
    slug: pathToSlug(f.path),
    title: f.path.split('/').pop().replace(/\.md$/, '').replace(/^\d+ - /, ''),
    path: f.path,
    folder: f.path.split('/').slice(0, -1).map(p => p.replace(/^\d+ - /, '')).join(' / '),
  }))
}

export default function SearchPage() {
  const { tree, loading } = useFileTree()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')

  const index = useMemo(() => buildIndex(tree), [tree])

  const fuse = useMemo(() => new Fuse(index, {
    keys: ['title', 'folder'],
    threshold: 0.35,
    includeScore: true,
  }), [index])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query.trim()).slice(0, 40)
  }, [query, fuse])

  function handleSubmit(e) {
    e.preventDefault()
    setSearchParams({ q: query })
  }

  return (
    <div className="page-inner">
      <div className="breadcrumb"><span>Search</span></div>

      <form onSubmit={handleSubmit} className="search-bar-large">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the Susia Encyclopedia…"
          type="search"
        />
      </form>

      {loading && <Loading message="Building search index…" />}

      {!loading && query.trim() && results.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No results for <em>"{query}"</em>.
        </p>
      )}

      {results.map(({ item }) => (
        <div className="search-result" key={item.slug}>
          <div className="search-result-title">
            <Link to={`/article/${encodeURIComponent(item.slug)}`}>{item.title}</Link>
          </div>
          <div className="search-result-path">{item.folder}</div>
        </div>
      ))}

      {!query.trim() && !loading && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 8 }}>
          Search across {index.length} articles by title or folder.
        </p>
      )}
    </div>
  )
}
