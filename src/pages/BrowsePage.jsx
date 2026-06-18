import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFileTree, useClassSchemas, useGeoHierarchy, fetchMeta, metaCache, pathToSlug } from '../hooks/useVault'
import { stripWL } from '../utils/geo'
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
  if (v == null) return ''
  // strip [[wikilink]] so plain filter options match wikilink-valued fields
  // (e.g. birth.country: "[[Susia]]"). Idempotent for plain text.
  return stripWL(v).toLowerCase().trim()
}

// Derived criminal-record status: "Clean record" | "Convict" | "Acquitted"
const RECORD_OPTIONS = ['Clean record', 'Convict', 'Acquitted']
function recordStatus(meta) {
  const raw = meta.criminal_charges
  const charges = (Array.isArray(raw) ? raw : (raw != null ? [raw] : []))
    .filter(c => c && (typeof c === 'object'
      ? Object.values(c).some(v => v != null && v !== '')
      : String(c).trim() !== ''))
  if (charges.length === 0) return 'Clean record'
  const convicted = charges.some(c => {
    const v = String((c && typeof c === 'object' ? c.verdict : c) || '').toLowerCase()
    return /guilty|convict/.test(v) && !/not\s+guilty|acquit/.test(v)
  })
  return convicted ? 'Convict' : 'Acquitted'
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
    } else if (key === 'record_status') {
      if (!selected.has(normalizeVal(recordStatus(meta)))) return false
    } else if (key === 'occupation') {
      // occupation: array of strings OR {title} objects (or a single value)
      const raw = meta.occupation
      const list = Array.isArray(raw) ? raw : (raw != null ? [raw] : [])
      const titles = list.map(e => (e && typeof e === 'object') ? e.title : e)
      if (!titles.some(t => selected.has(normalizeVal(t)))) return false
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

// ── Occupation filter (options derived from loaded person articles) ──
function OccupationFilter({ options, active, onToggle }) {
  if (options.length === 0) return null
  return (
    <div className="subfilter-panel">
      <SubFilterRow
        fieldKey="occupation"
        label="Occupation"
        options={options}
        active={active}
        onToggle={onToggle}
      />
    </div>
  )
}

// ── Criminal record filter (derived status) ──
function RecordFilter({ active, onToggle }) {
  return (
    <div className="subfilter-panel">
      <SubFilterRow
        fieldKey="record_status"
        label="Criminal record"
        options={RECORD_OPTIONS}
        active={active}
        onToggle={onToggle}
      />
    </div>
  )
}

// ── Birth filter — foldable Country › State › City accordion ──
// Each level is independently selectable (writes birth.country/state/city);
// carets only expand/collapse to reveal children.
function BirthRow({ depth, label, selected, onSelect, expandable, expanded, onExpand }) {
  return (
    <div
      className={'birth-row birth-row-d' + depth + (selected ? ' selected' : '')}
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      {expandable ? (
        <button className="birth-caret" onClick={onExpand} aria-label="expand">
          {expanded ? '▾' : '▸'}
        </button>
      ) : <span className="birth-caret-spacer" />}
      <button className="birth-name" onClick={onSelect}>{label}</button>
    </div>
  )
}

function BirthFilter({ hierarchy, loading, activeSubFilters, onToggle }) {
  const [openCountries, setOpenCountries] = useState(() => new Set())
  const [openStates, setOpenStates] = useState(() => new Set())

  const selCountry = activeSubFilters.get('birth.country') ?? new Set()
  const selState   = activeSubFilters.get('birth.state')   ?? new Set()
  const selCity    = activeSubFilters.get('birth.city')    ?? new Set()

  function toggleSet(setter, key) {
    setter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="subfilter-panel birth-filter">
      <span className="subfilter-group-label">Birth</span>
      {loading && <div className="subfilter-loading">Loading geography…</div>}
      {!loading && hierarchy && hierarchy.countries.length === 0 &&
        <div className="subfilter-loading">No geography found.</div>}
      <div className="birth-tree">
        {hierarchy && hierarchy.countries.map(country => {
          const cKey = country.name.toLowerCase()
          const cOpen = openCountries.has(cKey)
          const states = hierarchy.statesByCountry.get(cKey)?.items ?? []
          return (
            <div key={cKey}>
              <BirthRow
                depth={0}
                label={country.name}
                selected={selCountry.has(cKey)}
                onSelect={() => onToggle('birth.country', cKey)}
                expandable={states.length > 0}
                expanded={cOpen}
                onExpand={() => toggleSet(setOpenCountries, cKey)}
              />
              {cOpen && states.map(state => {
                const sKey = state.name.toLowerCase()
                const sOpen = openStates.has(sKey)
                const cities = hierarchy.citiesByState.get(sKey)?.items ?? []
                return (
                  <div key={sKey}>
                    <BirthRow
                      depth={1}
                      label={state.name}
                      selected={selState.has(sKey)}
                      onSelect={() => onToggle('birth.state', sKey)}
                      expandable={cities.length > 0}
                      expanded={sOpen}
                      onExpand={() => toggleSet(setOpenStates, sKey)}
                    />
                    {sOpen && cities.map(city => {
                      const ciKey = city.name.toLowerCase()
                      return (
                        <BirthRow
                          key={ciKey}
                          depth={2}
                          label={city.name}
                          selected={selCity.has(ciKey)}
                          onSelect={() => onToggle('birth.city', ciKey)}
                          expandable={false}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
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
  const rawSchema      = schemas && selectedType ? (schemas[selectedType] ?? null) : null
  const isPerson       = selectedType === 'person'

  // Hide a few overly-niche person sub-filters (replaced by the Criminal record filter).
  const HIDDEN_FILTERS = useMemo(() => new Set(['genre', 'plea', 'verdict']), [])
  const selectedSchema = useMemo(() => {
    if (!rawSchema || !isPerson) return rawSchema
    return rawSchema
      .map(entry => {
        if (entry.isGroup) {
          const children = entry.children.filter(c => !HIDDEN_FILTERS.has(c.name))
          return children.length ? { ...entry, children } : null
        }
        return HIDDEN_FILTERS.has(entry.name) ? null : entry
      })
      .filter(Boolean)
  }, [rawSchema, isPerson, HIDDEN_FILTERS])

  // Geography hierarchy for the Birth filter (fetched only for People)
  const { hierarchy: geoHierarchy, loading: geoLoading } = useGeoHierarchy(tree, isPerson)

  // Occupation options derived from loaded person articles
  const occupationOptions = useMemo(() => {
    if (!isPerson || !tree) return []
    const set = new Map() // normalized -> display
    tree.forEach(f => {
      if (guessTypeFromPath(f.path) !== 'person') return
      const meta = metaCache.get(f.path)
      if (!meta) return
      const raw = meta.occupation
      const list = Array.isArray(raw) ? raw : (raw != null ? [raw] : [])
      list.forEach(e => {
        const title = (e && typeof e === 'object') ? e.title : e
        const norm = normalizeVal(title)
        if (norm && !set.has(norm)) set.set(norm, String(title).trim())
      })
    })
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [isPerson, tree, metaVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch frontmatter when a type with a schema is selected ──
  // Also fetch for People (no schema required) so Occupation/Birth filters work.
  useEffect(() => {
    if ((!selectedSchema && !isPerson) || !tree || !selectedType) return
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

        {/* ── Person-only custom filters: Occupation + Birth ── */}
        {isPerson && (
          <OccupationFilter
            options={occupationOptions}
            active={activeSubFilters.get('occupation') ?? new Set()}
            onToggle={handleSubFilter}
          />
        )}
        {isPerson && (
          <RecordFilter
            active={activeSubFilters.get('record_status') ?? new Set()}
            onToggle={handleSubFilter}
          />
        )}
        {isPerson && (
          <BirthFilter
            hierarchy={geoHierarchy}
            loading={geoLoading}
            activeSubFilters={activeSubFilters}
            onToggle={handleSubFilter}
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
