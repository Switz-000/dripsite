// Dominant colours of a flag image, used to tint holiday confetti.
// Runs in the browser only; falls back to `fallback` if the image can't be
// read (network, CORS, or a canvas that got tainted).

const cache = new Map()
const fallback = ['#8b1a1a', '#c9a227', '#ffffff']

export function flagPalette(url, count = 4) {
  if (!url) return Promise.resolve(fallback)
  if (cache.has(url)) return cache.get(url)

  const p = new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = 48
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data

        // Bucket to 4 bits per channel, count, then pick the most common
        // buckets that are visibly different from each other.
        const buckets = new Map()
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
          buckets.set(key, (buckets.get(key) || 0) + 1)
        }
        const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => [
          ((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17,
        ])
        const picked = []
        for (const rgb of ranked) {
          if (picked.every(q => Math.hypot(q[0] - rgb[0], q[1] - rgb[1], q[2] - rgb[2]) > 90)) picked.push(rgb)
          if (picked.length === count) break
        }
        resolve(picked.length ? picked.map(([r, g, b]) => `rgb(${r},${g},${b})`) : fallback)
      } catch {
        resolve(fallback)
      }
    }
    img.onerror = () => resolve(fallback)
    img.src = url
  })
  cache.set(url, p)
  return p
}
