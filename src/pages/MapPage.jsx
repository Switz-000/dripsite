import React, { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pathToSlug, useFlags, useCountryGeo } from '../hooks/useVault'
import { flagUrlFor } from '../utils/github'
import { slugId } from '../utils/geo'
import { COUNTRIES, COUNTRY_VIEWBOXES, STATES, STATE_VIEWBOXES, CITIES } from '../data/mapData'

// Flag lookup for a map country — matched by article filename, then label
function countryFlag(country, flags) {
  if (!country || !flags) return null
  const base = country.article?.split('/').pop()
  return flagUrlFor(base, flags) || flagUrlFor(country.label, flags)
}

// Convert a screen-space (clientX/Y) point into the SVG's own coordinate
// system (the viewBox units used by cx/cy in mapData.js). Using the SVG's
// screen CTM means this is correct at any zoom level automatically.
function toSvgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const svgPt = pt.matrixTransform(ctm.inverse())
  return { x: Math.round(svgPt.x * 10) / 10, y: Math.round(svgPt.y * 10) / 10 }
}

export default function MapPage() {
  const [view, setView] = useState('world')
  const [activeCountry, setActiveCountry] = useState(null)
  const [activeState, setActiveState] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredCity, setHoveredCity] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [viewBox, setViewBox] = useState('0 0 800 600')
  const navigate = useNavigate()
  const flags = useFlags()
  const svgRef = useRef(null)

  // ── Coordinate picker (dev tool) ──────────────────────────────
  // Click the map while active to read off cx/cy for mapData.js
  const [pickerMode, setPickerMode] = useState(false)
  const [pickedPoints, setPickedPoints] = useState([])
  const [liveCoord, setLiveCoord] = useState(null)

  // Frontmatter-driven geography (population, capitals, article links),
  // fetched in one burst per country and cached for the session
  const { geo, loading: geoLoading } = useCountryGeo(
    activeCountry,
    activeCountry ? STATES[activeCountry.id] : null,
    activeCountry ? CITIES[activeCountry.id] : null,
  )

  // State shapes render immediately from local data; ids derived from labels
  const stateShapes = ((activeCountry && STATES[activeCountry.id]) || [])
    .map(s => ({ id: slugId(s.label), label: s.label, path: s.path }))

  function handleCountryClick(id) {
    const country = COUNTRIES.find(c => c.id === id)
    if (!country) return

    // if clicking a different country while already zoomed in, switch to it
    if (activeCountry && activeCountry.id !== id) {
      setActiveState(null)
    }

    setActiveCountry(country)

    // no states — skip straight to city view
    setView((STATES[id] || []).length > 0 ? 'country' : 'cities')

    if (COUNTRY_VIEWBOXES[id]) setViewBox(COUNTRY_VIEWBOXES[id])
  }

  function handleStateClick(id) {
    const state = stateShapes.find(s => s.id === id)
    if (!state) return
    setActiveState(state)
    setView('state')
    const vb = STATE_VIEWBOXES[activeCountry?.id]?.[id]
    if (vb) setViewBox(vb)
  }

  function goBack() {
    if (view === 'state') {
      setView('country')
      setActiveState(null)
      setViewBox(COUNTRY_VIEWBOXES[activeCountry?.id] || '0 0 800 600')
    } else if (view === 'country' || view === 'cities') {
      setView('world')
      setActiveCountry(null)
      setActiveState(null)
      setViewBox('0 0 800 600')
    }
  }

  // which city sizes are visible at this zoom level
  const visibleSizes = view === 'state'
    ? ['major', 'medium', 'minor']
    : view === 'cities'
      ? ['major', 'medium', 'minor']
      : view === 'country'
        ? ['major', 'medium']
        : ['major']

  function getVisibleCities() {
    if (!activeCountry || !geo) return []
    // skip cities whose coordinates haven't been set yet
    const drawable = geo.cities.filter(c => c.cx || c.cy)

    if (view === 'state' && activeState) {
      return drawable.filter(c => c.stateId === activeState.id && visibleSizes.includes(c.size))
    }

    // for 'cities' view (no states) or 'country' view — show all cities in country
    return drawable.filter(c => visibleSizes.includes(c.size))
  }

  const visibleCities = getVisibleCities()

  function dotSize(size) {
    const w = parseFloat(viewBox.split(' ')[2])
    const scale = w / 800
    const base = { major: 10, medium: 8, minor: 6 }
    return (base[size] || 3) * scale
  }

  const hoveredCountry = hoveredId ? COUNTRIES.find(c => c.id === hoveredId) : null
  const tooltip = hoveredCity
    ? { ...hoveredCity, isCity: true }
    : (hoveredId
      ? {
          label:
            hoveredCountry?.label ||
            stateShapes.find(s => s.id === hoveredId)?.label ||
            hoveredId,
          flag: countryFlag(hoveredCountry, flags),
        }
      : null)

  return (
    <div className="page-inner" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: 0 }}>
          {view === 'world' && 'Dripstan'}
          {view === 'country' && activeCountry?.label}
          {view === 'cities' && activeCountry?.label}
          {view === 'state' && activeState?.label}
        </h1>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {view === 'world' && 'Continent — click a country'}
          {view === 'country' && 'Country — click a state'}
          {view === 'cities' && 'Country — click a city'}
          {view === 'state' && 'State — click a city'}
        </div>
        <button
          onClick={() => setPickerMode(p => !p)}
          className="filter-btn"
          style={{ marginLeft: view === 'world' ? 'auto' : 0 }}
        >
          {pickerMode ? '✕ Exit Coordinate Picker' : '📍 Coordinate Picker'}
        </button>
        {view !== 'world' && (
          <button onClick={goBack} className="filter-btn">
            ← Back
          </button>
        )}
      </div>

      {pickerMode && (
        <div style={{
          marginBottom: 16, padding: '8px 12px', background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)', fontFamily: 'var(--font-ui)',
          fontSize: '0.75rem', color: 'var(--text-secondary)',
        }}>
          Click anywhere on the map to record its coordinates. Zoom into a country or state first for more precision.
        </div>
      )}

      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 20 }}>
        <span
          style={{ cursor: view !== 'world' ? 'pointer' : 'default', color: view !== 'world' ? 'var(--link)' : undefined }}
          onClick={() => { setView('world'); setActiveCountry(null); setActiveState(null); setViewBox('0 0 800 600') }}
        >
          Dripstan
        </span>
        {activeCountry && (
          <>
            <span className="sep">/</span>
            <span
              style={{
                cursor: view === 'state' ? 'pointer' : 'default',
                color: view === 'state' ? 'var(--link)' : undefined
              }}
              onClick={() => {
                if (view === 'state') {
                  setView('country')
                  setActiveState(null)
                  setViewBox(COUNTRY_VIEWBOXES[activeCountry.id] || '0 0 800 600')
                }
              }}
            >
              {activeCountry.label}
            </span>
          </>
        )}
        {activeState && <><span className="sep">/</span><span>{activeState.label}</span></>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>

        {/* Map */}
        <div
          style={{ position: 'relative', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
            if (pickerMode && svgRef.current) {
              setLiveCoord(toSvgPoint(svgRef.current, e.clientX, e.clientY))
            }
          }}
        >
          <svg
            ref={svgRef}
            viewBox={viewBox}
            style={{ width: '100%', display: 'block', transition: 'viewBox 0.4s ease', cursor: pickerMode ? 'crosshair' : undefined }}
            onClickCapture={e => {
              if (!pickerMode) return
              e.preventDefault()
              e.stopPropagation()
              const pt = toSvgPoint(svgRef.current, e.clientX, e.clientY)
              setPickedPoints(prev => [...prev, { ...pt, label: `city_${prev.length + 1}` }])
            }}
          >
            {/* Country paths — always rendered so you can click neighbors */}
            {COUNTRIES.map(c => (
              <path
                key={c.id}
                id={c.id}
                d={c.path}
                fill={
                  activeCountry?.id === c.id
                    ? 'color-mix(in srgb, var(--text-accent) 25%, var(--bg-surface))'
                    : hoveredId === c.id
                      ? 'color-mix(in srgb, var(--text-accent) 40%, var(--bg-surface))'
                      : 'var(--bg-surface)'
                }
                stroke="var(--border-strong)"
                strokeWidth="1"
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleCountryClick(c.id)}
              />
            ))}

            {/* State paths — only when inside a country with states */}
            {view === 'country' && activeCountry && stateShapes.map(s => (
              <path
                key={s.id}
                id={s.id}
                d={s.path || ''}
                fill={
                  activeState?.id === s.id
                    ? 'var(--text-accent)'
                    : hoveredId === s.id
                      ? 'color-mix(in srgb, var(--text-accent) 40%, var(--bg-surface))'
                      : 'transparent'
                }
                stroke="var(--border-strong)"
                strokeWidth="0.5"
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleStateClick(s.id)}
              />
            ))}

            {/* City dots */}
            {visibleCities.map(city => {
              const r = dotSize(city.size)
              const isHovered = hoveredCity?.id === city.id
              return (
                <g
                  key={city.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => { setHoveredCity(city); setHoveredId(null) }}
                  onMouseLeave={() => setHoveredCity(null)}
                  onClick={() => { if (city.slug) navigate(`/article/${city.slug}`) }}
                >
                  {city.capital ? (
                    <rect
                      x={city.cx - r} y={city.cy - r}
                      width={r * 2} height={r * 2}
                      fill={isHovered ? 'var(--text-accent)' : 'var(--text-primary)'}
                      stroke="var(--bg-surface)" strokeWidth={r * 0.4}
                    />
                  ) : (
                    <circle
                      cx={city.cx} cy={city.cy} r={r}
                      fill={isHovered ? 'var(--text-accent)' : 'var(--text-primary)'}
                      stroke="var(--bg-surface)" strokeWidth={r * 0.4}
                    />
                  )}
                  {(view === 'state' || view === 'cities' || city.size === 'major') && (
                    <text
                      x={city.cx + r + 1} y={city.cy + r * 0.5}
                      fontSize={dotSize('major') * 1.6}
                      fill="var(--text-primary)"
                      fontFamily="var(--font-ui)"
                      paintOrder="stroke"
                      stroke="var(--bg-surface)"
                      strokeWidth={dotSize('major') * 0.8}
                      strokeLinejoin="round"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {city.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Picked-point markers (coordinate picker) */}
            {pickerMode && pickedPoints.map((p, i) => (
              <g key={i} style={{ pointerEvents: 'none' }}>
                <circle cx={p.x} cy={p.y} r={dotSize('major') * 0.6} fill="none" stroke="#e63946" strokeWidth={dotSize('major') * 0.15} />
                <line x1={p.x - dotSize('major')} y1={p.y} x2={p.x + dotSize('major')} y2={p.y} stroke="#e63946" strokeWidth={dotSize('major') * 0.1} />
                <line x1={p.x} y1={p.y - dotSize('major')} x2={p.x} y2={p.y + dotSize('major')} stroke="#e63946" strokeWidth={dotSize('major') * 0.1} />
                <text x={p.x + dotSize('major') + 2} y={p.y} fontSize={dotSize('major')} fill="#e63946" fontFamily="var(--font-ui)">{i + 1}</text>
              </g>
            ))}
          </svg>

          {/* Live coordinate readout while picking */}
          {pickerMode && liveCoord && (
            <div style={{
              position: 'absolute', left: mousePos.x + 14, top: mousePos.y - 26,
              background: '#e63946', color: '#fff', padding: '3px 8px',
              fontFamily: 'var(--font-ui)', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 11,
            }}>
              {liveCoord.x}, {liveCoord.y}
            </div>
          )}

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position: 'absolute',
              left: mousePos.x + 14,
              top: mousePos.y - 10,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              padding: '6px 12px',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {tooltip.flag && <img src={tooltip.flag} alt="" className="flag-chip" />}
                <span style={{ fontWeight: 600 }}>{tooltip.label}</span>
              </div>
              {tooltip.pop != null && <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2 }}>Pop: {tooltip.pop.toLocaleString()}</div>}
              {tooltip.isCity && (tooltip.slug
                ? <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>Click to open article</div>
                : <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>No article yet</div>)}
            </div>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 10, left: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            padding: '6px 10px', fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem', color: 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', gap: 4
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="var(--text-primary)" /></svg>
              Capital
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--text-primary)" /></svg>
              City
            </div>
          </div>
        </div>

        {/* Info panel */}
        {pickerMode ? (
          <PickedPointsPanel
            points={pickedPoints}
            onLabelChange={(i, label) => setPickedPoints(prev => prev.map((p, idx) => idx === i ? { ...p, label } : p))}
            onRemove={i => setPickedPoints(prev => prev.filter((_, idx) => idx !== i))}
            onClear={() => setPickedPoints([])}
          />
        ) : (
          <InfoPanel
            view={view}
            country={activeCountry}
            state={activeState}
            states={geo?.states ?? stateShapes}
            cities={visibleCities}
            onStateClick={handleStateClick}
            flags={flags}
            loading={geoLoading}
          />
        )}
      </div>
    </div>
  )
}

function PickedPointsPanel({ points, onLabelChange, onRemove, onClear }) {
  const snippet = points.map(p => `    { label: '${p.label}', cx: ${p.x}, cy: ${p.y} },`).join('\n')

  function copyAll() {
    navigator.clipboard.writeText(snippet)
  }

  return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <SectionLabel>Picked Coordinates</SectionLabel>
      {points.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '6px 0' }}>
          Click the map to add a point.
        </div>
      )}
      {points.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: '#e63946', fontWeight: 700, fontSize: '0.7rem', minWidth: 14 }}>{i + 1}</span>
          <input
            value={p.label}
            onChange={e => onLabelChange(i, e.target.value)}
            style={{
              flex: 1, minWidth: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: '0.75rem', padding: '3px 6px',
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{p.x}, {p.y}</span>
          <button
            onClick={() => onRemove(i)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
            aria-label="Remove point"
          >
            ×
          </button>
        </div>
      ))}
      {points.length > 0 && (
        <>
          <button onClick={copyAll} className="filter-btn" style={{ marginTop: 10, width: '100%' }}>
            Copy snippet ({points.length})
          </button>
          <button onClick={onClear} className="filter-btn" style={{ marginTop: 6, width: '100%' }}>
            Clear all
          </button>
          <pre style={{
            marginTop: 10, padding: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            fontSize: '0.65rem', color: 'var(--text-secondary)', overflowX: 'auto', whiteSpace: 'pre',
          }}>
            {snippet}
          </pre>
        </>
      )}
    </div>
  )
}

