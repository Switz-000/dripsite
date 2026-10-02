// Scene checker: reads every frame's landmarks and the beat list and reports problems in
// words, so nobody has to spot them on a contact sheet. Browser-safe: the /dev/animate
// player runs it after every edit, and `npm run check -- scenes/x.mjs` runs it in Node.
//
// checkScene(S) takes the result of runScene() and returns
//   [{ level: 'error' | 'warn' | 'info', who, from, to, msg }]   (times in seconds)

const HEAD_MARKS = new Set(['headTop','headL','headR','eyeL','eyeR','brow','nose','mouth','cig','chin'])
const SNAP = 40            // a one-frame move this big (scene pixels), much bigger than the frames around it, reads as a jump

/* the beat driving a character's hand at frame f: the last one listed whose window (plus fade out) covers f */
export function activeHandBeat(scene, fps, who, side, f){
  let idx = -1
  ;(scene.beats || []).forEach((b, i) => {
    if (b.who !== who || !Array.isArray(b.t)) return
    const hand = b.sign ? (b.hand || 'R') : b.hand
    if (hand !== side) return
    const a = Math.round(b.t[0]*fps), z = Math.round(b.t[1]*fps), out = Math.round((b.out ?? .25)*fps)
    if (f >= a && f < z + out) idx = i
  })
  return idx
}

