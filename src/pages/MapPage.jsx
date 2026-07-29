import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pathToSlug, useFlags, useCountryGeo, useWorldCities } from '../hooks/useVault'
import { flagUrlFor } from '../utils/github'
import { slugId } from '../utils/geo'
import { COUNTRIES, COUNTRY_VIEWBOXES, STATES, CITIES, MAP_SIZING } from '../data/mapData'
import { makeLandTester, makeTextMeasurer, placeLabels, starPoints, LABEL_HALO } from '../utils/mapLabels'

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

// Geometry-derived bounding box for a path's `d` string. Rendered into the
// live <svg> just long enough to read getBBox(), so it's always in the map's
// own coordinate system regardless of the current zoom. This is why we don't
// hand-maintain per-state viewBoxes — the frame is computed from the shape.
function pathBBox(svg, d) {
  if (!svg || !d) return null
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  p.setAttribute('fill', 'none')
  svg.appendChild(p)
  const box = p.getBBox()
  svg.removeChild(p)
  return box
}

// ── Live sizing overrides ─────────────────────────────────────
// The two scale knobs (dots and labels, tuned independently) are kept in
// localStorage so a tweak survives a reload. Defaults come from MAP_SIZING.
const SIZING_KEY = 'dripwiki.map.sizing'

function loadSizing() {
  const fallback = { dot: MAP_SIZING.dot.scale, label: MAP_SIZING.label.scale }
  try {
    const saved = JSON.parse(localStorage.getItem(SIZING_KEY) || 'null')
    if (!saved) return fallback
    return {
      dot: Number.isFinite(saved.dot) ? saved.dot : fallback.dot,
      label: Number.isFinite(saved.label) ? saved.label : fallback.label,
    }
  } catch {
    return fallback
  }
}