function InfoPanel({ view, country, state, states, cities, onStateClick, flags, loading }) {
  const navigate = useNavigate()

  const loadingNote = loading && (
    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', padding: '6px 0', fontStyle: 'italic' }}>
      Loading city data…
    </div>
  )

  if (view === 'world') return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <SectionLabel>Nations</SectionLabel>
      {COUNTRIES.map(c => {
        const flag = countryFlag(c, flags)
        return (
          <PanelRow key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {flag
                ? <img src={flag} alt="" className="flag-chip" loading="lazy" />
                : <span className="flag-chip flag-chip-empty" />}
              <Link to={`/article/${pathToSlug(c.article)}`}>{c.label}</Link>
            </div>
          </PanelRow>
        )
      })}
    </div>
  )

  if ((view === 'country' || view === 'cities') && country) return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <PanelTitle title={country.label} slug={pathToSlug(country.article)} flagUrl={countryFlag(country, flags)} />
      {loadingNote}
      {view === 'country' && (
        <>
          <SectionLabel>States</SectionLabel>
          {(states || []).map(s => (
            <PanelRow key={s.id} onClick={() => onStateClick(s.id)} clickable>
              <div style={{ fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {s.capital}{s.pop != null ? `${s.capital ? ' · ' : ''}Pop. ${s.pop.toLocaleString()}` : ''}
              </div>
            </PanelRow>
          ))}
        </>
      )}
      {view === 'cities' && cities.length > 0 && (
        <>
          <SectionLabel>Cities</SectionLabel>
          {cities.map(c => <CityRow key={c.id} city={c} navigate={navigate} />)}
        </>
      )}
    </div>
  )

  if (view === 'state' && state) {
    // enriched data for the active state (falls back to the bare shape)
    const info = (states || []).find(s => s.id === state.id) || state
    return (
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
        <PanelTitle title={state.label} slug={info.slug} />
        {loadingNote}
        <InfoRow label="Capital"    value={info.capital} />
        <InfoRow label="Population" value={info.pop != null ? info.pop.toLocaleString() : null} />
        {cities.length > 0 && (
          <>
            <SectionLabel>Cities</SectionLabel>
            {cities.map(c => <CityRow key={c.id} city={c} navigate={navigate} />)}
          </>
        )}
      </div>
    )
  }

  return null
}

