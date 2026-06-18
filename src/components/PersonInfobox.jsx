import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'

// ── Wikilink helpers ────────────────────────────────────────────────
// Parses [[Target]] or [[Target|Display]] or [[Page#Section]]
function parseWL(s) {
  if (typeof s !== 'string') return null
  const m = s.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/)
  if (!m) return null
  const rawTarget = m[1].trim()
  const fragIdx = rawTarget.indexOf('#')
  const page = fragIdx >= 0 ? rawTarget.slice(0, fragIdx) : rawTarget
  const defaultDisplay = fragIdx >= 0 ? rawTarget.slice(fragIdx + 1) : rawTarget
  return { page, display: m[2] ? m[2].trim() : defaultDisplay }
}

// Renders any value that may contain [[wikilinks]], arrays, booleans, or scalars
function Field({ value, wikilinkFn, missing = '—' }) {
  if (value == null || value === '') return <span className="ibx-empty">{missing}</span>
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>
  if (typeof value === 'number') return <>{value}</>
  if (Array.isArray(value)) {
    const items = value.filter(v => v != null && v !== '')
    if (!items.length) return <span className="ibx-empty">{missing}</span>
    return <>{items.map((v, i) => (
      <React.Fragment key={i}>
        {i > 0 && ', '}
        <Field value={v} wikilinkFn={wikilinkFn} />
      </React.Fragment>
    ))}</>
  }
  const s = String(value)
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g
  const parts = []
  let last = 0, m
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    const rawTarget = m[1].trim()
    const fragIdx = rawTarget.indexOf('#')
    const page = fragIdx >= 0 ? rawTarget.slice(0, fragIdx) : rawTarget
    const defaultDisplay = fragIdx >= 0 ? rawTarget.slice(fragIdx + 1) : rawTarget
    const display = m[2] ? m[2].trim() : defaultDisplay
    const slug = wikilinkFn ? wikilinkFn(page) : null
    parts.push(slug
      ? <Link key={m.index} to={`/article/${slug}`} className="ibx-link">{display}</Link>
      : <span key={m.index} className="ibx-link-missing" title={`${page} — article not yet created`}>{display}</span>
    )
    last = re.lastIndex
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts.length ? <>{parts}</> : <>{s}</>
}

// ── Data utilities ──────────────────────────────────────────────────
// Deep emptiness test — treats null, '', empty arrays and all-empty objects as
// empty, recursively. Boolean `false` also counts as empty, so template default
// flags like `posthumous: false` don't make an otherwise-blank entry look filled.
function hasVal(v) {
  if (v == null) return false
  if (typeof v === 'boolean') return v === true
  if (Array.isArray(v)) return v.some(hasVal)
  if (typeof v === 'object') return Object.values(v).some(hasVal)
  return String(v).trim() !== ''
}

function compact(arr) {
  if (!Array.isArray(arr)) return []
  return arr.filter(hasVal)
}

function has(v) {
  return hasVal(v)
}

// Strip [[wikilink]] brackets for plain text display
function stripWL(v) {
  if (!v) return ''
  const wl = parseWL(String(v))
  return wl ? wl.display : String(v)
}

// ── Normalization — supports old flat format and new nested format ──
function normalizeMeta(raw) {
  const rec = { ...raw }
  // birth: support both birth.year (new) and birth_year (old flat)
  if (!rec.birth && (rec.birth_year || rec.birth_city)) {
    rec.birth = {
      year: rec.birth_year ?? null,
      city: rec.birth_city ?? null,
      state: rec.birth_state ?? null,
      country: rec.birth_country ?? null,
    }
  }
  // death: support both death.year (new) and death_year (old flat)
  if (!rec.death && (rec.death_year || rec.death_city)) {
    rec.death = {
      year: rec.death_year ?? null,
      city: rec.death_city ?? null,
      state: rec.death_state ?? null,
      country: rec.death_country ?? null,
      cause: rec.death_cause ?? null,
    }
  }
  // aliases: string → array
  if (typeof rec.aliases === 'string') {
    rec.aliases = rec.aliases.split(',').map(s => s.trim()).filter(Boolean)
  }
  // occupation: "Lawyer, Politician" string → array
  if (typeof rec.occupation === 'string') {
    rec.occupation = rec.occupation.split(',').map(s => s.trim()).filter(Boolean)
  }
  // criminal_charges: string[] → object[]
  if (Array.isArray(rec.criminal_charges)) {
    rec.criminal_charges = rec.criminal_charges.map(c =>
      typeof c === 'string' ? { charge: c } : c
    )
  }
  // offices: new schema renamed start_year/end_year (was start/end) and
  // parties[] (was party). Map to a single internal shape so the rest of the
  // component reads start/end/_parties regardless of source format. _parties is
  // kept as the raw array (may contain [[wikilinks]]) so each consumer can decide
  // to render it as links (offices list) or as plain text (lifeline).
  if (Array.isArray(rec.offices)) {
    rec.offices = rec.offices.map(o => {
      if (!o || typeof o !== 'object') return o
      const partyList = Array.isArray(o.parties)
        ? o.parties.filter(Boolean)
        : (o.party ? [o.party] : [])
      return {
        ...o,
        start: o.start_year ?? o.start ?? null,
        end: o.end_year ?? o.end ?? null,
        _parties: partyList,
      }
    })
  }
  return rec
}

