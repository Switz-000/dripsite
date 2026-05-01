import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFileTree, useClassSchemas, fetchMeta, metaCache, pathToSlug } from '../hooks/useVault'
import { Loading, ErrorState } from '../components/Loading'

// ── Path → type detection ──────────────────────────────────────
// Handles the "XX - FolderName" naming convention used throughout the vault.
function getPathSegments(path) {
  return path
    .toLowerCase()
    .split('/')
    .slice(0, -1)                          // drop filename
    .map(p => p.replace(/^\d+\s*-\s*/, '').trim())  // strip "01 - " prefix
}

function hasSegment(segments, name) {
  return segments.includes(name.toLowerCase())
}

function guessTypeFromPath(path) {
  const seg = getPathSegments(path)
  const lp  = path.toLowerCase()

  if (hasSegment(seg, 'people') || hasSegment(seg, 'characters')) return 'person'
  if (hasSegment(seg, 'companies') || hasSegment(seg, 'yarnojtes')) return 'company'
  if (hasSegment(seg, 'states')) return 'state'
  if (hasSegment(seg, 'cities')) return 'city'
  if (lp.includes('rest of the world') || hasSegment(seg, 'countries')) return 'country'
  if (hasSegment(seg, 'history') || hasSegment(seg, 'wars')) return 'event'
  if (hasSegment(seg, 'legislation')) return 'law'
  if (hasSegment(seg, 'federal') || hasSegment(seg, 'municipal') ||
      hasSegment(seg, 'government') || hasSegment(seg, 'goverment')) return 'institution'
  if (hasSegment(seg, 'organizations') || hasSegment(seg, 'parties')) return 'organization'
  if (hasSegment(seg, 'religion')) return 'religion'
  if (hasSegment(seg, 'traditions')) return 'tradition'
  if (hasSegment(seg, 'sport') || seg.some(s => s.includes('crolball'))) return 'sport'
  if (hasSegment(seg, 'culture') || hasSegment(seg, 'philosophy') ||
      hasSegment(seg, 'expressions')) return 'concept'
  return ''
}

// ── Helpers ────────────────────────────────────────────────────
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

const TYPE_LABELS = {
  person: 'People', company: 'Companies', state: 'States', city: 'Cities',
  country: 'Countries', event: 'Events', law: 'Laws', institution: 'Institutions',
  concept: 'Concepts', tradition: 'Traditions', religion: 'Religion',
  sport: 'Sport', organization: 'Organizations', project: 'Projects',
}

function typeLabel(type) {
  return TYPE_LABELS[type] ?? (type.charAt(0).toUpperCase() + type.slice(1) + 's')
}

// ── Sub-filter value matching ──────────────────────────────────
function normalizeVal(v) {
  return v == null ? '' : String(v).toLowerCase().trim()
}

function articleMatchesSubFilters(meta, activeSubFilters) {
  for (const [key, selected] of activeSubFilters) {
    if (selected.size === 0) continue

    // Nested: "parentField.childField"  (e.g. criminal_charges.verdict)
    if (key.includes('.')) {
      const [parent, child] = key.split('.')
      const parentVal = meta[parent]
      const items = Array.isArray(parentVal) ? parentVal
        : parentVal && typeof parentVal === 'object' ? [parentVal]
        : []
      const match = items.some(item =>
        item && typeof item === 'object' && selected.has(normalizeVal(item[child]))
      )
      if (!match) return false
    } else {
      // Top-level field — may be scalar or array
      const fieldVal = meta[key]
      if (Array.isArray(fieldVal)) {
        if (!fieldVal.some(v => selected.has(normalizeVal(v)))) return false
      } else {
        if (!selected.has(normalizeVal(fieldVal))) return false
      }
    }
  }
  return true
}

