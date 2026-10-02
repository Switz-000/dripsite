// Treaty room: cream wall, doorway with a gold curtain and red carpet, chandelier,
// hanging flags on poles at both sides, and a long table with two signing folders.
// Staged after the 1990 Bush-Gorbachev signing photo Martín sent.
// Options (scene.set): flags: five country names, left to right (left three, right two).
const TABLE = 470
const FLAG_SLOTS = [[-30,90,30,520],[78,110,18,540],[206,150,6,560],[1010,130,10,560],[1160,140,24,540]]

function hangingFlag(href, [x,w,top,bot], id){
  const hem = Array.from({length:7}, (_,i) => [x+w*i/6, bot+(i%2?10:-4)])
  const clip = `M${x} ${top} L${x+w} ${top} L${hem.reverse().map(p=>p.map(n=>n.toFixed(1)).join(' ')).join(' L')} Z`
  const folds = Array.from({length:6}, (_,i) => `<rect x="${(x+i*w/6).toFixed(1)}" y="${top}" width="${(w/12).toFixed(1)}" height="${bot-top+12}" fill="#000" fill-opacity="${(0.10+0.06*(i%3)).toFixed(2)}"/>`).join('')
  // a flag hung from a pole: the image turned 90 degrees so the hoist runs along the top
  return `<clipPath id="${id}"><path d="${clip}"/></clipPath>
  <g clip-path="url(#${id})"><g transform="translate(${x+w} ${top}) rotate(90)"><image href="${href}" xlink:href="${href}" x="0" y="0" width="${bot-top+12}" height="${w}" preserveAspectRatio="none"/></g>${folds}</g>
  <path d="${clip}" fill="none" stroke="#000" stroke-width="3" stroke-opacity=".55"/>
  <path d="M${x-4} ${top-30} L${x-4} 720" stroke="#6b5326" stroke-width="7"/><circle cx="${x-4}" cy="${top-34}" r="7" fill="#d8b04a" stroke="#000" stroke-width="2.5"/>`
}

const room = `<rect width="1280" height="720" fill="#e9dcbf"/>
  ${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${i*170-20}" y="0" width="22" height="720" fill="#d6c6a3"/>`).join('')}
  <rect x="470" y="70" width="340" height="470" fill="#5c4730"/><rect x="488" y="88" width="304" height="452" fill="#3b2b1b"/>
  ${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${560+i*20}" y="150" width="11" height="330" fill="${i%2?'#d9bc63':'#c8a84f'}"/>`).join('')}
  <path d="M488 470 L792 470 L900 560 L380 560 Z" fill="#8f2b25"/>
  <path d="M640 0 L640 40" stroke="#6b5326" stroke-width="3"/>
  <ellipse cx="640" cy="62" rx="58" ry="22" fill="#f3e7c4" stroke="#8a7240" stroke-width="3"/>
  ${[-48,-28,-8,12,32,52].map(d=>`<path d="M${640+d} 70 L${640+d} 92" stroke="#c9b27a" stroke-width="3"/><circle cx="${640+d}" cy="96" r="5" fill="#fff6d6" stroke="#8a7240" stroke-width="2"/>`).join('')}
  ${[[420,250],[860,250]].map(([x,y])=>`<path d="M${x} ${y} L${x} ${y+40}" stroke="#8a7240" stroke-width="4"/><ellipse cx="${x}" cy="${y-4}" rx="16" ry="10" fill="#fff3c4" fill-opacity=".9"/>`).join('')}`

function folder(x, col, ink){
  return `<path d="M${x-120} ${TABLE+16} L${x+120} ${TABLE+16} L${x+132} ${TABLE+62} L${x-132} ${TABLE+62} Z" fill="${col}" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
  <path d="M${x-108} ${TABLE+22} L${x+108} ${TABLE+22} L${x+118} ${TABLE+58} L${x-118} ${TABLE+58} Z" fill="#fbf8ef" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M${x} ${TABLE+22} L${x} ${TABLE+58}" stroke="#000" stroke-width="2"/>
  ${[0,1,2].map(i=>`<path d="M${x-96} ${TABLE+30+i*8} L${x-12} ${TABLE+30+i*8}" stroke="#9a9a9a" stroke-width="2"/>`).join('')}
  ${ink.p > 0 ? `<path d="M${ink.pts.slice(0, Math.max(2, Math.round(ink.p*(ink.pts.length-1))+1)).map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L')}" fill="none" stroke="#14213d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`
}

export default {
  scale: 0.95,
  spots: {
    seatL:  { x: 430, seat: TABLE },   seatR:  { x: 850, seat: TABLE },
    standL: { x: 112, ground: 668 },   standR: { x: 1185, ground: 650 },
  },
  // places a hand should never be drawn: the checker warns when one ends up here
  solids: [{ name: 'the front of the table', x0: 30, y0: TABLE + 78, x1: 1250, y1: 720 }],
  docs: {
    docL: { x: 430, sig: [446, TABLE+44, 86], seed: 3, color: '#6b1d1d' },
    docR: { x: 850, sig: [752, TABLE+44, 88], seed: 8, color: '#14284f' },
  },
  back(ctx){
    const names = ctx.scene.set.flags || []
    return room + names.map((n,i) => FLAG_SLOTS[i] ? hangingFlag(ctx.assets.flag(n), FLAG_SLOTS[i], 'flag'+i) : '').join('')
  },
  middle(ctx){
    const d = this.docs
    return `<path d="M60 ${TABLE} L1220 ${TABLE} L1250 ${TABLE+72} L30 ${TABLE+72} Z" fill="#2b1810" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <path d="M120 ${TABLE+14} L1160 ${TABLE+14}" stroke="#5a3a26" stroke-width="3" stroke-opacity=".7"/>
  ${folder(d.docL.x, d.docL.color, ctx.ink.docL)}${folder(d.docR.x, d.docR.color, ctx.ink.docR)}
  <rect x="30" y="${TABLE+72}" width="1220" height="40" fill="#4a2a18" stroke="#000" stroke-width="5"/>
  <rect x="50" y="${TABLE+112}" width="1180" height="${720-TABLE-112}" fill="#5a3420" stroke="#000" stroke-width="5"/>
  ${[0,1,2,3].map(i=>`<rect x="${110+i*285}" y="${TABLE+128}" width="250" height="56" fill="#62391f" stroke="#000" stroke-width="3"/><circle cx="${235+i*285}" cy="${TABLE+156}" r="7" fill="#2a1508" stroke="#000" stroke-width="2"/>`).join('')}`
  },
}
