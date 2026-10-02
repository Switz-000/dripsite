// npm run test:player [-- --no-build] [--export] [--headed]
// Builds the site, serves it, and drives /dev/animate in Chromium the way a person would:
// playback speed, frame stepping, landmarks, drag-to-fix accuracy, adding beats, drafts across a
// reload, error messages, the timeline, the checker, snippets, templates and the phone layout.
// --export also exports an MP4 (slow). Exit code = number of failed checks.
//
// Needs a Chromium for playwright-core: in Claude's cloud workspace it is preinstalled; on a
// PC run `npx playwright install chromium` once. VAULT_DIR is used for the build when set.
import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os'; import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), has = a => args.includes(a)
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

if (!has('--no-build')) {
  console.log('Building the site…')
  execFileSync('npm', ['run', 'build'], { cwd: SITE, stdio: ['ignore', 'ignore', 'inherit'], env: process.env })
}
const port = await new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: SITE, stdio: 'ignore' })
const URL = `http://localhost:${port}/dev/animate`
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }

// behind a proxy (Claude's cloud workspace) the vault still comes through it, but the local server must not
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined
const browser = await chromium.launch({ headless: !has('--headed'), proxy, args: proxy ? ['--proxy-bypass-list=localhost;127.0.0.1'] : [] })
const errors = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true, acceptDownloads: true })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => errors.push(e.message))
  const editor = pg.locator('.an-editor'), time = () => pg.locator('.an-time').innerText()
  const frameNo = async () => +(await time()).match(/frame (\d+)/)[1]
  const lm = name => pg.evaluate(n => { const c = [...document.querySelectorAll('.an-svg circle')].find(c => c.querySelector('title')?.textContent === n); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }, name)
  // the same landmark in scene units (immune to the page moving), and the screen-to-scene scale
  const lmScene = name => pg.evaluate(n => { const c = [...document.querySelectorAll('.an-svg circle')].find(c => c.querySelector('title')?.textContent === n); return c ? [+c.getAttribute('cx'), +c.getAttribute('cy')] : null }, name)
  const stageY = () => pg.evaluate(() => document.querySelector('.an-stage').getBoundingClientRect().y)
  const scale = () => pg.evaluate(() => 1280 / document.querySelector('.an-stage').getBoundingClientRect().width)
  const settle = () => sleep(900)

  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('requestfailed', r => logs.push('failed: ' + r.url().slice(0, 100)))
  await pg.goto(URL)
  try { await pg.waitForSelector('.an-svg svg, .an-error', { timeout: 60000 }) }
  catch { console.error('The player never loaded. Browser said:\n  ' + logs.slice(-8).join('\n  ')); throw new Error('player did not load') }
  if (await pg.locator('.an-error').count()) { console.error('The player showed an error: ' + await pg.locator('.an-error').innerText()); throw new Error('player error on load') }
  check('loads the default scene', await pg.locator('.an-error').count() === 0 && await pg.locator('.an-row').count() >= 4)

  await pg.keyboard.press('Space'); await sleep(2000); await pg.keyboard.press('Space')
  const played = await frameNo(); check('plays at about 24 fps', played >= 36 && played <= 60, `${played} frames in 2s`)

  await pg.keyboard.press('Home'); for (let i = 0; i < 4; i++) await pg.keyboard.press('Shift+ArrowRight'); for (let i = 0; i < 4; i++) await pg.keyboard.press('ArrowRight')
  check('arrow keys step exact frames', await frameNo() === 100)

  await pg.locator('label:has-text("Landmarks") input').check(); await sleep(300)
  check('landmarks overlay', await pg.locator('.an-svg circle title').count() > 50)

  const h = await lm('lasmanna.handL'), w1 = await lmScene('lasmanna.handL'), y1 = await stageY(), k = await scale()
  await pg.mouse.move(...h); await pg.mouse.down(); await pg.mouse.move(h[0] + 15, h[1] - 20, { steps: 6 }); await pg.mouse.up(); await settle()
  const w2 = await lmScene('lasmanna.handL'), moved = [(w2[0] - w1[0]) / k, (w2[1] - w1[1]) / k]
  check('drag moves the hand exactly where it was dropped', Math.abs(moved[0] - 15) < 2.5 && Math.abs(moved[1] + 20) < 2.5, `moved ${moved.map(v => v.toFixed(1))} screen px`)
  check('the stage does not jump when the status changes', Math.abs(await stageY() - y1) < 1, `moved ${(await stageY() - y1).toFixed(1)}px`)
  check('drag rewrites the beat line', /to: 'brow', dx: -?[\d.]+, dy: -?[\d.]+/.test(await editor.inputValue()) && !/dx: -12, dy: -18/.test(await editor.inputValue()))

  await pg.keyboard.press('Home'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await sleep(300)
  const h3 = await lm('lasmanna.handL'), before = (await editor.inputValue()).split('\n').length
  await pg.mouse.move(...h3); await pg.mouse.down(); await pg.mouse.move(h3[0] - 20, h3[1] - 60, { steps: 6 }); await pg.mouse.up(); await settle()
  const after = await editor.inputValue()
  check('dragging a free hand adds a beat', after.split('\n').length === before + 1 && /hand: 'L', to: \[/.test(after),
    after.split('\n').length === before + 1 ? '' : `${after.split('\n').length - before} lines added; note: ${await pg.locator('.an-note').innerText().catch(() => 'none')}`)

  await pg.reload(); await pg.waitForSelector('.an-svg svg'); await sleep(500)
  check('drafts survive a reload', (await pg.locator('.dp-status').first().innerText()).includes('Unsaved'))
  await pg.locator('button:has-text("Revert")').click(); await settle()
  check('revert goes back to the repo version', (await pg.locator('.dp-status').first().innerText()).includes('Same as the repo'))

  await editor.fill((await editor.inputValue()).replace('length: 9.5,', 'length: 9.5,,,')); await settle()
  check('syntax errors are reported', (await pg.locator('.an-error').count()) === 1)
  await pg.locator('button:has-text("Revert")').click(); await settle()
  await editor.fill((await editor.inputValue()).replace("to: 'brow'", "to: 'forehead'")); await settle()
  check('unknown landmarks are named', /not a landmark\. Landmarks: headTop/.test(await pg.locator('.an-error').innerText().catch(() => '')))
  await pg.locator('button:has-text("Revert")').click(); await settle()
  check('errors clear after a fix', await pg.locator('.an-error').count() === 0)

  await pg.locator('.an-beat').nth(4).click(); await sleep(300)
  const sel = await pg.evaluate(() => { const t = document.querySelector('.an-editor'); return t.value.slice(t.selectionStart, t.selectionEnd) })
  check('clicking a beat jumps to it and selects its line', await frameNo() === 88 && sel.includes("t: [3.67, 4.75]"))

  check('checker finds no problems in the signing scene', /no problems/.test(await pg.locator('.an-check h2').innerText()))
  await editor.fill((await editor.inputValue()).replace("t: [0.3, 9.5],   hand: 'R', to: [948, 500] }", "t: [0.3, 9.5],   hand: 'R', to: [948, 660] }")); await settle()
  check('checker flags a hand inside the table', /inside the front of the table/.test(await pg.locator('.an-check').innerText()))
  await pg.locator('button:has-text("Revert")').click(); await settle()

  const lines = (await editor.inputValue()).split('\n').length
  await pg.locator('.an-tools select').nth(1).selectOption('Nod'); await pg.locator('.an-tools button').click(); await settle()
  check('Add beat inserts a snippet line', (await editor.inputValue()).split('\n').length === lines + 1 && /nod: 1 }/.test(await editor.inputValue()))
  await pg.locator('button:has-text("Revert")').click(); await settle()

  await pg.locator('input[aria-label="New scene name"]').fill('test two talking ' + Date.now())
  await pg.locator('select[aria-label="Start from"]').selectOption('Two people talking (studio)')
  await pg.locator('button:has-text("New")').click(); await sleep(2500)
  check('new scene from a template runs', await pg.locator('.an-error').count() === 0 && (await editor.inputValue()).includes("set: { use: 'studio' }"))

  if (has('--export')) {
    const t0 = Date.now()
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 600000 }), pg.locator('button:has-text("Export MP4")').click()])
    const file = path.join(os.tmpdir(), 'player-export.mp4'); await dl.saveAs(file)
    let detail = `${(fs.statSync(file).size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    try { detail += ', ' + execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,r_frame_rate,nb_frames', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim() } catch {}
    check('exports an MP4', fs.statSync(file).size > 10000, detail)
  }

  await pg.setViewportSize({ width: 390, height: 844 }); await sleep(500)
  const [sw, w] = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  check('fits a phone without sideways scrolling', sw <= w, `${sw} vs ${w}`)
  check('no script errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close(); server.kill()
}
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed} of ${results.length} passed.`)
process.exit(failed)
