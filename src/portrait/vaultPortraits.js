// Reads and writes `portrait:` blocks in the dripwiki vault's person articles.
// Reading uses raw.githubusercontent (no API rate limit); writing commits
// through the GitHub contents API and needs a token with write access.
import { REPO_CONFIG, getFileTree, fetchMarkdown } from '../utils/github'
import { parseFrontmatter } from '../utils/markdown'
import { toYaml } from './engine'

const API = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/contents/`
const TOKEN_KEY = 'dripsite.githubToken'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || REPO_CONFIG.token || '' } catch { return REPO_CONFIG.token || '' }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}

let cache = null
// Every person article in the vault: [{ path, name, portrait|null }]. Reads each
// article's frontmatter, a few at a time; onProgress(done, total) reports along the way.
export async function listPeople(onProgress, force = false) {
  if (cache && !force) return cache
  const tree = await getFileTree()
  const out = []
  let next = 0, done = 0
  async function worker() {
    while (next < tree.length) {
      const f = tree[next++]
      try {
        const raw = await fetchMarkdown(f.path)
        const { meta } = parseFrontmatter(raw)
        if (meta?.type === 'person') {
          out.push({
            path: f.path,
            name: f.path.split('/').pop().replace(/\.md$/, ''),
            portrait: meta.portrait && typeof meta.portrait === 'object' ? meta.portrait : null,
          })
        }
      } catch { /* unreadable file: skip it */ }
      onProgress?.(++done, tree.length)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  out.sort((a, b) => a.name.localeCompare(b.name))
  return (cache = out)
}

// Returns the article text with its frontmatter `portrait:` block replaced by
// the spec, or added at the end of the frontmatter when there is none.
export function withPortrait(text, spec) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  if (lines[0].trim() !== '---') throw new Error('Article has no frontmatter to put the portrait in.')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error('Article frontmatter is not closed.')
  const block = toYaml(spec).split('\n')
  const start = lines.findIndex((l, i) => i > 0 && i < end && /^portrait:\s*(#.*)?$/.test(l))
  if (start < 0) lines.splice(end, 0, ...block)
  else {
    let stop = start + 1   // the block runs while lines are indented or blank
    while (stop < end && (/^\s+\S/.test(lines[stop]) || lines[stop].trim() === '')) stop++
    while (stop > start + 1 && lines[stop - 1].trim() === '') stop--   // keep trailing blanks outside
    lines.splice(start, stop - start, ...block)
  }
  return lines.join(eol)
}

const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)))
const b64encode = (str) => { let s = ''; for (const b of new TextEncoder().encode(str)) s += String.fromCharCode(b); return btoa(s) }

// Commits the spec into the article at `path` on the vault's branch.
export async function exportPortrait(path, spec) {
  const token = getToken()
  if (!token) throw new Error('Add a GitHub token with write access to the vault first.')
  const url = API + path.split('/').map(encodeURIComponent).join('/')
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
  const cur = await fetch(`${url}?ref=${REPO_CONFIG.branch}`, { headers })
  if (!cur.ok) throw new Error(`Could not read the article (${cur.status}).`)
  const file = await cur.json()
  const updated = withPortrait(b64decode(file.content), spec)
  const name = path.split('/').pop().replace(/\.md$/, '')
  const res = await fetch(url, {
    method: 'PUT', headers,
    body: JSON.stringify({ message: `Update portrait: ${name}`, content: b64encode(updated), sha: file.sha, branch: REPO_CONFIG.branch }),
  })
  if (!res.ok) throw new Error(res.status === 404 || res.status === 403 ? `GitHub refused the write (${res.status}). Check the token can write to ${REPO_CONFIG.owner}/${REPO_CONFIG.repo}.` : `Commit failed (${res.status}).`)
  if (cache) {
    const p = cache.find(x => x.path === path)
    if (p) p.portrait = JSON.parse(JSON.stringify(spec))
  }
}
