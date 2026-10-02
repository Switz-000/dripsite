// Browser-safe: used by lib/cast.mjs (Node) and by the site's /dev/animate page.
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