export function checkScene(S){
  const { scene, fps, N, place, rows, set } = S, [W, H] = S.size
  const out = [], cast = Object.keys(scene.cast), len = scene.length
  const sec = f => +(f/fps).toFixed(2)
  const add = (level, who, from, to, msg) => out.push({ level, who, from, to, msg })

  /* ---------- the beat list ---------- */
  ;(scene.beats || []).forEach((b, i) => {
    const where = `beat ${i+1}${b.who ? ` (${b.who})` : ''}`
    if (!cast.includes(b.who)) { add('error', b.who || '?', 0, 0, `${where}: "${b.who}" is not in the cast, so the beat does nothing.`); return }
    if (!Array.isArray(b.t) || b.t.length !== 2 || b.t.some(x => typeof x !== 'number')) { add('error', b.who, 0, 0, `${where}: \`t\` must be [from, to] in seconds.`); return }
    const [a, z] = b.t
    if (a < 0) add('error', b.who, a, z, `${where} starts before 0s.`)
    if (z <= a) add('error', b.who, a, z, `${where} ends (${z}s) before it starts (${a}s).`)
    if (a >= len) add('warn', b.who, a, z, `${where} starts at ${a}s, after the scene ends (${len}s).`)
    else if (z > len + 0.01) add('info', b.who, a, z, `${where} runs past the end of the scene (${z}s of ${len}s).`)
    if (!b.hand && !b.sign && !b.look && !b.face && !b.nod && b.walk == null) add('warn', b.who, a, z, `${where} has no hand, sign, look, face, nod or walk, so it does nothing.`)
    if (b.walk != null && (typeof b.walk !== 'number' || b.walk < -100 || b.walk > W + 100)) add('warn', b.who, a, z, `${where} walks to x=${b.walk}, outside the frame.`)
    if (b.hand && !['L','R'].includes(b.hand)) add('error', b.who, a, z, `${where}: hand must be 'L' or 'R'.`)
    if (b.hand && !b.sign && b.to == null) add('error', b.who, a, z, `${where}: a hand beat needs \`to\`.`)
  })
  for (const c of scene.captions || []) if (!Array.isArray(c.t) || c.t[1] <= c.t[0] || c.t[0] >= len) add('warn', '', c.t?.[0] ?? 0, c.t?.[1] ?? 0, `caption "${String(c.text).slice(0, 30)}" has bad times.`)
  for (const [k, c] of Object.entries(scene.cast)) for (const p of c.presets || [])
    if (p.at != null && p.at >= len) add('warn', k, p.at, p.at, `${k}'s preset "${p.preset}" starts at ${p.at}s, after the scene ends.`)

  /* two beats steering the same hand at the same time: the later one in the list wins */
  const handBeats = (scene.beats || []).map((b, i) => ({ b, i, hand: b.sign ? (b.hand || 'R') : b.hand })).filter(x => x.hand && Array.isArray(x.b.t))
  for (let x = 0; x < handBeats.length; x++) for (let y = x+1; y < handBeats.length; y++){
    const A = handBeats[x], B = handBeats[y]
    if (A.b.who !== B.b.who || A.hand !== B.hand) continue
    const from = Math.max(A.b.t[0], B.b.t[0]), to = Math.min(A.b.t[1], B.b.t[1])
    if (to - from > 0.3) add('info', A.b.who, from, to, `beats ${A.i+1} and ${B.i+1} both steer ${A.b.who}'s ${A.hand} hand from ${from}s to ${to}s; beat ${B.i+1} wins.`)
  }

  /* ---------- every frame ---------- */
  const W_ = (k, [x,y]) => { const P = place[k]; return [P.tx + x*P.S, P.ty + y*P.S] }
  const runs = new Map()       // key -> { level, who, msg(f) , from, to, worst }
  const flag = (key, level, who, f, value, msg) => {
    const r = runs.get(key)
    if (r && r.to === f-1){ r.to = f; r.worst = Math.max(r.worst, value); return }
    if (r) out.push(r.finish())
    runs.set(key, { level, who, from:f, to:f, worst:value, finish(){ return { level, who, from: sec(this.from), to: sec(this.to), msg: msg(this.worst, sec(this.from), sec(this.to)) } } })
  }
  const path = {}            // every hand's position per frame, for the jump check
  for (let f = 0; f < N; f++){
    const heads = {}
    for (const k of cast){
      const L = rows[k][f].landmarks, hl = W_(k, L.headL), hr = W_(k, L.headR), top = W_(k, L.headTop), chin = W_(k, L.chin)
      heads[k] = { c: [(hl[0]+hr[0])/2, (hl[1]+hr[1])/2], r: Math.abs(hr[0]-hl[0])/2, x0: Math.min(hl[0],hr[0]), x1: Math.max(hl[0],hr[0]), y0: top[1], y1: chin[1] }
    }
    for (const k of cast){
      const P = place[k], L = rows[k][f].landmarks, h = heads[k]
      // head leaving the frame
      const area = (h.x1-h.x0)*(h.y1-h.y0) || 1
      const ix = Math.max(0, Math.min(h.x1, W) - Math.max(h.x0, 0)), iy = Math.max(0, Math.min(h.y1, H) - Math.max(h.y0, 0))
      const off = 1 - ix*iy/area
      if (off > 0.2){ const edge = h.x0 < 0 ? 'left' : h.x1 > W ? 'right' : h.y0 < 0 ? 'top' : 'bottom'
        flag(`${k}:headoff:${edge}`, off > 0.5 && !S.walking?.(k, f) ? 'warn' : 'info', k, f, off, (v,a,z) => `${k}'s head is up to ${Math.round(v*100)}% off the ${edge} edge (${a}s to ${z}s).`) }
      for (const sd of ['L','R']){
        const p = W_(k, L['hand'+sd]), r = 25*P.S, key = `${k}:${sd}`
        // a hand outside its owner's clip (a figure in a picture frame) is not drawn at all
        if (P.clip && (p[0] < P.clip[0] - r || p[0] > P.clip[2] + r || p[1] < P.clip[1] - r || p[1] > P.clip[3] + r)) { ;(path[key] ||= []).push(p); continue }
        // hand leaving the frame
        if (p[0] < -r || p[0] > W + r || p[1] < -r || p[1] > H + r) flag(`${key}:off`, 'info', k, f, 1, (v,a,z) => `${k}'s ${sd} hand is outside the frame (${a}s to ${z}s).`)
        // hand inside furniture
        for (const s of set.solids || []) if (p[0] > s.x0 && p[0] < s.x1 && p[1] > s.y0 && p[1] < s.y1)
          flag(`${key}:solid:${s.name}`, 'warn', k, f, 1, (v,a,z) => `${k}'s ${sd} hand is inside ${s.name} (${a}s to ${z}s).`)
        // hand over a face it isn't aimed at
        const bi = activeHandBeat(scene, fps, k, sd, f), b = bi >= 0 ? scene.beats[bi] : null
        const aimedAtOwnHead = b && typeof b.to === 'string' && HEAD_MARKS.has(b.to)
        const aimedAtOther = b && b.to && typeof b.to === 'object' && !Array.isArray(b.to) && b.to.who
        for (const o of cast){
          const hh = heads[o], d = Math.hypot(p[0]-hh.c[0], p[1]-hh.c[1])
          if (d > hh.r*0.75) continue
          if (place[o].front && !P.front) continue                 // drawn behind that face, so it can't cover it
          if (o === k && aimedAtOwnHead) continue
          if (o !== k && aimedAtOther === o && HEAD_MARKS.has(b.to.to)) continue
          if (Array.isArray(b?.to)) continue                       // aimed at a scene point on purpose
          flag(`${key}:face:${o}`, 'warn', k, f, 1, (v,a,z) => o === k
            ? `${k}'s ${sd} hand covers ${k}'s own face (${a}s to ${z}s) without a beat aiming it there.`
            : `${k}'s ${sd} hand covers ${o}'s face (${a}s to ${z}s).`)
        }
        ;(path[key] ||= []).push(p)
      }
    }
  }
  for (const r of runs.values()) out.push(r.finish())
  /* jumps: a single frame that moves far more than its neighbours (fast but smooth moves are fine) */
  for (const [key, pts] of Object.entries(path)){
    const [k, sd] = key.split(':'), d = i => i <= 0 || i >= pts.length ? 0 : Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1])
    for (let i = 1; i < pts.length; i++){ const m = d(i)
      if (m > SNAP && m > 2.5*Math.max(d(i-1), d(i+1), 4)) add('warn', k, sec(i), sec(i), `${k}'s ${sd} hand jumps ${Math.round(m)}px in one frame at ${sec(i)}s. Give the beat driving it an \`in\` or \`out\` longer than 0.`) }
  }
  for (const k of cast) if (S.castInfo?.[k]?.placeholder) add('info', k, 0, 0, `${k} (${scene.cast[k].who}) uses a placeholder look from cast-extra.json, not a vault portrait.`)
  const order = { error: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level] || a.from - b.from)
}

/* plain-text report, one line per issue */
export function formatIssues(issues){
  if (!issues.length) return 'No problems found.'
  return issues.map(i => `${i.level.toUpperCase().padEnd(5)} ${String(i.from).padStart(5)}s  ${i.msg}`).join('\n')
}
