// ── Geography hierarchy (Country › State › City) ───────────────────
// Builds a foldable geographic tree from the vault's country/state/city
// articles, used by the Birth filter on the Browse page.
//
// Links (from article frontmatter):
//   state article:  country: "[[CountryName]]"
//   city article:   state:   "[[StateName]]"   (and country: "[[…]]")
// Wikilink targets resolve by filename base, so the canonical node name is
// the article's filename (without "NN - " prefix / ".md").

// Strip [[Target]] / [[Target|Display]] → display text. Idempotent for plain text.
export function stripWL(v) {
  if (v == null) return ''
  const s = String(v).trim()
  const m = s.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/)
  if (!m) return s
  const display = m[2] ? m[2].trim() : m[1].trim()
  // drop any #section fragment
  const hash = display.indexOf('#')
  return hash >= 0 ? display.slice(0, hash).trim() : display
}

function cleanName(path) {
  return path.split('/').pop().replace(/\.md$/, '').replace(/^\d+\s*-\s*/, '').trim()
}

function pathSegments(path) {
  return path.toLowerCase().split('/').slice(0, -1)
    .map(p => p.replace(/^\d+\s*-\s*/, '').trim())
}

// Minimal type detector for the three geo types (mirrors BrowsePage's logic
// for these segments). Returns 'country' | 'state' | 'city' | null.
export function geoTypeFromPath(path) {
  const seg = pathSegments(path)
  const lp = path.toLowerCase()
  if (seg.includes('states')) return 'state'
  if (seg.includes('cities')) return 'city'
  if (lp.includes('rest of the world') || seg.includes('countries')) return 'country'
  return null
}

// Resolve an article's geo type strictly from the frontmatter `type` field.
// The "99 - Rest of the World" folder mixes countries with rivers/seas/wars and
// many of those have no frontmatter, so the path heuristic (geoTypeFromPath) is
// only used to decide which files to fetch — never to classify nodes here.
// Real country/state/city articles always declare `type:`.
export function resolveGeoType(path, meta) {
  if (!meta || meta.type == null) return null
  const t = String(meta.type).toLowerCase().trim()
  return (t === 'country' || t === 'state' || t === 'city') ? t : null
}

// Paths of every potential country/state/city article in the tree (path-based
// pre-filter for fetching; final classification happens in buildGeoHierarchy).
export function geoPathsFromTree(tree) {
  if (!tree) return []
  return tree.filter(f => geoTypeFromPath(f.path) != null).map(f => f.path)
}

// ── Map data derivation helpers ─────────────────────────────────
// Used by the map page to derive city/state facts from frontmatter.

// Stable internal id from a display label: 'Neutral District' -> 'neutral_district'
export function slugId(label) {
  return String(label || '').toLowerCase().trim().replace(/\s+/g, '_')
}

// Latest population from frontmatter: scans population / population_YYYY keys,
// returns the value of the highest year that is non-empty. Coerces numeric
// strings like "1700000" or "1,700,000". Returns null when nothing usable.
export function latestPopulation(meta) {
  if (!meta) return null
  let best = null
  let bestYear = -1
  for (const [key, val] of Object.entries(meta)) {
    const m = key.match(/^population(?:_(\d+))?$/)
    if (!m) continue
    const n = typeof val === 'number'
      ? val
      : parseInt(String(val ?? '').replace(/[,\s]/g, ''), 10)
    if (!Number.isFinite(n)) continue
    const year = m[1] ? +m[1] : 0
    if (year > bestYear) {
      bestYear = year
      best = n
    }
  }
  return best
}

// City dot size class from population (null/unknown -> minor)
export function citySize(pop) {
  if (pop > 1_000_000) return 'major'
  if (pop > 100_000) return 'medium'
  return 'minor'
}

const UNGROUPED = 'Ungrouped'

// Build the hierarchy from already-fetched metas (metaCache: Map<path, meta>).
export function buildGeoHierarchy(tree, metaCache) {
  const countries = []           // [{ name }]
  const statesByCountry = new Map()  // countryLower -> [{ name }]
  const citiesByState = new Map()    // stateLower -> [{ name }]

  const countryNames = new Set()
  const stateNames = new Set()

  for (const f of tree || []) {
    const meta = metaCache.get(f.path) || {}
    const t = resolveGeoType(f.path, meta)
    if (!t) continue
    const name = cleanName(f.path)

    if (t === 'country') {
      countryNames.add(name.toLowerCase())
      countries.push({ name })
    } else if (t === 'state') {
      const parent = stripWL(meta.country) || UNGROUPED
      stateNames.add(name.toLowerCase())
      const key = parent.toLowerCase()
      if (!statesByCountry.has(key)) statesByCountry.set(key, { label: parent, items: [] })
      statesByCountry.get(key).items.push({ name })
    } else if (t === 'city') {
      const parent = stripWL(meta.state) || UNGROUPED
      const key = parent.toLowerCase()
      if (!citiesByState.has(key)) citiesByState.set(key, { label: parent, items: [] })
      citiesByState.get(key).items.push({ name })
    }
  }

  // Promote any state-parent country that has no country article of its own,
  // so its states are still browsable under a country row.
  for (const [key, { label }] of statesByCountry) {
    if (!countryNames.has(key)) countries.push({ name: label })
  }

  // sort everything alphabetically (Ungrouped last)
  const byName = (a, b) => {
    if (a.name === UNGROUPED) return 1
    if (b.name === UNGROUPED) return -1
    return a.name.localeCompare(b.name)
  }
  // dedupe countries by name
  const seen = new Set()
  const countriesUniq = countries.filter(c => {
    const k = c.name.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort(byName)

  for (const v of statesByCountry.values()) v.items.sort(byName)
  for (const v of citiesByState.values()) v.items.sort(byName)

  return {
    countries: countriesUniq,
    statesByCountry,   // Map<countryLower, {label, items:[{name}]}>
    citiesByState,     // Map<stateLower,   {label, items:[{name}]}>
  }
}
