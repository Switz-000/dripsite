// Runs a scene file: cast placed on a set, presets, beats on a timeline, reactions to events.
// Browser-safe (no file access): the caller passes cast specs, presets, sets and asset URLs,
// so the same scene can be rendered to video in Node or scrubbed live on the site.
//
// Scene file (scenes/*.mjs, `export default {...}`). Times are in seconds.
//   set:    { use: 'treaty-room', ...options the set understands }
//   cast:   { key: { who: 'Grawolja Lasmanna', spot: 'seatL' | at: [x, ground], scale, nudge: [dx,dy],
//                   props: { R: 'pen' }, presets: [{ preset, at, side, size, speed }], reactions: [...] } }
//   events: { flash: { bursts: [[from, to]], extra: [t, ...] } }
//   captions: [{ t: [from, to], text, style: 'sub' | 'title' }]   subtitles, or a lower-third title ('Name\nline two')
//   cast options: layer: 'front' draws the body over the set's foreground; a spot's clip: [x0,y0,x1,y1] keeps
//                 the character inside that rectangle (a figure in a picture frame)
//   beats:  [{ who, t: [from, to], ...one of:
//             hand: 'L'|'R', to: 'headTop' | [x,y] | { who, to } | { nib: 'docL' }, dx, dy
//             sign: 'docL', hand: 'R', part: [0, .55]        pen follows the signature on that document
//             look: { tilt, lean, hx, hy, brow }              blended in and out
//             face: { mouth, eyes: 'happy'|'closed'|'squeeze' }
//             nod: 1                                          small nods across the window
//             walk: x                                         walks to scene x, stepping and waddling
//           in, out: seconds of easing (default .25) }]
//   reactions per cast member: { always: 'scowl'|'smile' } | { on: 'flash', do: 'flinch'|'grin'|'blink', from, to }
import { play } from './play.mjs'
import { PEN_TIP, MARKER_TIP, PROPS } from './props.mjs'

const TIPS = { pen: PEN_TIP, marker: MARKER_TIP }
const ease = t => t<0 ? 0 : t>1 ? 1 : t*t*(3-2*t)
const rng = s => () => ((s = (s*16807) % 2147483647) / 2147483647)
const toFigure = (P, [x,y]) => [(x-P.tx)/P.S, (y-P.ty)/P.S]

/* a looping cursive scribble along a document's signature line */
export function signature([x0, y0, w], seed){
  const r = rng(seed), pts = []; let drift = 0
  const loops = 7 + Math.floor(r()*3)
  for (let i=0; i<=160; i++){ const t=i/160, a=t*loops*2*Math.PI; drift += (r()-.5)*.6
    const h = 9*(0.6+0.4*Math.sin(t*9+seed)) * (i<20?1.6:1)
    pts.push([x0 + t*w + 6*Math.cos(a), y0 - h*Math.sin(a) - t*6 + drift*0.3]) }
  return pts
}
const pointAt = (pts,p) => pts[Math.min(pts.length-1, Math.round(p*(pts.length-1)))]

