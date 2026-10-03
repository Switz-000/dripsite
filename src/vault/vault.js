// ============================================================
// THE VAULT
// ============================================================
// Everything the site knows about the dripwiki vault goes through here:
// which files exist, an article's text, frontmatter and rendered page, who
// is a person and what their portrait is. Where the files come from is the
// adapter's business: GitHub in the browser (./githubAdapter.js), a folder
// on disk at build time (scripts/vault.mjs). Both give the same answers,
// so the prerender and the browser can't disagree.
//
// An adapter is two functions:
//   listFiles()     -> every file path in the vault, "/" separated
//   readText(path)  -> the file's text, or null when there is no such file
//
// Nothing here touches the browser or Vite, so plain Node can import it.
import { isArticlePath, buildFlagMap, wikilinkToSlug } from '../utils/github.js'
import { slugToPath } from '../utils/slugs.js'
import { renderMarkdown, parseFrontmatter, getTitle, extractSummary } from '../utils/markdown.js'

// Turns a vault file into the article object the pages render
function buildArticle(slug, path, raw, tree) {
  const { meta, html } = renderMarkdown(raw, tree, text => wikilinkToSlug(text, tree))
  const { body } = parseFrontmatter(raw)
  return { slug, path, title: getTitle(meta, path), meta, html, summary: extractSummary(body) }
}

// A person's drawn portrait. Anything that isn't a block (`portrait: none`,
// a half-typed line) counts as no portrait.
function portraitOf(meta) {
  return meta.portrait && typeof meta.portrait === 'object' ? meta.portrait : null
}

function samePaths(a, b) {
  return a.length === b.length && a.every((f, i) => f.path === b[i].path)
}

const asBlob = path => ({ path, type: 'blob' })

export function createVault(adapter) {
  let files = null          // every file path
  let tree = null           // just the articles, as { path, type } objects
  let flags = null          // Map: lowercase country name -> image URL
  let listing = null        // in-flight or finished listFiles(), shared by the three above
  let everyone = null       // people() result
  const texts = new Map()      // path -> Promise<string | null>
  const metas = new Map()      // path -> frontmatter
  const articles = new Map()   // slug -> article
  const persons = new Map()    // slug -> { portrait } | false
  const refreshes = new Map()  // slug -> Promise<article | null>

  // One listing feeds files, tree and flags
  function list() {
    if (!listing) {
      listing = Promise.resolve()
        .then(() => adapter.listFiles())
        .then(paths => {
          files = paths
          flags = buildFlagMap(paths.map(asBlob))
          const live = paths.filter(isArticlePath).map(asBlob)
          // Keep the old array when nothing changed, so pages don't redo work
          if (!(tree && samePaths(tree, live))) tree = live
        })
        .catch(e => { listing = null; throw e })
    }
    return listing
  }

  function textOrNull(path) {
    if (!texts.has(path)) {
      const reading = Promise.resolve().then(() => adapter.readText(path))
      reading.catch(() => { if (texts.get(path) === reading) texts.delete(path) })   // a failed read can be tried again
      texts.set(path, reading)
    }
    return texts.get(path)
  }

  async function text(path) {
    const t = await textOrNull(path)
    if (t == null) throw new Error(`Could not load "${path}"`)
    return t
  }

  async function meta(path) {
    if (!metas.has(path)) {
      const { meta } = parseFrontmatter(await text(path))
      if (!metas.has(path)) metas.set(path, meta)
    }
    return metas.get(path)
  }

  // The tree to resolve slugs and wikilinks against: the build's copy if
  // that is all there is yet, like the page that is already on screen
  async function currentTree() {
    if (!tree) await list()
    return tree
  }

  async function article(slug) {
    if (!articles.has(slug)) {
      const t = await currentTree()
      const path = slugToPath(slug, t)
      if (!path) return null
      const raw = await text(path)
      if (!articles.has(slug)) articles.set(slug, buildArticle(slug, path, raw, t))
    }
    return articles.get(slug)
  }

  async function person(slug) {
    if (!persons.has(slug)) {
      const path = slugToPath(slug, await currentTree())
      const m = path ? await meta(path) : null
      const found = m?.type === 'person' ? { portrait: portraitOf(m) } : false
      if (!persons.has(slug)) persons.set(slug, found)
    }
    return persons.get(slug)
  }

  // Every person article: [{ path, name, portrait | null }], by name. Reads
  // frontmatter a few files at a time; onProgress(done, total) reports along the way.
  async function people(onProgress, force = false) {
    if (everyone && !force) return everyone
    await list()
    const all = tree
    if (force) for (const f of all) { texts.delete(f.path); metas.delete(f.path) }
    const out = []
    let next = 0, done = 0
    async function worker() {
      while (next < all.length) {
        const f = all[next++]
        try {
          const m = await meta(f.path)
          if (m?.type === 'person') {
            out.push({ path: f.path, name: f.path.split('/').pop().replace(/\.md$/, ''), portrait: portraitOf(m) })
          }
        } catch { /* unreadable file: skip it */ }
        onProgress?.(++done, all.length)
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
    out.sort((a, b) => a.name.localeCompare(b.name))
    return (everyone = out)
  }

  // Data baked into a prerendered page (see scripts/prerender.mjs), so the
  // first render has it without waiting. `tree` is plain paths, to keep
  // the page small.
  function prime({ tree: paths, flags: pairs, article: built, people: known } = {}) {
    if (known) for (const [slug, p] of Object.entries(known)) persons.set(slug, p)
    if (paths) tree = paths.map(asBlob)
    if (pairs) flags = new Map(pairs)
    if (built) {
      articles.set(built.slug, { ...built, fromBuild: true })
      if (!metas.has(built.path)) metas.set(built.path, built.meta)
    }
  }

  // A build-time article may be older than the vault. Reads it again, once,
  // and resolves to the live article if it changed, or null if there is
  // nothing new to show (or the read failed: the build copy stays).
  function refreshArticle(slug) {
    if (!refreshes.has(slug)) {
      const built = articles.get(slug)
      if (!built?.fromBuild) return Promise.resolve(null)
      refreshes.set(slug, Promise.resolve()
        .then(() => adapter.readText(built.path))
        .then(raw => {
          if (raw == null) return null
          const live = buildArticle(slug, built.path, raw, tree)
          articles.set(slug, live)
          metas.set(built.path, live.meta)
          texts.set(built.path, Promise.resolve(raw))
          const changed = live.html !== built.html ||
            JSON.stringify(live.meta) !== JSON.stringify(built.meta)
          return changed ? live : null
        })
        .catch(() => null))
    }
    return refreshes.get(slug)
  }

  return {
    files: async () => { await list(); return files },
    tree: async () => { await list(); return tree },
    flags: async () => { await list(); return flags },
    text,
    textOrNull,
    meta,
    article,
    person,
    people,
    prime,
    refreshArticle,
    // What is already known, without waiting: for a page's first render
    peekTree: () => tree,
    peekFlags: () => flags,
    peekMeta: path => metas.get(path),
    peekArticle: slug => articles.get(slug),
    peekPerson: slug => persons.get(slug),
  }
}
