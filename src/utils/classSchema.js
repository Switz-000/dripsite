import { REPO_CONFIG, fetchMarkdown } from './github.js'

// ── Class file list ────────────────────────────────────────────
async function fetchClassFileList() {
  const base = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`
  const headers = { Accept: 'application/vnd.github.v3+json' }
  if (REPO_CONFIG.token) headers['Authorization'] = `Bearer ${REPO_CONFIG.token}`

  const res = await fetch(`${base}/contents/00%20-%20Meta%2FClass`, { headers })
  if (!res.ok) return []
  const files = await res.json()
  return Array.isArray(files) ? files.filter(f => f.name.endsWith('.md') && f.type === 'file') : []
}

// ── Parser ─────────────────────────────────────────────────────
// Extracts field definitions from a Metadata Menu Class file.
// The files use YAML frontmatter with a `fields` array where each
// field has: name, type, path (parent object id or ""), id, options.valuesList
function parseClassFile(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return []

  const lines = match[1].split('\n')
  const allFields = []
  let i = 0

  while (i < lines.length) {
    // Field start: "  - name: fieldname"
    const nameMatch = lines[i].match(/^\s*-\s+name:\s+(\S+)/)
    if (nameMatch) {
      const name = nameMatch[1]
      let type = null
      let path = ''
      let id = null
      const valuesList = []
      let j = i + 1

      // Read until next field starts
      while (j < lines.length && !lines[j].match(/^\s*-\s+name:/)) {
        const m = lines[j]

        const tm = m.match(/^\s+type:\s+(\w+)/)
        if (tm) type = tm[1]

        const pm = m.match(/^\s+path:\s+"([^"]*)"/)
        if (pm) path = pm[1]

        const im = m.match(/^\s+id:\s+(\S+)/)
        if (im) id = im[1]

        // valuesList entries look like:  "1": Male  (with any indentation)
        const vm = m.match(/^\s+"?\d+"?:\s+(.+)$/)
        if (vm) {
          const val = vm[1].trim()
          if (val) valuesList.push(val)
        }

        j++
      }

      allFields.push({ name, type, path, id, valuesList })
      i = j
    } else {
      i++
    }
  }

  return allFields
}

// ── Schema builder ─────────────────────────────────────────────
// Turns raw field list into a clean filter schema:
//   [ { name, label, options, nested: false }
//   | { name, label, isGroup: true, children: [...] } ]
function formatLabel(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildFilterSchema(allFields) {
  // Map object-field id -> object-field name (for grouping nested selects)
  const idToName = {}
  allFields.forEach(f => { if (f.id) idToName[f.id] = f.name })

  const schema = []

  // Top-level Select fields (path === "")
  allFields
    .filter(f => f.type === 'Select' && f.path === '' && f.valuesList.length > 0)
    .forEach(f => {
      schema.push({ name: f.name, label: formatLabel(f.name), options: f.valuesList, nested: false })
    })

  // Top-level Object fields whose children include Select fields
  allFields
    .filter(f => f.type === 'Object' && f.path === '')
    .forEach(obj => {
      const children = allFields.filter(
        f => f.type === 'Select' && f.path === obj.id && f.valuesList.length > 0
      )
      if (children.length === 0) return
      schema.push({
        name: obj.name,
        label: formatLabel(obj.name),
        isGroup: true,
        children: children.map(c => ({
          name: c.name,
          label: formatLabel(c.name),
          options: c.valuesList,
          nested: true,
          parentName: obj.name,
        })),
      })
    })

  return schema
}

// ── Public API ─────────────────────────────────────────────────
// Returns: Map<typeName, FilterSchema[]>
// e.g.  { person: [...], company: [...] }
let _cache = null
let _pending = null

export async function fetchClassSchemas() {
  if (_cache) return _cache
  if (_pending) return _pending

  _pending = (async () => {
    const files = await fetchClassFileList()
    const schemas = {}

    await Promise.all(
      files.map(async f => {
        const typeName = f.name.replace(/\.md$/, '').toLowerCase()
        try {
          const text = await fetchMarkdown(`00 - Meta/Class/${f.name}`)
          const allFields = parseClassFile(text)
          schemas[typeName] = buildFilterSchema(allFields)
        } catch {
          schemas[typeName] = []
        }
      })
    )

    _cache = schemas
    _pending = null
    return schemas
  })()

  return _pending
}
