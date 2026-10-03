// The vault as the browser reads it: one recursive tree request to the
// GitHub API lists every file, and text comes from raw.githubusercontent.com,
// which has no API rate limit.
import { REPO_CONFIG, rawFileUrl } from '../utils/github.js'

const TREE_URL = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/git/trees/${REPO_CONFIG.branch}?recursive=1`

function authHeaders() {
  const h = { Accept: 'application/vnd.github.v3+json' }
  if (REPO_CONFIG.token) h['Authorization'] = `Bearer ${REPO_CONFIG.token}`
  return h
}

// `fetch` can be swapped out, which is how the tests stand in for GitHub
export function githubAdapter({ fetch = (...args) => globalThis.fetch(...args) } = {}) {
  return {
    async listFiles() {
      const res = await fetch(TREE_URL, { headers: authHeaders() })
      if (!res.ok) throw new Error(`GitHub API error ${res.status} — check repo name and branch`)
      const data = await res.json()
      return data.tree.filter(f => f.type === 'blob').map(f => f.path)
    },
    async readText(path) {
      const res = await fetch(rawFileUrl(path), { headers: authHeaders() })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Could not load "${path}" (${res.status})`)
      return res.text()
    },
  }
}
