// ── Map label placement ────────────────────────────────────────
// City labels used to sit permanently to the right of their dot, which meant
// they piled on top of each other (and on top of other cities) wherever the
// map gets dense. Instead each label is tried in eight positions around its
// dot and scored: overlapping another label or a dot is expensive, sitting on
// land costs a little, and the plain right-hand slot gets a small head start
// so the map stays visually calm when nothing is in the way.

// Candidate slots, in order of preference. dx/dy point away from the dot;
// `anchor` is the SVG text-anchor, which is always on the side facing the dot
// so the visible gap is exactly the clearance we asked for — no dependence on
// how wide the text turns out to be.
const SLOTS = [
  { id: 'right',       dx:  1, dy:  0, anchor: 'start',  bias: 0    },
  { id: 'left',        dx: -1, dy:  0, anchor: 'end',    bias: 0.35 },
  { id: 'top',         dx:  0, dy: -1, anchor: 'middle', bias: 0.5  },
  { id: 'bottom',      dx:  0, dy:  1, anchor: 'middle', bias: 0.6  },
  { id: 'topRight',    dx:  1, dy: -1, anchor: 'start',  bias: 0.9  },
  { id: 'bottomRight', dx:  1, dy:  1, anchor: 'start',  bias: 1.0  },
  { id: 'topLeft',     dx: -1, dy: -1, anchor: 'end',    bias: 1.1  },
  { id: 'bottomLeft',  dx: -1, dy:  1, anchor: 'end',    bias: 1.2  },
]

// Scoring weights — how much each kind of conflict hurts.
const W_LABEL_OVERLAP = 60   // covering another label: never acceptable
const W_DOT_OVERLAP   = 30   // covering a city marker: nearly as bad
const W_ON_LAND       = 2.4  // mild pull toward the ocean near a coastline
const W_OFF_SCREEN    = 40   // running outside the current viewBox

// When even the best slot leaves this much of a label buried under one that is
// already placed, the name is dropped instead of drawn as an unreadable pile.
// Important cities are placed first, so what gets dropped is the least of the
// crowd — and its marker (and hover tooltip) are still there.
const MAX_LABEL_COVER = 0.32

// Vertical text metrics as a fraction of the font size. The label's box hugs
// the glyphs (rather than the full line box) so a label sitting above a dot
// gets the same visible clearance as one sitting beside it.
const ASCENT  = 0.74
const DESCENT = 0.20
const LINE_H  = ASCENT + DESCENT
// Baseline offset from the box centre.
const BASELINE = (ASCENT - DESCENT) / 2

// Fallback width when the browser can't measure text: mean glyph width as a
// fraction of the font size. Only used when canvas measurement is unavailable.
const GLYPH_W = 0.55

// Labels are drawn with a background-coloured halo behind the glyphs. It is
// part of the label's ink, so it counts toward both collisions and the visible
// margin — measuring from the glyphs alone is what let text touch markers.
export const LABEL_HALO = 0.12   // fraction of the font size, per side

export function estimateTextWidth(label, fontSize) {
  return String(label || '').length * fontSize * GLYPH_W
}

// Real text widths from a canvas, measured once per label at a reference size
// and scaled linearly (text width is proportional to font size). Using the
// map's actual font means the collision boxes match what gets drawn, which is
// what keeps labels off their own markers.
export function makeTextMeasurer(fontFamily) {
  if (typeof document === 'undefined') return null
  let ctx
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    return null
  }
  if (!ctx || typeof ctx.measureText !== 'function') return null

  const REF = 100
  const cache = new Map()
  return function measure(label, fontSize, bold) {
    const key = (bold ? 'b|' : 'n|') + label
    let perUnit = cache.get(key)
    if (perUnit === undefined) {
      ctx.font = `${bold ? '700 ' : ''}${REF}px ${fontFamily}`
      perUnit = ctx.measureText(String(label)).width / REF
      if (!perUnit) perUnit = GLYPH_W * String(label).length
      cache.set(key, perUnit)
    }
    return perUnit * fontSize
  }
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
 * Every slot clears the marker by exactly `gap` on the axis it sits on, so a
 * short name and a long one are the same distance from their dot.
 *
 * @param cities   cities that should get a label
 * @param obstacles all drawn markers ({ x, y, r }) — labels dodge these too
 * @param opts     { fontSizeOf, radiusOf, boldOf, gap, viewBox: [x,y,w,h],
 *                   isLand, measure }
 * @returns [{ city, x, y, anchor, fontSize, slot }] — x/y is the text anchor
 *          point and `anchor` the text-anchor to render it with.
 */
