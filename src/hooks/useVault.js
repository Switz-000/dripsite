import { useState, useEffect, useMemo, useReducer } from 'react'
import { candidateSlugs } from '../utils/peopleLists'
import { pathToSlug, slugToPath } from '../utils/github'
import { vault } from '../vault'
import { fetchClassSchemas } from '../utils/classSchema'
import {
  geoPathsFromTree,
  buildGeoHierarchy,
  geoTypeFromPath,
  stripWL,
  slugId,
  latestPopulation,
  citySize,
} from '../utils/geo'
import { COUNTRIES, STATES, CITIES } from '../data/mapData'

// React's view of the vault (src/vault). Reading, caching and the rules
// about articles and people live there; these hooks only subscribe a
// component to an answer.

export function useFileTree() {
  // The copy baked into the page, if any, is on screen from the first render
  const [tree, setTree] = useState(vault.peekTree())
  const [loading, setLoading] = useState(!vault.peekTree())
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    // One listing for the whole visit, shared by every component that asks
    vault.tree()
      .then(t => {
        if (!alive) return
        setTree(t)
        setLoading(false)
      })
      .catch(e => {
        if (!alive) return
        // If GitHub fails but the page came with a tree, keep using that
        if (!vault.peekTree()) setError(e.message)
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  return { tree, loading, error }
}

export function useArticle(slug) {
  // An article baked into the page at build time is already known,
  // so it renders on the very first pass, with no spinner
  const cached = slug ? vault.peekArticle(slug) : undefined
  const [article, setArticle] = useState(cached || null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState(null)
  const { tree, loading: treeLoading, error: treeError } = useFileTree()

  useEffect(() => {
    // Wait until we have the tree
    if (treeLoading) return
    if (!slug) { setLoading(false); return }

    if (treeError) {
      setError(treeError)
      setLoading(false)
      return
    }

    let alive = true
    const hit = vault.peekArticle(slug)
    if (hit) {
      setArticle(hit)
      setLoading(false)

      // A build-time copy may be older than the vault: check GitHub in the
      // background and swap in the live version only if it changed
      if (hit.fromBuild) {
        vault.refreshArticle(slug).then(live => { if (alive && live) setArticle(live) })
      }
      return () => { alive = false }
    }

    setLoading(true)
    setError(null)

    vault.article(slug)
      .then(result => {
        if (!alive) return
        if (result) setArticle(result)
        else setError(`Article not found. The link may be outdated or the article does not exist.`)
        setLoading(false)
      })
      .catch(e => {
        if (!alive) return
        setError(e.message)
        setLoading(false)
      })
    return () => { alive = false }
  }, [slug, tree, treeLoading, treeError])

  return { article, loading, error }
}

// ── Country flags ─────────────────────────────────────────────
// Map of lowercase country name -> flag image URL. Comes from the same
// listing as the file tree, so it costs no extra request.
export function useFlags() {
  const [flags, setFlags] = useState(vault.peekFlags())

  useEffect(() => {
    if (vault.peekFlags()) return
    let alive = true
    vault.flags()
      .then(m => { if (alive) setFlags(m) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return flags  // null while loading, Map when ready
}

// ── Class schemas ─────────────────────────────────────────────
export function useClassSchemas() {
  const [schemas, setSchemas] = useState(null)

  useEffect(() => {
    fetchClassSchemas()
      .then(setSchemas)
      .catch(() => setSchemas({}))
  }, [])

  return schemas  // null while loading, {} on error, { typeName: [...] } when ready
}

// ── Geography hierarchy (Country › State › City) ──────────────
// Fetches country/state/city frontmatter (when enabled) and builds the
// foldable hierarchy used by the Birth filter. Result cached per tree.
let _geoCache = null
let _geoTreeRef = null
let _geoPending = null

export function useGeoHierarchy(tree, enabled) {
  const [hierarchy, setHierarchy] = useState(_geoTreeRef === tree ? _geoCache : null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !tree) return
    if (_geoTreeRef === tree && _geoCache) { setHierarchy(_geoCache); return }

    const paths = geoPathsFromTree(tree)
    if (paths.length === 0) {
      _geoCache = buildGeoHierarchy(tree, vault.peekMeta)
      _geoTreeRef = tree
      setHierarchy(_geoCache)
      return
    }

    setLoading(true)
    if (!_geoPending || _geoTreeRef !== tree) {
      _geoTreeRef = tree
      _geoPending = Promise.all(paths.map(p => vault.meta(p).catch(() => null)))
        .then(() => {
          _geoCache = buildGeoHierarchy(tree, vault.peekMeta)
          _geoPending = null
          return _geoCache
        })
    }
    _geoPending.then(h => { setHierarchy(h); setLoading(false) })
                .catch(() => setLoading(false))
  }, [tree, enabled])

  return { hierarchy, loading }
}

// ── Map country geography ─────────────────────────────────────
// Enriches the map's slim state/city definitions ({ label, path } and
// { label, cx, cy }) with data derived from vault frontmatter: population,
// size class, state assignment, capital marker, and the article slug.
// All of a country's state+city frontmatter is fetched in one parallel
// burst on first use (the vault reads each file once), then cached per country.
const _countryGeoCache = new Map()   // country.id -> { states, cities }

async function buildCountryGeo(country, stateDefs, cityDefs, tree) {
  // Candidate article paths: everything under the country's vault folder
  // whose path marks it as a state or city article (any nesting depth).
  const paths = country.folder
    ? tree
        .filter(f => {
          if (!f.path.startsWith(country.folder + '/')) return false
          const t = geoTypeFromPath(f.path)
          return t === 'state' || t === 'city'
        })
        .map(f => f.path)
    : []

  // Country's own meta too — capital source for countries without states
  const countryMetaPromise = country.article
    ? vault.meta(country.article + '.md').catch(() => null)
    : Promise.resolve(null)

  await Promise.all(paths.map(p => vault.meta(p).catch(() => null)))
  const countryMeta = await countryMetaPromise

  // Filename (lowercase) -> article path, split by kind
  const statePathByName = new Map()
  const cityPathByName = new Map()
  for (const p of paths) {
    const base = p.split('/').pop().replace(/\.md$/, '').toLowerCase()
    if (geoTypeFromPath(p) === 'state') statePathByName.set(base, p)
    else cityPathByName.set(base, p)
  }

  const states = (stateDefs || []).map(s => {
    const articlePath = statePathByName.get(s.label.toLowerCase()) || null
    const meta = articlePath ? vault.peekMeta(articlePath) : null
    return {
      id: slugId(s.label),
      label: s.label,
      path: s.path,   // SVG shape
      capital: meta ? stripWL(meta.capital) : null,
      pop: latestPopulation(meta),
      slug: articlePath ? pathToSlug(articlePath) : null,
    }
  })

  const capitalByStateId = new Map(
    states.map(st => [st.id, (st.capital || '').toLowerCase()])
  )
  const countryCapital = countryMeta ? stripWL(countryMeta.capital).toLowerCase() : ''

  const cities = (cityDefs || []).map(c => {
    const articlePath = cityPathByName.get(c.label.toLowerCase()) || null
    const meta = articlePath ? vault.peekMeta(articlePath) : null
    const pop = latestPopulation(meta)
    const stateName = meta ? stripWL(meta.state) : ''
    const stateId = stateName ? slugId(stateName) : null
    const labelLower = c.label.toLowerCase()
    // A capital is either the seat of its state or of the whole country;
    // national wins when a city is both, so the map can star it.
    const isNational = !!countryCapital && countryCapital === labelLower
    const isStateSeat = stateId != null && capitalByStateId.get(stateId) === labelLower
    return {
      id: slugId(c.label),
      label: c.label,
      cx: c.cx,
      cy: c.cy,
      stateId,
      pop,
      size: citySize(pop),
      capital: isNational || isStateSeat,
      capitalLevel: isNational ? 'national' : isStateSeat ? 'state' : null,
      slug: articlePath ? pathToSlug(articlePath) : null,
    }
  })

  return { states, cities }
}

export function useCountryGeo(country, stateDefs, cityDefs) {
  const { tree } = useFileTree()
  const [geo, setGeo] = useState(country ? _countryGeoCache.get(country.id) ?? null : null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!country) { setGeo(null); return }

    const cached = _countryGeoCache.get(country.id)
    if (cached) { setGeo(cached); return }
    if (!tree) return

    let alive = true
    setGeo(null)
    setLoading(true)

    buildCountryGeo(country, stateDefs, cityDefs, tree)
      .then(model => {
        _countryGeoCache.set(country.id, model)
        if (alive) { setGeo(model); setLoading(false) }
      })
      .catch(() => { if (alive) setLoading(false) })

    return () => { alive = false }
    // stateDefs/cityDefs are static module data keyed by country
  }, [country, tree]) // eslint-disable-line react-hooks/exhaustive-deps

  return { geo, loading }
}

// ── All cities across the continent ───────────────────────────
// For the world/continent view: enriches every country's city definitions
// (population, size, capital, article slug) so the map can plot major cities
// even before a country is selected. Loads each country's geo once and shares
// the per-country cache with useCountryGeo, so drilling in costs no refetch.
export function useWorldCities() {
  const { tree } = useFileTree()
  const [cities, setCities] = useState([])

  useEffect(() => {
    if (!tree) return
    let alive = true

    // Only countries that actually declare cities need loading.
    const entries = COUNTRIES.filter(c => (CITIES[c.id] || []).length > 0)

    Promise.all(entries.map(async c => {
      let model = _countryGeoCache.get(c.id)
      if (!model) {
        model = await buildCountryGeo(c, STATES[c.id], CITIES[c.id], tree).catch(() => null)
        if (model) _countryGeoCache.set(c.id, model)
      }
      return model
    })).then(models => {
      if (!alive) return
      const all = []
      for (const m of models) if (m) all.push(...m.cities)
      setCities(all)
    })

    return () => { alive = false }
  }, [tree])

  return cities
}

// ── License text (landing page) ───────────────────────────────
// Read straight from the LICENSE file in dripwiki, so the site never
// keeps a second copy. undefined = not loaded yet, null = no LICENSE file.
let licenseCache

export function useLicense() {
  const [text, setText] = useState(licenseCache)

  useEffect(() => {
    if (licenseCache !== undefined) return
    vault.textOrNull('LICENSE')
      .then(t => { licenseCache = t; setText(t) })
      .catch(() => setText(null))
  }, [])

  return text
}

// ── Chronology ────────────────────────────────────────────────
// chronology.json is written by generate_chronology.py in dripwiki: every
// dated event, and every span (a term, a war, an institution's life, an
// interlude) as one row with a start and an end. undefined = not loaded,
// null = the vault has no chronology.json.
let chronologyCache

export function useChronology() {
  const [data, setData] = useState(chronologyCache)

  useEffect(() => {
    if (chronologyCache !== undefined && chronologyCache !== null && !chronologyCache.fromBuild) return
    vault.textOrNull('chronology.json')
      .then(t => (t == null ? null : JSON.parse(t)))
      .then(d => { chronologyCache = d; setData(d) })
      .catch(() => { if (chronologyCache === undefined) { chronologyCache = null; setData(null) } })
  }, [])

  return data
}

// ── Build-time data ───────────────────────────────────────────
// Hands the vault the data baked into a prerendered page (see
// scripts/prerender.mjs), so the hooks render it on the very first pass
// instead of showing a spinner and fetching it again. Called by main.jsx in
// the browser, and by the prerender in Node before it renders each page.
// Anything baked in is still refreshed from GitHub in the background.
export function primeVault({ license, chronology, ...data } = {}) {
  vault.prime(data)
  if (license !== undefined) licenseCache = license
  if (chronology !== undefined) {
    chronologyCache = chronology && { ...chronology, fromBuild: true }
  }
}

export { pathToSlug, slugToPath }

// ── People named in lists ─────────────────────────────────────
// Who the article's lists name, so their portraits can sit beside them:
// slug -> { portrait } for a person, false for anything else. The build
// bakes this into the page; anything it didn't know about, such as a link
// added since the last build, is asked of the vault here.
export function usePeople(html, tree) {
  const [, refresh] = useReducer(n => n + 1, 0)
  const slugs = useMemo(() => candidateSlugs(html || ''), [html])

  useEffect(() => {
    if (!tree) return
    const missing = slugs.filter(s => vault.peekPerson(s) === undefined)
    if (!missing.length) return
    let alive = true
    // A failed lookup stays unknown; no portrait is fine
    Promise.all(missing.map(s => vault.person(s).catch(() => {})))
      .then(() => { if (alive) refresh() })
    return () => { alive = false }
  }, [slugs, tree])

  return Object.fromEntries(slugs.map(s => [s, vault.peekPerson(s)]))
}
