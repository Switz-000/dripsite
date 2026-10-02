// Renders a scene file.  Draft: 8 key frames on one contact sheet, half size, seconds.
//   npm run draft -- scenes/lasman-signing.mjs [--frames 0,40,90] [--landmarks]
//   npm run render -- scenes/lasman-signing.mjs [--audio file.wav@1.5] [--landmarks]
// Frames rasterise in parallel (one worker per CPU core) with resvg; ffmpeg makes the MP4.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..')
const FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].filter(f=>fs.existsSync(f))

async function raster(jobs, width){
  const n = Math.max(1, Math.min(os.cpus().length, jobs.length)), per = Math.ceil(jobs.length/n)
  await Promise.all(Array.from({length:n}, (_,i) => new Promise((ok, bad) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobs.slice(i*per, (i+1)*per), width, fonts: FONTS } })
    w.on('message', ok); w.on('error', bad)
  })))
}

if (!isMainThread){
  const { Resvg } = await import('@resvg/resvg-js')
  for (const j of workerData.jobs){
    const r = new Resvg(j.svg, { fitTo:{ mode:'width', value: workerData.width }, font:{ loadSystemFonts: workerData.fonts.length === 0, fontFiles: workerData.fonts, defaultFontFamily:'DejaVu Serif' } })
    fs.writeFileSync(j.out, r.render().asPng())
  }
  parentPort.postMessage('done')
} else {
  const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && /\.m?js$/.test(a))
  if (!file) { console.error('Usage: render.mjs scenes/<scene>.mjs [--draft [--frames a,b,c] [--small] [--focus who]] [--landmarks] [--audio file@seconds]'); process.exit(1) }
  const opt = n => { const i = args.indexOf('--'+n); return i < 0 ? null : (args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : true) }
  const t0 = Date.now()
  const { loadSceneFile } = await import('./load-node.mjs')
  const { S, name } = await loadSceneFile(file)
  const outDir = path.join(ROOT,'out',name)
  fs.rmSync(outDir, { recursive:true, force:true }); fs.mkdirSync(outDir, { recursive:true })
  const lm = !!opt('landmarks')
  if (opt('draft')){
    const picks = typeof opt('frames') === 'string' ? opt('frames').split(',').map(Number) : Array.from({length:8}, (_,i) => Math.round(i*(S.N-1)/7))
    // --focus <who>: crop every cell to one character (all frames share one crop, so movement still reads)
    const who = typeof opt('focus') === 'string' ? opt('focus') : null
    let view = [0, 0, S.size[0], S.size[1]]
    if (who){
      if (!S.rows[who]) { console.error(`No cast member "${who}". Cast: ${Object.keys(S.rows).join(', ')}`); process.exit(1) }
      const P = S.place[who]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
      const skip = new Set(['restL','restR', ...(P.seated ? ['footL','footR','ground','hips'] : [])])   // a seated character's legs are under the furniture
      for (const f of picks) for (const [n,[x,y]] of Object.entries(S.rows[who][f].landmarks)) { if (skip.has(n)) continue; const X = P.tx + x*P.S, Y = P.ty + y*P.S; x0 = Math.min(x0,X); y0 = Math.min(y0,Y); x1 = Math.max(x1,X); y1 = Math.max(y1,Y) }
      const pad = 40*P.S; x0 -= pad; y0 -= pad*1.6; x1 += pad; y1 += pad
      const aspect = S.size[0]/S.size[1], cw = Math.max(x1-x0, (y1-y0)*aspect), ch = cw/aspect
      view = [(x0+x1)/2 - cw/2, (y0+y1)/2 - ch/2, cw, ch]
    }
    const scale = opt('small') ? 4 : 2, [w,h] = [S.size[0]/scale, S.size[1]/scale]
    const crop = svg => svg.replace(/viewBox="[^"]*"/, `viewBox="${view.map(v=>v.toFixed(1)).join(' ')}"`)
    await raster(picks.map(f => ({ svg: crop(S.frame(f, { landmarks: lm })), out: path.join(outDir, `k${f}.png`) })), w)
    const cols = 4, rows = Math.ceil(picks.length/cols)
    const cells = picks.map((f,i) => { const x=(i%cols)*w, y=Math.floor(i/cols)*(h+24)
      return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${fs.readFileSync(path.join(outDir,`k${f}.png`)).toString('base64')}"/><text x="${x+6}" y="${y+h+17}" font-family="DejaVu Sans" font-size="${scale > 2 ? 12 : 15}">${f} · ${(f/S.fps).toFixed(2)}s</text>` }).join('')
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*w}" height="${rows*(h+24)}"><rect width="100%" height="100%" fill="#fff"/>${cells}</svg>`
    const out = path.join(ROOT,'out',`${name}-draft.png`)
    await raster([{ svg: sheet, out }], cols*w)
    console.log(`draft: ${out}  (${picks.length} frames of ${S.N}, ${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } else {
    const jobs = Array.from({length:S.N}, (_,f) => ({ svg: S.frame(f, { landmarks: lm }), out: path.join(outDir, String(f).padStart(4,'0')+'.png') }))
    await raster(jobs, S.size[0])
    const mp4 = path.join(ROOT,'out',`${name}.mp4`), au = opt('audio')
    const a = typeof au === 'string' ? au.split('@') : null
    execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate',String(S.fps),'-i',path.join(outDir,'%04d.png'),
      ...(a ? ['-i',a[0],'-af',`adelay=${Math.round((+a[1]||0)*1000)}:all=1,apad`,'-shortest','-c:a','aac'] : []),
      '-c:v','libx264','-pix_fmt','yuv420p','-crf','18', mp4])
    console.log(`video: ${mp4}  (${S.N} frames, ${((Date.now()-t0)/1000).toFixed(1)}s on ${os.cpus().length} cores)`)
  }
}
