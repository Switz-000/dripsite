import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runScene } from '../../animation/lib/scene.mjs'
import { PRESETS, SETS, SCENES, loadCast, loadFlags, flagUrl, flagsOf } from '../animate/assets'
import { evalScene, beatLines, patchBeat, insertBeat } from '../animate/sceneText'
import { checkScene, activeHandBeat } from '../../animation/lib/check.mjs'
import { canExportMp4, exportMp4, download, saveScene } from '../animate/output'
import { getToken, setToken } from '../portrait/vaultPortraits'

// Dev tool: plays a scene file from animation/scenes live, with the same engine the
// command-line renderer uses. Edit the file on the right and the stage re-runs; pause and
// drag a hand to fix where a beat puts it; save the file to GitHub or export an MP4.

const DRAFT = name => `drip-anim-draft:${name}`
const NEW_SCENES = 'drip-anim-new'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* private mode: drafts just aren't kept */ } },
}
/* starting points for the New button */
const TEMPLATES = {
  'One character (studio)': `// A new scene. Times are in seconds. See animation/README.md for every option.
export default {
  length: 4,
  set: { use: 'studio' },
  cast: {
    serec: { who: 'Boris Serec', spot: 'centre', presets: [{ preset: 'idle' }, { preset: 'wave', at: 1 }] },
  },
  beats: [
  ],
}
`,
  'Two people talking (studio)': `// Two people facing each other. Lean and head tilt sell who is talking to whom.
export default {
  length: 6,
  set: { use: 'studio' },
  cast: {
    left:  { who: 'Boris Serec', spot: 'left', presets: [{ preset: 'idle' }, { preset: 'point', at: 1.5, side: 'R', size: .7 }] },
    right: { who: 'Grawolja Lasmanna', spot: 'right', presets: [{ preset: 'idle' }, { preset: 'shrug', at: 4 }] },
  },
  beats: [
    { who: 'left', t: [0, 3.5], look: { tilt: 4, lean: 1.5, hx: 3 }, face: { mouth: 'open' } },
    { who: 'right', t: [0, 3.5], look: { tilt: -3, hx: -2 } },
    { who: 'right', t: [3.5, 6], look: { tilt: -5, lean: -1.5, hx: -3 }, face: { mouth: 'wavy' } },
    { who: 'left', t: [3.8, 5], nod: 1 },
  ],
}
`,
  'Signing at a table (treaty room)': `// Two signers at the treaty-room table. Swap the people and flags.
export default {
  length: 6,
  set: { use: 'treaty-room', flags: ['Susia', 'Confia', 'Susia', 'Confia', 'Susia'] },
  cast: {
    left:  { who: 'Grawolja Lasmanna', spot: 'seatL', nudge: [0, -22], props: { R: 'pen' } },
    right: { who: 'Boris Serec', spot: 'seatR', props: { L: 'pen' } },
  },
  beats: [
    { who: 'left',  t: [0.3, 6],   hand: 'L', to: [352, 500] },
    { who: 'left',  t: [1, 4],     sign: 'docL', hand: 'R' },
    { who: 'left',  t: [1, 4],     look: { tilt: 5, lean: 2, hy: 6 } },
    { who: 'right', t: [0.3, 6],   hand: 'R', to: [948, 500] },
    { who: 'right', t: [1.5, 4.5], sign: 'docR', hand: 'L' },
    { who: 'right', t: [1.5, 4.5], look: { tilt: -4, hy: 6, lean: -1.5 } },
  ],
}
`,
}
const TEMPLATE = TEMPLATES['One character (studio)']
/* beat lines the Add beat menu inserts at the playhead (one second long; adjust in the editor) */
const SNIPPETS = {
  'Hand above the head':        (w, o, t) => `{ who: '${w}', t: ${t}, hand: 'R', to: 'headTop', dx: 40, dy: -40 }`,
  'Hand to the chest':          (w, o, t) => `{ who: '${w}', t: ${t}, hand: 'R', to: 'chest', dx: 30, dy: 0 }`,
  'Shield the eyes':            (w, o, t) => `{ who: '${w}', t: ${t}, hand: 'L', to: 'brow', dx: -12, dy: -18 }`,
  'Hand to the mouth':          (w, o, t) => `{ who: '${w}', t: ${t}, hand: 'L', to: 'mouth', dx: 12, dy: 18 }`,
  "Hand on someone's shoulder": (w, o, t) => o ? `{ who: '${w}', t: ${t}, hand: 'L', to: { who: '${o}', to: 'shoulderR' } }` : null,
  'Look at someone':            (w, o, t, dir) => o ? `{ who: '${w}', t: ${t}, look: { tilt: ${4*dir}, lean: ${1.5*dir}, hx: ${3*dir} } }` : null,
  'Lean in':                    (w, o, t) => `{ who: '${w}', t: ${t}, look: { lean: 3, hy: 4, brow: 2 } }`,
  'Recoil':                     (w, o, t) => `{ who: '${w}', t: ${t}, look: { lean: -3, tilt: -4, hy: -3, brow: -6 }, face: { mouth: 'open' } }`,
  'Nod':                        (w, o, t) => `{ who: '${w}', t: ${t}, nod: 1 }`,
  'Smile':                      (w, o, t) => `{ who: '${w}', t: ${t}, face: { mouth: 'smile' } }`,
  'Happy eyes':                 (w, o, t) => `{ who: '${w}', t: ${t}, face: { mouth: 'smile', eyes: 'happy' } }`,
  'Eyes shut':                  (w, o, t) => `{ who: '${w}', t: ${t}, face: { eyes: 'closed' } }`,
}
const KIND_COLOURS = { hand: '#2f6db5', sign: '#7a3fb0', look: '#b5832f', face: '#2f9a6b', nod: '#b5402f' }
const kindOf = b => b.sign ? 'sign' : b.hand ? 'hand' : b.look ? 'look' : b.face ? 'face' : b.nod ? 'nod' : 'look'
const fmt = s => s.toFixed(2) + 's'
/* beats that overlap in time go on separate sub-rows of a character's lane */
function stack(beats) {
  const ends = [], row = new Map()
  beats.map((b, i) => [b, i]).sort((a, z) => a[0].t[0] - z[0].t[0]).forEach(([b, i]) => {
    let r = ends.findIndex(e => e <= b.t[0] + 1e-6); if (r < 0) { r = ends.length; ends.push(0) }
    ends[r] = b.t[1]; row.set(i, r)
  })
  return { row, rows: Math.max(1, ends.length) }
}

