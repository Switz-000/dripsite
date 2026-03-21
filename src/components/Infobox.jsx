import React from 'react'

// Fields to display per article type, in order
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
  ['type', 'Type'],
  ['era', 'Era'],
  ['founded', 'Founded'],
  ['capital', 'Capital'],
]

function formatValue(key, val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (Array.isArray(val)) {
    const items = val.filter(Boolean)
    if (!items.length) return null
    return items
      .map(v => {
        // Strip [[wikilink]] syntax
        if (typeof v === 'string') return v.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, p, a) => a || p)
        return String(v)
      })
      .join(', ')
  }
  if (typeof val === 'string') {
    return val.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, p, a) => a || p)
  }
  if (typeof val === 'number') {
    if (key.includes('market_cap')) {
      return 'D$' + (val / 1e9).toFixed(1) + 'B'
    }
    if (key.includes('population')) {
      return val.toLocaleString()
    }
    if (key.includes('gdp')) {
      return 'D$' + val.toLocaleString()
    }
    return val.toLocaleString()
  }
  return String(val)
}

export default function Infobox({ meta, title }) {
  if (!meta || Object.keys(meta).length === 0) return null

  const type = meta.type
  const fields = FIELD_CONFIGS[type] || DEFAULT_FIELDS

  const rows = fields
    .map(([key, label]) => {
      const val = formatValue(key, meta[key])
      if (!val) return null
      return { label, val }
    })
    .filter(Boolean)

  if (!rows.length) return null

  return (
    <div className="infobox">
      <div className="infobox-title">{title}</div>
      {rows.map(({ label, val }) => (
        <div className="infobox-row" key={label}>
          <span className="infobox-key">{label}</span>
          <span className="infobox-val">{val}</span>
        </div>
      ))}
    </div>
  )
}
