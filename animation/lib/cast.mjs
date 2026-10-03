// The cast: every character with a portrait spec, read from the vault's person articles,
// plus placeholder characters from cast-extra.json (people with no article or spec yet).
// Node only. Run it to see who can be animated:  npm run cast
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { walk } from '../../scripts/vault.mjs'
import { isArticlePath, FLAGS_PATH } from '../../src/utils/github.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/* the vault: VAULT_DIR if set, else the sibling folder on Martín's PC, else ../.vault from a site build */
export function vaultDir(){
  const tries = [process.env.VAULT_DIR, path.resolve(HERE,'../../../../dripstao/dripwiki'), path.resolve(HERE,'../../.vault'), '/home/claude/dripwiki']
  const d = tries.find(p => p && fs.existsSync(path.join(p,'00 - Meta')))
  if (!d) throw new Error('Vault not found. Set VAULT_DIR to the dripwiki folder.')
  return d
}
/* reads the `portrait:` block exactly as the site's toYaml() writes it (no YAML library needed) */
export function readPortrait(raw){
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/); if (!fm) return null
  const lines = fm[1].split(/\r?\n/), i = lines.findIndex(l => /^portrait:\s*$/.test(l)); if (i < 0) return null
  const o = {}; let sub = null
  for (const l of lines.slice(i+1)){
    if (!/^\s/.test(l)) break
    const m = l.match(/^(\s+)([A-Za-z]+):\s*(.*?)\s*$/); if (!m) continue
    const val = m[3].replace(/^"|"$/g,'')
    if (m[1].length <= 2){ if (val === ''){ o[m[2]] = {}; sub = o[m[2]] } else { o[m[2]] = /^\[.*\]$/.test(val) ? val.slice(1,-1).split(',').map(x=>x.trim()).filter(Boolean) : val; sub = null } }
    else if (sub) sub[m[2]] = /^-?\d*\.?\d+$/.test(val) ? +val : val
  }
  return o
}

export function loadCast(){
  const dir = vaultDir(), cast = {}
  for (const p of walk(dir).filter(isArticlePath)){
    const raw = fs.readFileSync(path.join(dir,p),'utf8'); if (!/\nportrait:/.test(raw.slice(0, 20000))) continue
    const spec = readPortrait(raw)
    if (spec) cast[path.basename(p,'.md')] = { spec, article: p }
  }
  const extra = JSON.parse(fs.readFileSync(path.join(HERE,'../cast-extra.json'),'utf8'))
  for (const [name,e] of Object.entries(extra)) if (!name.startsWith('_') && !cast[name]) cast[name] = { ...e, placeholder:true }
  return cast
}
export function flagPath(country){ return path.join(vaultDir(), FLAGS_PATH, country + '.png') }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const c = loadCast()
  for (const [n,e] of Object.entries(c)) console.log((e.placeholder?'placeholder  ':'vault        ') + n + (e.article?'   ('+e.article+')':''))
}