export function runScene(scene, { cast, presets, sets, assets = {}, fps } = {}){
  fps = fps || scene.fps || 24
  const sec = t => Math.round(t*fps), N = sec(scene.length)
  const set = sets[scene.set.use]; if (!set) throw new Error('No set called ' + scene.set.use)
  const S0 = scene.scale || set.scale || 1

  /* events: camera flashes, bunched at random inside bursts, plus fixed extra ones */
  const flashes = []
  if (scene.events?.flash){ const F = scene.events.flash, r = rng(F.seed || 5)
    for (const [a,b] of F.bursts||[]){ let f = sec(a); while (f < sec(b)){ flashes.push(f); f += 6 + Math.floor(r()*18) } }
    for (const t of F.extra||[]) flashes.push(sec(t))
    flashes.sort((a,b)=>a-b) }
  const sinceFlash = f => { let m = 99; for (const t of flashes) if (f >= t) m = Math.min(m, f-t); return m }
  const flashAmt = f => { const d = sinceFlash(f); return d < 5 ? [1,.55,.28,.12,.05][d] : 0 }
  const br = rng(9), bulbs = flashes.map(t => ({ t, x: br()<.5 ? 40+br()*220 : 1020+br()*220, y: 640+br()*80 }))

  /* documents and their signatures */
  const docs = {}
  for (const [k,d] of Object.entries(set.docs||{})) docs[k] = { ...d, pts: signature(d.sig, d.seed || k.length*3+1), beats: [] }
  for (const b of scene.beats||[]) if (b.sign) docs[b.sign].beats.push(b)
  const docProgress = (k, f) => { let p = 0; for (const b of docs[k].beats){ const [a,z] = b.t.map(sec), [p0,p1] = b.part||[0,1]
      if (f >= z) p = Math.max(p, p1); else if (f >= a) p = Math.max(p, p0 + (p1-p0)*ease((f-a)/(z-a))) } return p }

  /* placement: standing figures put their feet on the ground line, seated ones their waist on the seat line */
  const place = {}
  for (const [k,c] of Object.entries(scene.cast)){
    const spot = c.spot ? set.spots[c.spot] : { x:c.at[0], ground:c.at[1] }; if (!spot) throw new Error('No spot ' + c.spot)
    const S = c.scale || spot.scale || S0, [nx,ny] = c.nudge || [0,0]
    place[k] = spot.seat != null ? { S, tx: spot.x-200*S+nx, ty: spot.seat-425*S+ny, seated:true } : { S, tx: spot.x-200*S+nx, ty: spot.ground-712*S+ny, seated:false }
    place[k].x0 = spot.x + nx; place[k].clip = c.clip || spot.clip || null; place[k].front = c.layer === 'front'
  }

  /* walking: where each character stands at every frame, from its walk beats in time order */
  const walkX = {}
  for (const k of Object.keys(scene.cast)){
    const ws = (scene.beats||[]).filter(b => b.who === k && b.walk != null && Array.isArray(b.t)).sort((a,b) => a.t[0]-b.t[0])
    const xs = new Float64Array(N), moving = new Float64Array(N); let x = place[k].x0, wi = 0
    for (let f = 0; f < N; f++){
      while (wi < ws.length && f >= sec(ws[wi].t[1])){ x = ws[wi].walk; wi++ }
      const b = ws[wi]
      if (b && f >= sec(b.t[0])){ const a = sec(b.t[0]), z = sec(b.t[1]), k2 = ease((f-a)/Math.max(1,z-a)); xs[f] = x + (b.walk-x)*k2; moving[f] = Math.sign(b.walk-x) * Math.min(1, Math.sin(Math.PI*(f-a)/Math.max(1,z-a))*3) }
      else xs[f] = x
    }
    walkX[k] = { xs, moving }
  }

  /* play every cast member; beats and reactions run in the per-frame drive */
  const rows = {}, order = Object.keys(scene.cast)
  for (const k of order){
    const c = scene.cast[k], who = cast[c.who]; if (!who) throw new Error('Not in the cast: ' + c.who)
    const P = place[k], my = (scene.beats||[]).filter(b => b.who === k)
    const props = Object.fromEntries(Object.entries(c.props||{}).map(([sd,n]) => [sd, (f,v) => PROPS[n](f,v)]))
    const timeline = (c.presets || [{ preset:'idle' }]).map(p => ({ ...p, at: p.at != null ? sec(p.at) : undefined }))
    rows[k] = play(who.spec, timeline, { presets, fps, id:k, length:N, tail:0, props, layers:true, seed:k.length*7+3, drive:(f, anim, ctx) => {
      let mouth = null
      { const W_ = walkX[k], mv = W_.moving[f]
        anim.jx = (W_.xs[f] - P.x0) / P.S
        if (mv){ const ph = f/fps*2*Math.PI*2.1                      // about two steps a second
          anim.jy = -7*Math.abs(Math.sin(ph))*Math.abs(mv); anim.lean += 3*Math.sin(ph)*Math.abs(mv) + 2*mv; anim.tilt += 2*mv } }
      for (const b of my){
        if (b.walk != null) continue
        const [a,z] = b.t.map(sec), fin = sec(b.in ?? .25), fout = sec(b.out ?? .25)
        if (f < a || f >= z + fout) continue
        const w = (fin ? ease((f-a)/fin) : 1) * (f >= z ? (fout ? 1-ease((f-z)/fout) : 0) : 1)
        if (b.sign || b.hand){
          const sd = b.hand || 'R', key = 'hand'+sd, tip = TIPS[c.props?.[sd]] || [0,0]
          let world = null, fig = null
          if (b.sign){ const d = docs[b.sign], p = docProgress(b.sign, Math.min(f, z-1)); world = pointAt(d.pts, p) }
          else if (Array.isArray(b.to)) world = b.to
          else if (b.to?.nib){ const d = docs[b.to.nib]; world = pointAt(d.pts, docProgress(b.to.nib, f)) }
          else if (b.to?.who){ const o = rows[b.to.who]?.[f] || null, op = place[b.to.who]
            if (!o) throw new Error(`Beat for ${k} aims at ${b.to.who}, who must be listed earlier in the cast`)
            const L = o.landmarks[b.to.to]; if (!L) throw new Error(`${k}'s hand beat aims at ${b.to.who}'s "${b.to.to}", which is not a landmark.`)
            world = [op.tx + L[0]*op.S, op.ty + L[1]*op.S] }
          else { fig = ctx.landmarks()[b.to]; if (!fig) throw new Error(`${k}'s hand beat at ${b.t[0]}s aims at "${b.to}", which is not a landmark. Landmarks: ${Object.keys(ctx.landmarks()).join(', ')}`) }
          if (world) fig = toFigure(P, world)
          if (!fig) throw new Error(`No target for ${k}'s hand beat`)
          // aim the prop's tip (pen nib, marker tip) at the point, not the hand's centre
          const target = [fig[0] + (b.dx||0) - tip[0], fig[1] + (b.dy||0) - tip[1] - (b.sign && f >= z ? 14 : 0)]
          const [ox,oy] = ctx.handOffset(sd, target)
          anim[key] = { ...anim[key], x: anim[key].x + (ox-anim[key].x)*w, y: anim[key].y + (oy-anim[key].y)*w, r: b.sign ? 3*Math.sin(f*1.3)*w : anim[key].r*(1-w) }
        }
        if (b.look) for (const [q,val] of Object.entries(b.look)){ if (q==='brow'){ anim.browL += val*w; anim.browR += val*w } else anim[q] += val*w }
        if (b.nod && f < z) anim.hy += 5*Math.max(0, Math.sin((f-a)/13*Math.PI))*w
        if (b.face && f < z && w > .5){ if (b.face.mouth) mouth = b.face.mouth
          if (b.face.eyes) anim.blink = { happy:3, closed:1, squeeze:2 }[b.face.eyes] }
      }
      for (const r of c.reactions||[]){
        if (r.from != null && f < sec(r.from)) continue; if (r.to != null && f >= sec(r.to)) continue
        if (r.always === 'scowl'){ anim.browL += 5; anim.browR += 5; mouth = mouth || 'wavy' }
        if (r.always === 'smile') mouth = mouth || 'smile'
        if (r.on === 'flash'){ const d = sinceFlash(f), fl = d < 4 ? [1,.8,.5,.2][d] : 0
          if (r.do === 'flinch'){ if (d < 3) anim.blink = 2; anim.browL += 4*fl; anim.browR += 4*fl; anim.hx += 5*fl; anim.tilt -= 4*fl; anim.hy += 2*fl; if (fl > .3) mouth = 'short' }
          if (r.do === 'grin' && d < 6) anim.blink = 3
          if (r.do === 'blink' && d < 2) anim.blink = 1 }
      }
      return mouth ? { mouth } : null
    }})
  }

  const put = (k, svg) => { const P = place[k], g = `<g transform="translate(${P.tx.toFixed(1)} ${P.ty.toFixed(1)}) scale(${P.S})">${svg.replace(/^<svg [^>]*>/,'').replace(/<\/svg>\s*$/,'')}</g>`
    return P.clip ? `<g clip-path="url(#clip-${k})">${g}</g>` : g }
  const clips = order.filter(k => place[k].clip).map(k => { const [x0,y0,x1,y1] = place[k].clip; return `<clipPath id="clip-${k}"><rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}"/></clipPath>` }).join('')
  const back = order.filter(k => !place[k].front)
  const standing = back.filter(k => !place[k].seated), seated = back.filter(k => place[k].seated), front = order.filter(k => place[k].front)
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const wrap = (t, n) => { const out = []; let line = ''; for (const w of String(t).split(' ')){ if ((line+' '+w).trim().length > n && line){ out.push(line); line = w } else line = (line+' '+w).trim() } if (line) out.push(line); return out }
  function captions(f){
    return (scene.captions||[]).map(c => {
      const [a,z] = c.t.map(sec); if (f < a || f >= z) return ''
      const o = Math.min(1, (f-a)/4, (z-f)/4).toFixed(2)
      if (c.style === 'title'){ const [l1, ...rest] = String(c.text).split('\n'), w = Math.max(l1.length*15, ...rest.map(r=>r.length*10.5)) + 48
        return `<g opacity="${o}"><rect x="40" y="${H-170}" width="${w.toFixed(0)}" height="${44 + rest.length*26}" fill="#111" fill-opacity=".82"/><rect x="40" y="${H-170}" width="6" height="${44 + rest.length*26}" fill="#c9a227"/>
  <text x="62" y="${H-140}" font-family="DejaVu Sans" font-weight="bold" font-size="24" fill="#fff">${esc(l1)}</text>${rest.map((r,i)=>`<text x="62" y="${H-112+i*26}" font-family="DejaVu Sans" font-size="17" fill="#ddd">${esc(r)}</text>`).join('')}</g>` }
      const lines = wrap(c.text, 58), w = Math.max(...lines.map(l => l.length))*13.2 + 40, h = lines.length*34 + 16
      return `<g opacity="${o}"><rect x="${((W-w)/2).toFixed(0)}" y="${H-28-h}" width="${w.toFixed(0)}" height="${h}" rx="6" fill="#000" fill-opacity=".72"/>${lines.map((l,i)=>`<text x="${W/2}" y="${H-28-h+36+i*34}" text-anchor="middle" font-family="DejaVu Sans" font-size="24" fill="#fff">${esc(l)}</text>`).join('')}</g>`
    }).join('')
  }
  const [W,H] = scene.size || [1280,720]
  const ctxFor = f => ({ f, fps, scene, assets, ink: Object.fromEntries(Object.keys(docs).map(k => [k, { pts: docs[k].pts, p: docProgress(k,f) }])) })

  function frame(f, { landmarks: showLM = false, captions: showCaptions = true } = {}){
    const ctx = ctxFor(f), fl = flashAmt(f), b = bulbs.filter(q => f-q.t >= 0 && f-q.t < 3)
    const lm = !showLM ? '' : order.map(k => { const P = place[k], L = rows[k][f].landmarks
      return Object.entries(L).map(([n,[x,y]]) => `<circle cx="${(P.tx+x*P.S).toFixed(1)}" cy="${(P.ty+y*P.S).toFixed(1)}" r="4" fill="#d6336c" stroke="#fff" stroke-width="1.5"><title>${k}.${n}</title></circle>`).join('') }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${clips}<radialGradient id="bulb"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${set.back(ctx)}
${standing.map(k => put(k, rows[k][f].body)).join('')}
${seated.map(k => put(k, rows[k][f].body)).join('')}
${set.middle ? set.middle(ctx) : ''}
${back.map(k => put(k, rows[k][f].hands)).join('')}
${front.map(k => put(k, rows[k][f].body) + put(k, rows[k][f].hands)).join('')}
${showCaptions ? captions(f) : ''}
${b.map(q => `<circle cx="${q.x.toFixed(0)}" cy="${q.y.toFixed(0)}" r="${(150*(1-(f-q.t)/3)).toFixed(0)}" fill="url(#bulb)"/>`).join('')}
${fl > 0 ? `<rect width="${W}" height="${H}" fill="#fffdf4" fill-opacity="${(fl*0.62).toFixed(3)}"/>` : ''}
${lm}
</svg>`
  }
  return { N, fps, size:[W,H], frame, flashes, place, rows, set, scene, walking: (k, f) => !!walkX[k] && (walkX[k].moving[f] !== 0 || walkX[k].xs[f] !== walkX[k].xs[Math.min(N-1, f+1)]), castInfo: Object.fromEntries(order.map(k => [k, cast[scene.cast[k].who]])) }
}
