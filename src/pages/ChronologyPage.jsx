import React, { useMemo, useState } from 'react'
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

function groupOf(kind) {
  return GROUP_OF[kind] || 'events'   // begins/ends, interludes
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
function Spans({ spans, groups, country, from, max, tree }) {
  const laneGroup = { titles: 'people', institutions: 'institutions', events: 'events' }
  const start = from === 'all' ? null : +from
  const rows = spans.filter(s =>
    groups.has(laneGroup[s.lane] || 'events')
    && (country === 'all' || s.country === country)
    && (start === null || (s.end ?? max) >= start))
  if (!rows.length) return <p className="chrono-empty">Nothing matches these filters.</p>

  const lo = start ?? Math.floor(Math.min(...rows.map(s => s.start ?? max)) / 10) * 10
  const hi = Math.ceil((max + 1) / 10) * 10
  const pct = y => ((Math.max(y, lo) - lo) / (hi - lo)) * 100
  const step = hi - lo > 300 ? 50 : hi - lo > 120 ? 25 : 10
  const ticks = []
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) ticks.push(y)

  const slugOf = label => (tree ? wikilinkToSlug(label, tree) : null)

  function bar(s, key) {
    const a = pct(s.start ?? lo)
    const b = pct(s.end ?? max + 1)
    const open = s.end == null
    const label = s.holder || s.label
    const slug = slugOf(label)
    const years = open ? `${s.start} to ?` : s.start === s.end ? `${s.start}` : `${s.start}–${s.end}`
    const wide = b - a > 16
    return (
      <div key={key} className={`chrono-span${open ? ' open' : ''}${wide ? ' inside' : ''}${!wide && b > 80 ? ' flip' : ''}`}
           style={{ left: `${a}%`, width: `${Math.max(b - a, 0.4)}%` }}
           title={`${label}, ${years}`}>
        <span className="chrono-who">
          {slug && !s.interlude ? <Link to={`/article/${slug}`}>{label}</Link> : <em>{label}</em>}
        </span>
      </div>
    )
  }

  const grid = <div className="chrono-grid">{ticks.map(y => <i key={y} style={{ left: `${pct(y)}%` }} />)}</div>

  return (
    <div className="chrono-spans">
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
              const stacks = []
              for (const s of items) {
                const row = stacks.find(r => r.end <= (s.start ?? 0)) || (stacks.push({ end: -BIG, items: [] }), stacks[stacks.length - 1])
                row.items.push(s)
                row.end = s.end ?? max + 1
              }
              return stacks.map((row, i) => (
                <div className="chrono-srow" key={k + i}>
                  <div className="chrono-slabel" title={k}>{i === 0 ? k : ''}</div>
                  <div className="chrono-track">{grid}{row.items.map((s, j) => bar(s, j))}</div>
                </div>
              ))
            })}
          </div>
        )
      })}
    </div>
  )
}
