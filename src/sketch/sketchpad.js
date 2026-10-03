// Part sketchpad: raster layers drawn over a faded portrait, so a new part
// (a hat, a prop) is sketched in place on the head. Pixels, not vectors: the
// eraser and Ctrl+T behave like Photoshop's. Claude traces the saved PNGs
// into parts.json afterwards, the same way the first parts were made.

// World = the portrait's own coordinate space (compose()'s full-figure viewBox).
export const WORLD = { x: -40, y: -40, w: 480, h: 770 }
export const SCALE = 2                      // layer pixels per world unit
export const LAYERS = ['fill', 'ink']       // bottom to top
export const INK = '#000000'
export const FILL_HINT = '#e8902a'          // only marks where colour goes; the real colour comes from the palette
const UNDO_LIMIT = 40

const PX_W = WORLD.w * SCALE, PX_H = WORLD.h * SCALE

function makeCanvas(w = PX_W, h = PX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}

export class Sketchpad {
  constructor(canvases) {
    this.layers = canvases                  // { fill: <canvas>, ink: <canvas> }
    for (const c of Object.values(canvases)) { c.width = PX_W; c.height = PX_H }
    this.ctx = Object.fromEntries(Object.entries(canvases).map(([k, c]) => [k, c.getContext('2d', { willReadFrequently: true })]))
    this.backup = makeCanvas()
    this.undoStack = []; this.redoStack = []
    this.stroke = null; this.xf = null
    this.onChange = () => {}
  }

  /* ---------- history: each entry is a list of {layer, rect, before, after} ---------- */
  push(items) {
    this.undoStack.push(items); if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = []; this.dirty = true; this.onChange()
  }
  undo() { this.commitTransform(); const e = this.undoStack.pop(); if (!e) return
    for (const it of e) this.ctx[it.layer].putImageData(it.before, it.x, it.y)
    this.redoStack.push(e); this.dirty = true; this.onChange() }
  redo() { this.commitTransform(); const e = this.redoStack.pop(); if (!e) return
    for (const it of e) this.ctx[it.layer].putImageData(it.after, it.x, it.y)
    this.undoStack.push(e); this.dirty = true; this.onChange() }
  fullSnap(layer) { return this.ctx[layer].getImageData(0, 0, PX_W, PX_H) }

