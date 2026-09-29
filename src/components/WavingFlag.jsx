import React, { useEffect, useRef, useState } from 'react'

// A flag waving in the wind, rendered with WebGL: the flag image is a
// mip-mapped texture on a fine mesh whose vertices ride a few travelling waves
// (small near the pole, larger toward the free edge, with a slight droop and
// diagonal ripples). Each vertex is shaded by the slope of the cloth, so the
// folds catch and lose light. MSAA + mipmaps keep it sharp and free of jagged
// edges. Falls back to a plain image if WebGL isn't available.
const COLS = 48, ROWS = 12

const VERT = `
attribute vec2 aPos; attribute vec2 aUv; attribute float aShade;
varying vec2 vUv; varying float vShade;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUv = aUv; vShade = aShade; }`
const FRAG = `
precision mediump float;
uniform sampler2D uTex; varying vec2 vUv; varying float vShade;
void main() { vec4 c = texture2D(uTex, vUv); gl_FragColor = vec4(c.rgb * vShade, c.a); }`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  return sh
}

function wave(u, v, t) {
  const a = 0.06 + 0.94 * Math.pow(u, 1.15)
  return a * (
    Math.sin(5.4 * u - 2.7 * t + 0.9 * v) +
    0.45 * Math.sin(10.2 * u - 4.3 * t + 2.2 * v + 1.0) +
    0.2 * Math.sin(2.6 * u - 1.3 * t - 0.6 * v))
}

export default function WavingFlag({ src, name }) {
  const ref = useRef(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const W = 64, H = 50           // canvas size, css px
    const FW = 54, FH = 36         // flag box inside it
    const X0 = 2, Y0 = 3, AMP = 4  // pole offset, top margin, vertical swing
    // Deliberately low-res: one canvas pixel = PIXEL css px, scaled up crisp,
    // for a chunky pixel-art look.
    const PIXEL = 1.5
    canvas.width = Math.round(W / PIXEL)
    canvas.height = Math.round(H / PIXEL)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`

    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true })
    if (!gl) { setFallback(true); return }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    // Static mesh data (uv + triangle indices); positions/shade change per frame.
    const n = (COLS + 1) * (ROWS + 1)
    const uv = new Float32Array(n * 2)
    const pos = new Float32Array(n * 2)
    const shade = new Float32Array(n)
    const idx = new Uint16Array(COLS * ROWS * 6)
    for (let j = 0, k = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++, k++) {
        uv[k * 2] = i / COLS
        uv[k * 2 + 1] = j / ROWS
      }
    }
    for (let j = 0, q = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1
        idx.set([a, b, c, b, d, c], q)
        q += 6
      }
    }
    const buf = (data, attr, size, usage) => {
      const b = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, b)
      gl.bufferData(gl.ARRAY_BUFFER, data, usage)
      const loc = gl.getAttribLocation(prog, attr)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      return b
    }
    const posBuf = buf(pos, 'aPos', 2, gl.DYNAMIC_DRAW)
    const shadeBuf = buf(shade, 'aShade', 1, gl.DYNAMIC_DRAW)
    buf(uv, 'aUv', 2, gl.STATIC_DRAW)
    const ib = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)

    let raf = 0, alive = true, fw = FW, fh = FH
    const frame = t => {
      for (let j = 0, k = 0; j <= ROWS; j++) {
        for (let i = 0; i <= COLS; i++, k++) {
          const u = i / COLS, v = j / ROWS
          const z = wave(u, v, t)
          const e = 0.01
          const slope = (wave(Math.min(1, u + e), v, t) - wave(Math.max(0, u - e), v, t)) / (2 * e)
          const px = X0 + u * fw * (1 - 0.05 * Math.abs(z)) - z * 0.6
          const py = Y0 + AMP + v * fh + z * AMP * 0.55 + u * u * 1.6
          pos[k * 2] = (px / W) * 2 - 1
          pos[k * 2 + 1] = 1 - (py / H) * 2
          shade[k] = Math.min(1.18, Math.max(0.62, 1 - slope * 0.028 * (0.3 + u)))
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos)
      gl.bindBuffer(gl.ARRAY_BUFFER, shadeBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, shade)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => { if (alive) setFallback(true) }
    img.onload = () => {
      if (!alive) return
      // Fit the flag in its box, keeping its proportions.
      const ratio = img.naturalWidth / img.naturalHeight
      fw = FW
      fh = FW / ratio
      if (fh > FH) { fh = FH; fw = FH * ratio }

      // WebGL1 wants power-of-two textures for mipmaps: redraw the flag
      // (stretched) onto a 1024 square; the mesh un-stretches it.
      const S = 1024
      const tex = document.createElement('canvas')
      tex.width = tex.height = S
      const tc = tex.getContext('2d')
      tc.imageSmoothingQuality = 'high'
      tc.drawImage(img, 0, 0, S, S)

      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const ext = gl.getExtension('EXT_texture_filter_anisotropic')
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4)

      if (reduce) { frame(0.4); return }
      const start = performance.now()
      const loop = now => { frame((now - start) / 1000); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    img.src = src

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [src])

  return (
    <div className="waving-flag" role="img" aria-label={`Flag of ${name}`}>
      <span className="waving-flag-pole" aria-hidden="true" />
      {fallback
        ? <img src={src} alt="" className="waving-flag-static" />
        : <canvas ref={ref} aria-hidden="true" />}
    </div>
  )
}
