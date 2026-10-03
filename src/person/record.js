// A person, as the site reads them: raw frontmatter in, one normalised record
// out, and every view derived from that record (the infobox header, its tabs,
// the lifeline, and the facts Browse filters on).
//
// Pure functions of plain data, no React and no browser, with relative imports
// that end in .js, so the components, the prerender and the tests all load the
// same file. The components only render what these return.

import { stripWL } from '../utils/geo.js'

// ── "Empty" and wikilinks ─────────────────────────────────────

// Deep emptiness test: null, '', empty lists and all-empty objects are empty,
// recursively. Boolean `false` counts as empty too, so template defaults such as
// `posthumous: false` don't make an otherwise blank entry look filled.
export function hasValue(v) {
  if (v == null) return false
  if (typeof v === 'boolean') return v === true
  if (Array.isArray(v)) return v.some(hasValue)
  if (typeof v === 'object') return Object.values(v).some(hasValue)
  return String(v).trim() !== ''
}

// The filled entries of a list; anything that is not a list has none.
export function compact(list) {
  return Array.isArray(list) ? list.filter(hasValue) : []
}

// A whole-value [[Target]], [[Target|Shown]] or [[Page#Section]].
export function parseWikilink(s) {
  if (typeof s !== 'string') return null
  const m = s.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/)
  if (!m) return null
  const rawTarget = m[1].trim()
  const fragIdx = rawTarget.indexOf('#')
  const page = fragIdx >= 0 ? rawTarget.slice(0, fragIdx) : rawTarget
  const defaultDisplay = fragIdx >= 0 ? rawTarget.slice(fragIdx + 1) : rawTarget
  return { page, display: m[2] ? m[2].trim() : defaultDisplay }
}

// The text a value shows without its wikilink brackets.
export function plainText(v) {
  if (!v) return ''
  const wl = parseWikilink(String(v))
  return wl ? wl.display : String(v)
}

// ── Raw frontmatter → record ──────────────────────────────────

const isBlock = v => v != null && typeof v === 'object' && !Array.isArray(v)

// Reads both the old flat format (birth_year…) and the nested one, and gives
// every field one shape. Does not change what it is given.
export function personRecord(raw) {
  const rec = { ...raw }
  if (!rec.birth && (rec.birth_year || rec.birth_city)) {
    rec.birth = {
      year: rec.birth_year ?? null,
      city: rec.birth_city ?? null,
      state: rec.birth_state ?? null,
      country: rec.birth_country ?? null,
    }
  }
  if (!rec.death && (rec.death_year || rec.death_city)) {
    rec.death = {
      year: rec.death_year ?? null,
      city: rec.death_city ?? null,
      state: rec.death_state ?? null,
      country: rec.death_country ?? null,
      cause: rec.death_cause ?? null,
    }
  }
  if (typeof rec.aliases === 'string') {
    rec.aliases = rec.aliases.split(',').map(s => s.trim()).filter(Boolean)
  }
  // occupation: "Lawyer, Politician" → list; one {title} block → list of one
  if (typeof rec.occupation === 'string') {
    rec.occupation = rec.occupation.split(',').map(s => s.trim()).filter(Boolean)
  } else if (isBlock(rec.occupation)) {
    rec.occupation = [rec.occupation]
  }
  // criminal_charges: always a list of objects
  if (rec.criminal_charges != null && !Array.isArray(rec.criminal_charges)) {
    rec.criminal_charges = [rec.criminal_charges]
  }
  if (Array.isArray(rec.criminal_charges)) {
    rec.criminal_charges = rec.criminal_charges.map(c =>
      typeof c === 'string' ? { charge: c } : c
    )
  }
  // titles: formal offices (elected or appointed). One internal shape, so the
  // rest reads start/end/_parties whatever the source format. _parties keeps the
  // raw list (it may hold [[wikilinks]]) for each consumer to render as it likes.
  if (Array.isArray(rec.titles)) {
    rec.titles = rec.titles.map(t => {
      if (!t || typeof t !== 'object') return t
      return {
        ...t,
        start: t.start_year ?? null,
        end: t.end_year ?? null,
        _parties: Array.isArray(t.parties) ? t.parties.filter(Boolean) : [],
      }
    })
  }
  // roles: jobs held, distinct from titles
  if (Array.isArray(rec.roles)) {
    rec.roles = rec.roles.map(r => {
      if (!r || typeof r !== 'object') return r
      return { ...r, start: r.start_year ?? null, end: r.end_year ?? null }
    })
  }
  return rec
}

