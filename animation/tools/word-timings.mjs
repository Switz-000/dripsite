// npm run words -- <audio files or folders> [--prompt "Kolkov, Raroska"] [--force] [--lang en]
//
// Writes <take>.words.json next to every voice take: each word with its start and end in seconds,
// so talking beats can move the mouth on the right syllables. Uses whisper.cpp (large-v3) on the
// GPU through Vulkan, the build already in claude-space/tools/whisper.cpp on Martín's PC.
// Takes that already have an up-to-date .words.json are skipped unless --force.
//
//   --whisper <dir>   whisper.cpp folder (default: $WHISPER_CPP, else ../claude-space/tools/whisper.cpp next to dripsite)
//   --model <file>    model file (default: <whisper>/models/ggml-large-v3.bin)
//   --prompt <text>   names and odd words to expect, so whisper spells them right
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUDIO = /\.(wav|mp3|flac|ogg|m4a)$/i

/* whisper.cpp's --output-json-full -> [{ w, start, end, p }]. Exported for the tests. */
export function toWords(json){
  const words = []
  for (const seg of json.transcription || []){
    const segEnd = (seg.offsets?.to ?? 0) / 1000
    for (const t of seg.tokens || []){
      const text = t.text ?? ''
      if (/^\s*\[_[^\]]*\]\s*$/.test(text) || /^\s*<\|.*\|>\s*$/.test(text)) continue          // [_BEG_], [_TT_123], <|endoftext|>
      const start = t.t_dtw != null && t.t_dtw >= 0 ? t.t_dtw / 100 : (t.offsets?.from ?? 0) / 1000
      const end = (t.offsets?.to ?? t.offsets?.from ?? 0) / 1000
      const startsWord = /^\s/.test(text) || !words.length
      const isPunct = !/[\p{L}\p{N}]/u.test(text)
      if (startsWord && !isPunct) words.push({ w: text.trim(), start, end: Math.max(end, start), p: t.p ?? 1, _seg: segEnd })
      else if (words.length) { const w = words[words.length-1]; w.w += text.trim() === '' ? '' : (startsWord ? ' ' : '') + text.trim(); if (!isPunct) { w.end = Math.max(w.end, end); w.p = Math.min(w.p, t.p ?? 1) } }
    }
  }
  // a word lasts until the next one starts, but at most 0.15s past its own last sound and never past its segment
  for (let i = 0; i < words.length; i++){
    const w = words[i], next = words[i+1]
    if (next && next.start > w.start) w.end = Math.max(w.end, Math.min(next.start, w._seg || next.start, w.end + 0.15))   // runs into the next word, but not across a pause
    if (w.end <= w.start) w.end = w.start + 0.08
    w.start = +w.start.toFixed(3); w.end = +w.end.toFixed(3); w.p = +(+w.p).toFixed(3); delete w._seg
  }
  return words
}

/* whisper.cpp's word alignment (--dtw) needs the preset that matches the model, or it crashes */
const DTW = ['tiny','tiny.en','base','base.en','small','small.en','medium','medium.en','large.v1','large.v2','large.v3','large.v3.turbo']
export function dtwPreset(modelFile){
  const n = path.basename(modelFile).replace(/^(for-tests-)?ggml-/, '').replace(/(-q\d.*)?\.bin$/, '').replace(/^large-v(\d)(-turbo)?$/, (m, v, t) => `large.v${v}${t ? '.turbo' : ''}`)
  return DTW.includes(n) ? n : null
}

function findAudio(p, out = []){
  const st = fs.statSync(p)
  if (st.isDirectory()) { for (const f of fs.readdirSync(p).sort()) if (!f.startsWith('.')) findAudio(path.join(p, f), out) }
  else if (AUDIO.test(p) && !/[\\/]raw[\\/]/.test(p)) out.push(p)
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const args = process.argv.slice(2)
  const opt = n => { const i = args.indexOf('--'+n); return i < 0 ? null : (args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : true) }
  const taken = new Set(); for (const n of ['whisper','model','prompt','lang']) { const i = args.indexOf('--'+n); if (i >= 0) taken.add(i+1) }
  const inputs = args.filter((a,i) => !a.startsWith('--') && !taken.has(i))
  if (!inputs.length){ console.error('Usage: npm run words -- <audio files or folders> [--prompt "names"] [--force] [--lang en]'); process.exit(2) }
  const wdir = path.resolve(opt('whisper') || process.env.WHISPER_CPP || path.resolve(HERE, '../../../claude-space/tools/whisper.cpp'))
  const cli = path.join(wdir, 'build/bin/whisper-cli'), model = path.resolve(opt('model') || path.join(wdir, 'models/ggml-large-v3.bin'))
  for (const [what, p] of [['whisper-cli', cli], ['model', model]]) if (!fs.existsSync(p)) { console.error(`No ${what} at ${p}. Pass --whisper <whisper.cpp folder> or set WHISPER_CPP.`); process.exit(2) }
  if (!dtwPreset(model)) console.warn(`No word-alignment preset for ${path.basename(model)}; timings will be rougher.`)
  const files = inputs.flatMap(p => findAudio(path.resolve(p)))
  if (!files.length){ console.error('No audio files found.'); process.exit(2) }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'words-'))
  let done = 0, skipped = 0
  for (const f of files){
    const out = f.replace(AUDIO, '.words.json')
    if (!opt('force') && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(f).mtimeMs) { skipped++; continue }
    const wav = path.join(tmp, 'in.wav'), base = path.join(tmp, 'out')
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',f,'-ar','16000','-ac','1','-c:a','pcm_s16le',wav])
    const dtw = dtwPreset(model)
    const a = ['-m', model, '-f', wav, '-l', opt('lang') || 'en', ...(dtw ? ['--dtw', dtw, '-nfa'] : []), '-ojf', '-of', base, '-np']
    if (typeof opt('prompt') === 'string') a.push('--prompt', opt('prompt'))
    const t0 = Date.now()
    try { execFileSync(cli, a, { stdio: ['ignore', 'ignore', 'pipe'] }) }
    catch (e) { console.error(`whisper failed on ${f} (${e.signal ? 'crashed: ' + e.signal : 'exit ' + e.status}):\n${String(e.stderr || '').slice(-600)}`); continue }
    const json = JSON.parse(fs.readFileSync(base + '.json', 'utf8'))
    const words = toWords(json)
    fs.writeFileSync(out, JSON.stringify({ source: path.basename(f), model: path.basename(model), text: words.map(w => w.w).join(' '), words }, null, 1) + '\n')
    done++
    console.log(`${path.relative(process.cwd(), out)}  ${words.length} words, ${((Date.now()-t0)/1000).toFixed(1)}s  "${words.map(w=>w.w).join(' ').slice(0, 70)}"`)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`Done: ${done} transcribed, ${skipped} already up to date.`)
}
