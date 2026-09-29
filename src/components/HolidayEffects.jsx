import React, { useEffect, useRef } from 'react'

const STRIPS = 12

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

// A flag "waving": the image is cut into vertical strips that bob up and
// down out of phase, with a little shading that travels along the cloth.
export function WavingFlag({ src, name }) {
  return (
    <div className="waving-flag" role="img" aria-label={`Flag of ${name}`}>
      <span className="waving-flag-pole" aria-hidden="true" />
      <div className="waving-flag-cloth" aria-hidden="true">
        {Array.from({ length: STRIPS }, (_, i) => (
          <span
            key={i}
            style={{
              backgroundImage: `url("${src}")`,
              backgroundSize: `${STRIPS * 100}% 100%`,
              backgroundPosition: `${(i / (STRIPS - 1)) * 100}% 0`,
              animationDelay: `${-i * 0.11}s`,
            }}
          />
        ))}
      </div>
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