// ── Criminal record ───────────────────────────────────────────

// A real conviction: "Guilty", "Convicted", but not "Not guilty" or "Acquitted".
export function isConvicted(charge) {
  const v = String(charge?.verdict ?? '').toLowerCase()
  return /guilty|convict/.test(v) && !/not\s+guilty|acquit/.test(v)
}

// The statuses Browse filters on, in the order it shows them.
export const RECORD_STATUSES = ['Clean record', 'Convict', 'Acquitted']

export function recordStatus(rec) {
  const charges = compact(rec.criminal_charges)
  if (charges.length === 0) return 'Clean record'
  return charges.some(isConvicted) ? 'Convict' : 'Acquitted'
}

// ── Occupations ───────────────────────────────────────────────

// [{ title, span }] for each filled occupation (a string or a {title} block).
export function occupations(rec) {
  return compact(rec.occupation).map(o => {
    if (typeof o === 'string') return { title: o, span: null }
    return {
      title: o.title || '',
      span: o.start_year || o.end_year ? `${o.start_year ?? '?'}–${o.end_year ?? 'present'}` : null,
    }
  })
}

// Just the titles, trimmed, blanks left out.
export function occupationTitles(rec) {
  return occupations(rec).map(o => String(o.title).trim()).filter(Boolean)
}

// ── Header views ──────────────────────────────────────────────

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

