import { marked } from 'marked'
import { isImageFilename, imageUrl } from './github'

// ── Frontmatter parser ──────────────────────────────────────
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!match) return { meta: {}, body: raw }

  const yamlBlock = match[1]
  const body = match[2]
  const meta = {}
  let currentKey = null

  for (const line of yamlBlock.split('\n')) {
    if (!line.trim()) continue

    if (line.match(/^\s+-\s+/)) {
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '')
      if (currentKey) {
        if (!Array.isArray(meta[currentKey])) meta[currentKey] = []
        meta[currentKey].push(val)
      }
      continue
    }

    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/)
    if (kv) {
      currentKey = kv[1]
      const val = kv[2].trim().replace(/^["']|["']$/g, '')
      if (val === '') meta[currentKey] = null
      else if (val === 'true') meta[currentKey] = true
      else if (val === 'false') meta[currentKey] = false
      else if (!isNaN(val) && val !== '') meta[currentKey] = Number(val)
      else meta[currentKey] = val
    }
  }

  return { meta, body: body.trim() }
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
  if (meta.company_name) return meta.company_name
  if (meta.state_name)   return meta.state_name
  if (meta.full_name)    return meta.full_name
  if (meta.event_name)   return meta.event_name
  if (meta.official_name) return meta.official_name
  if (meta.name)         return meta.name
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
