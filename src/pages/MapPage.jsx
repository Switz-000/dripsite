import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pathToSlug } from '../hooks/useVault'
import { COUNTRIES, COUNTRY_VIEWBOXES, STATES, STATE_VIEWBOXES, CITIES, CITY_VISIBILITY } from '../data/mapData'

export default function MapPage() {
  const [view, setView] = useState('world')
  const [activeCountry, setActiveCountry] = useState(null)
  const [activeState, setActiveState] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredCity, setHoveredCity] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [viewBox, setViewBox] = useState('0 0 800 600')
  const navigate = useNavigate()

  function handleCountryClick(id) {
    const country = COUNTRIES.find(c => c.id === id)
    if (!country) return
    setActiveCountry(country)
    setActiveState(null)
    setView('country')
    if (COUNTRY_VIEWBOXES[id]) setViewBox(COUNTRY_VIEWBOXES[id])
  }

  function handleStateClick(id) {
    const state = (STATES[activeCountry?.id] || []).find(s => s.id === id)
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
    } else if (view === 'country') {
      setView('world')
      setActiveCountry(null)
      setViewBox('0 0 800 600')
    }
  }

  // cities visible at this zoom level
  const visibleSizes = CITY_VISIBILITY[view] || []
  function getVisibleCities() {
    if (!activeCountry) return []
    const all = CITIES[activeCountry.id] || {}
    if (view === 'state' && activeState) {
      return (all[activeState.id] || []).filter(c => visibleSizes.includes(c.size))
    }
    return Object.values(all).flat().filter(c => visibleSizes.includes(c.size))
  }
  const visibleCities = getVisibleCities()

  // scale dot size relative to current viewBox zoom
  function dotSize(size) {
    const w = parseFloat(viewBox.split(' ')[2])
    const scale = w / 800
    const base = { major: 5, medium: 3.5, minor: 2.5 }
    return (base[size] || 3) * scale
  }

  const tooltip = hoveredCity || (hoveredId ? { label: COUNTRIES.find(c => c.id === hoveredId)?.label || (STATES[activeCountry?.id] || []).find(s => s.id === hoveredId)?.label || hoveredId } : null)

  return (
    <div className="page-inner" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: 0 }}>
          {view === 'world' && 'Dripstan'}
          {view === 'country' && activeCountry?.label}
          {view === 'state' && activeState?.label}
        </h1>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {view === 'world' && 'Continente — clica num país'}
          {view === 'country' && 'País — clica num estado'}
          {view === 'state' && 'Estado — clica numa cidade'}
        </div>
        {view !== 'world' && (
          <button onClick={goBack} className="filter-btn" style={{ marginLeft: 'auto' }}>
            ← Voltar
          </button>
        )}
      </div>

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
              style={{ cursor: view === 'state' ? 'pointer' : 'default', color: view === 'state' ? 'var(--link)' : undefined }}
              onClick={() => { if (view === 'state') { setView('country'); setActiveState(null); setViewBox(COUNTRY_VIEWBOXES[activeCountry.id] || '0 0 800 600') } }}
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
          }}
        >
          <svg
            viewBox={viewBox}
            style={{ width: '100%', display: 'block', transition: 'viewBox 0.4s ease' }}
          >
            {/* Country paths — world view */}
            {COUNTRIES.map(c => (
              <path
                key={c.id}
                id={c.id}
                d={c.path}
                fill={hoveredId === c.id ? 'var(--text-accent)' : 'var(--bg-surface)'}
                stroke="var(--border-strong)"
                strokeWidth="1"
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  if (view === 'world') handleCountryClick(c.id)
                }}
              />
            ))}

            {/* State paths — country/state view */}
            {(view === 'country' || view === 'state') && activeCountry && (STATES[activeCountry.id] || []).map(s => (
              <path
                key={s.id}
                id={s.id}
                d={s.path || ''}
                fill={
                  activeState?.id === s.id
                    ? 'var(--text-accent)'
                    : hoveredId === s.id
                      ? 'color-mix(in srgb, var(--text-accent) 40%, var(--bg-surface))'
                      : 'var(--bg-surface)'
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
                  onMouseEnter={() => setHoveredCity(city)}
                  onMouseLeave={() => setHoveredCity(null)}
                  onClick={() => navigate(`/article/${pathToSlug(city.article)}`)}
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
                  {(view === 'state' || city.size === 'major') && (
                    <text
                      x={city.cx + r + 2} y={city.cy + r * 0.4}
                      fontSize={dotSize('major') * 1.8}
                      fill="var(--text-primary)"
                      fontFamily="var(--font-ui)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {city.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

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
              <div style={{ fontWeight: 600 }}>{tooltip.label}</div>
              {tooltip.pop && <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2 }}>Pop: {tooltip.pop}</div>}
              {tooltip.article && <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>Clica para abrir</div>}
            </div>
          )}

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '6px 10px', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="var(--text-primary)" /></svg>
              Capital
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--text-primary)" /></svg>
              Cidade
            </div>
          </div>
        </div>

        {/* Info panel */}
        <InfoPanel
          view={view}
          country={activeCountry}
          state={activeState}
          states={activeCountry ? STATES[activeCountry.id] : null}
          cities={visibleCities}
          onStateClick={handleStateClick}
        />
      </div>
    </div>
  )
}

function InfoPanel({ view, country, state, states, cities, onStateClick }) {
  const navigate = useNavigate()

  if (view === 'world') return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <SectionLabel>Nações</SectionLabel>
      {COUNTRIES.map(c => (
        <PanelRow key={c.id}>
          <Link to={`/article/${pathToSlug(c.article)}`}>{c.label}</Link>
        </PanelRow>
      ))}
    </div>
  )

  if (view === 'country' && country) return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <PanelTitle title={country.label} article={country.article} />
      <SectionLabel>Estados</SectionLabel>
      {(states || []).map(s => (
        <PanelRow key={s.id} onClick={() => onStateClick(s.id)} clickable>
          <div style={{ fontWeight: 600 }}>{s.label}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            {s.capital}{s.pop ? ` · Pop. ${s.pop}` : ''}
          </div>
        </PanelRow>
      ))}
    </div>
  )

  if (view === 'state' && state) return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
      <PanelTitle title={state.label} article={state.article} />
      <InfoRow label="Capital"    value={state.capital} />
      <InfoRow label="População"  value={state.pop} />
      <InfoRow label="PIB/capita" value={state.gdp ? `D$${state.gdp}` : null} />
      {cities.length > 0 && (
        <>
          <SectionLabel>Cidades</SectionLabel>
          {cities.map(c => (
            <PanelRow key={c.id} clickable onClick={() => navigate(`/article/${pathToSlug(c.article)}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {c.capital && <span style={{ fontSize: '0.6rem', color: 'var(--text-accent)' }}>■</span>}
                <span style={{ fontWeight: c.capital ? 700 : 400 }}>{c.label}</span>
              </div>
              {c.pop && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Pop. {c.pop}</div>}
            </PanelRow>
          ))}
        </>
      )}
    </div>
  )

  return null
}

function PanelTitle({ title, article }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{title}</div>
      <Link to={`/article/${pathToSlug(article)}`} style={{ fontSize: '0.72rem', color: 'var(--link)' }}>Abrir artigo →</Link>
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