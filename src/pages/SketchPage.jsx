import React, { useEffect, useMemo, useRef, useState } from 'react'
import { compose, DEFAULT_SPEC, SLOT_OPTIONS, normalizeSpec } from '../portrait/engine'
import { Sketchpad, WORLD, SCALE, LAYERS } from '../sketch/sketchpad'

// Dev tool: sketch a new part (a hat, a prop, a mouth) straight onto a faded
// portrait, then save it for Claude to trace into parts.json. A hard-pixel
// pencil with smoothing, a real eraser, a paint bucket, Ctrl+T, Photoshop's keys.
const SLOTS = ['hat', 'prop', 'mouth', 'brows', 'eyes', 'nose', 'hair', 'facial', 'eyewear', 'outfit', 'extra', 'other']
const LAYER_LABEL = { ink: 'Lines', fill: 'Colour areas' }
const HEAD_VIEW = { x: -40, y: -75, w: 480, h: 470 }
const FULL_VIEW = { x: -40, y: -40, w: 480, h: 770 }
const DEV = import.meta.env.DEV
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const GHOST_SLOTS = [['hair', 'Hair'], ['brows', 'Brows'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['eyewear', 'Glasses'], ['outfit', 'Outfit']]
const clampSize = v => Math.min(200, Math.max(1, Math.round(+v || 1)))
const inField = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

export default function SketchPage() {
  const viewRef = useRef(null), inkRef = useRef(null), fillRef = useRef(null)
  const cursorRef = useRef(null), stringRef = useRef(null)
  const padRef = useRef(null), dragRef = useRef(null), spaceRef = useRef(false)
  const [, setTick] = useState(0)
  const [tool, setTool] = useState('pencil')
  const [layer, setLayer] = useState('ink')
  const [size, setSize] = useState(10)
  const [pressureOn, setPressureOn] = useState(false)
  const [smooth, setSmooth] = useState(40)
  const [linked, setLinked] = useState(true)
  const [view, setView] = useState({ z: 1, px: 0, py: 0 })
  const [ghost, setGhost] = useState({ hair: 'none', outfit: 'suit', mouth: 'line', nose: 'hook', brows: 'none', eyewear: 'none', headW: 1, show: true, anchors: false, opacity: 0.35 })
  const [meta, setMeta] = useState({ name: '', slot: 'hat', note: '' })
  const [status, setStatus] = useState('')
  const [saved, setSaved] = useState([])

  const ghostSpec = useMemo(() => normalizeSpec({ ...DEFAULT_SPEC, ...Object.fromEntries(GHOST_SLOTS.map(([k]) => [k, ghost[k]])),
    shape: { ...DEFAULT_SPEC.shape, headW: ghost.headW } }), [...GHOST_SLOTS.map(([k]) => ghost[k]), ghost.headW])
  const ghostSvg = useMemo(() => compose(ghostSpec, { id: 'ghost', frame: 'full', anchors: ghost.anchors }), [ghostSpec, ghost.anchors])

  // the key handlers live on window, so they read the latest state through a ref
  const st = useRef({}); st.current = { tool, layer, size, smooth, linked, view, pressureOn }
  const pad = () => padRef.current
  const xfLayers = () => (linked ? LAYERS : [layer])

  useEffect(() => {
    padRef.current = new Sketchpad({ fill: fillRef.current, ink: inkRef.current })
    padRef.current.onChange = () => setTick(t => t + 1)
    fit(HEAD_VIEW)
    if (DEV) refreshSaved()
    const warn = e => { if (padRef.current?.dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  /* ---------- view: world units <-> screen ---------- */
  function fit(r) {
    const el = viewRef.current; if (!el) return
    const vw = el.clientWidth, vh = el.clientHeight, z = Math.min(vw / r.w, vh / r.h) * 0.96
    setView({ z, px: vw / 2 - (r.x + r.w / 2 - WORLD.x) * z, py: vh / 2 - (r.y + r.h / 2 - WORLD.y) * z })
  }
  function toPx(e) {   // pointer -> layer pixels
    const r = viewRef.current.getBoundingClientRect(), v = st.current.view
    return { x: (e.clientX - r.left - v.px) / v.z * SCALE, y: (e.clientY - r.top - v.py) / v.z * SCALE }
  }
  useEffect(() => {
    const el = viewRef.current
    const wheel = e => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
      setView(v => { const z = Math.min(24, Math.max(0.3, v.z * Math.exp(-e.deltaY * 0.0015)))
        return { z, px: mx - (mx - v.px) * z / v.z, py: my - (my - v.py) * z / v.z } })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  /* ---------- transform box hit testing ---------- */
  const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
  function hit(p) {
    const t = pad().xf, tol = 9 / st.current.view.z * SCALE
    for (const [hx, hy] of HANDLES) {
      const q = pad().local(hx * t.w / 2 * t.sx, hy * t.h / 2 * t.sy)
      if (Math.hypot(q.x - p.x, q.y - p.y) < tol) return { kind: 'scale', hx, hy }
    }
    const c = Math.cos(-t.rot), s = Math.sin(-t.rot), dx = p.x - t.cx, dy = p.y - t.cy
    const lx = dx * c - dy * s, ly = dx * s + dy * c
    return Math.abs(lx) <= Math.abs(t.w * t.sx) / 2 && Math.abs(ly) <= Math.abs(t.h * t.sy) / 2 ? { kind: 'move' } : { kind: 'rotate' }
  }
  const CURSORS = { move: 'move', rotate: 'alias', scale: 'nwse-resize' }

  /* ---------- pointer ---------- */
  function onDown(e) {
    if (e.button === 2) return
    const el = viewRef.current; el.setPointerCapture(e.pointerId)
    if (e.button === 1 || spaceRef.current) { dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, v: st.current.view }; return }
    const p = toPx(e), P = pad()
    if (st.current.tool === 'move' && !P.xf) {
      if (!P.beginTransform(xfLayers())) return
      dragRef.current = { kind: 'move', p, t0: { ...P.xf }, commitOnUp: true }; return
    }
    if (P.xf) { const h = hit(p); dragRef.current = { ...h, p, t0: { ...P.xf } }; return }
    if (st.current.tool === 'bucket') {
      const r = P.bucket(st.current.layer, p)
      if (!r.ok && r.why === 'line') flash('That is a line. Click inside an area.')
      else if (r.leaked) flash('The area is not closed, so it filled to the edge. Ctrl+Z, close the gap, try again.')
      return
    }
    const pressure = e.pointerType === 'pen' && st.current.pressureOn ? e.pressure : null
    P.beginStroke(st.current.layer, p, { size: st.current.size, smooth: st.current.smooth, pressure, erase: st.current.tool === 'eraser' })
    dragRef.current = { kind: 'stroke' }
  }
  function onMove(e) {
    const p = toPx(e), d = dragRef.current, P = pad()
    drawCursor(e, p)
    if (!d) { if (P?.xf) viewRef.current.style.cursor = CURSORS[hit(p).kind]; return }
    if (d.kind === 'pan') { setView({ ...d.v, px: d.v.px + e.clientX - d.x, py: d.v.py + e.clientY - d.y }); return }
    if (d.kind === 'stroke') {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
      for (const ev of (evs.length ? evs : [e])) P.moveStroke(toPx(ev), ev.pointerType === 'pen' && st.current.pressureOn ? ev.pressure : null)
      return
    }
    const t0 = d.t0
    if (d.kind === 'move') { P.setTransform({ cx: t0.cx + p.x - d.p.x, cy: t0.cy + p.y - d.p.y }); return }
    if (d.kind === 'rotate') {
      let rot = t0.rot + Math.atan2(p.y - t0.cy, p.x - t0.cx) - Math.atan2(d.p.y - t0.cy, d.p.x - t0.cx)
      if (e.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12)
      P.setTransform({ rot }); return
    }
    // scale: the opposite handle stays put (Alt: the centre does); corners keep proportions unless Shift
    const { hx, hy } = d, m = e.altKey ? 2 : 1
    const A = e.altKey ? { x: t0.cx, y: t0.cy } : P.local(-hx * t0.w / 2 * t0.sx, -hy * t0.h / 2 * t0.sy, t0)
    const c = Math.cos(-t0.rot), s = Math.sin(-t0.rot), dx = p.x - A.x, dy = p.y - A.y
    const v = { x: dx * c - dy * s, y: dx * s + dy * c }
    let sx = t0.sx, sy = t0.sy
    if (hx && hy && !e.shiftKey) {
      const dd = { x: hx * t0.w * t0.sx / m, y: hy * t0.h * t0.sy / m }
      const k = (v.x * dd.x + v.y * dd.y) / (dd.x * dd.x + dd.y * dd.y); sx = t0.sx * k; sy = t0.sy * k
    } else {
      if (hx) sx = m * v.x * hx / t0.w
      if (hy) sy = m * v.y * hy / t0.h
    }
    const clamp = v => (Math.abs(v) < 0.02 ? (v < 0 ? -0.02 : 0.02) : v); sx = clamp(sx); sy = clamp(sy)
    const C = e.altKey ? A : (() => { const cc = Math.cos(t0.rot), ss = Math.sin(t0.rot), lx = hx * t0.w * sx / 2, ly = hy * t0.h * sy / 2
      return { x: A.x + lx * cc - ly * ss, y: A.y + lx * ss + ly * cc } })()
    P.setTransform({ sx, sy, cx: C.x, cy: C.y })
  }
  function onUp(e) {
    const d = dragRef.current; dragRef.current = null
    if (!d) return
    if (d.kind === 'stroke') pad().endStroke()
    if (d.commitOnUp) pad().commitTransform()
    if (stringRef.current) stringRef.current.style.display = 'none'
  }
  function drawCursor(e, p) {
    const c = cursorRef.current, s = stringRef.current; if (!c) return
    const P = pad(), drawing = st.current.tool === 'pencil' || st.current.tool === 'eraser'
    const show = drawing && !P?.xf && !spaceRef.current
    const at = P?.stroke ? P.stroke.b : p
    c.style.display = show ? '' : 'none'
    c.setAttribute('cx', at.x / SCALE + WORLD.x); c.setAttribute('cy', at.y / SCALE + WORLD.y); c.setAttribute('r', st.current.size / SCALE / 2)
    if (P?.stroke && st.current.smooth > 0) {
      s.style.display = ''
      s.setAttribute('x1', at.x / SCALE + WORLD.x); s.setAttribute('y1', at.y / SCALE + WORLD.y)
      s.setAttribute('x2', p.x / SCALE + WORLD.x); s.setAttribute('y2', p.y / SCALE + WORLD.y)
    }
    if (!P?.xf) viewRef.current.style.cursor = spaceRef.current ? 'grab' : drawing || st.current.tool === 'bucket' ? 'crosshair' : 'move'
  }

  /* ---------- keys ---------- */
  useEffect(() => {
    const down = e => {
      const P = pad(), k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey
      if (mod && k === 's') { e.preventDefault(); save(); return }
      if (inField(e)) return
      if (k === ' ') { spaceRef.current = true; viewRef.current.style.cursor = 'grab'; e.preventDefault(); return }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? P.redo() : P.undo(); return }
      if (mod && k === 'y') { e.preventDefault(); P.redo(); return }
      // T on its own too: some desktops (KDE) keep Ctrl+T for themselves
      if ((mod && k === 't') || (!mod && k === 't' && !P.xf)) { e.preventDefault(); if (!P.beginTransform(st.current.linked ? LAYERS : [st.current.layer])) flash('Nothing to transform on this layer.'); return }
      if (mod && k === 's') { e.preventDefault(); save(); return }
      if (mod && k === '0') { e.preventDefault(); fit(FULL_VIEW); return }
      if (mod) return
      if (P.xf) {
        if (k === 'enter') { P.commitTransform(); return }
        if (k === 'escape') { P.cancelTransform(); return }
        const step = e.shiftKey ? 10 * SCALE : SCALE, arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }
        if (arrows[k]) { e.preventDefault(); P.setTransform({ cx: P.xf.cx + arrows[k][0] * step, cy: P.xf.cy + arrows[k][1] * step }); return }
      }
      if (k === 'b') { P.commitTransform(); setTool('pencil') }
      else if (k === 'e') { P.commitTransform(); setTool('eraser') }
      else if (k === 'g') { P.commitTransform(); setTool('bucket') }
      else if (k === 'v') setTool('move')
      else if (k === '[') setSize(s => clampSize(s - (s > 20 ? 5 : s > 10 ? 2 : 1)))
      else if (k === ']') setSize(s => clampSize(s + (s >= 20 ? 5 : s >= 10 ? 2 : 1)))
      else if (k === '1') setLayer('ink')
      else if (k === '2') setLayer('fill')
      else if (k === 'h') setGhost(g => ({ ...g, show: !g.show }))
      else if (k === '0') fit(HEAD_VIEW)
    }
    const up = e => { if (e.key === ' ') { spaceRef.current = false; viewRef.current.style.cursor = '' } }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  /* ---------- save / open ---------- */
  function flash(msg) { setStatus(msg); clearTimeout(flash.t); flash.t = setTimeout(() => setStatus(''), 4000) }
  async function refreshSaved() { try { setSaved(await (await fetch('/__sketches')).json()) } catch { setSaved([]) } }
  async function save() {
    const P = pad(), slug = slugify(meta.name)
    if (!slug) { flash('Give the part a name first.'); return }
    if (P.isEmpty('ink') && P.isEmpty('fill')) { flash('Nothing drawn yet.'); return }
    const payload = { version: 1, slug, ...meta, ghost: ghostSpec, world: WORLD, scale: SCALE, savedAt: new Date().toISOString(),
      layers: Object.fromEntries(LAYERS.map(l => [l, P.isEmpty(l) ? null : P.dataURL(l)])),
      preview: await P.preview(compose(ghostSpec, { id: 'prev', frame: 'full' })) }
    if (DEV) {
      try {
        const r = await fetch('/__sketches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(await r.text())
        P.dirty = false; refreshSaved(); flash(`Saved to sketches/${slug}/. Tell Claude: "integrate sketches/${slug}".`)
      } catch (err) { flash('Save failed: ' + err.message) }
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }))
      a.download = `${slug}.sketch.json`; a.click(); URL.revokeObjectURL(a.href)
      P.dirty = false; flash(`Downloaded ${slug}.sketch.json. Put it in the repo's sketches/ folder for Claude.`)
    }
  }
  async function open(payload) {
    if (pad().dirty && !confirm('Drop the unsaved drawing?')) return
    await pad().load(payload.layers)
    setMeta({ name: payload.name || payload.slug || '', slot: payload.slot || 'hat', note: payload.note || '' })
    if (payload.ghost) { const n = normalizeSpec(payload.ghost)
      setGhost(g => ({ ...g, ...Object.fromEntries(GHOST_SLOTS.map(([k]) => [k, n[k]])), headW: n.shape.headW })) }
    flash('Opened ' + (payload.name || payload.slug))
  }
  async function openSaved(slug) { if (slug) try { await open(await (await fetch('/__sketches/' + slug)).json()) } catch (err) { flash('Could not open: ' + err.message) } }
  function openFile(file) { if (file) file.text().then(t => open(JSON.parse(t))).catch(() => flash('That file is not a sketch.')) }
  async function fresh() {
    if (pad().dirty && !confirm('Drop the unsaved drawing?')) return
    await pad().load({}); setMeta(m => ({ ...m, name: '', note: '' }))
  }

  /* ---------- transform overlay ---------- */
  const P = padRef.current, xf = P?.xf
  const W = p => [p.x / SCALE + WORLD.x, p.y / SCALE + WORLD.y]
  const hs = 6 / view.z
  const overlay = xf && (() => {
    const pts = P.corners().map(W)
    const handles = HANDLES.map(([hx, hy]) => W(P.local(hx * xf.w / 2 * xf.sx, hy * xf.h / 2 * xf.sy)))
    return <g>
      <polygon points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#1e6fd9" strokeWidth={1 / view.z} />
      {handles.map(([x, y], i) => <rect key={i} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#fff" stroke="#1e6fd9" strokeWidth={1 / view.z} />)}
      <circle cx={W({ x: xf.cx, y: xf.cy })[0]} cy={W({ x: xf.cx, y: xf.cy })[1]} r={hs / 2} fill="none" stroke="#1e6fd9" strokeWidth={1 / view.z} />
    </g>
  })()

  const worldStyle = { width: WORLD.w, height: WORLD.h, transform: `translate(${view.px}px, ${view.py}px) scale(${view.z})` }
  const tools = [['pencil', 'Pencil', 'B'], ['eraser', 'Eraser', 'E'], ['bucket', 'Bucket', 'G'], ['move', 'Move', 'V']]

  return (
    <div className="page-inner sk">
      <h1 className="article-title">Part Sketchpad</h1>
      <p className="dp-lede">
        Draw a new part on the portrait and save it. Claude traces it, puts it on the right anchor and adds it to the composer.
        Lines go on <b>Lines</b>; scribble where the colour goes on <b>Colour areas</b>.
      </p>

      <div className="sk-bar">
        <div className="dp-chips">
          {tools.map(([k, label, key]) => (
            <button key={k} type="button" className={'dp-chip' + (tool === k ? ' on' : '')} aria-pressed={tool === k}
              onClick={() => { if (k !== 'move') pad().commitTransform(); setTool(k) }}>{label} <kbd>{key}</kbd></button>
          ))}
          <button type="button" className={'dp-chip' + (xf ? ' on' : '')} onClick={() => xf ? pad().commitTransform() : (pad().beginTransform(xfLayers()) || flash('Nothing to transform on this layer.'))}>
            Transform <kbd>Ctrl T · T</kbd></button>
        </div>
        <label className="sk-field"><span>Size</span>
          <input type="range" min="1" max="80" step="1" value={Math.min(size, 80)} onChange={e => setSize(clampSize(e.target.value))} />
          <input type="number" className="sk-num" min="1" max="200" step="1" value={size}
            onChange={e => e.target.value !== '' && setSize(clampSize(e.target.value))} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /> px</label>
        <label className="dp-check" title="Off: every line is the same width, like Photoshop's pencil">
          <input type="checkbox" checked={pressureOn} onChange={e => setPressureOn(e.target.checked)} /> Pen pressure changes size</label>
        <label className="sk-field"><span>Smoothing</span>
          <input type="range" min="0" max="100" step="1" value={smooth} onChange={e => setSmooth(+e.target.value)} /><output>{smooth}%</output></label>
        <div className="dp-chips">
          {[...LAYERS].reverse().map((l, i) => (
            <button key={l} type="button" className={'dp-chip sk-layer-' + l + (layer === l ? ' on' : '')} aria-pressed={layer === l}
              onClick={() => setLayer(l)}>{LAYER_LABEL[l]} <kbd>{i + 1}</kbd></button>
          ))}
        </div>
        <label className="dp-check"><input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} /> Move &amp; transform both layers</label>
      </div>

      <div className="sk-grid">
        <div className="sk-view" ref={viewRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.display = 'none' }}
          onContextMenu={e => e.preventDefault()}>
          <div className="sk-world" style={worldStyle}>
            <div className="sk-ghost portrait-svg" style={{ opacity: ghost.show ? ghost.opacity : 0 }} dangerouslySetInnerHTML={{ __html: ghostSvg }} />
            <canvas ref={fillRef} className="sk-canvas sk-fill" />
            <canvas ref={inkRef} className="sk-canvas" />
            <svg className="sk-overlay" viewBox={`${WORLD.x} ${WORLD.y} ${WORLD.w} ${WORLD.h}`}>
              <line ref={stringRef} stroke="#1e6fd9" strokeWidth={1 / view.z} style={{ display: 'none' }} />
              <circle ref={cursorRef} fill="none" stroke="#1e6fd9" strokeWidth={1 / view.z} style={{ display: 'none' }} />
              {overlay}
            </svg>
          </div>
          <div className="sk-hud">
            {xf ? 'Transform: drag inside to move, corners to scale (Shift: free, Alt: from centre), outside to rotate. Enter to apply, Esc to cancel.'
              : tool === 'bucket' ? 'Bucket: click inside an area closed off by lines. It fills the current layer.'
              : 'Scroll to zoom · Space-drag to pan · [ ] size · Ctrl+Z undo · H hide portrait · 0 fit head · 10 px = the standard line'}
          </div>
        </div>

        <div className="dp-panel sk-panel">
          <section className="dp-group">
            <h2>Part</h2>
            <label className="sk-row"><span>Name</span><input className="sk-input" value={meta.name} placeholder="fedora" onChange={e => setMeta({ ...meta, name: e.target.value })} /></label>
            <label className="sk-row"><span>Slot</span>
              <select className="sk-input" value={meta.slot} onChange={e => setMeta({ ...meta, slot: e.target.value })}>
                {SLOTS.map(s => <option key={s}>{s}</option>)}
              </select></label>
            <textarea className="dp-paste" rows={3} value={meta.note} onChange={e => setMeta({ ...meta, note: e.target.value })}
              placeholder="Notes for Claude: sits behind the ears, held in the right hand, colour like the suit..." />
            <div className="dp-row">
              <button type="button" className="dp-btn" onClick={save}>{DEV ? 'Save' : 'Download'} <kbd>Ctrl S</kbd></button>
              <button type="button" className="dp-btn dp-btn-quiet" onClick={fresh}>New</button>
              <button type="button" className="dp-btn dp-btn-quiet" onClick={() => pad().clear(layer)}>Clear {LAYER_LABEL[layer].toLowerCase()}</button>
            </div>
            <span className="dp-status" role="status">{status}</span>
          </section>

          <section className="dp-group">
            <h2>Open</h2>
            {DEV && saved.length > 0 && (
              <select className="sk-input" value="" onChange={e => openSaved(e.target.value)}>
                <option value="">Saved sketches…</option>
                {saved.map(s => <option key={s.slug} value={s.slug}>{s.name || s.slug} ({s.slot})</option>)}
              </select>
            )}
            <label className="dp-btn dp-btn-quiet sk-file">Open .sketch.json<input type="file" accept=".json,application/json" onChange={e => { openFile(e.target.files[0]); e.target.value = '' }} /></label>
          </section>

          <section className="dp-group">
            <h2>Portrait underneath</h2>
            {GHOST_SLOTS.map(([k, label]) => (
              <label className="sk-row" key={k}><span>{label}</span>
                <select className="sk-input" value={ghost[k]} onChange={e => setGhost({ ...ghost, [k]: e.target.value })}>
                  {SLOT_OPTIONS[k].map(h => <option key={h}>{h}</option>)}
                </select></label>
            ))}
            <label className="sk-row"><span>Head width</span>
              <input type="range" min="0.92" max="1.1" step="0.01" value={ghost.headW} onChange={e => setGhost({ ...ghost, headW: +e.target.value })} /></label>
            <label className="sk-row"><span>Opacity</span>
              <input type="range" min="0.05" max="1" step="0.05" value={ghost.opacity} onChange={e => setGhost({ ...ghost, opacity: +e.target.value, show: true })} /></label>
            <label className="dp-check"><input type="checkbox" checked={ghost.anchors} onChange={e => setGhost({ ...ghost, anchors: e.target.checked })} /> Show anchors</label>
            <div className="dp-row">
              <button type="button" className="dp-btn dp-btn-quiet" onClick={() => fit(HEAD_VIEW)}>Fit head</button>
              <button type="button" className="dp-btn dp-btn-quiet" onClick={() => fit(FULL_VIEW)}>Whole figure</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
