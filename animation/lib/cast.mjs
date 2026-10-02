// The cast: every character with a portrait spec, read from the vault's person articles,
// plus placeholder characters from cast-extra.json (people with no article or spec yet).
// Node only. Run it to see who can be animated:  npm run cast
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { readPortrait } from './portrait-block.mjs'
export { readPortrait }

const HERE = path.dirname(fileURLToPath(import.meta.url))
/* the vault: VAULT_DIR if set, else the sibling folder on Martín's PC, else ../.vault from a site build */
export function vaultDir(){
  const tries = [process.env.VAULT_DIR, path.resolve(HERE,'../../../../dripstao/dripwiki'), path.resolve(HERE,'../../.vault'), '/home/claude/dripwiki']
  const d = tries.find(p => p && fs.existsSync(path.join(p,'00 - Meta')))
  if (!d) throw new Error('Vault not found. Set VAULT_DIR to the dripwiki folder.')
  return d
}
function walk(d, out=[]){ for (const f of fs.readdirSync(d)){ if (f.startsWith('.')) continue; const p = path.join(d,f); fs.statSync(p).isDirectory() ? walk(p,out) : f.endsWith('.md') && out.push(p) } return out }

export function loadCast(){
  const dir = vaultDir(), cast = {}
  for (const p of walk(dir)){
    const raw = fs.readFileSync(p,'utf8'); if (!/\nportrait:/.test(raw.slice(0, 20000))) continue
    const spec = readPortrait(raw)
    if (spec) cast[path.basename(p,'.md')] = { spec, article: path.relative(dir,p) }
  }
  const extra = JSON.parse(fs.readFileSync(path.join(HERE,'../cast-extra.json'),'utf8'))
  for (const [name,e] of Object.entries(extra)) if (!name.startsWith('_') && !cast[name]) cast[name] = { ...e, placeholder:true }
  return cast
}
export function flagPath(country){ return path.join(vaultDir(), '00 - Meta/Images/Country Flags', country + '.png') }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const c = loadCast()
  for (const [n,e] of Object.entries(c)) console.log((e.placeholder?'placeholder  ':'vault        ') + n + (e.article?'   ('+e.article+')':''))
}