export function placeLabels(cities, obstacles, opts) {
  const {
    fontSizeOf, radiusOf, boldOf, gap = 0, viewBox, isLand, measure,
    haloFrac = LABEL_HALO,
  } = opts
  const [vx, vy, vw, vh] = viewBox
  const bounds = { x1: vx, y1: vy, x2: vx + vw, y2: vy + vh }
  const widthOf = measure || ((label, fs) => estimateTextWidth(label, fs))

  const dotBoxes = obstacles.map(o => box(o.x, o.y, o.r * 2, o.r * 2))
  const placed = []
  const out = []

  for (const city of [...cities].sort((a, b) => priority(a) - priority(b) || (b.pop || 0) - (a.pop || 0))) {
    const fs = fontSizeOf(city)
    const r = radiusOf(city)
    const textW = widthOf(city.label, fs, boldOf ? boldOf(city) : false)
    if (!textW) continue
    const halo = fs * haloFrac
    // Full inked extent of the label, halo included.
    const w = textW + halo * 2
    const h = fs * LINE_H + halo * 2

    let best = null
    for (const slot of SLOTS) {
      // Clearance is applied per axis. Diagonals only need part of the radius
      // on each axis to clear the marker, which keeps them from drifting far.
      const reach = slot.dx !== 0 && slot.dy !== 0 ? r * 0.72 : r
      // Anchor point: the glyphs start `gap` (plus the halo) clear of the
      // marker, so the visible margin is the same for every label regardless
      // of how long the name is or which slot it lands in.
      const ax = slot.dx === 0 ? city.cx : city.cx + slot.dx * (reach + gap + halo)
      const ay = slot.dy === 0 ? city.cy : city.cy + slot.dy * (reach + gap + h / 2)
      // The box grows away from the anchor, so text width never eats the gap.
      const bx = slot.dx === 0 ? ax : ax + slot.dx * (textW / 2)
      const b = box(bx, ay, w, h)

      const area = w * h
      let cover = 0
      for (const p of placed) cover += overlapArea(b, p) / area
      let cost = slot.bias + cover * W_LABEL_OVERLAP
      // Marker overlap is scored against the MARKER's area, not the label's:
      // covering a dot is just as bad whether the name is short or long.
      for (const d of dotBoxes) {
        const hit = overlapArea(b, d)
        if (hit > 0) cost += (hit / (d.w * d.h)) * W_DOT_OVERLAP
      }
      cost += landFraction(b, isLand) * W_ON_LAND

      // Penalise anything hanging outside the visible frame, proportionally.
      const inside = overlapArea(b, bounds) / area
      cost += (1 - inside) * W_OFF_SCREEN

      if (!best || cost < best.cost) best = { cost, cover, b, slot, ax, ay }
      if (cost === 0) break   // perfect fit in the preferred slot
    }

    if (!best || best.cover > MAX_LABEL_COVER) continue
    placed.push(best.b)
    out.push({
      city,
      x: best.ax,
      // SVG y is the baseline; drop from the box centre to sit on it
      y: best.ay + fs * BASELINE,
      anchor: best.slot.anchor,
      fontSize: fs,
      slot: best.slot.id,
    })
  }

  return out
}

// Points for a five-pointed star centred on (cx, cy), used for national
// capitals. The inner radius is deliberately generous: a spindly star reads as
// a different weight of symbol next to the solid dots and squares.
export function starPoints(cx, cy, r, spikes = 5) {
  const inner = r * 0.52
  const pts = []
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? r : inner
    const angle = (Math.PI / spikes) * i - Math.PI / 2
    pts.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`)
  }
  return pts.join(' ')
}
