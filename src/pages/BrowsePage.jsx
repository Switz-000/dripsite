import React, { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading, ErrorState } from '../components/Loading'

const TYPE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'People', value: 'person' },
  { label: 'Companies', value: 'company' },
  { label: 'States', value: 'state' },
  { label: 'Cities', value: 'city' },
  { label: 'Countries', value: 'country' },
  { label: 'Events', value: 'event' },
  { label: 'Laws', value: 'law' },
  { label: 'Institutions', value: 'institution' },
  { label: 'Concepts', value: 'concept' },
  { label: 'Organizations', value: 'organization' },
]

// Guess type from path folder structure when frontmatter isn't loaded
function guessTypeFromPath(path) {
  const lower = path.toLowerCase()
  if (lower.includes('/characters/') || lower.includes('/people/')) return 'person'
  if (lower.includes('/companies/') || lower.includes('/yarnojtes/')) return 'company'
  if (lower.includes('/states/')) return 'state'
  if (lower.includes('/cities/')) return 'city'
  if (lower.includes('/countries/')) return 'country'
  if (lower.includes('/history/') || lower.includes('/wars/')) return 'event'
  if (lower.includes('/legislation/')) return 'law'
  if (lower.includes('/federal/') || lower.includes('/municipal/')) return 'institution'
  if (lower.includes('/culture/') || lower.includes('/philosophy/')) return 'concept'
  if (lower.includes('/organizations/') || lower.includes('/parties/')) return 'organization'
  return ''
}

function cleanTitle(path) {
  return path
    .split('/').pop()
    .replace(/\.md$/, '')
    .replace(/^\d+ - /, '')
}

function cleanPath(path) {
  return path
    .split('/')
    .slice(0, -1)
    .map(p => p.replace(/^\d+ - /, ''))
    .join(' › ')
}

export default function BrowsePage() {
  const { tree, loading, error } = useFileTree()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState(searchParams.get('type') || '')
  const [localSearch, setLocalSearch] = useState('')

  const items = useMemo(() => {
    if (!tree) return []
    return tree
      .map(f => ({
        path: f.path,
        slug: pathToSlug(f.path),
        title: cleanTitle(f.path),
        displayPath: cleanPath(f.path),
        guessedType: guessTypeFromPath(f.path),
      }))
      .filter(item => {
        if (filter && item.guessedType !== filter) return false
        if (localSearch) {
          const q = localSearch.toLowerCase()
          return item.title.toLowerCase().includes(q) || item.displayPath.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [tree, filter, localSearch])

  if (loading) return <div className="page-inner"><Loading message="Loading article index…" /></div>
  if (error) return <div className="page-inner"><ErrorState message={error} /></div>

  return (
    <div className="page-inner">
      <div className="breadcrumb">
        <span>Browse All Articles</span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <input
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Filter by title…"
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            padding: '10px 14px',
            outline: 'none',
            marginBottom: 16,
          }}
        />

        <div className="browse-controls">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-btn ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
          {items.length} articles
        </div>
      </div>

      <div className="article-list">
        {items.map(item => (
          <div className="article-list-item" key={item.slug}>
            <Link to={`/article/${encodeURIComponent(item.slug)}`}>
              {item.title}
            </Link>
            <span className="item-path">{item.displayPath}</span>
          </div>
        ))}

        {items.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center' }}>
            No articles match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