// ── Office ranking for quick stats ─────────────────────────────────
function officeRank(o) {
  const t = (o?.title || '').toLowerCase()
  if (/(emperor|empress|king|queen|tsar|sovereign)/.test(t)) return 100
  if (/(president|head of state|presiding councillor)/.test(t)) return 90
  if (/(prime minister|premier|chancellor|head of government)/.test(t)) return 85
  if (/(governor|viceroy|grand duke)/.test(t)) return 80
  if (/(minister|secretary|councillor)/.test(t)) return 60
  if (/(senator|deputy|representative|legislator)/.test(t)) return 45
  if (/(mayor|burgomaster)/.test(t)) return 40
  if (/(judge|justice)/.test(t)) return 35
  return 10
}

function highestOffice(offices) {
  if (!offices?.length) return null
  return [...offices].sort((a, b) => officeRank(b) - officeRank(a))[0]
}

function shortOffice(o) {
  return (o.title || '')
    .replace(/^Presiding /, 'Pres. ')
    .replace(/^President /, 'Pres. ')
    .replace(/^Member of the General Government of the .*/, 'Gen. Gov.')
    .replace(/ of the Federated.*$/, '')
    .replace(/ of the .*$/, '')
    .replace(/ of .*$/, '')
    .trim() || ((o._parties || []).map(p => stripWL(String(p))).join(', ') || '')
}

function shortenTitle(t) {
  if (!t) return ''
  return t
    .replace(/^Presiding /, 'Pres. ')
    .replace(/^Member of the General Government of the .*/, 'Gen. Gov. Member')
    .replace(/ of the Federated.*$/, '')
    .replace(/ of the .*$/, '')
    .replace(/ of .*$/, '')
}

function buildQuickStats(rec) {
  const out = []
  if (rec.birth?.year && rec.death?.year) {
    out.push({ label: 'Age at death', value: rec.death.year - rec.birth.year, unit: 'yrs' })
  }
  const offices = compact(rec.offices)
  if (offices.length) {
    const o = highestOffice(offices)
    if (o) out.push({
      label: offices.length > 1 ? 'Highest office' : 'Office',
      value: `${o.start ?? '?'}–${String(o.end ?? '').slice(-2) || '?'}`,
      sub: shortOffice(o),
    })
  }
  const awards = compact(rec.awards)
  if (awards.length && out.length < 3) {
    out.push({
      label: awards.length > 1 ? 'Honours' : 'Honour',
      value: awards.length,
      sub: awards.every(a => a.posthumous) ? 'posthumous' : 'awarded',
    })
  }
  const charges = compact(rec.criminal_charges)
  if (charges.length && out.length < 3) {
    out.push({
      label: 'Charges',
      value: charges.length,
      sub: charges.some(c => /guilty/i.test(c.verdict || '')) ? 'convicted' : '—',
    })
  }
  return out.slice(0, 3)
}

function titleKicker(rec) {
  const parts = []
  const occ = compact(rec.occupation)
  if (occ.length) {
    const first = occ[0]
    parts.push(typeof first === 'string' ? first : (first.title || ''))
  }
  const charges = compact(rec.criminal_charges)
  if (charges.some(c => /treason|sedition|rebellion/i.test(c.charge || '')) && rec.death?.cause) {
    parts.push('Martyr')
  }
  return parts.join(' · ') || (rec.type || 'Person')
}

