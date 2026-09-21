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
const BAR_MIN = 6        // unfolded, a single year still has to be wide enough to hit
const BAR_HAIR = 1       // folded, a term is only ever as wide as the years it ran
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
//
// Which of the two gives way is what folding decides. Unfolded, the names win:
// each is placed inside its bar or clear of it, and the bars stack into as
// many lines as that takes. Folded, the bars win: they are drawn at their true
// width, a title's whole succession sits on one line, and a name is only drawn
// where it happens to fit. A title whose terms genuinely overlap in time still
// takes more than one line, folded or not.
function layoutRow(items, geom, pct, lo, max, folded) {
  const { px, font, bold } = geom
  const laid = items.map(s => {
    const label = s.holder || s.label
    // The right edge comes from b, not from left + width, so that a term
    // ending in the year the next one starts lands on exactly its edge.
    const a = pct(s.start ?? lo)
    const b = pct(s.end ?? max + 1)
    const left = (a / 100) * px
    const right = Math.max((b / 100) * px, left + (folded ? BAR_HAIR : BAR_MIN))
    return {
      span: s, a, b, left, right, label, place: 'right', offset: 0,
      // Before the first measurement there is nothing to measure against, so
      // every name goes to the right — what the browser would do anyway.
      nameW: px ? labelWidth(label, font) : 0,
      insideW: px ? labelWidth(label, bold) + 14 : Infinity,
    }
  })

  // Where a name can go above its bar without leaving the track.
  const over = it => Math.max(0, Math.min(it.left, px - it.nameW))

  if (!folded) {
    for (const it of laid) {
      if (!px) continue
      if (it.right - it.left >= it.insideW) it.place = 'inside'
      else if (it.right + LABEL_GAP + it.nameW <= px) it.place = 'right'
      else if (it.left - LABEL_GAP - it.nameW >= 0) it.place = 'left'
      else {
        // Nothing fits beside the bar, which on a phone is most of them:
        // the name goes above it, pulled back to stay inside the track.
        it.place = 'over'
        it.offset = over(it) - it.left
      }
    }
  }

  // What each bar takes up on its line: the bar itself, plus the name when
  // the name is what keeps the next bar away — which is never so folded.
  const from = it => (it.place === 'left' && !folded ? it.left - LABEL_GAP - it.nameW : it.left)
  const to = it => (folded ? it.right
    : it.place === 'right' ? it.right + LABEL_GAP + it.nameW
    : it.place === 'over' ? Math.max(it.right, it.left + it.offset + it.nameW)
    : it.right)

  const stacks = []
  const gap = folded ? 0 : ROW_GAP
  for (const it of laid) {
    // Half a pixel of slack, since the percentages the bars are drawn from
    // do not always come back as the same float on both sides of an edge.
    const row = stacks.find(r => r.to + gap <= from(it) + 0.5)
      || (stacks.push({ to: -BIG, items: [] }), stacks[stacks.length - 1])
    row.items.push(it)
    row.to = Math.max(row.to, to(it))
  }

  // Folded, the names are placed last, into whatever room the bars left: a
  // lone term still gets its name, a crowded succession goes on colour alone
  // and leaves the names to the tooltip, or to unfolding.
  if (folded && px) {
    for (const row of stacks) {
      let occupied = 0        // right edge of everything already drawn on this line
      const above = []        // and the stretches taken by names sitting above it
      row.items.forEach((it, i) => {
        const limit = i + 1 < row.items.length ? row.items[i + 1].left : px
        const l0 = over(it)
        if (it.right - it.left >= it.insideW) it.place = 'inside'
        else if (it.right + LABEL_GAP + it.nameW <= limit) {
          it.place = 'right'
          occupied = it.right + LABEL_GAP + it.nameW
        } else if (it.left - LABEL_GAP - it.nameW >= occupied) it.place = 'left'
        else {
          // A name longer than the whole track is clipped by the track's
          // width, so what it takes up above the bars stops there too.
          const l1 = Math.min(l0 + it.nameW, px)
          if (above.some(([x0, x1]) => l0 < x1 && x0 < l1)) it.place = 'none'
          else {
            it.place = 'over'
            it.offset = l0 - it.left
            above.push([l0, l1])
          }
        }
        occupied = Math.max(occupied, it.right)
      })
    }
  }

  return stacks.map(r => r.items)
}

function Spans({ spans, groups, country, from, max, tree }) {
  const wrap = useRef(null)
  const [geom, setGeom] = useState({ px: 0, font: '', bold: '' })
  // Titles the reader has unfolded into one line per term. Everything starts
  // folded: a title is a line, and its terms are the colours along it.
  const [unfolded, setUnfolded] = useState(() => new Set())

  function toggleFold(id) {
    setUnfolded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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
      const cs = getComputedStyle(el.querySelector('.chrono-probe'))
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
    const name = it.place === 'none' ? null : (
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
      {/* Never drawn; it is what the names are measured against, and it is
          here so a folded lane with no name in it still has a font to read. */}
      <span className="chrono-who chrono-probe" aria-hidden="true">M</span>
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
              const id = lane + '\u0000' + k
              const folded = !unfolded.has(id)
              const stacks = layoutRow(items, geom, pct, lo, max, folded)
              return stacks.map((row, i) => (
                <div key={k + i}
                     className={'chrono-srow'
                       + (folded ? ' folded' : '')
                       + (stacks.length > 1 ? ' grouped' : '')
                       + (row.some(it => it.place === 'over') ? ' tall' : '')}>
                  <div className="chrono-slabel" title={k}>
                    {i > 0 ? null : <>
                      <span>{rowSlug ? <Link to={`/article/${rowSlug}`}>{k}</Link> : k}</span>
                      {items.length > 1
                        ? <button className="chrono-fold" onClick={() => toggleFold(id)}
                                  aria-expanded={!folded}
                                  title={`${folded ? 'Unfold' : 'Fold'} ${k}`}
                                  aria-label={`${folded ? 'Unfold' : 'Fold'} ${k}`}>
                            {folded ? '▸' : '▾'}
                          </button>
                        : <span className="chrono-fold-spacer" />}
                    </>}
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
