import React, { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading, ErrorState } from '../components/Loading'

const TYPE_FILTERS = [
  { label: 'All',           value: ''             },
  { label: 'People',        value: 'person'        },
  { label: 'Companies',     value: 'company'       },
  { label: 'States',        value: 'state'         },
  { label: 'Cities',        value: 'city'          },
  { label: 'Countries',     value: 'country'       },
  { label: 'Events',        value: 'event'         },
  { label: 'Laws',          value: 'law'           },
  { label: 'Institutions',  value: 'institution'   },
  { label: 'Concepts',      value: 'concept'       },
  { label: 'Organizations', value: 'organization'  },
]

function guessTypeFromPath(path) {
  const p = path.toLowerCase()
  if (p.includes('/characters/') || p.includes('/people/')) return 'person'
  if (p.includes('/companies/') || p.includes('/yarnojtes/')) return 'company'
  if (p.includes('/states/')) return 'state'
  if (p.includes('/cities/')) return 'city'
  if (p.includes('/countries/') || p.includes('rest of the world')) return 'country'
  if (p.includes('/history/') || p.includes('/wars/')) return 'event'
  if (p.includes('/legislation/')) return 'law'
  if (p.includes('/federal/') || p.includes('/municipal/') || p.includes('/goverment/')) return 'institution'
  if (p.includes('/culture/') || p.includes('/philosophy/')) return 'concept'
  if (p.includes('/organizations/') || p.includes('/parties/')) return 'organization'
  return ''
}

function cleanTitle(path) {
  return path.split('/').pop().replace(/\.md$/, '').replace(/^\d+ - /, '')
}

function cleanFolder(path) {
  return path
    .split('/').slice(0, -1)
    .map(p => p.replace(/^\d+ - /, ''))
    .filter(Boolean)
    .join(' › ')
}

export default function BrowsePage() {
  const { tree, loading, error } = useFileTree()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter]       = useState(searchParams.get('type') || '')
  const [localSearch, setLocalSearch] = useState('')

  // Keep filter in sync with URL
  useEffect(() => {
    setFilter(searchParams.get('type') || '')
  }, [searchParams])

  function handleFilter(value) {
    setFilter(value)
    if (value) setSearchParams({ type: value })
    else setSearchParams({})
  }

  const items = useMemo(() => {
    if (!tree) return []
    return tree
      .map(f => ({
        slug:   pathToSlug(f.path),
        title:  cleanTitle(f.path),
        folder: cleanFolder(f.path),
        type:   guessTypeFromPath(f.path),
      }))
      .filter(item => {
        if (filter && item.type !== filter) return false
        if (localSearch) {
          const q = localSearch.toLowerCase()
          return item.title.toLowerCase().includes(q) ||
                 item.folder.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [tree, filter, localSearch])

  if (loading) return <div className="page-inner"><Loading message="Loading article index..." /></div>
  if (error)   return <div className="page-inner"><ErrorState message={error} /></div>

  return (
    <div className="page-inner">
      <div className="breadcrumb"><span>Browse All Articles</span></div>

      <div style={{ marginBottom: 24 }}>
        <input
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Filter by title..."
          className="browse-filter-input"
        />
        <div className="browse-controls">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              className={'filter-btn' + (filter === f.value ? ' active' : '')}
              onClick={() => handleFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="browse-count">{items.length} articles</div>
      </div>

      <div className="article-list">
        {items.map(item => (
          <div className="article-list-item" key={item.slug}>
            <Link to={`/article/${item.slug}`}>{item.title}</Link>
            <span className="item-path">{item.folder}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="browse-empty">No articles match this filter.</div>
        )}
      </div>
    </div>
  )
}
