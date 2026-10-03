// ============================================================
// VAULT ON DISK (build time, plain Node)
// ============================================================
// Puts the dripwiki vault on disk and reads it through the same vault
// module the browser uses (src/vault), with files as the source instead
// of GitHub.
//
// By default it downloads the whole repo as one .tar.gz archive: a single
// request, and not part of GitHub's rate-limited API. For a local run,
// point VAULT_DIR at a folder that already holds the vault instead:
//   VAULT_DIR="C:/path/to/susia-wiki" npm run build

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_CONFIG } from '../src/utils/github.js'

const DEFAULT_DIR = path.resolve('.vault')

// The vault for a build: downloaded, or the folder VAULT_DIR names
export async function loadVault() {
  const dir = process.env.VAULT_DIR ? path.resolve(process.env.VAULT_DIR) : DEFAULT_DIR
  if (!process.env.VAULT_DIR) await download(dir)

  // Imported here, not at the top: the animation tool uses diskAdapter and
  // walk from this file without needing the site's markdown renderer
  const { createVault } = await import('../src/vault/vault.js')
  const vault = createVault(diskAdapter(dir))
  if ((await vault.tree()).length === 0) throw new Error(`No articles found in ${dir}`)
  return vault
}

// The vault module's way into a folder on disk (see src/vault/vault.js)
export function diskAdapter(dir) {
  return {
    listFiles: async () => walk(dir),
    readText: async p => {
      try { return fs.readFileSync(path.join(dir, p), 'utf8') }
      catch (e) { if (e.code === 'ENOENT') return null; throw e }
    },
  }
}

async function download(dir) {
  const { owner, repo, branch } = REPO_CONFIG
  // GitHub's archive endpoint sometimes answers 502/504 for a moment, so try
  // it a few times, then the codeload mirror it redirects to anyway
  const urls = process.env.VAULT_TARBALL_URL
    ? [process.env.VAULT_TARBALL_URL]
    : [
        `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.tar.gz`,
        `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${branch}`,
      ]

  let res, lastError
  for (let attempt = 0; attempt < 6 && !res; attempt++) {
    const url = urls[attempt % urls.length]
    if (attempt) await new Promise(r => setTimeout(r, 2000 * attempt))
    try {
      const r = await fetch(url)
      if (r.ok) res = r
      else lastError = new Error(`Vault download failed (${r.status}): ${url}`)
      if (!r.ok && r.status >= 400 && r.status < 500 && r.status !== 429) break   // not transient
    } catch (e) { lastError = e }
    if (!res) console.warn(`vault: attempt ${attempt + 1} failed (${lastError.message})`)
  }
  if (!res) throw lastError

  const archive = path.join(os.tmpdir(), `${repo}-${Date.now()}.tar.gz`)
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))

  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // GitHub wraps everything in a top folder like "dripwiki-main/";
  // --strip-components=1 drops it so the vault sits directly in dir
  execFileSync('tar', ['-xzf', archive, '-C', dir, '--strip-components=1'])
  fs.rmSync(archive)

  console.log(`vault: downloaded ${owner}/${repo}@${branch} into ${path.relative(process.cwd(), dir)}/`)
}

// Every file under dir, as sorted "/"-separated paths relative to dir
export function walk(dir, rel = '') {
  const out = []
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue
      out.push(...walk(dir, p))
    } else {
      out.push(p)
    }
  }
  return out.sort()
}
