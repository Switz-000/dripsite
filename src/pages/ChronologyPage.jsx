import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChronology, useFileTree } from '../hooks/useVault'
import { wikilinkToSlug } from '../utils/github'
import { Loading } from '../components/Loading'

// Which group an event belongs to, from the kind generate_chronology.py wrote.
const GROUP_OF = {
  Birth: 'people', Death: 'people', Appointment: 'people', 'End of tenure': 'people',
  Graduation: 'people', Enlists: 'people', Discharge: 'people', Award: 'people',
  Charged: 'people', Verdict: 'people',
  Founded: 'institutions', Dissolved: 'institutions',
  'Yarnojte granted': 'institutions', 'Yarnojte revoked': 'institutions',
  Publication: 'documents', 'Document recorded': 'documents',
}
const GROUPS = [
  ['people', 'People'],
  ['institutions', 'Institutions'],
  ['events', 'Wars and events'],
  ['documents', 'Documents'],
]
const LANES = [['titles', 'Titles'], ['events', 'Wars and events'], ['institutions', 'Institutions']]
const BIG = 10 ** 6

// Span layout, in CSS pixels. SHADES is how many --span-N colours styles.css
// offers for successive holders of the same title.
const SHADES = 6
const BAR_MIN = 6        // a single year still has to be wide enough to hit
const LABEL_GAP = 6      // between a bar and the name drawn beside it
const ROW_GAP = 8        // clear space two neighbours on one row need

function groupOf(kind) {
  return GROUP_OF[kind] || 'events'   // begins/ends, interludes
}

// Measuring has to happen before the browser paints, or the first frame shows
// the overlapping labels the layout exists to avoid. There is no DOM during
// the build-time render, where the effect never runs at all.
const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// How wide a name will be painted, in CSS pixels. A canvas measures the same
// text the browser will; the cache keeps it to one measurement per name.
let _ctx = null
const _widths = new Map()
function labelWidth(s, font) {
  const key = font + '\u0000' + s
  const hit = _widths.get(key)
  if (hit !== undefined) return hit
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
  _ctx.font = font
  const w = _ctx.measureText(s).width
  _widths.set(key, w)
  return w
}

// [[Target|Label]] and *italics* as React nodes
function text(raw, tree) {
  const out = []
  let last = 0
  const re = /\[\[([^\]]+)\]\]|\*([^*]+)\*/g
  let m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push(raw.slice(last, m.index))
    if (m[1] !== undefined) {
      const [target, label] = m[1].split('|')
      const slug = tree ? wikilinkToSlug(target, tree) : null
      out.push(slug
        ? <Link key={out.length} to={`/article/${slug}`}>{(label || target).trim()}</Link>
        : <span key={out.length} className="chrono-missing">{(label || target).trim()}</span>)
    } else {
      out.push(<em key={out.length}>{m[2]}</em>)
    }
    last = re.lastIndex
  }
  if (last < raw.length) out.push(raw.slice(last))
  return out
}

