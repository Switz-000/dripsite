// npm run check:portraits [-- <git ref>]
// Draws every vault portrait plus 300 seeded random ones, in every frame type, with and
// without anchors, using the engine in the working tree and the engine at <git ref>
// (default origin/main), and reports any portrait that came out different.
// Exit code 1 when something changed, so it can gate a pull request.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadCast } from '../lib/cast.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ref = process.argv.slice(2).find(a => !a.startsWith('-')) || 'origin/main'
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })

let old
try {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portraits-'))
  fs.writeFileSync(path.join(dir, 'engine.js'), git('show', `${ref}:src/portrait/engine.js`))
  fs.writeFileSync(path.join(dir, 'parts.json'), git('show', `${ref}:src/portrait/parts.json`))
  old = await import(pathToFileURL(path.join(dir, 'engine.js')))
} catch (e) {
  console.error(`Could not read the engine at "${ref}". Fetch it first (git fetch origin main) or name another ref.\n${e.message.split('\n')[0]}`)
  process.exit(2)
}
const cur = await import(pathToFileURL(path.join(ROOT, 'src/portrait/engine.js')))

const specs = []
try { for (const [n, e] of Object.entries(loadCast())) specs.push([n + (e.placeholder ? ' (placeholder)' : ''), e.spec]) }
catch (e) { console.warn('Vault not found, checking random portraits only. ' + e.message) }
let seed = 42; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), pick = a => a[Math.floor(R() * a.length)]
for (let i = 0; i < 300; i++) {
  const s = {}
  for (const k of cur.SLOT_ORDER) { const o = cur.SLOT_OPTIONS[k]; s[k] = cur.MULTI.includes(k) ? o.filter(() => R() < .3) : pick(o) }
  s.shape = Object.fromEntries(cur.SHAPES.map(x => [x.key, x.min + (x.max - x.min) * R()]))
  s.palette = Object.fromEntries(Object.entries(cur.SWATCHES).map(([k, v]) => [k, pick(v)[1]]))
  specs.push(['random #' + i, s])
}

const changed = []
let n = 0
for (const [name, s] of specs) for (const frame of ['full', 'bust', 'face']) for (const anchors of [false, true]) {
  const a = old.compose(s, { frame, anchors, id: 'x' }), b = cur.compose(s, { frame, anchors, id: 'x' }); n++
  if (a !== b) { let i = 0; while (a[i] === b[i]) i++; changed.push({ name, frame, anchors, at: i, was: a.slice(Math.max(0, i - 30), i + 50), now: b.slice(Math.max(0, i - 30), i + 50) }) }
}
if (!changed.length) { console.log(`check:portraits: all ${n} portraits identical to ${ref} (${specs.length} specs x 3 frames x anchors on/off).`); process.exit(0) }
const names = [...new Set(changed.map(c => c.name))]
console.log(`check:portraits: ${changed.length} of ${n} portraits differ from ${ref}, across ${names.length} specs: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', ...' : ''}`)
const c = changed[0]
console.log(`First difference: ${c.name}, frame ${c.frame}${c.anchors ? ', anchors' : ''}, at character ${c.at}\n  was: ${c.was}\n  now: ${c.now}`)
process.exit(1)