// A viewBox string that frames `box` with a little breathing room around it.
function bboxViewBox(box, padFrac = 0.12) {
  const pad = Math.max(box.width, box.height) * padFrac
  const x = box.x - pad
  const y = box.y - pad
  const w = box.width + pad * 2
  const h = box.height + pad * 2
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
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

  // ── Sizing (dots and labels scale separately) ─────────────────
  const [sizingOpen, setSizingOpen] = useState(false)
  const [sizing, setSizing] = useState(loadSizing)

  function updateSizing(patch) {
    setSizing(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(SIZING_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  // Rendered width of the <svg> in CSS pixels. Together with the viewBox width
  // it gives the map's current scale, so marker/label sizes can be authored in
  // screen pixels and stay identical whether you're looking at a tiny state or
  // the whole continent.
  const [svgPx, setSvgPx] = useState(0)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => setSvgPx(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Frontmatter-driven geography (population, capitals, article links),
  // fetched in one burst per country and cached for the session
  const { geo, loading: geoLoading } = useCountryGeo(
    activeCountry,
    activeCountry ? STATES[activeCountry.id] : null,
    activeCountry ? CITIES[activeCountry.id] : null,
  )

  // Every country's cities, so the continent view can plot the big ones
  const worldCities = useWorldCities()

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

    // Frame the country: a hand-tuned viewBox if one exists, else derive it
    // from the country's own shape.
    const box = pathBBox(svgRef.current, country.path)
    setViewBox(COUNTRY_VIEWBOXES[id] || (box ? bboxViewBox(box, 0.06) : '0 0 800 600'))
  }

  function handleStateClick(id) {
    const state = stateShapes.find(s => s.id === id)
    if (!state) return
    setActiveState(state)
    setView('state')
    // Zoom to the state by computing its bounding box from its shape — no
    // hand-entered coordinates to get wrong.
    const box = pathBBox(svgRef.current, state.path)
    if (box) setViewBox(bboxViewBox(box))
    else if (activeCountry) setViewBox(COUNTRY_VIEWBOXES[activeCountry.id] || '0 0 800 600')
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

  // Memoised: label placement below runs over this list, and it must not be
  // redone on every hover.
  const visibleCities = useMemo(() => {
    // Continent view: the biggest cities from every country
    if (view === 'world') {
      return worldCities.filter(c => (c.cx || c.cy) && visibleSizes.includes(c.size))
    }

    if (!activeCountry || !geo) return []
    // skip cities whose coordinates haven't been set yet
    const drawable = geo.cities.filter(c => c.cx || c.cy)

    if (view === 'state' && activeState) {
      return drawable.filter(c => c.stateId === activeState.id && visibleSizes.includes(c.size))
    }

    // for 'cities' view (no states) or 'country' view — show all cities in country
    return drawable.filter(c => visibleSizes.includes(c.size))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, worldCities, activeCountry, activeState, geo])

  // Map units per CSS pixel at the current zoom. Everything drawn on top of the
  // map (dots, labels, strokes) is authored in pixels and multiplied by this,
  // so a big country and a small state render markers at the same size.
  const vb = viewBox.split(' ').map(Number)
  const unitsPerPx = svgPx > 0 ? vb[2] / svgPx : vb[2] / 800
  const px = n => n * unitsPerPx

  // Dot radius and label size are deliberately independent: each has its own
  // per-tier pixel size and its own master scale (MAP_SIZING / ⚙ Sizing panel).
  function dotSize(city) {
    const base = MAP_SIZING.dot.px[city.size] ?? MAP_SIZING.dot.px.minor
    const boost = city.capitalLevel === 'national'
      ? MAP_SIZING.dot.nationalBoost
      : city.capital ? MAP_SIZING.dot.capitalBoost : 1
    return px(base * boost * sizing.dot)
  }

  function labelSize(city) {
    const base = MAP_SIZING.label.px[city.size] ?? MAP_SIZING.label.px.minor
    return px(base * sizing.label)
  }

  // Bold names get measured as bold — otherwise their boxes come out too
  // narrow and the next label creeps into them.
  const isBold = city => !!city.capital || city.size === 'major'

  // Which cities carry a visible name at this zoom level
  const labelled = useMemo(
    () => visibleCities.filter(c => view === 'state' || view === 'cities' || c.size === 'major'),
    [visibleCities, view],
  )

  // Country outlines never change, so the point-in-land test is built once.
  const isLand = useMemo(() => makeLandTester(COUNTRIES), [])

  // Labels are measured in the map's real font. Until the webfont arrives the
  // browser measures the fallback, so re-measure (and re-place) once it loads.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return
    let alive = true
    document.fonts.ready.then(() => { if (alive) setFontsReady(true) })
    return () => { alive = false }
  }, [])

  const measure = useMemo(() => {
    if (typeof window === 'undefined') return null
    const family =
      getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'serif'
    return makeTextMeasurer(family)
    // fontsReady busts the per-label measurement cache
  }, [fontsReady])

  // Positions for every label: right of the dot by default, but moved left /
  // up / down (and out over the water near a coast) when that slot is taken.
  const labelLayout = useMemo(
    () => placeLabels(labelled, visibleCities.map(c => ({ x: c.cx, y: c.cy, r: dotSize(c) })), {
      fontSizeOf: labelSize,
      radiusOf: dotSize,
      boldOf: isBold,
      gap: px(MAP_SIZING.label.gap),
      viewBox: vb,
      isLand,
      measure,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelled, visibleCities, viewBox, unitsPerPx, sizing.dot, sizing.label, isLand, measure],
  )

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
          onClick={() => setSizingOpen(s => !s)}
          className={`filter-btn${sizingOpen ? ' active' : ''}`}
          style={{ marginLeft: 'auto' }}
        >
          ⚙ Sizing
        </button>
        <button
          onClick={() => setPickerMode(p => !p)}
          className="filter-btn"
        >
          {pickerMode ? '✕ Exit Coordinate Picker' : '📍 Coordinate Picker'}
        </button>
        {view !== 'world' && (
          <button onClick={goBack} className="filter-btn">
            ← Back
          </button>
        )}
      </div>

      {sizingOpen && (
        <div style={{
          marginBottom: 16, padding: '10px 12px', background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)', fontFamily: 'var(--font-ui)',
          fontSize: '0.72rem', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap',
        }}>
          <SizeSlider
            label="Dot size"
            value={sizing.dot}
            onChange={v => updateSizing({ dot: v })}
          />
          <SizeSlider
            label="Label size"
            value={sizing.label}
            onChange={v => updateSizing({ label: v })}
          />
          <button
            className="filter-btn"
            onClick={() => updateSizing({ dot: MAP_SIZING.dot.scale, label: MAP_SIZING.label.scale })}
          >
            Reset
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>
            Saved in this browser. To change it for everyone, set{' '}
            <code>MAP_SIZING.dot.scale</code> / <code>.label.scale</code> in <code>mapData.js</code>.
          </span>
        </div>
      )}

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
                strokeWidth={px(MAP_SIZING.stroke.country)}
                style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleCountryClick(c.id)}
              />
            ))}

            {/* State paths — kept while inside a country AND while zoomed into
                a state, so the internal borders stay visible during state zoom */}
            {(view === 'country' || view === 'state') && activeCountry && stateShapes.map(s => {
              const isActive = activeState?.id === s.id
              const fill = view === 'state'
                // zoomed in: gently tint the focused state, outline the rest
                ? (isActive ? 'color-mix(in srgb, var(--text-accent) 15%, transparent)' : 'transparent')
                : (isActive
                    ? 'var(--text-accent)'
                    : hoveredId === s.id
                      ? 'color-mix(in srgb, var(--text-accent) 40%, var(--bg-surface))'
                      : 'transparent')
              return (
                <path
                  key={s.id}
                  id={s.id}
                  d={s.path || ''}
                  fill={fill}
                  stroke="var(--border-strong)"
                  strokeWidth={px(isActive ? MAP_SIZING.stroke.stateActive : MAP_SIZING.stroke.state)}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleStateClick(s.id)}
                />
              )
            })}

            {/* City markers — star = national capital, square = state capital,
                circle = ordinary city */}
            {visibleCities.map(city => {
              const r = dotSize(city)
              const isHovered = hoveredCity?.id === city.id
              const fill = isHovered ? 'var(--text-accent)' : 'var(--text-primary)'
              const isStar = city.capitalLevel === 'national'
              const outline = {
                stroke: 'var(--bg-surface)',
                strokeWidth: r * (isStar ? MAP_SIZING.dot.starOutline : MAP_SIZING.dot.outline),
              }
              return (
                <g
                  key={city.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => { setHoveredCity(city); setHoveredId(null) }}
                  onMouseLeave={() => setHoveredCity(null)}
                  onClick={() => { if (city.slug) navigate(`/article/${city.slug}`) }}
                >
                  {isStar ? (
                    <polygon
                      points={starPoints(city.cx, city.cy, r)}
                      fill={fill} strokeLinejoin="round" {...outline}
                    />
                  ) : city.capital ? (
                    <rect
                      x={city.cx - r} y={city.cy - r}
                      width={r * 2} height={r * 2}
                      fill={fill} {...outline}
                    />
                  ) : (
                    <circle cx={city.cx} cy={city.cy} r={r} fill={fill} {...outline} />
                  )}
                </g>
              )
            })}

            {/* City labels — drawn after every marker so nothing sits on top of
                them, and positioned by the collision-aware placer */}
            <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {labelLayout.map(({ city, x, y, anchor, fontSize }) => (
                <text
                  key={city.id}
                  x={x} y={y}
                  fontSize={fontSize}
                  textAnchor={anchor}
                  fontWeight={isBold(city) ? 700 : 400}
                  fill="var(--text-primary)"
                  fontFamily="var(--font-display)"
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={fontSize * LABEL_HALO * 2}
                  strokeLinejoin="round"
                >
                  {city.label}
                </text>
              ))}
            </g>

            {/* Picked-point markers (coordinate picker) */}
            {pickerMode && pickedPoints.map((p, i) => {
              const m = px(9)   // crosshair arm length, in screen pixels
              return (
                <g key={i} style={{ pointerEvents: 'none' }}>
                  <circle cx={p.x} cy={p.y} r={m * 0.6} fill="none" stroke="#e63946" strokeWidth={m * 0.15} />
                  <line x1={p.x - m} y1={p.y} x2={p.x + m} y2={p.y} stroke="#e63946" strokeWidth={m * 0.1} />
                  <line x1={p.x} y1={p.y - m} x2={p.x} y2={p.y + m} stroke="#e63946" strokeWidth={m * 0.1} />
                  <text x={p.x + m * 1.2} y={p.y} fontSize={m} fill="#e63946" fontFamily="var(--font-ui)">{i + 1}</text>
                </g>
              )
            })}
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
              <svg width="12" height="12">
                <polygon points={starPoints(6, 6, 5.5)} fill="var(--text-primary)" />
              </svg>
              National capital
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12"><rect x="2" y="2" width="8" height="8" fill="var(--text-primary)" /></svg>
              State capital
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="var(--text-primary)" /></svg>
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

// One scale knob. Dots and labels each get their own, so they can be tuned
// against each other instead of growing and shrinking together.
function SizeSlider({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ minWidth: 68 }}>{label}</span>
      <input
        type="range"
        min="0.3" max="3" step="0.05"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: 130, accentColor: 'var(--text-accent)' }}
      />
      <span style={{ minWidth: 30, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value.toFixed(2)}
      </span>
    </label>
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
        {city.capital && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-accent)' }}>
            {city.capitalLevel === 'national' ? '★' : '■'}
          </span>
        )}
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