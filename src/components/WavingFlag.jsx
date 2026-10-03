import React, { useEffect, useRef, useState } from 'react'

// A waving flag built from vertical strips of the flag image. Each strip is
// nudged up and down every frame along a few travelling waves (small near the
// pole, bigger toward the free edge, with a slight droop) and lit or shaded
// by the slope of the cloth at that point, so the folds catch the light.
const STRIPS = 12
const BOX_W = 54, BOX_H = 36 // largest area the flag may fill, css px
const AMP = 4                // vertical swing, css px

function wave(u, t) {
  const a = 0.06 + 0.94 * Math.pow(u, 1.15)
  return a * (
    Math.sin(5.4 * u - 2.7 * t + 0.45) +
    0.45 * Math.sin(10.2 * u - 4.3 * t + 1.1 + 1.0) +
    0.2 * Math.sin(2.6 * u - 1.3 * t - 0.3))
}

export default function WavingFlag({ src, name }) {
  const strips = useRef([])
  const [size, setSize] = useState({ w: BOX_W, h: Math.round(BOX_W / 1.5) })

  // Fit the flag inside its box, keeping its proportions.
  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive || !img.naturalHeight) return
      const ratio = img.naturalWidth / img.naturalHeight
      let w = BOX_W, h = BOX_W / ratio
      if (h > BOX_H) { h = BOX_H; w = BOX_H * ratio }
      setSize({ w: Math.round(w), h: Math.round(h) })
    }
    img.src = src
    return () => { alive = false }
  }, [src])

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const frame = t => {
      strips.current.forEach((el, i) => {
        if (!el) return
        const u = (i + 0.5) / STRIPS
        const e = 0.02
        const z = wave(u, t)
        const slope = (wave(Math.min(1, u + e), t) - wave(Math.max(0, u - e), t)) / (2 * e)
        const y = z * AMP * 0.55 + u * u * 1.6
        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
        const b = Math.min(1.18, Math.max(0.68, 1 - slope * 0.028 * (0.3 + u)))
        el.style.filter = `brightness(${b.toFixed(3)})`
      })
    }
    if (reduce) { frame(0.4); return }
    const start = performance.now()
    const loop = now => { frame((now - start) / 1000); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <div className="waving-flag" role="img" aria-label={`Flag of ${name}`}>
      <span className="waving-flag-pole" aria-hidden="true" style={{ height: size.h + 8 }} />
      <div className="waving-flag-cloth" aria-hidden="true" style={{ width: size.w, height: size.h }}>
        {Array.from({ length: STRIPS }, (_, i) => (
          <span
            key={i}
            ref={el => { strips.current[i] = el }}
            style={{
              backgroundImage: `url("${src}")`,
              backgroundSize: `${STRIPS * 100}% 100%`,
              backgroundPosition: `${(i / (STRIPS - 1)) * 100}% 0`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
