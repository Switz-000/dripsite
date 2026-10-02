// Plays presets on a character and returns one posed frame per tick.
// Browser-safe: no file access here, presets are passed in.
//
// A preset (presets/*.json) is a short clip for a generic body:
//   keys   [frame, pose, mouth?]  poses the body springs toward
//   osc    repeated motion on one value (waving, jabbing, nodding)
//   snap   instant changes (squash on take-off and landing)
//   arc    a jump: {from, len, height}
// Pose values: lx ly rx ry (hand offsets), lean tilt hx hy brow, bw bh legs (around 1),
// happy (eyes as arcs), front (hands over the body), and landmark-aimed hands:
//   "handR": {"to": "headTop", "dx": 25, "dy": -40}
// which puts the hand's centre 25 right and 40 above the top of the head, on any body.
import { compose, landmarks, handOffset } from '../../src/portrait/engine.js'

const REST = { front:0, happy:0, lx:0, ly:0, rx:0, ry:0, lean:0, tilt:0, hy:0, hx:0, brow:0, bw:1, bh:1, legs:1 }
const RATIO = new Set(['bw','bh','legs'])
const SPRING = { lx:[.13,.74], ly:[.13,.74], rx:[.13,.74], ry:[.13,.74] }   // hands lag behind the body
const FLAG = new Set(['happy','front'])
const SWAP = { lx:'rx', rx:'lx', ly:'ry', ry:'ly', handL:'handR', handR:'handL' }
const swapName = n => n.replace(/L$/,'#').replace(/R$/,'L').replace(/#$/,'R')

/* per-use options: side 'L' mirrors the gesture to the other hand, size scales it */
function adapt(pose, { side='R', size=1 } = {}){
  const o = {}
  for (const [k,v] of Object.entries(pose)){
    const key = side==='L' ? (SWAP[k]||k) : k
    if (k==='handL'||k==='handR'){ o[key] = { ...v, to: side==='L' && v.to ? swapName(v.to) : v.to, dx:(v.dx||0)*(side==='L'?-1:1)*size, dy:(v.dy||0)*size }; continue }
    let val = v
    if (side==='L' && (k.endsWith('x') || ['tilt','lean'].includes(k)) && !RATIO.has(k)) val = -v
    o[key] = FLAG.has(k) ? val : RATIO.has(k) ? 1+(val-1)*size : val*size
  }
  return o
}
const shapeOf = (shape, wave) => shape==='pulse' ? Math.max(0,Math.sin(wave)) : shape==='abs' ? Math.abs(Math.sin(wave)) : Math.sin(wave)

/* timeline: [{preset:'wave', side:'L', size:.7, speed:1.2, mouth:'smile'|false, at?:frame}, ...]
   options: presets (name -> preset), fps, id, length, tail, props {L,R}: (f,v)=>svg,
   drive(f, anim, ctx): per-frame override, may return {mouth}; layers: split body/hands */
export function play(spec, timeline, { presets, fps=24, id='c', tail=12, length=0, props={}, drive=null, layers=false, seed=7 } = {}){
  const events = []; let t0 = 0
  for (const step of timeline){
    const P = presets[step.preset]; if (!P) throw new Error('No preset called ' + step.preset)
    if (step.at != null) t0 = step.at
    const sp = step.speed || 1, at = f => t0 + Math.round(f/sp), size = step.size ?? 1
    for (const [f,pose,mouth] of P.keys) events.push({ f:at(f), type:'key', pose:adapt(pose,step), mouth: step.mouth===false ? null : (step.mouth && mouth ? step.mouth : mouth) })
    for (const [f,set,vel] of P.snap||[]) events.push({ f:at(f), type:'snap', set:adapt(set,step), vel: vel ? adapt(vel,step) : null })
    for (const o of P.osc||[]){
      const p = step.side==='L' ? (SWAP[o.p]||o.p) : o.p
      const flip = step.side==='L' && (/x$/.test(o.p) || o.p==='tilt') ? -1 : 1
      events.push({ type:'osc', from:at(o.from), to:at(o.to), p, amp:o.amp*size*flip, hz:o.hz*sp, shape:o.shape })
    }
    if (P.arc) events.push({ type:'arc', from:at(P.arc.from), len:Math.round(P.arc.len/sp), height:P.arc.height*size })
    t0 = at(P.length)
  }
  const N = Math.max(length, t0 + tail)
  const x = { ...REST }, v = Object.fromEntries(Object.keys(REST).map(k=>[k,0]))
  let target = { ...REST }, aim = {}, mouth = spec.mouth
  const baseMouth = spec.mouth
  const rnd = (s=>()=>((s=(s*16807)%2147483647)/2147483647))(seed)
  const blinkAt = new Set(); for (let f=10+Math.floor(rnd()*30); f<N; f+=50+Math.floor(rnd()*60)){ blinkAt.add(f); blinkAt.add(f+1) }
  const frames = []
  for (let f=0; f<N; f++){
    for (const e of events) if (e.f===f){
      if (e.type==='key'){ const { handL, handR, ...rest } = e.pose; target = { ...REST, ...rest }; aim = { handL, handR }
        mouth = e.mouth ?? (Object.keys(e.pose).length ? mouth : baseMouth) }
      if (e.type==='snap'){ Object.assign(x, e.set); if (e.vel) for (const k in e.vel) v[k] += e.vel[k] }
    }
    const t = f/fps, br = Math.sin(t*2*Math.PI/3.2)
    // landmark-aimed hands: turn the aim into an offset target using where the body is this frame
    const probe = { hx:x.hx, hy:x.hy, tilt:x.tilt, lean:x.lean }
    const pshape = { ...spec, shape:{ ...(spec.shape||{}), bodyW:(spec.shape?.bodyW??1)*x.bw, bodyH:(spec.shape?.bodyH??1)*x.bh } }
    const LM = (aim.handL||aim.handR) ? landmarks(pshape, probe) : null
    for (const sd of ['L','R']){ const a = aim['hand'+sd]; if (!a) continue
      const base = a.at || LM[a.to]; if (!base) throw new Error('No landmark called ' + a.to)
      const [ox,oy] = handOffset(pshape, probe, sd, [base[0]+(a.dx||0), base[1]+(a.dy||0)])
      target[sd==='L'?'lx':'rx'] = ox; target[sd==='L'?'ly':'ry'] = oy }
    x.happy = target.happy; x.front = target.front
    for (const k in REST){ if (FLAG.has(k)) continue; const [st,dm] = SPRING[k] || [.2,.68]; v[k] = (v[k] + (target[k]-x[k])*st)*dm; x[k] += v[k] }
    const add = Object.fromEntries(Object.keys(REST).map(k=>[k,0])); let jy = 0
    for (const e of events){
      if (e.type==='osc' && f>=e.from && f<e.to) add[e.p] += e.amp*shapeOf(e.shape, (f-e.from)/fps*2*Math.PI*e.hz)
      if (e.type==='arc' && f>=e.from && f<e.from+e.len){ const k=(f-e.from)/e.len; jy = -4*e.height*k*(1-k) }
    }
    const q = k => x[k] + add[k]
    const anim = { hx:q('hx'), hy:q('hy')+0.8*br, tilt:q('tilt'), lean:q('lean'), jy, legs:q('legs'),
      blink: x.happy>0 ? 3 : blinkAt.has(f) ? 1 : 0, browL:q('brow'), browR:q('brow'), boil:Math.floor(f/3)%3,
      handL:{ x:q('lx'), y:q('ly')+1.5*br, r:Math.max(-22,Math.min(22,-v.lx*1.4+v.ly*0.5)), prop:props.L&&props.L(f,v), front:!!x.front },
      handR:{ x:q('rx'), y:q('ry')+1.5*br, r:Math.max(-22,Math.min(22,-v.rx*1.4-v.ry*0.5)), prop:props.R&&props.R(f,v), front:!!x.front } }
    const shape = { ...(spec.shape||{}), bodyW:(spec.shape?.bodyW??1)*q('bw'), bodyH:(spec.shape?.bodyH??1)*q('bh')+0.005*br }
    let m2 = mouth
    const posed = { ...spec, shape }
    if (drive){ const o = drive(f, anim, { spec:posed, landmarks:a=>landmarks(posed, a||anim), handOffset:(sd,pt,a)=>handOffset(posed, a||anim, sd, pt) }) || {}; if (o.mouth) m2 = o.mouth }
    const s2 = { ...posed, mouth:m2 }
    // drawings are made only when a frame is shown, so re-running a scene after an edit is instant
    const out = { anim, spec:s2, landmarks: landmarks(s2, anim) }, lazy = (k, make) => { let v; Object.defineProperty(out, k, { get: () => v ?? (v = make()), enumerable: true }) }
    if (layers){ lazy('body', () => compose(s2, { id, frame:'full', anim:{ ...anim, layer:'body' } })); lazy('hands', () => compose(s2, { id:id+'h', frame:'full', anim:{ ...anim, layer:'hands' } })) }
    else lazy('svg', () => compose(s2, { id, frame:'full', anim }))
    frames.push(out)
  }
  return frames
}
export { landmarks, handOffset }
