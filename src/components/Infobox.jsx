import React from 'react'
import { Link } from 'react-router-dom'

const FIELD_CONFIGS = {
  person: [
    ['birth_year', 'Born'],
    ['death_year', 'Died'],
    ['death_cause', 'Cause'],
    ['birth_city', 'Birthplace'],
    ['nationality', 'Nationality'],
    ['ethnicity', 'Ethnicity'],
    ['religion', 'Religion'],
    ['occupation', 'Occupation'],
    ['party', 'Party'],
    ['enhanced', 'Enhanced'],
    ['spouse', 'Spouse'],
  ],
  company: [
    ['founded', 'Founded'],
    ['founding_place', 'Founded in'],
    ['headquarters', 'HQ'],
    ['market_cap', 'Market Cap'],
    ['yarnojte', 'Yarnojte'],
    ['yarnojte_granted', 'Status granted'],
    ['yarnojte_revoked', 'Status revoked'],
    ['sector', 'Sector'],
  ],
  state: [
    ['country', 'Country'],
    ['capital', 'Capital'],
    ['population_2070', 'Population (2070)'],
    ['gdp_per_capita_2070', 'GDP per capita'],
    ['state_animal', 'State Animal'],
    ['climate', 'Climate'],
    ['has_fez', 'Has FEZ'],
  ],
  country: [
    ['official_name', 'Official Name'],
    ['capital', 'Capital'],
    ['population_2070', 'Population (2070)'],
    ['currency', 'Currency'],
    ['religion', 'Religion'],
    ['goverment_type', 'Government'],
  ],
  city: [
    ['country', 'Country'],
    ['state', 'State'],
    ['population_2070', 'Population (2070)'],
    ['landlocked', 'Landlocked'],
  ],
  event: [
    ['date_start', 'Started'],
    ['date_end', 'Ended'],
    ['location', 'Location'],
    ['outcome', 'Outcome'],
  ],
}

const DEFAULT_FIELDS = [
  ['era', 'Era'],
  ['founded', 'Founded'],
  ['capital', 'Capital'],
]

// Fields never shown in infobox (used elsewhere in the UI)
const SKIP_FIELDS = new Set([
  'type', 'summary',
  'full_name', 'company_name', 'state_name', 'event_name', 'official_name', 'name',
])

function humanizeKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatNumber(key, val) {
  if (key.includes('market_cap')) return 'D$' + (val / 1e9).toFixed(1) + 'B'
  if (key.includes('population')) return val.toLocaleString()
  if (key.includes('gdp')) return 'D$' + val.toLocaleString()
  return val.toLocaleString()
}

function renderInlineText(text, wikilinkFn) {
  const re = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g
  const parts = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const target = m[1]
    const display = m[2] || m[1]
    const slug = wikilinkFn ? wikilinkFn(target) : null
    parts.push(
      slug
        ? <Link key={m.index} to={`/article/${slug}`} className="infobox-link">{display}</Link>
        : display
    )
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return parts
}

function renderObjectList(items, wikilinkFn) {
  return (
    <div className="infobox-obj-list">
      {items.map((obj, i) => (
        <div key={i} className="infobox-obj-item">
          {Object.entries(obj)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => (
              <div key={k} className="infobox-obj-row">
                <span className="infobox-obj-key">{humanizeKey(k)}</span>
                <span className="infobox-obj-val">{renderValue(k, v, wikilinkFn)}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}

function renderValue(key, val, wikilinkFn) {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'number') return formatNumber(key, val)
  if (Array.isArray(val)) {
    const items = val.filter(v => v !== null && v !== undefined)
    if (!items.length) return null
    if (items.some(v => typeof v === 'object' && v !== null)) {
      return renderObjectList(items, wikilinkFn)
    }
    return items.map((v, i) => (
      <React.Fragment key={i}>
        {i > 0 && ', '}
        {renderInlineText(String(v), wikilinkFn)}
      </React.Fragment>
    ))
  }
  if (typeof val === 'string') {
    if (!val.trim()) return null
    return renderInlineText(val, wikilinkFn)
  }
  return String(val)
}

export default function Infobox({ meta, title, imageUrl, wikilinkFn }) {
  if (!meta || Object.keys(meta).length === 0) return null

  const type = meta.type
  const typedConfig = FIELD_CONFIGS[type] || DEFAULT_FIELDS
  const typedKeys = new Set(typedConfig.map(([k]) => k))

  // Type-specific fields first (in configured order)
  const rows = []
  for (const [key, label] of typedConfig) {
    const val = renderValue(key, meta[key], wikilinkFn)
    if (val === null || val === undefined) continue
    rows.push({ label, val })
  }

  // Remaining meta fields not already shown
  for (const [key, rawVal] of Object.entries(meta)) {
    if (SKIP_FIELDS.has(key)) continue
    if (typedKeys.has(key)) continue
    if (rawVal === null || rawVal === undefined) continue
    const val = renderValue(key, rawVal, wikilinkFn)
    if (val === null || val === undefined) continue
    rows.push({ label: humanizeKey(key), val })
  }

  if (!rows.length && !imageUrl) return null

  return (
    <div className="infobox">
      <div className="infobox-title">{title}</div>
      {imageUrl && (
        <div className="infobox-image-wrap">
          <img src={imageUrl} alt={title} />
        </div>
      )}
      <div className="infobox-fields">
        {rows.map(({ label, val }) => (
          <div className="infobox-row" key={label}>
            <span className="infobox-key">{label}</span>
            <div className="infobox-val">{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