function buildTabs(rec) {
  const tabs = []
  if (['native_name','aliases','sex','ethnicity','religion','citizenship','nationality','birth','death','spouse','children_count','enhanced']
      .some(k => has(rec[k]))) {
    tabs.push({ id: 'facts', label: 'Facts' })
  }
  if (['occupation','education','offices','party','parties','organization','organizations','political_alignment','military_service']
      .some(k => has(rec[k]))) {
    tabs.push({ id: 'career', label: 'Career' })
  }
  if (['known_for','awards','era','historical_period','written_works'].some(k => has(rec[k]))) {
    tabs.push({ id: 'legacy', label: 'Legacy' })
  }
  if (has(rec.criminal_charges)) {
    tabs.push({ id: 'record', label: 'Record' })
  }
  return tabs
}

// ── Portrait + title overlay ────────────────────────────────────────
function PortraitSection({ rec, name, imageUrl }) {
  return (
    <div className="ibx-portrait-head">
      {imageUrl
        ? <img src={imageUrl} alt={name} className="ibx-portrait-img" />
        : <div className="ibx-portrait-placeholder" />
      }
      <div className="ibx-title-block">
        <div className="ibx-kicker">{titleKicker(rec)}</div>
        <div className="ibx-name">{name}</div>
        {(rec.birth?.year || rec.death?.year) && (
          <div className="ibx-dates">
            <span>{rec.birth?.year ?? '?'}</span>
            <span className="ibx-date-rule" />
            <span>{rec.death?.year ?? 'living'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Quick stats strip ───────────────────────────────────────────────
function QuickStatsRow({ stats }) {
  return (
    <div className="ibx-qstats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
      {stats.map((s, i) => (
        <div key={i} className="ibx-qstat">
          <div className="ibx-qstat-label">{s.label}</div>
          <div className="ibx-qstat-value">
            {s.value}
            {s.unit && <span className="ibx-qstat-unit">{s.unit}</span>}
          </div>
          {s.sub && <div className="ibx-qstat-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Tab bar ─────────────────────────────────────────────────────────
function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="ibx-tabs">
      {tabs.map(t => (
        <button key={t.id} className="ibx-tab-btn" data-active={String(active === t.id)}
          onClick={() => onSelect(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Row component (label + value) ───────────────────────────────────
function Row({ label, children }) {
  return (
    <div className="ibx-row">
      <span className="ibx-row-key">{label}</span>
      <div className="ibx-row-val">{children}</div>
    </div>
  )
}

// ── Facts panel ─────────────────────────────────────────────────────
function FactsPanel({ rec, wikilinkFn }) {
  const W = ({ v }) => <Field value={v} wikilinkFn={wikilinkFn} />
  return (
    <div className="ibx-dl">
      {has(rec.native_name) && <Row label="Native name"><W v={rec.native_name} /></Row>}
      {has(rec.lusitanized_name) && <Row label="Romanized"><W v={rec.lusitanized_name} /></Row>}
      {has(rec.aliases) && <Row label="Also known as"><W v={rec.aliases} /></Row>}
      {has(rec.sex) && <Row label="Sex"><W v={rec.sex} /></Row>}
      {has(rec.ethnicity) && <Row label="Ethnicity"><W v={rec.ethnicity} /></Row>}
      {has(rec.religion) && <Row label="Religion"><W v={rec.religion} /></Row>}
      {has(rec.citizenship) && <Row label="Citizenship"><W v={rec.citizenship} /></Row>}
      {has(rec.nationality) && <Row label="Nationality"><W v={rec.nationality} /></Row>}
      {has(rec.birth) && (
        <Row label="Born">
          {rec.birth.city && <Field value={rec.birth.city} wikilinkFn={wikilinkFn} />}
          {rec.birth.state && <>, <Field value={rec.birth.state} wikilinkFn={wikilinkFn} /></>}
          {rec.birth.country && <>, <Field value={rec.birth.country} wikilinkFn={wikilinkFn} /></>}
          {rec.birth.year && <div className="ibx-meta">{rec.birth.year}</div>}
        </Row>
      )}
      {has(rec.death) && (
        <Row label="Died">
          {rec.death.city && <Field value={rec.death.city} wikilinkFn={wikilinkFn} />}
          {rec.death.state && <>, <Field value={rec.death.state} wikilinkFn={wikilinkFn} /></>}
          {rec.death.country && <>, <Field value={rec.death.country} wikilinkFn={wikilinkFn} /></>}
          {rec.death.year && (
            <div className="ibx-meta">
              {rec.death.year}{rec.death.cause && ` · ${rec.death.cause}`}
            </div>
          )}
        </Row>
      )}
      {has(rec.spouse) && <Row label="Spouse"><W v={rec.spouse} /></Row>}
      {rec.children_count != null && rec.children_count !== '' && (
        <Row label="Children">{rec.children_count}</Row>
      )}
      {rec.enhanced != null && !(rec.death?.year != null && rec.death.year < 2055) && (
        <Row label="Enhanced">
          {rec.enhanced
            ? <span className="ibx-yes">Yes</span>
            : <span className="ibx-no">No</span>}
        </Row>
      )}
    </div>
  )
}

// ── Career panel ────────────────────────────────────────────────────
// IMPORTANT: the Lifeline must NEVER render clickable links. Every value here
// (title, location, party, notes) is printed as plain text, so callers building
// `events` must strip [[wikilinks]] with stripWL() before passing values in —
// do not render <Field>/<Link> inside this component.
function Lifeline({ events }) {
  return (
    <div className="ibx-lifeline">
      {events.map((e, i) => (
        <div key={i} className={`ibx-lf-item ibx-lf-${e.kind}`}>
          <span className="ibx-lf-year">{e.year}</span>
          <span className="ibx-lf-dot" />
          <div className="ibx-lf-body">
            <div className="ibx-lf-title">{e.title}</div>
            {e.span && <div className="ibx-lf-span">{e.span}</div>}
            {e.location && <div className="ibx-lf-meta">{e.location}</div>}
            {e.party && <div className="ibx-lf-meta">{e.party}</div>}
            {e.notes && <div className="ibx-lf-notes">{e.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function CareerPanel({ rec, wikilinkFn }) {
  const occ = compact(rec.occupation)
  const edu = compact(rec.education)
  const offices = compact(rec.offices)
  const align = rec.political_alignment
  const parties = [...(Array.isArray(rec.parties) ? rec.parties : []),
    ...(rec.party ? [rec.party] : [])]
    .filter((v, i, a) => v && a.indexOf(v) === i)
  const orgs = [...(Array.isArray(rec.organizations) ? rec.organizations : []),
    ...(rec.organization ? [rec.organization] : [])]
    .filter((v, i, a) => v && a.indexOf(v) === i)
  const military = compact(rec.military_service)

  const events = useMemo(() => {
    const ev = []
    if (rec.birth?.year) {
      ev.push({
        year: rec.birth.year, kind: 'birth', title: 'Born',
        location: [rec.birth.city, rec.birth.state, rec.birth.country]
          .filter(Boolean).map(stripWL).join(', ') || null,
      })
    }
    edu.forEach(e => {
      if (e.year) ev.push({
        year: e.year, kind: 'event',
        title: e.degree || 'Degree',
        location: e.institution ? stripWL(String(e.institution)) : null,
      })
    })
    offices.forEach(o => {
      if (o.start) ev.push({
        year: o.start, kind: 'office',
        title: o.title || 'Office',
        span: o.end ? `${o.start}–${o.end}` : `${o.start}–?`,
        location: o.employer ? stripWL(String(o.employer)) : null,
        party: [
          o._parties?.length ? o._parties.map(p => stripWL(String(p))).join(', ') : null,
          o.appointer ? `appt. ${stripWL(String(o.appointer))}` : null,
        ].filter(Boolean).join(' · ') || null,
        notes: o.notes || null,
      })
    })
    military.forEach(m => {
      const startY = m.start_year
      if (!startY) return
      const titleParts = [m.rank, m.branch ? stripWL(String(m.branch)) : null].filter(Boolean)
      ev.push({
        year: startY, kind: 'military',
        title: titleParts.join(', ') || 'Military service',
        span: m.end_year ? `${startY}–${m.end_year}` : `${startY}–?`,
        party: m.allegiance ? stripWL(String(m.allegiance)) : null,
        location: has(m.conflicts)
          ? compact(m.conflicts).map(c => stripWL(String(c))).join(', ')
          : null,
        notes: m.notes || null,
      })
    })
    if (rec.death?.year) {
      ev.push({
        year: rec.death.year, kind: 'death',
        title: rec.death.cause || 'Died',
        location: [rec.death.city, rec.death.state, rec.death.country]
          .filter(Boolean).map(stripWL).join(', ') || null,
      })
    }
    return ev.sort((a, b) => a.year - b.year)
  }, [rec])

  return (
    <div>
      {occ.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Occupations</div>
          <div>
            {occ.map((o, i) => {
              const label = typeof o === 'string' ? o : (o.title || '')
              const span = typeof o === 'object' && (o.start_year || o.end_year)
                ? `${o.start_year ?? '?'}–${o.end_year ?? 'present'}`
                : null
              return (
                <span key={i} className="ibx-chip">
                  {label}
                  {span && <span className="ibx-meta" style={{ marginLeft: 5 }}>{span}</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {edu.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Education</div>
          {edu.map((e, i) => (
            <div key={i} className="ibx-edu-item">
              {e.degree || '—'}
              {e.institution && <>, <Field value={e.institution} wikilinkFn={wikilinkFn} /></>}
              {e.year && <span className="ibx-meta" style={{ marginLeft: 6 }}>{e.year}</span>}
            </div>
          ))}
        </div>
      )}

      {offices.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Offices held</div>
          {offices.map((o, i) => (
            <div key={i} className="ibx-office-item">
              <div className="ibx-office-title">{o.title}</div>
              {o.employer && (
                <div className="ibx-meta"><Field value={o.employer} wikilinkFn={wikilinkFn} /></div>
              )}
              <div className="ibx-meta">
                {o.start ?? '?'}–{o.end ?? '?'}
                {o._parties?.length > 0 && <> · <Field value={o._parties} wikilinkFn={wikilinkFn} /></>}
              </div>
              {o.notes && <div className="ibx-notes">{o.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {has(align) && (
        <div className="ibx-section">
          <div className="ibx-section-label">Political alignment</div>
          <div>
            {(Array.isArray(align) ? align : [align]).map((p, i) => (
              <span key={i} className="ibx-chip">
                <Field value={p} wikilinkFn={wikilinkFn} />
              </span>
            ))}
          </div>
        </div>
      )}

      {parties.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">{parties.length > 1 ? 'Parties' : 'Party'}</div>
          {parties.map((p, i) => (
            <div key={i} className="ibx-list-item">
              <Field value={p} wikilinkFn={wikilinkFn} />
            </div>
          ))}
        </div>
      )}

      {orgs.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">{orgs.length > 1 ? 'Organizations' : 'Organization'}</div>
          {orgs.map((o, i) => (
            <div key={i} className="ibx-list-item">
              <Field value={o} wikilinkFn={wikilinkFn} />
            </div>
          ))}
        </div>
      )}

      {military.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Military service</div>
          {military.map((m, i) => (
            <div key={i} className="ibx-office-item">
              <div className="ibx-office-title">
                {m.rank && <span>{m.rank}</span>}
                {m.branch && <span>{m.rank ? ', ' : ''}<Field value={m.branch} wikilinkFn={wikilinkFn} /></span>}
                {!m.rank && !m.branch && m.allegiance && <Field value={m.allegiance} wikilinkFn={wikilinkFn} />}
              </div>
              <div className="ibx-meta">
                {m.start_year ?? '?'}–{m.end_year ?? 'present'}
                {m.allegiance && (m.rank || m.branch) && <> · <Field value={m.allegiance} wikilinkFn={wikilinkFn} /></>}
              </div>
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Lifeline</div>
          <Lifeline events={events} />
        </div>
      )}
    </div>
  )
}

// ── Legacy panel ────────────────────────────────────────────────────
function prettyEra(slug) {
  return String(slug).split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function LegacyPanel({ rec, wikilinkFn }) {
  const known = compact(rec.known_for)
  const awards = compact(rec.awards)
  const works = compact(rec.written_works)
  const eras = rec.era ?? rec.historical_period

  return (
    <div>
      {known.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Known for</div>
          <div className="ibx-kf-grid">
            {known.map((k, i) => {
              const val = typeof k === 'string' ? k : (k.item ? String(k.item) : null)
              if (!val) return null
              const wl = parseWL(val)
              const display = wl ? wl.display : val
              const slug = wl && wikilinkFn ? wikilinkFn(wl.page) : null
              return (
                <div key={i} className="ibx-kf-tile">
                  {slug
                    ? <Link to={`/article/${slug}`} className="ibx-kf-link">{display}</Link>
                    : <span>{display}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {works.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Written works</div>
          {works.map((w, i) => (
            <div key={i} className="ibx-work-item">
              <div className="ibx-work-title">
                <Field value={w.title} wikilinkFn={wikilinkFn} />
              </div>
              <div className="ibx-meta">
                {w.publication_year}{w.genre && ` · ${w.genre}`}
              </div>
              {w.notes && <div className="ibx-notes">{w.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {awards.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Awards & honours</div>
          {awards.map((a, i) => (
            <div key={i} className="ibx-award-item">
              <div className="ibx-award-title">{a.title}</div>
              <div className="ibx-meta">
                {(a.awarded_year ?? a.awarded) && `${a.awarded_year ?? a.awarded} · `}
                <Field value={a.granted_by} wikilinkFn={wikilinkFn} />
                {a.country && <>, <Field value={a.country} wikilinkFn={wikilinkFn} /></>}
                {a.posthumous && ' · posthumous'}
              </div>
              {a.notes && <div className="ibx-notes">{a.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {has(eras) && (
        <div className="ibx-part-of">
          <div className="ibx-section-label" style={{ padding: '9px 12px 5px' }}>Part of</div>
          <div style={{ padding: '0 12px 12px' }}>
            {(Array.isArray(eras) ? eras : [eras]).filter(Boolean).map((p, i) => (
              <span key={i} className="ibx-era-tag">{prettyEra(p)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Criminal record panel ────────────────────────────────────────────
function RecordPanel({ rec }) {
  const charges = compact(rec.criminal_charges)
  return (
    <div style={{ padding: '10px 12px 12px' }}>
      <div className="ibx-section-label ibx-record-label">Criminal record</div>
      {charges.map((c, i) => (
        <div key={i} className="ibx-charge-card" style={{ marginTop: i ? 8 : 6 }}>
          <div className="ibx-charge-head">
            <span className="ibx-charge-title">{c.charge || 'Unspecified charge'}</span>
            {c.counts && <span className="ibx-charge-count">×{c.counts}</span>}
          </div>
          <dl className="ibx-charge-grid">
            {c.charged_year && <><dt>Charged</dt><dd>{c.charged_year}</dd></>}
            {c.plea     && <><dt>Plea</dt>    <dd>{c.plea}</dd></>}
            {c.verdict  && <><dt>Verdict</dt> <dd className={/guilty/i.test(c.verdict) ? 'ibx-guilty' : ''}>{c.verdict}</dd></>}
            {c.verdict_year && <><dt>Verdict year</dt><dd>{c.verdict_year}</dd></>}
            {c.sentence && <><dt>Sentence</dt><dd>{c.sentence}</dd></>}
            {c.served != null && c.served !== '' && (
              <><dt>Served</dt><dd>{typeof c.served === 'boolean' ? (c.served ? 'Yes' : 'No') : c.served}</dd></>
            )}
            {c.in_absentia === true && <><dt>Trial</dt><dd>In absentia</dd></>}
          </dl>
          {c.notes && <div className="ibx-charge-notes">{c.notes}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────────
export default function PersonInfobox({ meta, title, imageUrl, wikilinkFn }) {
  const rec = useMemo(() => normalizeMeta(meta), [meta])
  const tabs = useMemo(() => buildTabs(rec), [rec])
  const [tab, setTab] = useState(() => tabs[0]?.id || 'facts')
  const stats = useMemo(() => buildQuickStats(rec), [rec])

  const name = rec.lusitanized_name || rec.native_name || title

  return (
    <aside className="ibx-person">
      <PortraitSection rec={rec} name={name} imageUrl={imageUrl} />

      {stats.length > 0 && <QuickStatsRow stats={stats} />}

      {tabs.length > 0 && <TabBar tabs={tabs} active={tab} onSelect={setTab} />}

      <div className="ibx-panel-body">
        {tab === 'facts'  && <FactsPanel  rec={rec} wikilinkFn={wikilinkFn} />}
        {tab === 'career' && <CareerPanel rec={rec} wikilinkFn={wikilinkFn} />}
        {tab === 'legacy' && <LegacyPanel rec={rec} wikilinkFn={wikilinkFn} />}
        {tab === 'record' && <RecordPanel rec={rec} wikilinkFn={wikilinkFn} />}
      </div>
    </aside>
  )
}
