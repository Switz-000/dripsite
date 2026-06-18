import { marked } from 'marked'
import { isImageFilename, imageUrl } from './github'

// ── Frontmatter parser ──────────────────────────────────────
// Supports: nested mappings, sequences of objects/scalars,
// yes/no/true/false booleans, quoted strings, null/~ values.
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!match) return { meta: {}, body: raw }
  return { meta: parseYAMLBlock(match[1]), body: match[2].trim() }
}

// Strip an inline YAML `#` comment from a line. A `#` only starts a comment when
// it is at the start of the (trimmed) content or preceded by whitespace, and is
// not inside single/double quotes — so values like [[Page#Section]] or "a#b" and
// URLs are preserved, while `key:   # note` and full-line `# heading` are removed.
function stripComment(line) {
  let inS = false, inD = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).replace(/\s+$/, '')
    }
  }
  return line
}

function parseYAMLBlock(src) {
  const lines = src.split('\n').map(l => stripComment(l.replace(/\t/g, '  ')))
  let idx = 0

  const isBlank = l => l == null || /^\s*(#.*)?$/.test(l)
  const indentOf = l => l == null ? -1 : l.match(/^( *)/)[1].length

  function skipBlanks() {
    while (idx < lines.length && isBlank(lines[idx])) idx++
  }

  function scalar(s) {
    const v = s.trim()
    if (!v || v === '~' || /^null$/i.test(v)) return null
    if ((v[0] === '"' && v[v.length - 1] === '"') ||
        (v[0] === "'" && v[v.length - 1] === "'")) return v.slice(1, -1)
    if (/^(true|yes|on)$/i.test(v)) return true
    if (/^(false|no|off)$/i.test(v)) return false
    if (/^-?\d+$/.test(v)) return +v
    if (/^-?\d*\.\d+$/.test(v)) return +v
    return v
  }

  function parseBlock(minIndent) {
    skipBlanks()
    if (idx >= lines.length) return null
    const ind = indentOf(lines[idx])
    if (ind < minIndent) return null
    const rest = lines[idx].slice(ind)
    if (rest === '-' || rest.startsWith('- ')) return parseSeq(ind)
    return parseMap(ind)
  }

  function parseSeq(seqInd) {
    const arr = []
    while (idx < lines.length) {
      if (isBlank(lines[idx])) { idx++; continue }
      const l = lines[idx]
      const ind = indentOf(l)
      if (ind < seqInd) break
      const rest = l.slice(ind)
      if (!rest.startsWith('-')) break
      const after = rest.slice(1).replace(/^ /, '')
      idx++
      if (!after.trim()) {
        arr.push(parseBlock(seqInd + 2))
        continue
      }
      const m = after.match(/^([\w][\w-]*)\s*:\s*(.*)$/)
      if (m) {
        const obj = {}
        const [, k, v] = m
        obj[k] = v.trim() ? scalar(v) : parseBlock(seqInd + 4)
        // collect remaining sub-keys at this object's indent level
        while (idx < lines.length) {
          if (isBlank(lines[idx])) { idx++; continue }
          const i2 = indentOf(lines[idx])
          if (i2 <= seqInd) break
          const r2 = lines[idx].slice(i2)
          const mm = r2.match(/^([\w][\w-]*)\s*:\s*(.*)$/)
          if (!mm) break
          idx++
          const [, k2, v2] = mm
          obj[k2] = v2.trim() ? scalar(v2) : parseBlock(i2 + 2)
        }
        arr.push(obj)
      } else {
        arr.push(scalar(after))
      }
    }
    return arr
  }

  function parseMap(mapInd) {
    const obj = {}
    while (idx < lines.length) {
      if (isBlank(lines[idx])) { idx++; continue }
      const l = lines[idx]
      const ind = indentOf(l)
      if (ind < mapInd) break
      if (ind > mapInd) { idx++; continue }
      const m = l.slice(ind).match(/^([\w][\w-]*)\s*:\s*(.*)$/)
      if (!m) { idx++; continue }
      const [, k, v] = m
      idx++
      obj[k] = v.trim() && v !== '|' && v !== '|-' && v !== '>' && v !== '>-'
        ? scalar(v)
        : parseBlock(mapInd + 2)
    }
    return obj
  }

  return parseMap(0)
}

// ── Wikilink + image processing ─────────────────────────────
//
// Obsidian image embed:  ![[filename.png]]  or  ![[filename.png|alt text]]
// Obsidian image link:    [[filename.png]]  (without !)
// Regular wikilink:       [[Article Name]]  or  [[Article|Alias]]
//
export function preprocessWikilinks(markdown, tree, wikilinkToSlugFn) {
  // Step 1: handle image embeds first — ![[...]] with image extension
  let result = markdown.replace(/!\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = inner.split('|')
    const filename = parts[0].trim()
    const alt = (parts[1] || filename).trim()

    if (isImageFilename(filename)) {
      const url = imageUrl(filename)
      return `<figure class="wiki-image"><img src="${url}" alt="${alt}" loading="lazy" />${alt !== filename ? `<figcaption>${alt}</figcaption>` : ''}</figure>`
    }

    // ![[non-image]] — treat as a regular embed placeholder (rare, just show name)
    return `<span class="embed-placeholder">${filename}</span>`
  })

  // Step 2: handle plain [[wikilinks]] — check if image or article
  result = result.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = inner.split('|')
    const target = parts[0].trim()
    const label  = (parts[1] || target).trim()

    // If the target looks like an image file, render as inline image
    if (isImageFilename(target)) {
      const url = imageUrl(target)
      return `<img src="${url}" alt="${label}" class="wiki-image-inline" loading="lazy" />`
    }

    // Otherwise resolve as article link
    const slug = wikilinkToSlugFn(inner, tree)
    if (slug) {
      return `<a href="/article/${slug}" class="wikilink">${label}</a>`
    }

    return `<span class="wikilink-missing" title="Article not yet created">${label}</span>`
  })

  return result
}

