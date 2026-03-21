import { marked } from 'marked'

// Strip YAML frontmatter and return { frontmatter obj, body string }
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!match) return { meta: {}, body: raw }

  const yamlBlock = match[1]
  const body = match[2]
  const meta = {}

  // Simple YAML parser for the flat/nested patterns we use
  let currentKey = null
  let inList = false

  for (const line of yamlBlock.split('\n')) {
    // Skip empty
    if (!line.trim()) continue

    // List item
    if (line.match(/^\s+-\s+/)) {
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '')
      if (currentKey) {
        if (!Array.isArray(meta[currentKey])) meta[currentKey] = []
        meta[currentKey].push(val)
      }
      continue
    }

    // Key: value
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/)
    if (kv) {
      inList = false
      currentKey = kv[1]
      const val = kv[2].trim().replace(/^["']|["']$/g, '')
      if (val === '') {
        // Will be populated by list items below
        meta[currentKey] = null
      } else if (val === 'true') meta[currentKey] = true
      else if (val === 'false') meta[currentKey] = false
      else if (!isNaN(val) && val !== '') meta[currentKey] = Number(val)
      else meta[currentKey] = val
    }
  }

  return { meta, body: body.trim() }
}

// Convert wikilinks [[Page]] or [[Page|Alias]] to placeholder spans
// that the React component will later replace with <Link>s
export function preprocessWikilinks(markdown, tree, wikilinkToSlug) {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = inner.split('|')
    const target = parts[0].trim()
    const label  = (parts[1] || target).trim()
    const slug   = wikilinkToSlug(inner, tree)
    if (slug) {
      return `<a href="/article/${slug}" class="wikilink">${label}</a>`
    }
    // Unresolved link - render as muted text
    return `<span class="wikilink-missing" title="Article not yet created">${label}</span>`
  })
}

// Strip Obsidian-specific syntax that doesn't parse well
function cleanObsidian(text) {
  return text
    // Remove dataviewjs blocks
    .replace(/```dataviewjs[\s\S]*?```/g, '')
    // Remove dataview blocks
    .replace(/```dataview[\s\S]*?```/g, '')
    // Remove %% comments %%
    .replace(/%%[\s\S]*?%%/g, '')
    // Remove canvas JSON that may be included
    .replace(/```json[\s\S]*?```/g, '')
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
}

// Full pipeline: raw markdown → HTML string
export function renderMarkdown(raw, tree, wikilinkToSlug) {
  const { meta, body } = parseFrontmatter(raw)
  const cleaned = cleanObsidian(body)
  const withLinks = preprocessWikilinks(cleaned, tree, wikilinkToSlug)

  marked.setOptions({
    breaks: true,
    gfm: true,
  })

  const html = marked.parse(withLinks)
  return { meta, html }
}

// Extract plain text summary from body (first non-empty paragraph)
export function extractSummary(body, maxLen = 200) {
  const cleaned = cleanObsidian(body)
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, page, alias) => alias || page)
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
  const firstPara = cleaned.split('\n\n').find(p => p.trim().length > 30) || ''
  return firstPara.trim().slice(0, maxLen) + (firstPara.length > maxLen ? '…' : '')
}

// Get display title: frontmatter > filename
export function getTitle(meta, path) {
  if (meta.company_name) return meta.company_name
  if (meta.state_name) return meta.state_name
  if (meta.full_name) return meta.full_name
  if (meta.event_name) return meta.event_name
  if (meta.official_name) return meta.official_name
  if (meta.name) return meta.name
  // Fall back to filename without extension
  return path.split('/').pop().replace(/\.md$/, '')
}

// Determine article type label for the infobox header
export function getTypeLabel(meta) {
  const typeMap = {
    person:      'Person',
    company:     'Corporation',
    state:       'State',
    city:        'City',
    country:     'Country',
    institution: 'Institution',
    law:         'Legislation',
    event:       'Event',
    war:         'Conflict',
    concept:     'Concept',
    tradition:   'Tradition',
    organization:'Organization',
    sport:       'Sport',
    technology:  'Technology',
    structure:   'Structure',
    document:    'Document',
    religion:    'Religion',
  }
  return typeMap[meta.type] || null
}
