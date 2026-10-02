// Browser-side MP4 export and saving scene files to the dripsite repo.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { getToken } from '../portrait/vaultPortraits'

/* ---------- MP4 ----------
   Each frame's SVG is drawn into a canvas and encoded with the browser's own H.264 encoder
   (WebCodecs) at exact timestamps, so the video is 24 fps however slow the drawing is.
   Silent: the command-line render (`npm run render -- ... --audio`) is the one with sound. */
export function canExportMp4() { return typeof window !== 'undefined' && 'VideoEncoder' in window }

export async function exportMp4({ frames, frameSvg, size: [W, H], fps, onProgress, signal }) {
  if (!canExportMp4()) throw new Error('This browser cannot encode video (no WebCodecs). Use Chrome, Edge or a recent Firefox, or `npm run render`.')
  const pick = await pickCodec(W, H, fps)
  if (!pick) throw new Error(`This browser cannot encode ${W}x${H} video (no H.264, VP9 or AV1 encoder). Use Chrome or Edge, or \`npm run render\`.`)
  const { codec } = pick
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.mux, width: W, height: H, frameRate: fps }, fastStart: 'in-memory' })
  let failed = null
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failed = e } })
  enc.configure({ codec, width: W, height: H, bitrate: 6_000_000, framerate: fps })
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  for (let f = 0; f < frames; f++) {
    if (signal?.aborted) { enc.close(); throw new DOMException('Export cancelled', 'AbortError') }
    if (failed) throw failed
    const img = await svgImage(frameSvg(f))
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H)
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) })
    enc.encode(vf, { keyFrame: f % (fps * 2) === 0 }); vf.close()
    if (enc.encodeQueueSize > 8) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }))
    onProgress?.(f + 1, frames)
  }
  await enc.flush(); enc.close()
  if (failed) throw failed
  muxer.finalize()
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' })
  blob.codecLabel = pick.label
  return blob
}

/* H.264 first (plays everywhere); browsers without an H.264 encoder (some Linux Chromium builds)
   fall back to VP9 or AV1, still in an .mp4 that browsers, VLC and most editors open. */
const CODECS = [
  { codec: 'avc1.4d0028', mux: 'avc', label: 'H.264' },
  { codec: 'avc1.42e028', mux: 'avc', label: 'H.264' },
  { codec: 'avc1.640028', mux: 'avc', label: 'H.264' },
  { codec: 'vp09.00.40.08', mux: 'vp9', label: 'VP9' },
  { codec: 'av01.0.08M.08', mux: 'av1', label: 'AV1' },
]
async function pickCodec(width, height, framerate) {
  for (const c of CODECS) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c.codec, width, height, bitrate: 6_000_000, framerate })).supported) return c } catch { /* try the next */ }
  }
  return null
}

function svgImage(svg) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); ok(img) }
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('A frame could not be drawn.')) }
    img.src = url
  })
}

export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/* ---------- Save to GitHub ----------
   Commits animation/scenes/<name>.mjs to the site repo, with the token the portrait
   composer already stores. The live site then redeploys with the new scene. */
const SITE_REPO = { owner: 'Switz-000', repo: 'dripsite', branch: 'main' }
const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin) }

export async function saveScene(name, text) {
  const token = getToken()
  if (!token) throw new Error('Add a GitHub token first (the same one the portrait composer uses), with write access to dripsite.')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Scene names are lowercase words joined by dashes, like "lasman-signing".')
  const path = `animation/scenes/${name}.mjs`
  const url = `https://api.github.com/repos/${SITE_REPO.owner}/${SITE_REPO.repo}/contents/${path}`
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
  const cur = await fetch(`${url}?ref=${SITE_REPO.branch}`, { headers })
  const sha = cur.ok ? (await cur.json()).sha : undefined
  if (!cur.ok && cur.status !== 404) throw new Error(`Could not read the scene on GitHub (${cur.status}).`)
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({
    message: `${sha ? 'Update' : 'Add'} animation scene: ${name}`, content: b64(text), branch: SITE_REPO.branch, ...(sha ? { sha } : {}) }) })
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404
    ? `GitHub refused the write (${res.status}). The token needs write access to ${SITE_REPO.owner}/${SITE_REPO.repo}.`
    : `Saving failed (${res.status}).`)
}