// ── Obsidian syntax cleanup ──────────────────────────────────
function cleanObsidian(text) {
  return text
    .replace(/```dataviewjs[\s\S]*?```/g, '')
    .replace(/```dataview[\s\S]*?```/g, '')
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

// ── Full render pipeline ─────────────────────────────────────
export function renderMarkdown(raw, tree, wikilinkToSlug) {
  const { meta, body } = parseFrontmatter(raw)
  const cleaned = cleanObsidian(body)
  const withLinks = preprocessWikilinks(cleaned, tree, wikilinkToSlug)

  marked.setOptions({ breaks: true, gfm: true })

  const html = marked.parse(withLinks)
  return { meta, html }
}

// ── Helpers ──────────────────────────────────────────────────
export function extractSummary(body, maxLen = 200) {
  const cleaned = cleanObsidian(body)
    .replace(/!\[\[([^\]]+)\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, page, alias) => alias || page)
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
  const firstPara = cleaned.split('\n\n').find(p => p.trim().length > 30) || ''
  return firstPara.trim().slice(0, maxLen) + (firstPara.length > maxLen ? '...' : '')
}

export function getTitle(meta, path) {
  if (meta.company_name)    return meta.company_name
  if (meta.state_name)      return meta.state_name
  if (meta.full_name)       return meta.full_name
  if (meta.event_name)      return meta.event_name
  if (meta.official_name)   return meta.official_name
  if (meta.lusitanized_name) return meta.lusitanized_name
  if (meta.native_name)     return meta.native_name
  if (meta.name)            return meta.name
  return path.split('/').pop().replace(/\.md$/, '')
}

export function getTypeLabel(meta) {
  const typeMap = {
    person:       'Person',
    company:      'Corporation',
    state:        'State',
    city:         'City',
    country:      'Country',
    institution:  'Institution',
    law:          'Legislation',
    event:        'Event',
    war:          'Conflict',
    concept:      'Concept',
    tradition:    'Tradition',
    organization: 'Organization',
    sport:        'Sport',
    technology:   'Technology',
    structure:    'Structure',
    document:     'Document',
    religion:     'Religion',
  }
  return typeMap[meta.type] || null
}
