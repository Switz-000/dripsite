import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Portrait from '../portrait/Portrait'
import {
  personRecord, hasValue, compact, parseWikilink, isConvicted,
  occupations, quickStats as quickStatsOf, titleKicker, tabs as tabsOf,
  lifeline, parties as partiesOf, organizations as organizationsOf,
} from '../person/record.js'

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

// ── Portrait + title overlay ────────────────────────────────────────
function PortraitSection({ rec, name, imageUrl, portrait }) {
  return (
    <div className="ibx-portrait-head">
      {/* a drawn portrait (frontmatter `portrait:`) wins over an image in the article body */}
      {portrait && typeof portrait === 'object'
        ? <Portrait spec={portrait} className="ibx-portrait-drawn" />
        : imageUrl
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
function QuickStatsRow({ stats, wikilinkFn }) {
  return (
    <div className="ibx-qstats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
      {stats.map((s, i) => (
        <div key={i} className="ibx-qstat">
          <div className="ibx-qstat-label">{s.label}</div>
          <div className="ibx-qstat-value">
            {s.value}
            {s.unit && <span className="ibx-qstat-unit">{s.unit}</span>}
          </div>
          {s.sub && (() => {
            const slug = s.subLink && wikilinkFn ? wikilinkFn(s.subLink) : null
            return <div className="ibx-qstat-sub">
              {slug ? <Link to={`/article/${slug}`} className="ibx-link">{s.sub}</Link> : s.sub}
            </div>
          })()}
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
      {hasValue(rec.native_name) && <Row label="Native name"><W v={rec.native_name} /></Row>}
      {hasValue(rec.lusitanized_name) && <Row label="Romanized"><W v={rec.lusitanized_name} /></Row>}
      {hasValue(rec.aliases) && <Row label="Also known as"><W v={rec.aliases} /></Row>}
      {hasValue(rec.sex) && <Row label="Sex"><W v={rec.sex} /></Row>}
      {hasValue(rec.ethnicity) && <Row label="Ethnicity"><W v={rec.ethnicity} /></Row>}
      {hasValue(rec.religion) && <Row label="Religion"><W v={rec.religion} /></Row>}
      {hasValue(rec.citizenship) && <Row label="Citizenship"><W v={rec.citizenship} /></Row>}
      {hasValue(rec.nationality) && <Row label="Nationality"><W v={rec.nationality} /></Row>}
      {hasValue(rec.birth) && (
        <Row label="Born">
          {rec.birth.city && <Field value={rec.birth.city} wikilinkFn={wikilinkFn} />}
          {rec.birth.state && <>, <Field value={rec.birth.state} wikilinkFn={wikilinkFn} /></>}
          {rec.birth.country && <>, <Field value={rec.birth.country} wikilinkFn={wikilinkFn} /></>}
          {rec.birth.year && <div className="ibx-meta">{rec.birth.year}</div>}
        </Row>
      )}
      {hasValue(rec.death) && (
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
      {hasValue(rec.spouse) && <Row label="Spouse"><W v={rec.spouse} /></Row>}
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
// (title, location, party, notes) is printed as plain text; lifeline() in
// person/record.js strips the [[wikilinks]] — do not render <Field>/<Link>
// inside this component.
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
  const occ = occupations(rec)
  const edu = compact(rec.education)
  const titles = compact(rec.titles)
  const roles = compact(rec.roles)
  const align = rec.political_alignment
  const parties = partiesOf(rec)
  const orgs = organizationsOf(rec)
  const military = compact(rec.military_service)
  const events = useMemo(() => lifeline(rec), [rec])

  return (
    <div>
      {occ.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Occupations</div>
          <div>
            {occ.map((o, i) => (
              <span key={i} className="ibx-chip">
                {o.title}
                {o.span && <span className="ibx-meta" style={{ marginLeft: 5 }}>{o.span}</span>}
              </span>
            ))}
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

      {titles.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Offices held</div>
          {titles.map((t, i) => (
            <div key={i} className="ibx-office-item">
              <div className="ibx-office-title"><Field value={t.title} wikilinkFn={wikilinkFn} /></div>
              {t.seat && (
                <div className="ibx-meta"><Field value={t.seat} wikilinkFn={wikilinkFn} /></div>
              )}
              <div className="ibx-meta">
                {t.start ?? '?'}–{t.end ?? '?'}
                {t._parties?.length > 0 && <> · <Field value={t._parties} wikilinkFn={wikilinkFn} /></>}
                {t.appointer && <> · appt. <Field value={t.appointer} wikilinkFn={wikilinkFn} /></>}
              </div>
              {t.notes && <div className="ibx-notes">{t.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {roles.length > 0 && (
        <div className="ibx-section">
          <div className="ibx-section-label">Roles</div>
          {roles.map((r, i) => (
            <div key={i} className="ibx-office-item">
              <div className="ibx-office-title">{r.role}</div>
              {r.employer && (
                <div className="ibx-meta"><Field value={r.employer} wikilinkFn={wikilinkFn} /></div>
              )}
              <div className="ibx-meta">{r.start ?? '?'}–{r.end ?? '?'}</div>
              {r.notes && <div className="ibx-notes">{r.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {hasValue(align) && (
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
              const wl = parseWikilink(val)
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

      {hasValue(eras) && (
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
            {c.verdict  && <><dt>Verdict</dt> <dd className={isConvicted(c) ? 'ibx-guilty' : ''}>{c.verdict}</dd></>}
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
  const rec = useMemo(() => personRecord(meta), [meta])
  const tabs = useMemo(() => tabsOf(rec), [rec])
  const [tab, setTab] = useState(() => tabs[0]?.id || 'facts')
  const stats = useMemo(() => quickStatsOf(rec), [rec])

  const name = rec.lusitanized_name || rec.native_name || title

  return (
    <aside className="ibx-person">
      <PortraitSection rec={rec} name={name} imageUrl={imageUrl} portrait={meta?.portrait} />

      {stats.length > 0 && <QuickStatsRow stats={stats} wikilinkFn={wikilinkFn} />}

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