export default function AnimatePage() {
  const savedNames = useMemo(() => Object.keys(SCENES).sort(), [])
  const [newNames, setNewNames] = useState(() => { try { return JSON.parse(store.get(NEW_SCENES) || '[]') } catch { return [] } })
  const [name, setName] = useState(() => savedNames.includes('lasman-signing') ? 'lasman-signing' : savedNames[0] || 'untitled')
  const [text, setText] = useState('')
  const [runner, setRunner] = useState(null)        // { S, scene, castInfo }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [f, setF] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [showLM, setShowLM] = useState(false)
  const [status, setStatus] = useState('')
  const [drag, setDrag] = useState(null)
  const [hoverHand, setHoverHand] = useState(null)
  const [selected, setSelected] = useState(-1)
  const [exporting, setExporting] = useState(null)  // { done, total, abort }
  const [token, setTok] = useState(() => getToken())
  const [newName, setNewName] = useState('')
  const [template, setTemplate] = useState(Object.keys(TEMPLATES)[0])
  const [snipWho, setSnipWho] = useState('')
  const [snipKind, setSnipKind] = useState(Object.keys(SNIPPETS)[0])
  const [showInfo, setShowInfo] = useState(false)
  const stageRef = useRef(null), overlayRef = useRef(null), editorRef = useRef(null)
  const flagMode = useRef('blob'), runSeq = useRef(0)

  const flash = useCallback((msg, ms = 4000) => { setStatus(msg); if (ms) setTimeout(() => setStatus(s => s === msg ? '' : s), ms) }, [])
  const isSaved = savedNames.includes(name)

  /* load a scene's text: an unsaved draft wins over the version in the repo */
  useEffect(() => {
    setText(store.get(DRAFT(name)) ?? SCENES[name] ?? TEMPLATE)
    setF(0); setPlaying(false); setSelected(-1)
  }, [name])

  /* re-run whenever the text settles */
  useEffect(() => {
    if (!text) return
    const seq = ++runSeq.current
    const t = setTimeout(async () => {
      try {
        const scene = await evalScene(text)
        const names = Object.values(scene.cast).map(c => c.who)
        setLoading('Loading characters from the vault…')
        const { cast, missing } = await loadCast(names, (d, n) => setLoading(`Loading characters from the vault… ${d}/${n}`))
        if (missing.length) throw new Error(`Not in the vault and not in cast-extra.json: ${missing.join(', ')}. Check the spelling, or give them a portrait: block.`)
        setLoading(flagsOf(scene).length ? 'Loading flags…' : '')
        await loadFlags(flagsOf(scene))
        if (seq !== runSeq.current) return
        const S = runScene(scene, { cast, presets: PRESETS, sets: SETS, assets: { flag: n => flagUrl(n, flagMode.current) } })
        setRunner({ S, scene, cast })
        setError(''); setLoading('')
        setF(x => Math.min(x, S.N - 1))
      } catch (e) {
        if (seq !== runSeq.current) return
        setError(String(e.message || e)); setLoading('')
      }
    }, 350)
    return () => clearTimeout(t)
  }, [text])

  /* keep drafts so a refresh never loses work */
  useEffect(() => {
    if (!text) return
    const saved = SCENES[name]
    store.set(DRAFT(name), saved != null && text === saved ? null : text)
  }, [text, name])

  /* draw the current frame */
  useEffect(() => {
    if (!runner || !stageRef.current) return
    stageRef.current.innerHTML = runner.S.frame(Math.min(f, runner.S.N - 1), { landmarks: showLM })
  }, [runner, f, showLM])

  /* playback clock */
  useEffect(() => {
    if (!playing || !runner) return
    let raf, last = performance.now(), acc = 0
    const tick = now => {
      acc += (now - last) / 1000 * runner.S.fps * speed; last = now
      if (acc >= 1) {
        const step = Math.floor(acc); acc -= step
        setF(x => {
          const n = x + step
          if (n < runner.S.N) return n
          if (loop) return n % runner.S.N
          setPlaying(false); return runner.S.N - 1
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, runner, speed, loop])

  /* keyboard: space plays, arrows step a frame, shift+arrows a second */
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('textarea, input, select')) return
      if (!runner) return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p) }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false)
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? runner.S.fps : 1)
        setF(x => Math.max(0, Math.min(runner.S.N - 1, x + d)))
      } else if (e.key === 'Home') { setF(0) } else if (e.key === 'End') { setF(runner.S.N - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runner])

  /* ---------- editor helpers ---------- */
  /* shows a line in the editor; `focus` moves the keyboard there too (only when the person asked for the
     editor, e.g. by clicking a beat), so space and the arrows keep driving playback after a drag */
  function selectLine(i, focus = false) {
    const ta = editorRef.current; if (!ta || i < 0) return
    const lines = ta.value.split('\n'); let a = 0
    for (let k = 0; k < i; k++) a += lines[k].length + 1
    if (focus) ta.focus()
    ta.setSelectionRange(a, a + lines[i].length)
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 16
    ta.scrollTop = Math.max(0, i * lh - ta.clientHeight / 3)
  }
  function selectBeat(i) {
    if (!runner) return
    setSelected(i)
    const lines = beatLines(text, runner.scene.beats.length)
    if (lines) selectLine(lines[i], true)
  }

  /* ---------- stage geometry ---------- */
  const fig2world = (k, [x, y]) => { const P = runner.S.place[k]; return [P.tx + x * P.S, P.ty + y * P.S] }
  function toScene(e) {
    const svg = overlayRef.current; if (!svg) return null
    const m = svg.getScreenCTM(); if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [p.x, p.y]
  }
  function handAt(p) {
    if (!runner || !p) return null
    let best = null
    for (const k of Object.keys(runner.scene.cast)) for (const sd of ['L', 'R']) {
      const fr = runner.S.rows[k]?.[Math.min(f, runner.S.N - 1)]; if (!fr) continue
      const w = fig2world(k, fr.landmarks['hand' + sd]), d = Math.hypot(w[0] - p[0], w[1] - p[1])
      const r = 30 * runner.S.place[k].S + 6
      if (d < r && (!best || d < best.d)) best = { k, sd, w, d }
    }
    return best
  }
  function onPointerDown(e) {
    const p = toScene(e), h = handAt(p)
    if (!h) return
    e.preventDefault(); overlayRef.current.setPointerCapture(e.pointerId)
    if (document.activeElement?.closest?.('textarea, input, select')) document.activeElement.blur()   // keys go back to playback
    setPlaying(false)
    setDrag({ ...h, start: p, now: p })
  }
  function onPointerMove(e) {
    const p = toScene(e)
    if (drag) { setDrag(d => ({ ...d, now: p })); return }
    const h = handAt(p); setHoverHand(h ? `${h.k}:${h.sd}` : null)
  }
  function onPointerUp() {
    if (!drag) return
    const d = drag; setDrag(null)
    const world = [d.now[0] - d.start[0], d.now[1] - d.start[1]]
    if (Math.hypot(...world) < 2) return
    const S = runner.S.place[d.k].S, fig = [world[0] / S, world[1] / S]
    const i = activeHandBeat(runner.scene, runner.S.fps, d.k, d.sd, f)
    let r
    if (i >= 0) r = patchBeat(text, runner.scene.beats, i, { world, fig })
    else {
      const t0 = Math.round(f / runner.S.fps * 100) / 100, t1 = Math.min(runner.scene.length, Math.round((t0 + 1) * 100) / 100)
      const target = [Math.round(d.w[0] + world[0]), Math.round(d.w[1] + world[1])]
      r = insertBeat(text, runner.scene.beats, `{ who: '${d.k}', t: [${t0}, ${t1}], hand: '${d.sd}', to: [${target[0]}, ${target[1]}] }`)
      if (!r.error) r.note = `New beat: ${d.k}'s ${d.sd} hand to [${target}] from ${t0}s to ${t1}s. Adjust its times in the editor.`
    }
    if (r.error) { flash(r.error, 7000); return }
    setText(r.text); flash(r.note, 6000)
    setTimeout(() => selectLine(r.line), 0)
  }

  /* ---------- actions ---------- */
  async function onSave() {
    try {
      flash('Saving to GitHub…', 0)
      await saveScene(name, text)
      store.set(DRAFT(name), null)
      flash(`Saved animation/scenes/${name}.mjs to GitHub. The site redeploys with it in a minute or two.`, 8000)
    } catch (e) { flash(String(e.message || e), 9000) }
  }
  async function onExport() {
    if (!runner) return
    const ctrl = new AbortController()
    setExporting({ done: 0, total: runner.S.N, abort: () => ctrl.abort() })
    flagMode.current = 'data'
    try {
      const blob = await exportMp4({ frames: runner.S.N, fps: runner.S.fps, size: runner.S.size, frameSvg: k => runner.S.frame(k),
        signal: ctrl.signal, onProgress: (done, total) => setExporting(x => x && { ...x, done, total }) })
      download(blob, `${name}.mp4`)
      flash(`Exported ${name}.mp4 (${blob.codecLabel}, ${(blob.size / 1e6).toFixed(1)} MB, no sound)${blob.codecLabel === 'H.264' ? '' : '. This browser has no H.264 encoder, so it used ' + blob.codecLabel + '; for the most compatible file use `npm run render`'}.`, 9000)
    } catch (e) { if (e.name !== 'AbortError') flash(String(e.message || e), 9000); else flash('Export cancelled.') }
    finally { flagMode.current = 'blob'; setExporting(null) }
  }
  function onNew(e) {
    e.preventDefault()
    const n = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!n) return
    if (savedNames.includes(n) || newNames.includes(n)) { flash(`There is already a scene called ${n}.`); return }
    const list = [...newNames, n]; setNewNames(list); store.set(NEW_SCENES, JSON.stringify(list))
    store.set(DRAFT(n), TEMPLATES[template] || TEMPLATE); setNewName(''); setName(n)
  }
  function onRevert() {
    if (!isSaved) return
    store.set(DRAFT(name), null); setText(SCENES[name]); flash('Back to the version in the repo.')
  }
  const dirty = isSaved ? text !== SCENES[name] : true

  /* the checker runs after every re-run; problems show under the timeline and on the lanes */
  const issues = useMemo(() => { try { return runner ? checkScene(runner.S) : [] } catch (e) { return [{ level: 'error', who: '', from: 0, to: 0, msg: 'The checker failed: ' + e.message }] } }, [runner])
  const counts = { error: issues.filter(i => i.level === 'error').length, warn: issues.filter(i => i.level === 'warn').length, info: issues.filter(i => i.level === 'info').length }

  function onAddBeat() {
    if (!runner) return
    const keys = Object.keys(runner.scene.cast), who = keys.includes(snipWho) ? snipWho : keys[0]
    const other = keys.find(k => k !== who)
    const t0 = Math.round(f / runner.S.fps * 100) / 100, t1 = Math.min(runner.scene.length, Math.round((t0 + 1) * 100) / 100)
    const dir = other ? Math.sign(runner.S.place[other].tx - runner.S.place[who].tx) || 1 : 1
    const line = SNIPPETS[snipKind](who, other, `[${t0}, ${t1}]`, dir)
    if (!line) { flash('That one needs a second character in the scene.'); return }
    const r = insertBeat(text, runner.scene.beats, line)
    if (r.error) { flash(r.error, 7000); return }
    setText(r.text); flash(`Added "${snipKind}" for ${who} from ${t0}s to ${t1}s.`)
    setTimeout(() => selectLine(r.line), 0)
  }

  /* ---------- render ---------- */
  const S = runner?.S, N = S?.N || 1, fps = S?.fps || 24
  const castKeys = runner ? Object.keys(runner.scene.cast) : []
  const len = runner?.scene.length || 1
  const pct = t => `${(100 * t / len).toFixed(3)}%`

  return (
    <div className="page-inner dp an">
      <h1 className="article-title">Animation</h1>
      <p className="dp-lede">
        Plays a scene file live. Edit it on the right and the stage updates. Pause and drag a hand to move where its beat puts it.
        Space plays, arrows step a frame, shift+arrows a second.
      </p>

      <div className="an-bar">
        <label className="an-field">Scene
          <select value={name} onChange={e => setName(e.target.value)}>
            {savedNames.map(n => <option key={n} value={n}>{n}</option>)}
            {newNames.filter(n => !savedNames.includes(n)).map(n => <option key={n} value={n}>{n} (not saved yet)</option>)}
          </select>
        </label>
        <form className="an-field" onSubmit={onNew}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="new-scene-name" aria-label="New scene name" />
          <select value={template} onChange={e => setTemplate(e.target.value)} aria-label="Start from">
            {Object.keys(TEMPLATES).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="dp-btn dp-btn-quiet" type="submit" disabled={!newName.trim()}>New</button>
        </form>
        <span className="dp-status" role="status">{loading || (dirty ? 'Unsaved changes (kept in this browser)' : 'Same as the repo')}</span>
      </div>

      <div className="an-grid">
        <div className="an-stagecol">
          <div className={'an-stage' + (drag ? ' dragging' : hoverHand ? ' grab' : '')}>
            <div ref={stageRef} className="an-svg" aria-label="Scene preview" />
            {S && (
              <svg ref={overlayRef} className="an-overlay" viewBox={`0 0 ${S.size[0]} ${S.size[1]}`}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
                {drag && (<g>
                  <line x1={drag.w[0]} y1={drag.w[1]} x2={drag.w[0] + drag.now[0] - drag.start[0]} y2={drag.w[1] + drag.now[1] - drag.start[1]} stroke="#d6336c" strokeWidth="2" strokeDasharray="5 4" />
                  <circle cx={drag.w[0] + drag.now[0] - drag.start[0]} cy={drag.w[1] + drag.now[1] - drag.start[1]} r={24 * S.place[drag.k].S} fill="#d6336c" fillOpacity=".25" stroke="#d6336c" strokeWidth="2" />
                </g>)}
              </svg>
            )}
            {!S && !error && <div className="an-empty">{loading || 'Loading…'}</div>}
          </div>

          <div className="an-transport">
            <button className="dp-btn" type="button" onClick={() => setPlaying(p => !p)} disabled={!S} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
            <button className="dp-btn dp-btn-quiet" type="button" onClick={() => { setPlaying(false); setF(x => Math.max(0, x - 1)) }} disabled={!S} aria-label="Previous frame">‹</button>
            <button className="dp-btn dp-btn-quiet" type="button" onClick={() => { setPlaying(false); setF(x => Math.min(N - 1, x + 1)) }} disabled={!S} aria-label="Next frame">›</button>
            <span className="an-time">{fmt(f / fps)} <span>frame {f} of {N - 1}</span></span>
            <label className="an-field an-small">Speed
              <select value={speed} onChange={e => setSpeed(+e.target.value)}>
                {[0.25, 0.5, 1, 2].map(s => <option key={s} value={s}>{s}x</option>)}
              </select>
            </label>
            <label className="dp-check"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop</label>
            <label className="dp-check"><input type="checkbox" checked={showLM} onChange={e => setShowLM(e.target.checked)} /> Landmarks</label>
          </div>
          <input className="an-scrub" type="range" min="0" max={N - 1} value={f} disabled={!S}
            onChange={e => { setPlaying(false); setF(+e.target.value) }} aria-label="Scrub" />

          {runner && (
            <div className="an-timeline" aria-label="Beats by character">
              <div className="an-playhead" style={{ left: `calc(84px + (100% - 84px) * ${Math.min(1, f / fps / len)})` }} />
              {castKeys.map(k => {
                const c = runner.scene.cast[k], info = runner.cast[c.who]
                const mine = runner.scene.beats.map((b, i) => [b, i]).filter(([b]) => b.who === k)
                const st = stack(mine.map(([b]) => b)), rows = st.rows, row = new Map(mine.map(([, i], j) => [i, st.row.get(j)]))
                return (
                  <div className="an-row" key={k}>
                    <span className="an-who" title={c.who + (info?.placeholder ? ' (placeholder look)' : '')}>{k}{info?.placeholder ? ' *' : ''}</span>
                    <div className="an-lane" style={{ height: 6 + rows * 13 }}>
                      {(c.presets || []).filter(p => p.at != null).map((p, i) => (
                        <span key={'p' + i} className="an-preset" style={{ left: pct(p.at) }} title={`preset ${p.preset} at ${p.at}s`}>{p.preset}</span>
                      ))}
                      {issues.filter(x => x.who === k && x.level !== 'info' && x.to >= x.from).map((x, j) => (
                        <span key={'x' + j} className={'an-issue ' + x.level} style={{ left: pct(x.from), width: `max(3px, ${pct(Math.max(0, x.to - x.from))})` }} title={x.msg} />
                      ))}
                      {mine.map(([b, i]) => (
                        <button key={i} type="button" className={'an-beat' + (selected === i ? ' on' : '')}
                          style={{ left: pct(b.t[0]), top: 3 + row.get(i) * 13, width: `calc(${pct(Math.max(.05, b.t[1] - b.t[0]))} - 1px)`, background: KIND_COLOURS[kindOf(b)] }}
                          title={`${kindOf(b)}${b.hand ? ' ' + b.hand : ''}${typeof b.to === 'string' ? ' → ' + b.to : ''}  ${b.t[0]}–${b.t[1]}s`}
                          onClick={() => { setPlaying(false); setF(Math.round(b.t[0] * fps)); selectBeat(i) }} />
                      ))}
                    </div>
                  </div>
                )
              })}
              {S.flashes.length > 0 && (
                <div className="an-row">
                  <span className="an-who">flashes</span>
                  <div className="an-lane">{S.flashes.map((t, i) => <span key={i} className="an-tick" style={{ left: pct(t / fps) }} />)}</div>
                </div>
              )}
              <div className="an-legend">{Object.entries(KIND_COLOURS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}<span>* placeholder look</span></div>
            </div>
          )}
          {runner && (
            <div className="an-tools">
              <label className="an-field">Add beat
                <select value={snipWho || castKeys[0]} onChange={e => setSnipWho(e.target.value)} aria-label="Character">
                  {castKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={snipKind} onChange={e => setSnipKind(e.target.value)} aria-label="Beat">
                  {Object.keys(SNIPPETS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <button className="dp-btn dp-btn-quiet" type="button" onClick={onAddBeat}>Add at {fmt(f / fps)}</button>
            </div>
          )}
          {status && <p className="an-note" role="status">{status}</p>}
          {runner && (
            <section className="an-check" aria-label="Scene check">
              <h2>Check <span className={counts.error ? 'bad' : counts.warn ? 'meh' : 'ok'}>
                {counts.error || counts.warn ? `${counts.error} errors, ${counts.warn} warnings` : 'no problems'}</span>
                {counts.info > 0 && <button type="button" className="an-linkbtn" onClick={() => setShowInfo(v => !v)}>{showInfo ? 'hide' : 'show'} {counts.info} notes</button>}
              </h2>
              <ul>
                {issues.filter(x => x.level !== 'info' || showInfo).map((x, j) => (
                  <li key={j} className={x.level}>
                    <button type="button" onClick={() => { setPlaying(false); setF(Math.min(N - 1, Math.round(x.from * fps))) }}>{x.from.toFixed(2)}s</button>
                    <span>{x.msg}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="dp-panel an-panel">
          <section className="dp-group">
            <h2>Scene file <span className="an-path">animation/scenes/{name}.mjs</span></h2>
            <textarea ref={editorRef} className="an-editor" value={text} spellCheck="false"
              onChange={e => setText(e.target.value)} aria-label="Scene file" />
            {error && <pre className="an-error" role="alert">{error}</pre>}
          </section>
          <section className="dp-group">
            <h2>Save and export</h2>
            <div className="dp-row">
              <button className="dp-btn" type="button" onClick={onSave} disabled={!!error || !text}>Save to GitHub</button>
              <button className="dp-btn dp-btn-quiet" type="button" onClick={() => download(new Blob([text], { type: 'text/javascript' }), `${name}.mjs`)}>Download file</button>
              {isSaved && <button className="dp-btn dp-btn-quiet" type="button" onClick={onRevert} disabled={!dirty}>Revert</button>}
            </div>
            <div className="dp-row">
              {exporting
                ? <><span className="dp-status">Exporting… {exporting.done}/{exporting.total}</span><button className="dp-btn dp-btn-quiet" type="button" onClick={exporting.abort}>Cancel</button></>
                : <button className="dp-btn dp-btn-quiet" type="button" onClick={onExport} disabled={!S || !canExportMp4()}>Export MP4 (silent)</button>}
            </div>
            {!canExportMp4() && <p className="dp-status">This browser can't encode video; use Chrome or Edge, or render with `npm run render`.</p>}
            <label className="an-field an-token">GitHub token
              <input type="password" value={token} placeholder="needs write access to dripsite" autoComplete="off"
                onChange={e => { setTok(e.target.value); setToken(e.target.value.trim()) }} />
            </label>
          </section>
          <section className="dp-group">
            <h2>Cheat sheet</h2>
            <p className="an-help">
              <b>Beats</b> run over <code>t: [from, to]</code>: <code>hand</code> + <code>to</code> (a landmark, <code>[x, y]</code>, <code>{'{ who, to }'}</code> or <code>{'{ nib: \'docL\' }'}</code>), <code>sign</code>, <code>look</code>, <code>face</code>, <code>nod</code>.
              <b> Presets</b>: {Object.keys(PRESETS).join(', ')}.
              <b> Sets</b>: {Object.entries(SETS).map(([k, s]) => `${k} (${Object.keys(s.spots || {}).join(', ')})`).join('; ')}.
              <b> Landmarks</b>: headTop, headL/R, eyeL/R, brow, nose, mouth, chin, neck, shoulderL/R, chest, waist, hips, sideL/R, restL/R, handL/R, footL/R.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
