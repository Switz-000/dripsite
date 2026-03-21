import React, { useState, useMemo } from 'react'
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
  { label: 'Traditions',    value: 'tradition'     },
  { label: 'Religion',      value: 'religion'      },
  { label: 'Sport',         value: 'sport'         },
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
  if (p.includes('/organizations/') || p.includes('/parties/')) return 'organization'
  // More specific culture sub-types before the broad 'concept' fallback
  if (p.includes('/religion/')) return 'religion'
  if (p.includes('/traditions/')) return 'tradition'
  if (p.includes('/sport') || p.includes('crolball')) return 'sport'
  if (p.includes('/culture/') || p.includes('/philosophy/') || p.includes('/expressions/')) return 'concept'
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
  const [localSearch, setLocalSearch] = useState('')

  // filter is a Set of active type strings. Empty set = show all.
  const activeTypes = useMemo(() => {
    const raw = searchParams.get('type') || ''
    return new Set(raw ? raw.split(',').filter(Boolean) : [])
  }, [searchParams])

  function handleFilter(value) {
    if (!value) {
      // "All" button — clear everything
      setSearchParams({})
      return
    }
    const next = new Set(activeTypes)
    if (next.has(value)) next.delete(value)
    else next.add(value)

    if (next.size === 0) setSearchParams({})
    else setSearchParams({ type: [...next].join(',') })
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
        if (activeTypes.size > 0 && !activeTypes.has(item.type)) return false
        if (localSearch) {
          const q = localSearch.toLowerCase()
          return item.title.toLowerCase().includes(q) ||
                 item.folder.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [tree, activeTypes, localSearch])

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
              className={'filter-btn' + (
                f.value === ''
                  ? activeTypes.size === 0 ? ' active' : ''
                  : activeTypes.has(f.value) ? ' active' : ''
              )}
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