// ── Sub-filter panel ───────────────────────────────────────────
function SubFilterPanel({ schema, activeSubFilters, onToggle, metaLoading }) {
  if (!schema || schema.length === 0) return null

  return (
    <div className="subfilter-panel">
      {metaLoading && <div className="subfilter-loading">Loading filter data…</div>}
      {schema.map(entry => (
        entry.isGroup ? (
          <div key={entry.name} className="subfilter-group">
            <span className="subfilter-group-label">{entry.label}</span>
            {entry.children.map(child => (
              <SubFilterRow
                key={`${entry.name}.${child.name}`}
                fieldKey={`${entry.name}.${child.name}`}
                label={child.label}
                options={child.options}
                active={activeSubFilters.get(`${entry.name}.${child.name}`) ?? new Set()}
                onToggle={onToggle}
              />
            ))}
          </div>
        ) : (
          <SubFilterRow
            key={entry.name}
            fieldKey={entry.name}
            label={entry.label}
            options={entry.options}
            active={activeSubFilters.get(entry.name) ?? new Set()}
            onToggle={onToggle}
          />
        )
      ))}
    </div>
  )
}

function SubFilterRow({ fieldKey, label, options, active, onToggle }) {
  return (
    <div className="subfilter-row">
      <span className="subfilter-label">{label}</span>
      <div className="subfilter-options">
        {options.map(opt => (
          <button
            key={opt}
            className={'subfilter-btn' + (active.has(normalizeVal(opt)) ? ' active' : '')}
            onClick={() => onToggle(fieldKey, normalizeVal(opt))}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function BrowsePage() {
  const { tree, loading, error } = useFileTree()
  const schemas = useClassSchemas()

  const [searchParams, setSearchParams] = useSearchParams()
  const [localSearch, setLocalSearch]   = useState('')
  // activeSubFilters: Map<fieldKey, Set<normalizedValue>>
  const [activeSubFilters, setActiveSubFilters] = useState(new Map())
  // tracks which types have had their frontmatter fetched
  const [fetchedTypes, setFetchedTypes] = useState(new Set())
  const [metaLoading, setMetaLoading]   = useState(false)
  // bump to re-render after metaCache is populated
  const [metaVersion, setMetaVersion]   = useState(0)
  const fetchingRef = useRef(new Set())  // prevents duplicate concurrent fetches

  // ── Parse active types from URL ──────────────────────────────
  const activeTypes = useMemo(() => {
    const raw = searchParams.get('type') || ''
    return new Set(raw ? raw.split(',').filter(Boolean) : [])
  }, [searchParams])

  // ── Build dynamic type list from file tree ───────────────────
  const typeList = useMemo(() => {
    if (!tree) return []
    const counts = new Map()
    tree.forEach(f => {
      const t = guessTypeFromPath(f.path)
      if (t) counts.set(t, (counts.get(t) || 0) + 1)
    })
    // Also include types from Class schemas even if no path match yet
    if (schemas) {
      Object.keys(schemas).forEach(t => {
        if (!counts.has(t)) counts.set(t, 0)
      })
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])   // most articles first
      .map(([type, count]) => ({ type, count }))
  }, [tree, schemas])

  // ── Single selected type (sub-filters only for one type at a time) ──
  const selectedType   = activeTypes.size === 1 ? [...activeTypes][0] : null
  const selectedSchema = schemas && selectedType ? (schemas[selectedType] ?? null) : null

  // ── Fetch frontmatter when a type with a schema is selected ──
  useEffect(() => {
    if (!selectedSchema || !tree || !selectedType) return
    if (fetchedTypes.has(selectedType)) return
    if (fetchingRef.current.has(selectedType)) return

    const paths = tree
      .filter(f => guessTypeFromPath(f.path) === selectedType)
      .map(f => f.path)

    if (paths.length === 0) {
      setFetchedTypes(prev => new Set([...prev, selectedType]))
      return
    }

    fetchingRef.current.add(selectedType)
    setMetaLoading(true)

    Promise.all(paths.map(p => fetchMeta(p).catch(() => null)))
      .then(() => {
        setFetchedTypes(prev => new Set([...prev, selectedType]))
        setMetaVersion(v => v + 1)
        setMetaLoading(false)
        fetchingRef.current.delete(selectedType)
      })
      .catch(() => {
        setMetaLoading(false)
        fetchingRef.current.delete(selectedType)
      })
  }, [selectedType, selectedSchema, tree]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle type filter ───────────────────────────────────────
  function handleTypeFilter(value) {
    setActiveSubFilters(new Map()) // clear sub-filters on type change
    if (!value) { setSearchParams({}); return }
    const next = new Set(activeTypes)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    if (next.size === 0) setSearchParams({})
    else setSearchParams({ type: [...next].join(',') })
  }

  // ── Toggle sub-filter value ──────────────────────────────────
  function handleSubFilter(fieldKey, normalizedValue) {
    setActiveSubFilters(prev => {
      const next = new Map(prev)
      const current = new Set(next.get(fieldKey) ?? [])
      if (current.has(normalizedValue)) current.delete(normalizedValue)
      else current.add(normalizedValue)
      next.set(fieldKey, current)
      return next
    })
  }

  // ── Compute filtered article list ────────────────────────────
  const items = useMemo(() => {
    if (!tree) return []
    const hasSubFilters = [...activeSubFilters.values()].some(s => s.size > 0)

    return tree
      .map(f => ({
        path:  f.path,
        slug:  pathToSlug(f.path),
        title: cleanTitle(f.path),
        folder: cleanFolder(f.path),
        type:  guessTypeFromPath(f.path),
      }))
      .filter(item => {
        // Type filter
        if (activeTypes.size > 0 && !activeTypes.has(item.type)) return false
        // Text search
        if (localSearch) {
          const q = localSearch.toLowerCase()
          if (!item.title.toLowerCase().includes(q) &&
              !item.folder.toLowerCase().includes(q)) return false
        }
        // Sub-filter (only when meta is available)
        if (hasSubFilters) {
          const meta = metaCache.get(item.path)
          if (!meta) return true  // not yet loaded — show optimistically
          return articleMatchesSubFilters(meta, activeSubFilters)
        }
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [tree, activeTypes, localSearch, activeSubFilters, metaVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────
  if (loading) return <div className="page-inner"><Loading message="Loading article index…" /></div>
  if (error)   return <div className="page-inner"><ErrorState message={error} /></div>

  const hasActiveSubFilters = [...activeSubFilters.values()].some(s => s.size > 0)

  return (
    <div className="page-inner">
      <div className="breadcrumb"><span>Browse All Articles</span></div>

      <div style={{ marginBottom: 24 }}>
        <input
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Filter by title…"
          className="browse-filter-input"
        />

        {/* ── Type buttons ── */}
        <div className="browse-controls">
          <button
            className={'filter-btn' + (activeTypes.size === 0 ? ' active' : '')}
            onClick={() => handleTypeFilter('')}
          >
            All
          </button>
          {typeList.map(({ type, count }) => (
            <button
              key={type}
              className={'filter-btn' + (activeTypes.has(type) ? ' active' : '') +
                         (schemas && type in schemas ? ' has-schema' : '')}
              onClick={() => handleTypeFilter(type)}
              title={count > 0 ? `${count} articles` : undefined}
            >
              {typeLabel(type)}
              {count > 0 && <span className="filter-btn-count">{count}</span>}
            </button>
          ))}
        </div>

        {/* ── Sub-filter panel (only when one type with a schema is selected) ── */}
        {selectedSchema && (
          <SubFilterPanel
            schema={selectedSchema}
            activeSubFilters={activeSubFilters}
            onToggle={handleSubFilter}
            metaLoading={metaLoading}
          />
        )}

        <div className="browse-count">
          {items.length} article{items.length !== 1 ? 's' : ''}
          {hasActiveSubFilters && ' (filtered)'}
        </div>
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