// The article a title's [[wikilink]] points to
function officeLink(o) {
  const m = /\[\[([^\]|#]+)/.exec(o?.title || '')
  return m ? m[1].trim() : null
}

function shortOffice(o) {
  return (o.title || '')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/^Presiding /, 'Pres. ')
    .replace(/^President /, 'Pres. ')
    .replace(/^Member of the General Government of the .*/, 'Gen. Gov.')
    .replace(/ of the Federated.*$/, '')
    .replace(/ of the .*$/, '')
    .replace(/ of .*$/, '')
    .trim() || ((o._parties || []).map(p => plainText(String(p))).join(', ') || '')
}

// Up to three headline figures: age at death, highest office, honours, charges.
export function quickStats(rec) {
  const out = []
  if (rec.birth?.year && rec.death?.year) {
    out.push({ label: 'Age at death', value: rec.death.year - rec.birth.year, unit: 'yrs' })
  }
  const titles = compact(rec.titles)
  if (titles.length) {
    const o = highestOffice(titles)
    if (o) out.push({
      label: titles.length > 1 ? 'Highest office' : 'Office',
      value: `${o.start ?? '?'}–${String(o.end ?? '').slice(-2) || '?'}`,
      sub: shortOffice(o),
      subLink: officeLink(o),
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
      sub: charges.some(isConvicted) ? 'convicted' : '—',
    })
  }
  return out.slice(0, 3)
}

export function titleKicker(rec) {
  const parts = []
  const [first] = occupations(rec)
  if (first) parts.push(first.title)
  const charges = compact(rec.criminal_charges)
  if (charges.some(c => /treason|sedition|rebellion/i.test(c.charge || '')) && rec.death?.cause) {
    parts.push('Martyr')
  }
  return parts.join(' · ') || (rec.type || 'Person')
}

// The infobox tabs that have anything to show.
export function tabs(rec) {
  const any = keys => keys.some(k => hasValue(rec[k]))
  const out = []
  if (any(['native_name', 'aliases', 'sex', 'ethnicity', 'religion', 'citizenship', 'nationality', 'birth', 'death', 'spouse', 'children_count', 'enhanced'])) {
    out.push({ id: 'facts', label: 'Facts' })
  }
  if (any(['occupation', 'education', 'titles', 'roles', 'party', 'parties', 'organization', 'organizations', 'political_alignment', 'military_service'])) {
    out.push({ id: 'career', label: 'Career' })
  }
  if (any(['known_for', 'awards', 'era', 'historical_period', 'written_works'])) {
    out.push({ id: 'legacy', label: 'Legacy' })
  }
  if (hasValue(rec.criminal_charges)) {
    out.push({ id: 'record', label: 'Record' })
  }
  return out
}

// ── Career ────────────────────────────────────────────────────

const mergedList = (list, single) =>
  [...(Array.isArray(list) ? list : []), ...(single ? [single] : [])]
    .filter((v, i, a) => v && a.indexOf(v) === i)

export const parties = rec => mergedList(rec.parties, rec.party)
export const organizations = rec => mergedList(rec.organizations, rec.organization)

// The life as dated events, oldest first. Every value is plain text (wikilinks
// stripped), because the lifeline never renders links.
export function lifeline(rec) {
  const ev = []
  if (rec.birth?.year) {
    ev.push({
      year: rec.birth.year, kind: 'birth', title: 'Born',
      location: [rec.birth.city, rec.birth.state, rec.birth.country]
        .filter(Boolean).map(plainText).join(', ') || null,
    })
  }
  compact(rec.education).forEach(e => {
    if (e.year) ev.push({
      year: e.year, kind: 'event',
      title: e.degree || 'Degree',
      location: e.institution ? plainText(String(e.institution)) : null,
    })
  })
  compact(rec.titles).forEach(t => {
    if (t.start) ev.push({
      year: t.start, kind: 'office',
      title: t.title ? plainText(String(t.title)) : 'Title',
      span: t.end ? `${t.start}–${t.end}` : `${t.start}–?`,
      location: t.seat ? plainText(String(t.seat)) : null,
      party: [
        t._parties?.length ? t._parties.map(p => plainText(String(p))).join(', ') : null,
        t.appointer ? `appt. ${plainText(String(t.appointer))}` : null,
      ].filter(Boolean).join(' · ') || null,
      notes: t.notes || null,
    })
  })
  compact(rec.roles).forEach(r => {
    if (r.start) ev.push({
      year: r.start, kind: 'event',
      title: r.role || 'Role',
      span: r.end ? `${r.start}–${r.end}` : `${r.start}–?`,
      location: r.employer ? plainText(String(r.employer)) : null,
      notes: r.notes || null,
    })
  })
  compact(rec.military_service).forEach(m => {
    const startY = m.start_year
    if (!startY) return
    const titleParts = [m.rank, m.branch ? plainText(String(m.branch)) : null].filter(Boolean)
    ev.push({
      year: startY, kind: 'military',
      title: titleParts.join(', ') || 'Military service',
      span: m.end_year ? `${startY}–${m.end_year}` : `${startY}–?`,
      party: m.allegiance ? plainText(String(m.allegiance)) : null,
      location: hasValue(m.conflicts)
        ? compact(m.conflicts).map(c => plainText(String(c))).join(', ')
        : null,
      notes: m.notes || null,
    })
  })
  if (rec.death?.year) {
    ev.push({
      year: rec.death.year, kind: 'death',
      title: rec.death.cause || 'Died',
      location: [rec.death.city, rec.death.state, rec.death.country]
        .filter(Boolean).map(plainText).join(', ') || null,
    })
  }
  return ev.sort((a, b) => a.year - b.year)
}

// ── Browse filters ────────────────────────────────────────────

// Values compare lowercase and without wikilink brackets, so a plain filter
// option matches a wikilink-valued field (birth.country: "[[Susia]]").
export function normalizeFilterValue(v) {
  if (v == null) return ''
  return stripWL(v).toLowerCase().trim()
}

// Does an article pass every active filter? `active` is Map<fieldKey, Set<normalised
// value>>; `subject` is a person's record, or any other article's frontmatter.
export function matchesFilters(subject, active) {
  for (const [key, selected] of active) {
    if (selected.size === 0) continue

    if (key.includes('.')) {
      // "parent.child", e.g. criminal_charges.verdict or birth.country
      const [parent, child] = key.split('.')
      const parentVal = subject[parent]
      const items = Array.isArray(parentVal) ? parentVal
        : parentVal && typeof parentVal === 'object' ? [parentVal]
        : []
      const match = items.some(item =>
        item && typeof item === 'object' && selected.has(normalizeFilterValue(item[child]))
      )
      if (!match) return false
    } else if (key === 'record_status') {
      if (!selected.has(normalizeFilterValue(recordStatus(subject)))) return false
    } else if (key === 'occupation') {
      if (!occupationTitles(subject).some(t => selected.has(normalizeFilterValue(t)))) return false
    } else {
      // top-level field, scalar or list
      const fieldVal = subject[key]
      if (Array.isArray(fieldVal)) {
        if (!fieldVal.some(v => selected.has(normalizeFilterValue(v)))) return false
      } else if (!selected.has(normalizeFilterValue(fieldVal))) return false
    }
  }
  return true
}
