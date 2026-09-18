// ============================================================
// VAULT LOADER (build time, plain Node)
// ============================================================
// Puts the dripwiki vault on disk and lists its articles, using the same
// rule the browser uses (isArticlePath in src/utils/github.js).
//
// By default it downloads the whole repo as one .tar.gz archive: a single
// request, and not part of GitHub's rate-limited API. For a local run,
// point VAULT_DIR at a folder that already holds the vault instead:
//   VAULT_DIR="C:/path/to/susia-wiki" npm run build

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_CONFIG, isArticlePath } from '../src/utils/github.js'

const DEFAULT_DIR = path.resolve('.vault')

export async function loadVault() {
  const dir = process.env.VAULT_DIR ? path.resolve(process.env.VAULT_DIR) : DEFAULT_DIR
  if (!process.env.VAULT_DIR) await download(dir)

  const files = walk(dir)
  const articles = files.filter(isArticlePath)
  if (articles.length === 0) throw new Error(`No articles found in ${dir}`)

  return {
    dir,
    files,                                      // every file, vault-relative, "/" separated
    articles,                                   // just the articles, same format
    read: p => fs.readFileSync(path.join(dir, p), 'utf8'),
    exists: p => fs.existsSync(path.join(dir, p)),
  }
}

async function download(dir) {
  const { owner, repo, branch } = REPO_CONFIG
  const url = process.env.VAULT_TARBALL_URL ||
    `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.tar.gz`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Vault download failed (${res.status}): ${url}`)

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
function walk(dir, rel = '') {
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
