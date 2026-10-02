// Scene files as text: evaluate what's in the editor, find each beat's line, and patch a
// beat in place (keeping comments and formatting) when a hand is dragged on the stage.
// Convention the patcher relies on: one beat per line inside `beats: [ ... ]`, as in
// animation/scenes/lasman-signing.mjs.

/* Turns the editor text into the scene object. Scene files have no imports, so a blob module works. */
export async function evalScene(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    const s = mod.default
    if (!s || typeof s !== 'object') throw new Error('The scene file must `export default { ... }`.')
    for (const k of ['length', 'set', 'cast']) if (s[k] == null) throw new Error(`The scene has no \`${k}\`.`)
    if (!Array.isArray(s.beats)) s.beats = []
    return s
  } finally { URL.revokeObjectURL(url) }
}

/* Line number (0-based) of every beat, in order, or null when the layout doesn't follow the convention. */
export function beatLines(text, count) {
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^\s*beats\s*:\s*\[/.test(l))
  if (start < 0) return count ? null : []
  const out = []
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    const l = lines[i].replace(/\/\/.*$/, '')
    if (i > start && /^\s*\{/.test(l) && depth === 1) out.push(i)
    for (const c of l.replace(/'[^']*'|"[^"]*"/g, '')) { if (c === '[') depth++; else if (c === ']') depth-- }
    if (i > start && depth <= 0) break
  }
  return out.length === count ? out : null
}

const num = v => String(Math.round(v * 10) / 10)

/* Applies a drag to one beat's line. `world` = how far the hand moved on screen (scene units),
   `fig` = the same move in the character's own units (for dx/dy). Returns { text, note } or { error }. */
export function patchBeat(text, beats, index, { world, fig }) {
  const lines = beatLines(text, beats.length)
  if (!lines) return { error: 'Beats need one per line inside `beats: [ ... ]` for dragging to edit them.' }
  const b = beats[index], i = lines[index]
  let line = text.split('\n')[i]
  if (b.sign) return { error: 'This hand is signing: it follows the ink. Drag after the signing beat ends, or move the document in the set.' }
  if (Array.isArray(b.to)) {
    const nx = b.to[0] + world[0], ny = b.to[1] + world[1]
    const re = /to\s*:\s*\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/
    if (!re.test(line)) return { error: 'Could not find `to: [x, y]` on the beat\'s line.' }
    line = line.replace(re, `to: [${num(nx)}, ${num(ny)}]`)
    return { text: setLine(text, i, line), line: i, note: `${b.who}'s ${b.hand || 'R'} hand now aims at [${num(nx)}, ${num(ny)}]` }
  }
  const dx = (b.dx || 0) + fig[0], dy = (b.dy || 0) + fig[1]
  line = setKey(setKey(line, 'dy', num(dy)), 'dx', num(dx))
  return { text: setLine(text, i, line), line: i, note: `${b.who}'s ${b.hand || 'R'} hand: dx ${num(b.dx || 0)} → ${num(dx)}, dy ${num(b.dy || 0)} → ${num(dy)}` }
}

/* Adds a new beat line at the end of the beats list. */
export function insertBeat(text, beats, beatSource) {
  const lines = beatLines(text, beats.length)
  if (!lines) return { error: 'Beats need one per line inside `beats: [ ... ]` to add one by dragging.' }
  const all = text.split('\n')
  let at
  if (lines.length) at = lines[lines.length - 1] + 1
  else { const s = all.findIndex(l => /^\s*beats\s*:\s*\[/.test(l)); if (/\]\s*,?\s*$/.test(all[s])) { all[s] = all[s].replace(/\[\s*\]/, '['); all.splice(s + 1, 0, '  ],'); } at = s + 1 }
  const indent = lines.length ? all[lines[0]].match(/^\s*/)[0] : '    '
  if (lines.length && !/,\s*(\/\/.*)?$/.test(all[at - 1])) all[at - 1] = all[at - 1].replace(/(\s*(\/\/.*)?)$/, ',$1')
  all.splice(at, 0, indent + beatSource + ',')
  return { text: all.join('\n'), line: at }
}

function setLine(text, i, line) { const all = text.split('\n'); all[i] = line; return all.join('\n') }
/* sets `key: value` inside a one-line object literal, adding it before the closing brace if absent */
function setKey(line, key, value) {
  const re = new RegExp(`(\\b${key}\\s*:\\s*)-?[\\d.]+`)
  if (re.test(line)) return line.replace(re, `$1${value}`)
  return line.replace(/\s*\}(\s*,?\s*(\/\/.*)?)$/, `, ${key}: ${value} }$1`)
}