export default function ChronologyPage() {
  const data = useChronology()
  const { tree } = useFileTree()
  const [view, setView] = useState('timeline')
  const [groups, setGroups] = useState(() => new Set(GROUPS.map(g => g[0])))
  const [country, setCountry] = useState('all')
  const [from, setFrom] = useState('1900')

  const events = data?.events || []
  const spans = data?.spans || []

  const countries = useMemo(
    () => [...new Set(events.map(e => e.country).filter(Boolean))].sort(),
    [events])

  const shown = useMemo(
    () => events.filter(e => groups.has(groupOf(e.kind)) && (country === 'all' || e.country === country)),
    [events, groups, country])

  const years = events.map(e => e.year)
  const min = years.length ? Math.min(...years) : 0
  const max = years.length ? Math.max(...years) : 0

  if (data === undefined) return <div className="page-inner"><Loading /></div>
  if (!data || !events.length) {
    return (
      <div className="page-inner">
        <h1 className="article-title">Chronology</h1>
        <p className="chrono-lede">No chronology has been generated for this vault yet.</p>
      </div>
    )
  }

  function toggle(g) {
    setGroups(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  return (
    <div className="page-inner chrono">
      <div className="article-type-badge">Index</div>
      <h1 className="article-title">Chronology</h1>
      <p className="chrono-lede">
        <strong>{events.length}</strong> dated events from <strong>{min}</strong> to <strong>{max}</strong>,
        taken from the frontmatter of the articles they belong to.
      </p>

      <div className="chrono-bar">
        <div className="chrono-row">
          <div className="chrono-tabs">
            <button onClick={() => setView('timeline')} aria-pressed={view === 'timeline'}>Timeline</button>
            <button onClick={() => setView('spans')} aria-pressed={view === 'spans'}>Spans</button>
          </div>
          {GROUPS.map(([g, label]) => {
            const n = events.filter(e => (country === 'all' || e.country === country) && groupOf(e.kind) === g).length
            return (
              <button key={g} className={`chrono-chip g-${g}`} aria-pressed={groups.has(g)} onClick={() => toggle(g)}>
                <span className="chrono-dot" />{label}<span className="chrono-n">{n}</span>
              </button>
            )
          })}
          <span className="chrono-spacer" />
          <select value={country} onChange={e => setCountry(e.target.value)} aria-label="Country">
            <option value="all">All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {view === 'spans' && (
            <select value={from} onChange={e => setFrom(e.target.value)} aria-label="From year">
              <option value="all">All years</option>
              <option value="1800">From 1800</option>
              <option value="1900">From 1900</option>
              <option value="1950">From 1950</option>
            </select>
          )}
        </div>
        {view === 'timeline' && <Strip events={shown} min={min} max={max} />}
      </div>

      {view === 'timeline'
        ? <Timeline events={shown} tree={tree} showCountry={country === 'all'} />
        : <Spans spans={spans} groups={groups} country={country} from={from} max={max} tree={tree} />}
    </div>
  )
}

// ── Decade strip ──────────────────────────────────────────────
function Strip({ events, min, max }) {
  const first = Math.floor(min / 10) * 10
  const last = Math.floor(max / 10) * 10
  const decades = []
  for (let d = first; d <= last; d += 10) decades.push(d)
  const counts = decades.map(d => GROUPS.map(([g]) =>
    events.filter(e => groupOf(e.kind) === g && e.year >= d && e.year < d + 10).length))
  const peak = Math.max(1, ...counts.map(c => c.reduce((a, b) => a + b, 0)))

  function jump(d) {
    const target = document.querySelector(`[data-year="${d}"]`)
      || [...document.querySelectorAll('[data-year]')].find(el => +el.dataset.year >= d)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="chrono-strip">
        {decades.map((d, i) => {
          const total = counts[i].reduce((a, b) => a + b, 0)
          return (
            <button key={d} className={'chrono-dec' + (total ? '' : ' empty')}
                    title={`${d}s: ${total}`} onClick={() => jump(d)}>
              {counts[i].map((n, j) => n
                ? <span key={j} className={`g-${GROUPS[j][0]}`} style={{ height: `${(n / peak) * 100}%` }} />
                : null)}
            </button>
          )
        })}
      </div>
      <div className="chrono-axis"><span>{first}</span><span>{last}s</span></div>
    </>
  )
}

// ── Timeline ──────────────────────────────────────────────────
function Timeline({ events, tree, showCountry }) {
  const byYear = new Map()
  for (const e of events) {
    if (!byYear.has(e.year)) byYear.set(e.year, [])
    byYear.get(e.year).push(e)
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  if (!years.length) return <p className="chrono-empty">Nothing matches these filters.</p>

  const out = []
  let prev = null
  for (const y of years) {
    if (prev !== null && y - prev > 25) {
      out.push(<div className="chrono-gap" key={`gap${y}`}>{y - prev - 1} years with nothing recorded</div>)
    }
    out.push(
      <section className="chrono-year" key={y} data-year={y}>
        <div className="chrono-ylabel">{y}</div>
        <ul>
          {byYear.get(y).map((e, i) => (
            <li key={i} className={`chrono-ev g-${groupOf(e.kind)}`}>
              <span className="chrono-kind">{e.kind}</span>
              {text(e.text, tree)}
              {showCountry && e.country ? <span className="chrono-country">{e.country}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    )
    prev = y
  }
  return <div className="chrono-timeline">{out}</div>
}

// ── Spans ─────────────────────────────────────────────────────
// Laying out a lane row is a packing problem: a bar is only as wide as the
// years it covers, but the name beside it has a fixed width in pixels, so on a
// long timeline the names of short tenures run straight into each other.
// layoutRow measures every name, finds it a place (inside the bar, clear of it
// on either side, or on its own line above), and then packs the bars into as
// many stacked rows as it takes for nothing to overlap.
function layoutRow(items, geom, pct, lo, max) {
  const { px, font, bold } = geom
  const laid = items.map(s => {
    const a = pct(s.start ?? lo)
    const b = pct(s.end ?? max + 1)
    const left = (a / 100) * px
    const width = Math.max(((b - a) / 100) * px, BAR_MIN)
    const label = s.holder || s.label
    // Before the first measurement there is nothing to measure against, so
    // every name goes to the right — what the browser would do anyway.
    let place = 'right'
    let nameW = 0
    let offset = 0
    if (px) {
      nameW = labelWidth(label, font)
      if (width >= labelWidth(label, bold) + 14) place = 'inside'
      else if (left + width + LABEL_GAP + nameW <= px) place = 'right'
      else if (left - LABEL_GAP - nameW >= 0) place = 'left'
      else {
        // Nothing fits beside the bar, which on a phone is most of them:
        // the name goes above it, pulled back to stay inside the track.
        place = 'over'
        offset = Math.max(0, Math.min(left, px - nameW)) - left
      }
    }
    const label0 = place === 'left' ? left - LABEL_GAP - nameW
      : place === 'over' ? Math.min(left, left + offset)
      : left
    const label1 = place === 'right' ? left + width + LABEL_GAP + nameW
      : place === 'over' ? Math.max(left + width, left + offset + nameW)
      : left + width
    return { span: s, a, b, place, offset, from: label0, to: label1 }
  })

  const stacks = []
  for (const it of laid) {
    const row = stacks.find(r => r.to + ROW_GAP <= it.from)
      || (stacks.push({ to: -BIG, items: [] }), stacks[stacks.length - 1])
    row.items.push(it)
    row.to = Math.max(row.to, it.to)
  }
  return stacks.map(r => r.items)
}

function Spans({ spans, groups, country, from, max, tree }) {
  const wrap = useRef(null)
  const [geom, setGeom] = useState({ px: 0, font: '', bold: '' })

  const laneGroup = { titles: 'people', institutions: 'institutions', events: 'events' }
  const start = from === 'all' ? null : +from
  const rows = spans.filter(s =>
    groups.has(laneGroup[s.lane] || 'events')
    && (country === 'all' || s.country === country)
    && (start === null || (s.end ?? max) >= start))

  // The width of a track, and the font its names are painted in. Read before
  // the browser paints, so the very first frame is already laid out, and
  // again whenever the page is resized.
  useMeasureEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const track = el.querySelector('.chrono-track')
      if (!track) return
      const px = track.getBoundingClientRect().width
      const cs = getComputedStyle(el.querySelector('.chrono-who') || el)
      setGeom(prev => {
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        return prev.px === px && prev.font === font
          ? prev
          : { px, font, bold: `${cs.fontStyle} 600 ${cs.fontSize} ${cs.fontFamily}` }
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows.length])

  if (!rows.length) return <p className="chrono-empty">Nothing matches these filters.</p>

  const lo = start ?? Math.floor(Math.min(...rows.map(s => s.start ?? max)) / 10) * 10
  const hi = Math.ceil((max + 1) / 10) * 10
  const pct = y => ((Math.max(y, lo) - lo) / (hi - lo)) * 100
  const step = hi - lo > 300 ? 50 : hi - lo > 120 ? 25 : 10
  const ticks = []
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) ticks.push(y)

  const slugOf = label => (label && tree ? wikilinkToSlug(label, tree) : null)

  // One bar. The whole bar is the link to whoever held it, so clicking the
  // bar and clicking the name beside it both open their article.
  function bar(it, rowLabel, color, key) {
    const s = it.span
    const label = s.holder || s.label
    const slug = s.interlude ? null : slugOf(label)
    const years = s.end == null ? `${s.start} to ?`
      : s.start === s.end ? `${s.start}`
      : `${s.start}–${s.end}`
    const cls = 'chrono-span at-' + it.place
      + (s.end == null ? ' open' : '')
      + (s.interlude ? ' interlude' : '')
    const name = (
      <span className="chrono-who"
            style={it.place === 'over' ? { left: `${it.offset}px`, maxWidth: `${geom.px}px` } : undefined}>
        {s.interlude ? <em>{label}</em> : label}
      </span>
    )
    const props = {
      className: cls,
      style: { left: `${it.a}%`, width: `${Math.max(it.b - it.a, 0.3)}%`, '--c': color },
      title: rowLabel && rowLabel !== label ? `${label} — ${rowLabel}, ${years}` : `${label}, ${years}`,
    }
    return slug
      ? <Link key={key} to={`/article/${slug}`} {...props}>{name}</Link>
      : <div key={key} {...props}>{name}</div>
  }

  const grid = <div className="chrono-grid">{ticks.map(y => <i key={y} style={{ left: `${pct(y)}%` }} />)}</div>

  return (
    <div className="chrono-spans" ref={wrap}>
      <div className="chrono-saxis">
        <div />
        <div className="chrono-ticks">{ticks.map(y => <span key={y} style={{ left: `${pct(y)}%` }}>{y}</span>)}</div>
      </div>
      {LANES.map(([lane, laneLabel]) => {
        const ls = rows.filter(s => s.lane === lane).sort((x, y) => (x.start ?? 0) - (y.start ?? 0))
        if (!ls.length) return null
        // Titles get one row per title, holders side by side; overlapping
        // holders, and interludes, stack underneath.
        const keys = lane === 'titles'
          ? [...new Set(ls.map(s => s.display || s.title || s.label))]
          : ls.map(s => s.label)
        return (
          <div className="chrono-lane" key={lane}>
            <h2>{laneLabel}</h2>
            {keys.map(k => {
              const items = lane === 'titles'
                ? ls.filter(s => (s.display || s.title || s.label) === k)
                : ls.filter(s => s.label === k)
              // The row's own article: the title as it is written here, or
              // the canonical title the vault filed these tenures under.
              const rowSlug = slugOf(k) || slugOf(items[0].title)
              // Successive holders take the next colour in the palette, so
              // one tenure is visibly a different person from the next; a
              // holder who comes back later keeps the colour they had.
              const shade = new Map()
              for (const s of items) {
                const who = s.holder || s.label
                if (!s.interlude && !shade.has(who)) shade.set(who, `var(--span-${shade.size % SHADES})`)
              }
              // Institutions and wars keep their group's colour from the
              // filter chips; only titles cycle through holders.
              const colorOf = s => (s.interlude ? null
                : lane === 'titles' ? shade.get(s.holder || s.label)
                : `var(--${lane})`)
              // A title whose holders did not fit on one row gets several,
              // with the title written once and a rule down the gutter
              // holding them together.
              const stacks = layoutRow(items, geom, pct, lo, max)
              return stacks.map((row, i) => (
                <div key={k + i}
                     className={'chrono-srow'
                       + (stacks.length > 1 ? ' grouped' : '')
                       + (row.some(it => it.place === 'over') ? ' tall' : '')}>
                  <div className="chrono-slabel" title={k}>
                    {i > 0 ? '' : rowSlug ? <Link to={`/article/${rowSlug}`}>{k}</Link> : k}
                  </div>
                  <div className="chrono-track">
                    {grid}
                    {row.map((it, j) => bar(it, k, colorOf(it.span), j))}
                  </div>
                </div>
              ))
            })}
          </div>
        )
      })}
    </div>
  )
}