  /* ---------- pencil & eraser: hard pixels, no antialiasing ---------- */
  // p: layer-pixel point; size in whole layer pixels; smooth 0..100 (lazy-brush string length)
  beginStroke(layer, p, { size, smooth, pressure, erase }) {
    this.commitTransform()
    const bctx = this.backup.getContext('2d'); bctx.clearRect(0, 0, PX_W, PX_H); bctx.drawImage(this.layers[layer], 0, 0)
    this.stroke = { layer, size, erase, radius: smooth / 100 * 30 * SCALE, b: { ...p }, prev: { ...p }, mid: { ...p }, pr: pressure,
                    box: [p.x - size, p.y - size, p.x + size, p.y + size], last: null }
    this.stamp(p.x, p.y)
  }
  diameter() { const s = this.stroke; return Math.max(1, Math.round(s.pr == null ? s.size : s.size * (0.2 + 0.8 * s.pr))) }
  // a round pencil tip of d whole pixels, either fully on or fully off
  tip(d, color) {
    const key = d + color; this.tips ||= {}
    if (this.tips[key]) return this.tips[key]
    const c = makeCanvas(d, d), x = c.getContext('2d'), img = x.createImageData(d, d)
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)), R = d / 2
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
      if (d <= 2 || (i + 0.5 - R) ** 2 + (j + 0.5 - R) ** 2 <= R * R + 0.25) img.data.set([r, g, b, 255], (j * d + i) * 4)
    }
    x.putImageData(img, 0, 0); return (this.tips[key] = c)
  }
  stamp(x, y) {
    const s = this.stroke, d = this.diameter(), X = Math.round(x - d / 2), Y = Math.round(y - d / 2)
    if (s.last && s.last[0] === X && s.last[1] === Y && s.last[2] === d) return
    s.last = [X, Y, d]
    const c = this.ctx[s.layer]
    c.save(); c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    c.drawImage(this.tip(d, s.layer === 'ink' ? INK : FILL_HINT), X, Y); c.restore()
    s.box = [Math.min(s.box[0], X), Math.min(s.box[1], Y), Math.max(s.box[2], X + d), Math.max(s.box[3], Y + d)]
  }
  // stamp along a quadratic curve every half pixel, so the line has no gaps
  curve(a, ctl, b) {
    const L = Math.hypot(ctl.x - a.x, ctl.y - a.y) + Math.hypot(b.x - ctl.x, b.y - ctl.y), n = Math.max(1, Math.ceil(L * 2))
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t
      this.stamp(u * u * a.x + 2 * u * t * ctl.x + t * t * b.x, u * u * a.y + 2 * u * t * ctl.y + t * t * b.y)
    }
  }
  moveStroke(p, pressure) {
    const s = this.stroke; if (!s) return
    const dx = p.x - s.b.x, dy = p.y - s.b.y, d = Math.hypot(dx, dy)
    if (d <= s.radius) return                         // the string is slack: the pencil stays put
    const k = (d - s.radius) / d
    this.segment({ x: s.b.x + dx * k, y: s.b.y + dy * k }, pressure)
  }
  segment(b, pressure) {
    const s = this.stroke
    if (Math.hypot(b.x - s.prev.x, b.y - s.prev.y) < 0.4) { s.b = b; return }
    s.pr = pressure == null ? null : (s.pr == null ? pressure : s.pr * 0.6 + pressure * 0.4)
    const mid = { x: (s.prev.x + b.x) / 2, y: (s.prev.y + b.y) / 2 }
    this.curve(s.mid, s.prev, mid)
    s.b = b; s.mid = mid; s.prev = b
  }
  // the line ends where the pencil is, not where the cursor is: no jump to catch up with the pointer
  endStroke() {
    const s = this.stroke; if (!s) return
    this.curve(s.mid, s.mid, s.prev)
    const x = Math.max(0, Math.floor(s.box[0])), y = Math.max(0, Math.floor(s.box[1]))
    const w = Math.min(PX_W, Math.ceil(s.box[2])) - x, h = Math.min(PX_H, Math.ceil(s.box[3])) - y
    this.stroke = null
    if (w <= 0 || h <= 0) return
    this.push([{ layer: s.layer, x, y, before: this.backup.getContext('2d').getImageData(x, y, w, h), after: this.ctx[s.layer].getImageData(x, y, w, h) }])
  }

  /* ---------- paint bucket: fills the area the lines enclose, on the current layer ---------- */
  bucket(layer, p) {
    this.commitTransform()
    const X = Math.floor(p.x), Y = Math.floor(p.y)
    if (X < 0 || Y < 0 || X >= PX_W || Y >= PX_H) return { ok: false, why: 'outside' }
    const ink = this.ctx.ink.getImageData(0, 0, PX_W, PX_H).data
    const wall = i => ink[i * 4 + 3] > 127
    if (wall(Y * PX_W + X)) return { ok: false, why: 'line' }
    const seen = new Uint8Array(PX_W * PX_H), stack = [Y * PX_W + X]
    let x0 = X, y0 = Y, x1 = X, y1 = Y, leaked = false
    seen[Y * PX_W + X] = 1
    while (stack.length) {
      const i = stack.pop(), x = i % PX_W, y = (i - x) / PX_W
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x === 0 || y === 0 || x === PX_W - 1 || y === PX_H - 1) leaked = true
      for (const j of [x > 0 ? i - 1 : -1, x < PX_W - 1 ? i + 1 : -1, y > 0 ? i - PX_W : -1, y < PX_H - 1 ? i + PX_W : -1]) {
        if (j >= 0 && !seen[j] && !wall(j)) { seen[j] = 1; stack.push(j) }
      }
    }
    // grow one pixel under the lines, so no white seam shows between line and colour
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(PX_W - 1, x1 + 1); y1 = Math.min(PX_H - 1, y1 + 1)
    const w = x1 - x0 + 1, h = y1 - y0 + 1, c = this.ctx[layer]
    const before = c.getImageData(x0, y0, w, h), after = c.getImageData(x0, y0, w, h), d = after.data
    const col = [1, 3, 5].map(i => parseInt((layer === 'ink' ? INK : FILL_HINT).slice(i, i + 2), 16))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * PX_W + x
      const hit = seen[i] || (wall(i) && ((x > 0 && seen[i - 1]) || (x < PX_W - 1 && seen[i + 1]) || (y > 0 && seen[i - PX_W]) || (y < PX_H - 1 && seen[i + PX_W])))
      if (hit) d.set([...col, 255], ((y - y0) * w + (x - x0)) * 4)
    }
    c.putImageData(after, x0, y0)
    this.push([{ layer, x: x0, y: y0, before, after }])
    return { ok: true, leaked }
  }

  /* ---------- free transform (Ctrl+T) and the move tool ---------- */
  contentBox(layers) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    for (const l of layers) {
      const d = this.ctx[l].getImageData(0, 0, PX_W, PX_H).data
      for (let y = 0; y < PX_H; y++) for (let x = 0; x < PX_W; x++) {
        if (d[(y * PX_W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  }
  beginTransform(layers) {
    if (this.xf) return true
    const box = this.contentBox(layers); if (!box) return false
    const floats = {}, before = {}
    for (const l of layers) {
      before[l] = this.fullSnap(l)
      const f = makeCanvas(box.w, box.h); f.getContext('2d').drawImage(this.layers[l], box.x, box.y, box.w, box.h, 0, 0, box.w, box.h)
      floats[l] = f
    }
    this.xf = { layers, floats, before, w: box.w, h: box.h, cx: box.x + box.w / 2, cy: box.y + box.h / 2, sx: 1, sy: 1, rot: 0 }
    this.onChange(); return true
  }
  setTransform(patch) { if (!this.xf) return; Object.assign(this.xf, patch, { moved: true }); this.renderTransform(); this.onChange() }
  renderTransform() {
    const t = this.xf
    for (const l of t.layers) {
      const c = this.ctx[l]
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, PX_W, PX_H)
      c.imageSmoothingEnabled = false   // nearest neighbour: pixels stay hard, no half-transparent edges
      c.translate(Math.round(t.cx), Math.round(t.cy)); c.rotate(t.rot); c.scale(t.sx, t.sy); c.drawImage(t.floats[l], -t.w / 2, -t.h / 2)
      c.restore()
    }
  }
  commitTransform() {
    const t = this.xf; if (!t) return
    this.xf = null
    // the browser softens the edges of a rotated image even with smoothing off: snap them back to hard pixels
    if (t.moved) for (const l of t.layers) {
      const img = this.fullSnap(l), d = img.data
      for (let i = 3; i < d.length; i += 4) if (d[i] && d[i] < 255) d[i] = d[i] < 128 ? 0 : 255
      this.ctx[l].putImageData(img, 0, 0)
    }
    if (t.moved) this.push(t.layers.map(l => ({ layer: l, x: 0, y: 0, before: t.before[l], after: this.fullSnap(l) })))
    else this.onChange()
  }
  cancelTransform() {
    const t = this.xf; if (!t) return
    for (const l of t.layers) this.ctx[l].putImageData(t.before[l], 0, 0)
    this.xf = null; this.onChange()
  }
  // corners of the transform box, in layer pixels: [tl, tr, br, bl]
  corners() {
    const t = this.xf; if (!t) return null
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([hx, hy]) => this.local(hx * t.w / 2 * t.sx, hy * t.h / 2 * t.sy))
  }
  local(lx, ly, t = this.xf) {
    const c = Math.cos(t.rot), s = Math.sin(t.rot)
    return { x: t.cx + lx * c - ly * s, y: t.cy + lx * s + ly * c }
  }

  clear(layer) {
    this.commitTransform()
    const before = this.fullSnap(layer); this.ctx[layer].clearRect(0, 0, PX_W, PX_H)
    this.push([{ layer, x: 0, y: 0, before, after: this.fullSnap(layer) }])
  }
  isEmpty(layer) { return !this.contentBox([layer]) }

  /* ---------- save / load ---------- */
  dataURL(layer) { this.commitTransform(); return this.layers[layer].toDataURL('image/png') }
  async load(layers) {
    this.commitTransform()
    const items = []
    for (const l of LAYERS) {
      const before = this.fullSnap(l); this.ctx[l].clearRect(0, 0, PX_W, PX_H)
      if (layers?.[l]) {
        const img = new Image(); img.src = layers[l]; await img.decode()
        this.ctx[l].drawImage(img, 0, 0, PX_W, PX_H)
      }
      items.push({ layer: l, x: 0, y: 0, before, after: this.fullSnap(l) })
    }
    this.push(items); this.dirty = false; this.onChange()
  }
  // a flat picture of the sketch on the ghost, for looking at without opening the tool
  async preview(ghostSvg, ghostOpacity = 0.35) {
    const out = makeCanvas(), c = out.getContext('2d')
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, PX_W, PX_H)
    if (ghostSvg) {
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ghostSvg.replace('<svg ', `<svg width="${PX_W}" height="${PX_H}" `))
      await img.decode(); c.globalAlpha = ghostOpacity; c.drawImage(img, 0, 0); c.globalAlpha = 1
    }
    c.globalAlpha = 0.55; c.drawImage(this.layers.fill, 0, 0); c.globalAlpha = 1
    c.drawImage(this.layers.ink, 0, 0)
    return out.toDataURL('image/png')
  }
}
