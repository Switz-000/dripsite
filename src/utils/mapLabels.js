// ── Map label placement ────────────────────────────────────────
// City labels used to sit permanently to the right of their dot, which meant
// they piled on top of each other (and on top of other cities) wherever the
// map gets dense. Instead each label is tried in eight positions around its
// dot and scored: overlapping another label or a dot is expensive, sitting on
// land costs a little, and the plain right-hand slot gets a small head start
// so the map stays visually calm when nothing is in the way.

// Candidate slots, in order of preference. dx/dy point away from the dot.
const SLOTS = [
  { id: 'right',       dx:  1, dy:  0, bias: 0    },
  { id: 'left',        dx: -1, dy:  0, bias: 0.35 },
  { id: 'top',         dx:  0, dy: -1, bias: 0.5  },
  { id: 'bottom',      dx:  0, dy:  1, bias: 0.6  },
  { id: 'topRight',    dx:  1, dy: -1, bias: 0.9  },
  { id: 'bottomRight', dx:  1, dy:  1, bias: 1.0  },
  { id: 'topLeft',     dx: -1, dy: -1, bias: 1.1  },
  { id: 'bottomLeft',  dx: -1, dy:  1, bias: 1.2  },
]

// Scoring weights — how much each kind of conflict hurts.
const W_LABEL_OVERLAP = 60   // covering another label: never acceptable
const W_DOT_OVERLAP   = 26   // covering a city dot: nearly as bad
const W_ON_LAND       = 2.4  // mild pull toward the ocean near a coastline
const W_OFF_SCREEN    = 40   // running outside the current viewBox

// Average glyph width as a fraction of the font size — good enough to reserve
// space for a label without measuring text in the DOM for every candidate.
const GLYPH_W = 0.55

export function estimateTextWidth(label, fontSize) {
  return String(label || '').length * fontSize * GLYPH_W
}

function box(cx, cy, w, h) {
  return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, cx, cy, w, h }
}

function overlapArea(a, b) {
  const dx = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const dy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  return dx > 0 && dy > 0 ? dx * dy : 0
}

// Point-in-country test built from the country `d` strings via Path2D, with a
// coarse cache so repeated probes around the same spot are nearly free.
// Returns null when the browser can't do it (then land is simply ignored).
export function makeLandTester(countries) {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null
  let ctx, paths
  try {
    ctx = document.createElement('canvas').getContext('2d')
    paths = countries.map(c => new Path2D(c.path))
  } catch {
    return null
  }
  if (!ctx || !paths.length) return null

  const cache = new Map()
  return function isLand(x, y) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    let land = false
    for (const p of paths) {
      if (ctx.isPointInPath(p, x, y)) { land = true; break }
    }
    cache.set(key, land)
    return land
  }
}

// Fraction of a label box that sits over land (sampled at centre + corners).
function landFraction(b, isLand) {
  if (!isLand) return 0
  const xs = [b.x1 + b.w * 0.15, b.cx, b.x2 - b.w * 0.15]
  const ys = [b.y1 + b.h * 0.2, b.y2 - b.h * 0.2]
  let hits = 0
  for (const x of xs) for (const y of ys) if (isLand(x, y)) hits++
  return hits / (xs.length * ys.length)
}

// Bigger, more important cities get their preferred slot first.
const SIZE_RANK = { major: 0, medium: 1, minor: 2 }

function priority(city) {
  const capital = city.capitalLevel === 'national' ? 0 : city.capital ? 1 : 2
  return capital * 10 + (SIZE_RANK[city.size] ?? 3)
}

/**
 * Choose a non-overlapping position for every label.
 *
 * @param cities   cities that should get a label
 * @param obstacles all drawn dots ({ x, y, r }) — labels dodge these too
 * @param opts     { fontSizeOf, radiusOf, gap, viewBox: [x,y,w,h], isLand }
 * @returns [{ city, x, y, fontSize, slot }] — x/y are the text anchor point,
 *          which is always the centre of the label box (textAnchor="middle").
 */
export function placeLabels(cities, obstacles, opts) {
  const { fontSizeOf, radiusOf, gap = 0, viewBox, isLand } = opts
  const [vx, vy, vw, vh] = viewBox
  const bounds = { x1: vx, y1: vy, x2: vx + vw, y2: vy + vh }

  const dotBoxes = obstacles.map(o => box(o.x, o.y, o.r * 2, o.r * 2))
  const placed = []
  const out = []

  for (const city of [...cities].sort((a, b) => priority(a) - priority(b) || (b.pop || 0) - (a.pop || 0))) {
    const fs = fontSizeOf(city)
    const r = radiusOf(city)
    const w = estimateTextWidth(city.label, fs)
    const h = fs * 1.1
    if (!w) continue

    let best = null
    for (const slot of SLOTS) {
      // Diagonals sit closer in on each axis so they don't fly off the dot.
      const diag = slot.dx !== 0 && slot.dy !== 0 ? 0.72 : 1
      const cx = city.cx + slot.dx * (r + gap + w / 2) * diag
      const cy = city.cy + slot.dy * (r + gap + h / 2) * diag
      const b = box(cx, cy, w, h)

      let cost = slot.bias
      const area = w * h
      for (const p of placed) cost += (overlapArea(b, p) / area) * W_LABEL_OVERLAP
      for (const d of dotBoxes) cost += (overlapArea(b, d) / area) * W_DOT_OVERLAP
      cost += landFraction(b, isLand) * W_ON_LAND

      // Penalise anything hanging outside the visible frame, proportionally.
      const inside = overlapArea(b, bounds) / area
      cost += (1 - inside) * W_OFF_SCREEN

      if (!best || cost < best.cost) best = { cost, b, slot }
      if (cost === 0) break   // perfect fit in the preferred slot
    }

    if (!best) continue
    placed.push(best.b)
    out.push({
      city,
      x: best.b.cx,
      // SVG y is the baseline; nudge down from the box centre by the cap height
      y: best.b.cy + fs * 0.35,
      fontSize: fs,
      slot: best.slot.id,
    })
  }

  return out
}

// Points for a five-pointed star centred on (cx, cy), used for national capitals.
export function starPoints(cx, cy, r, spikes = 5) {
  const inner = r * 0.44
  const pts = []
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? r : inner
    const angle = (Math.PI / spikes) * i - Math.PI / 2
    pts.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`)
  }
  return pts.join(' ')
}
