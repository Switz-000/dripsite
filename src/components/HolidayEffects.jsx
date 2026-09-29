import React, { useEffect, useRef } from 'react'

// Very dark flag colours (navy, black) vanish against the dark theme, so
// blend them part-way towards white for the confetti.
function lift(color) {
  const m = color.match(/\d+/g)
  if (!m) return color
  const [r, g, b] = m.map(Number)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (lum > 0.3) return color
  const t = 0.55
  return `rgb(${Math.round(r + (255 - r) * t)},${Math.round(g + (255 - g) * t)},${Math.round(b + (255 - b) * t)})`
}

// A flag waving in the wind, drawn on a canvas at device resolution: the flag
// is first scaled down once (so it stays sharp), then re-drawn every frame one
// device-pixel column at a time, shifted along a travelling sine wave. The
// wave grows from the pole to the free edge, and light/dark shading follows
// the folds.
export function WavingFlag({ src, name }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)
    const W = 56, H = 38, AMP = 3.2 // css px (AMP = max vertical swing)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round((H + AMP * 2) * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H + AMP * 2}px`

    let raf = 0, alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      // Fit the flag inside W x H, keeping its proportions.
      const ratio = img.naturalWidth / img.naturalHeight
      let fw = W, fh = W / ratio
      if (fh > H) { fh = H; fw = H * ratio }
      const pw = Math.round(fw * dpr), ph = Math.round(fh * dpr)

      // Downscale in halving steps for a clean, unpixelated source.
      let cur = img, cw = img.naturalWidth, ch = img.naturalHeight
      while (cw / 2 > pw) {
        const t = document.createElement('canvas')
        cw = Math.round(cw / 2); ch = Math.round(ch / 2)
        t.width = cw; t.height = ch
        const tc = t.getContext('2d')
        tc.imageSmoothingQuality = 'high'
        tc.drawImage(cur, 0, 0, cw, ch)
        cur = t
      }
      const flag = document.createElement('canvas')
      flag.width = pw; flag.height = ph
      const fc = flag.getContext('2d')
      fc.imageSmoothingQuality = 'high'
      fc.drawImage(cur, 0, 0, pw, ph)

      const amp = AMP * dpr
      const draw = t => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        for (let x = 0; x < pw; x++) {
          const u = x / (pw - 1)                    // 0 at the pole, 1 at the free edge
          const phase = u * 7 - t * 3.2
          const y = amp + Math.sin(phase) * amp * (0.15 + 0.85 * u)
          ctx.drawImage(flag, x, 0, 1, ph, x, y, 1, ph)
          const shade = Math.cos(phase) * 0.22 * u  // fold shading
          if (shade !== 0) {
            ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade * 0.6})` : `rgba(0,0,0,${-shade})`
            ctx.globalCompositeOperation = 'source-atop'
            ctx.fillRect(x, y, 1, ph)
            ctx.globalCompositeOperation = 'source-over'
          }
        }
      }
      if (reduce) { draw(0); return }
      const start = performance.now()
      const loop = now => { draw((now - start) / 1000); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    img.crossOrigin = 'anonymous'
    img.src = src
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [src])

  return (
    <div className="waving-flag" role="img" aria-label={`Flag of ${name}`}>
      <span className="waving-flag-pole" aria-hidden="true" />
      <canvas ref={ref} aria-hidden="true" />
    </div>
  )
}

// Small confetti burst that rains over its (positioned) parent, in the given
// colours. Purely decorative; skipped when the viewer prefers reduced motion.
export function Confetti({ colors }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !colors?.length) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const make = (fromTop) => ({
      x: Math.random() * w,
      y: fromTop ? -10 - Math.random() * h * 0.4 : Math.random() * h,
      s: 3 + Math.random() * 4,
      vy: 0.5 + Math.random() * 0.9,
      sway: 0.4 + Math.random() * 0.9,
      ph: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.12,
      c: lift(colors[Math.floor(Math.random() * colors.length)]),
    })
    const parts = Array.from({ length: 46 }, () => make(false))

    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.y += p.vy
        p.ph += 0.03
        p.x += Math.sin(p.ph) * p.sway * 0.6
        p.rot += p.vr
        if (p.y > h + 10) Object.assign(p, make(true))
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.scale(1, Math.cos(p.ph * 1.7)) // flutter
        ctx.fillStyle = p.c
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [colors])

  return <canvas ref={ref} className="holiday-confetti" aria-hidden="true" />
}