function CityRow({ city, navigate }) {
  return (
    <PanelRow clickable={!!city.slug} onClick={() => { if (city.slug) navigate(`/article/${city.slug}`) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {city.capital && <span style={{ fontSize: '0.6rem', color: 'var(--text-accent)' }}>■</span>}
        <span style={{ fontWeight: city.capital ? 700 : 400 }}>{city.label}</span>
      </div>
      {city.pop != null && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Pop. {city.pop.toLocaleString()}</div>}
    </PanelRow>
  )
}

function PanelTitle({ title, slug, flagUrl }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {flagUrl && (
        <img
          src={flagUrl}
          alt={`Flag of ${title}`}
          style={{
            display: 'block', width: '100%', maxWidth: 180,
            border: '1px solid var(--border-strong)', marginBottom: 10,
          }}
        />
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{title}</div>
      {slug && <Link to={`/article/${slug}`} style={{ fontSize: '0.72rem', color: 'var(--link)' }}>Open article →</Link>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '12px 0 6px', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
      {children}
    </div>
  )
}

function PanelRow({ children, onClick, clickable }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', cursor: clickable ? 'pointer' : 'default', color: 'var(--text-primary)', transition: 'color 0.1s' }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.color = 'var(--link)' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.color = 'var(--text-primary)' }}
    >
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.78rem' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 80 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}