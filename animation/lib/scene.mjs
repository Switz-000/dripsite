// Runs a scene file: cast placed on a set, presets, beats on a timeline, reactions to events.
// Browser-safe (no file access): the caller passes cast specs, presets, sets and asset URLs,
// so the same scene can be rendered to video in Node or scrubbed live on the site.
//
// Scene file (scenes/*.mjs, `export default {...}`). Times are in seconds.
//   set:    { use: 'treaty-room', ...options the set understands }
//   cast:   { key: { who: 'Grawolja Lasmanna', spot: 'seatL' | at: [x, ground], scale, nudge: [dx,dy],
//                   props: { R: 'pen' }, presets: [{ preset, at, side, size, speed }], reactions: [...] } }
//   events: { flash: { bursts: [[from, to]], extra: [t, ...] } }
//   beats:  [{ who, t: [from, to], ...one of:
//             hand: 'L'|'R', to: 'headTop' | [x,y] | { who, to } | { nib: 'docL' }, dx, dy
//             sign: 'docL', hand: 'R', part: [0, .55]        pen follows the signature on that document
//             look: { tilt, lean, hx, hy, brow }              blended in and out
//             face: { mouth, eyes: 'happy'|'closed'|'squeeze' }
//             nod: 1                                          small nods across the window
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
      for (const b of my){
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

  const put = (k, svg) => { const P = place[k]; return `<g transform="translate(${P.tx.toFixed(1)} ${P.ty.toFixed(1)}) scale(${P.S})">${svg.replace(/^<svg [^>]*>/,'').replace(/<\/svg>\s*$/,'')}</g>` }
  const standing = order.filter(k => !place[k].seated), seated = order.filter(k => place[k].seated)
  const [W,H] = scene.size || [1280,720]
  const ctxFor = f => ({ f, fps, scene, assets, ink: Object.fromEntries(Object.keys(docs).map(k => [k, { pts: docs[k].pts, p: docProgress(k,f) }])) })

  function frame(f, { landmarks: showLM = false } = {}){
    const ctx = ctxFor(f), fl = flashAmt(f), b = bulbs.filter(q => f-q.t >= 0 && f-q.t < 3)
    const lm = !showLM ? '' : order.map(k => { const P = place[k], L = rows[k][f].landmarks
      return Object.entries(L).map(([n,[x,y]]) => `<circle cx="${(P.tx+x*P.S).toFixed(1)}" cy="${(P.ty+y*P.S).toFixed(1)}" r="4" fill="#d6336c" stroke="#fff" stroke-width="1.5"><title>${k}.${n}</title></circle>`).join('') }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><radialGradient id="bulb"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${set.back(ctx)}
${standing.map(k => put(k, rows[k][f].body)).join('')}
${seated.map(k => put(k, rows[k][f].body)).join('')}
${set.middle ? set.middle(ctx) : ''}
${order.map(k => put(k, rows[k][f].hands)).join('')}
${b.map(q => `<circle cx="${q.x.toFixed(0)}" cy="${q.y.toFixed(0)}" r="${(150*(1-(f-q.t)/3)).toFixed(0)}" fill="url(#bulb)"/>`).join('')}
${fl > 0 ? `<rect width="${W}" height="${H}" fill="#fffdf4" fill-opacity="${(fl*0.62).toFixed(3)}"/>` : ''}
${lm}
</svg>`
  }
  return { N, fps, size:[W,H], frame, flashes, place, rows, set, scene, castInfo: Object.fromEntries(order.map(k => [k, cast[scene.cast[k].who]])) }
}
