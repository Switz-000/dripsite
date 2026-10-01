import React, { useEffect, useMemo, useRef, useState } from 'react'
import Portrait from '../portrait/Portrait'
import { DEFAULT_SPEC, SLOT_OPTIONS, SLOT_ORDER, MULTI, SHAPES, COLORS, SWATCHES, normalizeSpec, toYaml } from '../portrait/engine'
import { parseFrontmatter } from '../utils/markdown'
import { listPeople, exportPortrait, getToken, setToken } from '../portrait/vaultPortraits'

// Dev tool: build a character portrait from parts and copy the spec into a
// person article's frontmatter. The infobox reads the same spec.
const LABELS = { eyes: 'Eyes', eyeliner: 'Eyeliner', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', hair: 'Hair',
  facial: 'Facial hair', eyewear: 'Eyewear', outfit: 'Outfit', extras: 'Extras' }

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Dropdown whose options preview on hover: onPreview(opt) while an option is
// under the pointer or keyboard focus, onPreview(null) when it leaves.
function PartSelect({ slot, spec, onPick, onPreview }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const multi = MULTI.includes(slot)
  const value = spec[slot]
  const label = multi ? (value.length ? value.join(', ') : 'none') : value
  const isOn = (opt) => (multi ? value.includes(opt) : value === opt)

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) close() }
    const esc = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  function close() { setOpen(false); onPreview(null) }
  function choose(opt) { onPick(opt); if (!multi) close() }

  return (
    <div className="dp-select" ref={ref}>
      <button type="button" className="dp-selbtn" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span>{label}</span><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="dp-menu" role="listbox" aria-multiselectable={multi} onMouseLeave={() => onPreview(null)}>
          {SLOT_OPTIONS[slot].map(opt => (
            <li key={opt}>
              <button type="button" role="option" aria-selected={isOn(opt)} className={'dp-opt' + (isOn(opt) ? ' on' : '')}
                onMouseEnter={() => onPreview(opt)} onFocus={() => onPreview(opt)} onClick={() => choose(opt)}>
                {multi && <span className="dp-tick" aria-hidden="true">{isOn(opt) ? '✓' : ''}</span>}{opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Import from / export to the person articles in the vault.
function VaultSection({ spec, onImport, flash }) {
  const [people, setPeople] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(null)   // 'import' | null: whether the import list is open
  const [q, setQ] = useState('')
  const [target, setTarget] = useState('')  // path of the article to export to
  const [token, setTok] = useState(getToken)
  const [busy, setBusy] = useState(false)

  async function load(force) {
    setError(''); setProgress([0, 1])
    try { setPeople(await listPeople((d, t) => setProgress([d, t]), force)) }
    catch (e) { setError(e.message) }
    setProgress(null)
  }
  function openImport() { setMode(m => (m ? null : 'import')); if (!people && !progress) load() }
  const match = (p) => p.name.toLowerCase().includes(q.trim().toLowerCase())
  const withPortrait = (people || []).filter(p => p.portrait && match(p))
  const targetPerson = (people || []).find(p => p.path === target)

  async function doExport() {
    const verb = targetPerson.portrait ? 'overwrite the portrait on' : 'add a portrait to'
    if (!window.confirm(`This commits straight to the vault and will ${verb} "${targetPerson.name}". Continue?`)) return
    setBusy(true)
    try { await exportPortrait(target, spec); setPeople([...people]); flash(`Saved to ${targetPerson.name}. The site updates on its next rebuild.`) }
    catch (e) { flash(e.message) }
    setBusy(false)
  }

  return (
    <section className="dp-group">
      <h2>Vault</h2>
      <div className="dp-row">
        <button type="button" className="dp-btn dp-btn-quiet" onClick={openImport}>{mode ? 'Close import' : 'Import…'}</button>
        <button type="button" className="dp-btn dp-btn-quiet" onClick={() => { if (!people && !progress) load() }} disabled={!!people || !!progress}>
          {people ? `${people.length} people loaded` : 'Load people'}
        </button>
        {progress && <span className="dp-status">Reading articles {progress[0]}/{progress[1]}…</span>}
        {error && <span className="dp-status">{error}</span>}
      </div>

      {mode === 'import' && people && (
        <div className="dp-people">
          <input className="dp-search" type="search" placeholder="Search people with portraits" value={q} onChange={e => setQ(e.target.value)} />
          <ul className="dp-peoplelist">
            {withPortrait.map(p => (
              <li key={p.path}>
                <button type="button" className="dp-person" onClick={() => { onImport(p.portrait); setTarget(p.path); setMode(null); flash(`Imported ${p.name}. Export is now aimed at the same article.`) }}>
                  <span className="dp-face"><Portrait spec={p.portrait} frame="face" /></span>{p.name}
                </button>
              </li>
            ))}
            {!withPortrait.length && <li className="dp-status">No matching portraits.</li>}
          </ul>
        </div>
      )}

      {people && (
        <label className="dp-slot">
          <span>Export to</span>
          <select className="dp-selbtn" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Pick a person article…</option>
            {people.map(p => <option key={p.path} value={p.path}>{p.name}{p.portrait ? ' (has portrait)' : ''}</option>)}
          </select>
        </label>
      )}
      <label className="dp-slot">
        <span>GitHub token</span>
        <input className="dp-search" type="password" placeholder="Needs write access to the vault" value={token}
          onChange={e => { setTok(e.target.value); setToken(e.target.value.trim()) }} autoComplete="off" />
      </label>
      <div className="dp-row">
        <button type="button" className="dp-btn" onClick={doExport} disabled={!targetPerson || !token.trim() || busy}>
          {busy ? 'Exporting…' : targetPerson ? (targetPerson.portrait ? 'Export (overrides)' : 'Export (adds)') : 'Export'}
        </button>
      </div>
    </section>
  )
}

export default function PortraitsPage() {
  const [spec, setSpec] = useState(() => normalizeSpec(DEFAULT_SPEC))
  const [hover, setHover] = useState(null) // { slot, opt } while previewing an option
  const [anchors, setAnchors] = useState(false)
  const [status, setStatus] = useState('')
  const [pasted, setPasted] = useState('')
  const yaml = useMemo(() => toYaml(spec), [spec])
  const shown = useMemo(() => {
    if (!hover) return spec
    const { slot, opt } = hover
    if (!MULTI.includes(slot)) return { ...spec, [slot]: opt }
    const cur = spec[slot]
    return { ...spec, [slot]: cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt] }
  }, [spec, hover])

  const set = (patch) => setSpec(s => ({ ...s, ...patch }))
  function pick(slot, opt) {
    if (MULTI.includes(slot)) {
      const cur = spec[slot]
      set({ [slot]: cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt] })
    } else set({ [slot]: opt })
  }
  function randomize() {
    const next = { ...spec, shape: { ...spec.shape }, palette: { ...spec.palette } }
    for (const slot of SLOT_ORDER) {
      const opts = SLOT_OPTIONS[slot]
      next[slot] = MULTI.includes(slot) ? opts.filter(() => Math.random() < 0.25) : pickOne(opts)
    }
    for (const x of SHAPES) next.shape[x.key] = +(x.min + Math.random() * (x.max - x.min)).toFixed(2)
    for (const c of Object.keys(SWATCHES)) next.palette[c] = pickOne(SWATCHES[c])[1]
    setSpec(normalizeSpec(next))
  }
  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 2500) }
  function copy() {
    navigator.clipboard?.writeText(yaml).then(() => flash('Spec copied. Paste it into the article\'s frontmatter.'))
      .catch(() => flash('Copy was blocked. Select the spec and copy it by hand.'))
  }
  function load() {
    const text = pasted.includes('portrait:') ? pasted : 'portrait:\n' + pasted
    const meta = parseFrontmatter('---\n' + text.replace(/^---\s*$/gm, '').trim() + '\n---\n').meta
    if (!meta.portrait || typeof meta.portrait !== 'object') { flash('No portrait block found in what was pasted.'); return }
    setSpec(normalizeSpec(meta.portrait)); setPasted(''); flash('Spec loaded.')
  }

  return (
    <div className="page-inner dp">
      <h1 className="article-title">Character Portraits</h1>
      <p className="dp-lede">
        Pick parts, then copy the spec into a person article's frontmatter. The article's infobox draws the same portrait.
      </p>

      <div className="dp-grid">
        <div className="dp-stagecol">
          <div className="dp-stages">
            <figure className="dp-stage">
              <Portrait spec={shown} frame="full" anchors={anchors} />
              <figcaption>Full figure</figcaption>
            </figure>
            <figure className="dp-stage dp-stage-bust">
              <div className="dp-ibx"><Portrait spec={shown} frame="bust" /></div>
              <figcaption>As the infobox shows it</figcaption>
            </figure>
          </div>
          <div className="dp-row">
            <button type="button" className="dp-btn" onClick={randomize}>🎲 Randomize</button>
            <label className="dp-check"><input type="checkbox" checked={anchors} onChange={e => setAnchors(e.target.checked)} /> Show anchors</label>
          </div>
        </div>

        <div className="dp-panel">
          <section className="dp-group">
            <h2>Parts</h2>
            {SLOT_ORDER.map(slot => (
              <div className="dp-slot" key={slot}>
                <span>{LABELS[slot]}</span>
                <PartSelect slot={slot} spec={spec} onPick={opt => pick(slot, opt)}
                  onPreview={opt => setHover(opt == null ? null : { slot, opt })} />
              </div>
            ))}
          </section>

          <section className="dp-group">
            <h2>Build</h2>
            {SHAPES.map(x => (
              <label className="dp-slot" key={x.key}>
                <span>{x.label}</span>
                <span className="dp-range">
                  <input type="range" min={x.min} max={x.max} step="0.01" value={spec.shape[x.key]}
                    onChange={e => set({ shape: { ...spec.shape, [x.key]: +e.target.value } })} />
                  <output>×{(+spec.shape[x.key]).toFixed(2)}</output>
                </span>
              </label>
            ))}
          </section>

          <section className="dp-group">
            <h2>Colours</h2>
            <div className="dp-colors">
              {COLORS.map(c => (
                <div className="dp-colrow" key={c}>
                  <label><input type="color" value={spec.palette[c]} onChange={e => set({ palette: { ...spec.palette, [c]: e.target.value } })} /> {c}</label>
                  {SWATCHES[c] && (
                    <span className="dp-sw">
                      {SWATCHES[c].map(([n, v]) => (
                        <button key={v} type="button" className="dp-swatch" title={n} aria-label={`${c}: ${n}`} style={{ background: v }}
                          onClick={() => set({ palette: { ...spec.palette, [c]: v } })} />
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <VaultSection spec={spec} onImport={p => setSpec(normalizeSpec(p))} flash={flash} />

          <section className="dp-group">
            <h2>Spec</h2>
            <pre className="dp-yaml">{yaml}</pre>
            <div className="dp-row">
              <button type="button" className="dp-btn" onClick={copy}>Copy spec</button>
              <button type="button" className="dp-btn dp-btn-quiet" onClick={() => setSpec(normalizeSpec(DEFAULT_SPEC))}>Reset</button>
              <span className="dp-status" role="status">{status}</span>
            </div>
            <textarea className="dp-paste" rows={4} value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder="Paste a portrait block from an article to edit it here" />
            <div className="dp-row"><button type="button" className="dp-btn dp-btn-quiet" onClick={load} disabled={!pasted.trim()}>Load pasted spec</button></div>
          </section>
        </div>
      </div>
    </div>
  )
}
