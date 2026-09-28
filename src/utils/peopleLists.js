// Lists that name people show their portrait to the left of the name.
//
// Article bodies are rendered to an HTML string, so this works on that string:
// in every table row and list item, the first cell (or item) that starts with a
// link to a person article gets that person's drawn portrait in front of it.
// Pure string code, so the prerender and the browser produce the same thing.
import { compose } from '../portrait/engine'

const LINK_RE = /^\s*<a href="\/article\/([^"]+)" class="wikilink">/
const CELL_RE = /(<td[^>]*>)([\s\S]*?)(<\/td>)/g
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g
const ITEM_RE = /<li>((?:(?!<\/?[uo]l|<li)[\s\S])*?)<\/li>/g

// Slug of the article a cell/item opens with, or null
function leadingSlug(content) {
  return LINK_RE.exec(content)?.[1] ?? null
}

// Every slug that could get a portrait, so callers know whom to look up
export function candidateSlugs(html) {
  const out = new Set()
  for (const [, row] of html.matchAll(ROW_RE)) {
    for (const [, , content] of row.matchAll(CELL_RE)) {
      const slug = leadingSlug(content)
      if (slug) out.add(slug)
    }
  }
  for (const [, content] of html.matchAll(ITEM_RE)) {
    const slug = leadingSlug(content)
    if (slug) out.add(slug)
  }
  return [...out]
}

// people: slug -> { portrait } for person articles (portrait may be null), and
// anything falsy for articles that aren't people.
export function decoratePeople(html, people) {
  if (!people || !html) return html
  let n = 0
  const badge = (person) => {
    const svg = person.portrait && typeof person.portrait === 'object'
      ? compose(person.portrait, { id: 'pl' + n++, frame: 'bust' })
      : ''
    return `<span class="people-portrait${svg ? '' : ' people-portrait-empty'}">${svg}</span>`
  }
  const wrap = (person, content) =>
    `<span class="people-entry">${badge(person)}<span class="people-entry-text">${content}</span></span>`

  html = html.replace(ROW_RE, (row, inner) => {
    let done = false
    const cells = inner.replace(CELL_RE, (cell, open, content, close) => {
      if (done) return cell
      const person = people[leadingSlug(content)]
      if (!person) return cell
      done = true
      return open + wrap(person, content) + close
    })
    return `<tr>${cells}</tr>`
  })

  return html.replace(ITEM_RE, (item, content) => {
    const person = people[leadingSlug(content)]
    return person ? `<li class="people-item">${wrap(person, content)}</li>` : item
  })
}
