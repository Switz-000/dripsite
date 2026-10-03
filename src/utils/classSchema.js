import { vault } from '../vault/index.js'

// ── Class file list ────────────────────────────────────────────
// The Metadata Menu class files, one per article type, from the listing
// the vault already has
const CLASS_DIR = '00 - Meta/Class/'

async function classFiles() {
  const files = await vault.files().catch(() => [])
  return files.filter(p => p.startsWith(CLASS_DIR) && !p.slice(CLASS_DIR.length).includes('/') && p.endsWith('.md'))
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
    const files = await classFiles()
    const schemas = {}

    await Promise.all(
      files.map(async path => {
        const typeName = path.slice(CLASS_DIR.length).replace(/\.md$/, '').toLowerCase()
        try {
          const allFields = parseClassFile(await vault.text(path))
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
