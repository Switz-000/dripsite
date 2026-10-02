// Gallery: a hall with three gilt-framed portraits (who come alive) above wood panelling.
// Portrait spots: frameL, frameC, frameR (seated, clipped to the frame). Floor: floor (standing).
// Options (scene.set): names: three name plates, left to right.
const FRAMES = [240, 640, 1040], FW = 270, TOP = 24, BOT = 352, IN = 20
const BG = ['#5f6b4a', '#4d5a6e', '#6b4a3c']        // each portrait's painted background
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const wall = `<rect width="1280" height="720" fill="#5a1a1c"/>
  ${Array.from({ length: 33 }, (_, i) => `<rect x="${i * 40}" y="0" width="16" height="430" fill="#000" fill-opacity="${i % 2 ? .07 : .12}"/>`).join('')}
  ${Array.from({ length: 33 }, (_, i) => `<path d="M${i * 40 + 20} 30 l6 10 l-6 10 l-6 -10 Z M${i * 40} 230 l6 10 l-6 10 l-6 -10 Z" fill="#7a2a2c" fill-opacity=".55"/>`).join('')}
  <rect y="410" width="1280" height="22" fill="#3a2214"/><rect y="404" width="1280" height="8" fill="#6b4426"/>
  <rect y="432" width="1280" height="182" fill="#4a2c1c"/>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="${18 + i * 160}" y="452" width="140" height="140" fill="none" stroke="#2c180d" stroke-width="5"/><rect x="${24 + i * 160}" y="458" width="128" height="128" fill="none" stroke="#6b4426" stroke-width="2"/>`).join('')}
  <rect y="606" width="1280" height="114" fill="#7a5232"/><rect y="606" width="1280" height="8" fill="#2c180d"/>
  ${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 100 - 20} 614 L${i * 100 - 60} 720" stroke="#5e3e24" stroke-width="3"/>`).join('')}`

function frame(x, i, name) {
  const x0 = x - FW / 2, x1 = x + FW / 2
  return `<path d="M${x0} ${TOP} H${x1} V${BOT} H${x0} Z M${x0 + IN} ${TOP + IN} V${BOT - IN} H${x1 - IN} V${TOP + IN} Z" fill="#c9a227" fill-rule="evenodd" stroke="#000" stroke-width="4"/>
  <path d="M${x0 + 7} ${TOP + 7} H${x1 - 7} V${BOT - 7} H${x0 + 7} Z M${x0 + IN} ${TOP + IN} V${BOT - IN} H${x1 - IN} V${TOP + IN} Z" fill="#8f6f12" fill-rule="evenodd" fill-opacity=".55"/>
  <rect x="${x0 + IN}" y="${TOP + IN}" width="${FW - 2 * IN}" height="${BOT - TOP - 2 * IN}" fill="none" stroke="#000" stroke-width="3"/>
  ${[[x0 + 10, TOP + 10], [x1 - 10, TOP + 10], [x0 + 10, BOT - 10], [x1 - 10, BOT - 10]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="5" fill="#e8c95a" stroke="#000" stroke-width="2"/>`).join('')}
  ${name ? `<rect x="${x - 92}" y="${BOT + 12}" width="184" height="26" rx="3" fill="#b8902a" stroke="#000" stroke-width="2.5"/>
  <text x="${x}" y="${BOT + 30}" text-anchor="middle" font-family="DejaVu Serif" font-size="${name.length > 24 ? 10 : 13}" fill="#2c1d05">${esc(name)}</text>` : ''}`
}

export default {
  scale: 0.74,
  spots: {
    frameL: { x: FRAMES[0], seat: 277, scale: 0.55, clip: [FRAMES[0] - FW / 2 + IN, TOP + IN, FRAMES[0] + FW / 2 - IN, BOT - IN] },
    frameC: { x: FRAMES[1], seat: 277, scale: 0.55, clip: [FRAMES[1] - FW / 2 + IN, TOP + IN, FRAMES[1] + FW / 2 - IN, BOT - IN] },
    frameR: { x: FRAMES[2], seat: 277, scale: 0.55, clip: [FRAMES[2] - FW / 2 + IN, TOP + IN, FRAMES[2] + FW / 2 - IN, BOT - IN] },
    floor:  { x: 1160, ground: 700 },
  },
  back(ctx) {
    return wall + FRAMES.map((x, i) => `<rect x="${x - FW / 2 + IN}" y="${TOP + IN}" width="${FW - 2 * IN}" height="${BOT - TOP - 2 * IN}" fill="${BG[i]}"/>
  <rect x="${x - FW / 2 + IN}" y="${TOP + IN}" width="${FW - 2 * IN}" height="${BOT - TOP - 2 * IN}" fill="#000" fill-opacity=".18"/>`).join('')
  },
  middle(ctx) {
    const names = ctx.scene.set.names || []
    return FRAMES.map((x, i) => frame(x, i, names[i])).join('')
  },
}
