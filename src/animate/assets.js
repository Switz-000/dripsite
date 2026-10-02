// Everything the /dev/animate page needs from animation/, loaded the browser way.
// Presets, sets and scene files are bundled from the repo; characters come from the vault
// on GitHub (only the people the scene uses), plus the placeholders in cast-extra.json.
import { getFileTree, fetchMarkdown, getFlagMap, flagUrlFor } from '../utils/github'
import { readPortrait } from '../../animation/lib/portrait-block.mjs'
import castExtra from '../../animation/cast-extra.json'

const presetFiles = import.meta.glob('../../animation/presets/*.json', { eager: true, import: 'default' })
const setFiles = import.meta.glob('../../animation/sets/*.mjs', { eager: true, import: 'default' })
const sceneFiles = import.meta.glob('../../animation/scenes/*.mjs', { eager: true, query: '?raw', import: 'default' })

const base = p => p.split('/').pop().replace(/\.(json|mjs)$/, '')
export const PRESETS = Object.fromEntries(Object.values(presetFiles).map(p => [p.name, p]))
export const SETS = Object.fromEntries(Object.entries(setFiles).map(([p, s]) => [base(p), s]))
export const SCENES = Object.fromEntries(Object.entries(sceneFiles).map(([p, text]) => [base(p), text]))

/* ---------- Cast ---------- */
const people = new Map()          // name -> { spec, article } once fetched
let treeCache = null
async function tree() { return treeCache || (treeCache = await getFileTree()) }

/* Specs for exactly these names: vault articles first, cast-extra placeholders for the rest. */
export async function loadCast(names, onProgress) {
  const out = {}, missing = []
  const want = [...new Set(names)].filter(n => !people.has(n))
  if (want.length) {
    const files = await tree()
    let done = 0
    await Promise.all(want.map(async n => {
      const f = files.find(x => x.path.split('/').pop() === n + '.md')
      if (f) {
        try { const spec = readPortrait(await fetchMarkdown(f.path)); if (spec) people.set(n, { spec, article: f.path }) } catch { /* unreadable: falls back below */ }
      }
      onProgress?.(++done, want.length)
    }))
  }
  for (const n of names) {
    if (people.has(n)) out[n] = people.get(n)
    else if (castExtra[n] && !n.startsWith('_')) out[n] = { ...castExtra[n], placeholder: true }
    else missing.push(n)
  }
  return { cast: out, missing }
}
export const PLACEHOLDERS = Object.keys(castExtra).filter(n => !n.startsWith('_'))

/* ---------- Flags ---------- */
// Two forms: a blob URL for the live stage (cheap to redraw 24 times a second) and a
// data URL for export (a picture drawn into a canvas may only use data URLs).
const flags = new Map()
export async function loadFlags(names) {
  await Promise.all([...new Set(names)].filter(n => !flags.has(n)).map(async n => {
    const url = flagUrlFor(n, await getFlagMap())
    const res = url ? await fetch(url) : null
    if (!res?.ok) throw new Error(`No flag called "${n}" in the vault (00 - Meta/Images/Country Flags).`)
    const blob = await res.blob()
    const data = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob) })
    flags.set(n, { blob: URL.createObjectURL(blob), data })
  }))
}
export const flagUrl = (n, kind = 'blob') => flags.get(n)?.[kind] || ''

/* every flag a scene's set asks for (sets take a `flags` list today) */
export const flagsOf = scene => Array.isArray(scene?.set?.flags) ? scene.set.flags : []
