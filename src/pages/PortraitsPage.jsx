import React, { useMemo, useState } from 'react'
import Portrait from '../portrait/Portrait'
import { DEFAULT_SPEC, SLOT_OPTIONS, SLOT_ORDER, MULTI, SHAPES, COLORS, SWATCHES, normalizeSpec, toYaml } from '../portrait/engine'
import { parseFrontmatter } from '../utils/markdown'

// Dev tool: build a character portrait from parts and copy the spec into a
// person article's frontmatter. The infobox reads the same spec.
const LABELS = { eyes: 'Eyes', eyeliner: 'Eyeliner', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', hair: 'Hair',
  facial: 'Facial hair', eyewear: 'Eyewear', outfit: 'Outfit', extras: 'Extras' }

export default function PortraitsPage() {
  const [spec, setSpec] = useState(() => normalizeSpec(DEFAULT_SPEC))
  const [anchors, setAnchors] = useState(false)
  const [status, setStatus] = useState('')
  const [pasted, setPasted] = useState('')
  const yaml = useMemo(() => toYaml(spec), [spec])

  const set = (patch) => setSpec(s => ({ ...s, ...patch }))
  function pick(slot, opt) {
    if (MULTI.includes(slot)) {
      const cur = spec[slot]
      set({ [slot]: cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt] })
    } else set({ [slot]: opt })
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
              <Portrait spec={spec} frame="full" anchors={anchors} />
              <figcaption>Full figure</figcaption>
            </figure>
            <figure className="dp-stage dp-stage-bust">
              <div className="dp-ibx"><Portrait spec={spec} frame="bust" /></div>
              <figcaption>As the infobox shows it</figcaption>
            </figure>
          </div>
          <label className="dp-check"><input type="checkbox" checked={anchors} onChange={e => setAnchors(e.target.checked)} /> Show anchors</label>
        </div>

        <div className="dp-panel">
          <section className="dp-group">
            <h2>Parts</h2>
            {SLOT_ORDER.map(slot => (
              <div className="dp-slot" key={slot}>
                <span>{LABELS[slot]}</span>
                <div className="dp-chips">
                  {SLOT_OPTIONS[slot].map(opt => {
                    const on = MULTI.includes(slot) ? spec[slot].includes(opt) : spec[slot] === opt
                    return <button key={opt} type="button" className={'dp-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => pick(slot, opt)}>{opt}</button>
                  })}
                </div>
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
