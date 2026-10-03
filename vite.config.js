import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Dev server only: the Part Sketchpad (/dev/sketch) saves drawings into
// sketches/<slug>/ so Claude can pick them up. Nothing of this ships.
const SKETCHES = path.resolve('sketches')
const slugOk = s => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s)
const png = (dataURL, file) => fs.writeFileSync(file, Buffer.from(dataURL.replace(/^data:image\/png;base64,/, ''), 'base64'))
const asDataURL = file => fs.existsSync(file) ? 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') : null

function sketchSaver() {
  return {
    name: 'sketch-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sketches', (req, res) => {
        const send = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
        const slug = decodeURIComponent((req.url || '/').replace(/^\/|\/$/g, ''))
        if (req.method === 'GET' && !slug) {
          const list = fs.existsSync(SKETCHES) ? fs.readdirSync(SKETCHES).filter(d => fs.existsSync(path.join(SKETCHES, d, 'sketch.json')))
            .map(d => JSON.parse(fs.readFileSync(path.join(SKETCHES, d, 'sketch.json'), 'utf8'))) : []
          return send(200, list.map(({ slug, name, slot, savedAt }) => ({ slug, name, slot, savedAt })))
        }
        if (req.method === 'GET') {
          if (!slugOk(slug)) return send(400, 'bad name')
          const dir = path.join(SKETCHES, slug), file = path.join(dir, 'sketch.json')
          if (!fs.existsSync(file)) return send(404, 'not found')
          return send(200, { ...JSON.parse(fs.readFileSync(file, 'utf8')),
            layers: { ink: asDataURL(path.join(dir, 'ink.png')), fill: asDataURL(path.join(dir, 'fill.png')) } })
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', c => { body += c })
          req.on('end', () => {
            try {
              const { layers = {}, preview, ...meta } = JSON.parse(body)
              if (!slugOk(meta.slug)) return send(400, 'bad name')
              const dir = path.join(SKETCHES, meta.slug)
              fs.mkdirSync(dir, { recursive: true })
              for (const l of ['ink', 'fill']) {
                const f = path.join(dir, l + '.png')
                if (layers[l]) png(layers[l], f); else fs.rmSync(f, { force: true })
              }
              if (preview) png(preview, path.join(dir, 'preview.png'))
              fs.writeFileSync(path.join(dir, 'sketch.json'), JSON.stringify(meta, null, 2) + '\n')
              send(200, { ok: true, dir: 'sketches/' + meta.slug })
            } catch (err) { send(500, String(err.message || err)) }
          })
          return
        }
        send(405, 'method not allowed')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), sketchSaver()],
  server: { watch: { ignored: ['**/sketches/**'] } },
})
