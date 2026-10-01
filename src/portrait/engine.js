// Character portraits: bowling-pin figures composed from Martín's drawn parts.
// A portrait is a small spec (which part goes in each slot, four build numbers,
// a palette). compose() turns a spec into an SVG string. Parts are traced from
// his drawings (parts.json); every part sits on an anchor the head owns, and
// stretching moves coordinates rather than scaling the drawing, so line widths
// never change. Pure string code: runs in the browser and in the prerender.
import BASE from './parts.json'


const K = '#000000';
const LW = 5;
const ST = (w=LW)=>`stroke="${K}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/* ---------- Skeleton (from the base drawings) ---------- */
const HEAD = BASE.head, CHIN = HEAD.cy + HEAD.ry;
const TORSO_TOP = BASE.body.top, TORSO_BOT = BASE.body.bot, TORSO_HALF = 77;
const EYE_GAP = BASE.eyegap;

/* ---------- Move coordinates, never the drawing: strokes keep their width ---------- */
function bake(str, ax, bx, ay, by){
  if(!str) return '';
  const X=v=>ax*v+bx, Y=v=>ay*v+by, f=v=>(+v).toFixed(1);
  const pathD = d => { const toks=d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g)||[]; let cmd='',i=0; const out=[];
    for(const t of toks){
      if(/[A-Za-z]/.test(t)){ cmd=t; i=0; out.push(t); continue; }
      const v=+t, up=cmd===cmd.toUpperCase();
      if(cmd==='H'||cmd==='h') out.push(f(up?X(v):ax*v));
      else if(cmd==='V'||cmd==='v') out.push(f(up?Y(v):ay*v));
      else { out.push(f(i%2===0?(up?X(v):ax*v):(up?Y(v):ay*v))); i++; }
    }
    return out.join(' '); };
  const MAP = { path:{d:pathD}, circle:{cx:X,cy:Y}, ellipse:{cx:X,cy:Y,rx:v=>ax*v,ry:v=>ay*v},
                rect:{x:X,y:Y,width:v=>ax*v,height:v=>ay*v} };
  return str.replace(/<(path|circle|ellipse|rect)\b([^>]*)>/g, (all, tag, attrs) => {
    const m = MAP[tag];
    return `<${tag}` + attrs.replace(/(\s)([a-z]+)="([^"]*)"/g, (a, sp, name, val) =>
      m[name] ? `${sp}${name}="${tag==='path' ? m[name](val) : f(m[name](+val))}"` : a) + '>';
  }); }
const move = (str,dx,dy) => bake(str,1,dx,1,dy);
const about = (sx,sy,cx,cy,dx=0,dy=0) => [sx, cx-cx*sx+dx, sy, cy-cy*sy+dy];

/* ---------- Parts: each draws itself around its own origin ---------- */
const onAnchor = (o,x,y,fill) => move(`<path d="${o.d}" fill="${fill}" fill-rule="evenodd"/>`, x-o.o[0], y-o.o[1]);
const glassLayer = (g,p) => `<path d="${g.rim}" fill="${p}" fill-rule="evenodd"/><path d="${g.frame}" fill="${K}" fill-rule="evenodd"/>`;
const EYEWEAR = {
  none: null,
  square: {    // drawn by Martín; lenses cleaned to their outer shape, frame takes the "frames" colour
    side:(x,y,side,p)=>{ const g=BASE.eyewear.square[side<0?'L':'R']; return move(`<path d="${g.frame}" fill="${p.frames}" fill-rule="evenodd"/>`, x-g.o[0], y-g.o[1]); },
    bridge:(xl,xr,y,p)=>{ const b=BASE.eyewear.square.bridge, n0=xl+b.offL, n1=xr+b.offR, k=(n1-n0)/(b.x1-b.x0);
      return bake(`<path d="${b.frame}" fill="${p.frames}" fill-rule="evenodd"/>`, k, n0-b.x0*k, 1, y-b.oy); }
  },
  browline: {   // traced from Kolkov: each lens sits on its eye, the bridge is rebuilt to span the gap
    side:(x,y,side)=>{ const g=BASE.eyewear.browline[side<0?'L':'R']; return move(glassLayer(g,BASE.eyewear.browline.rimColor), x-g.o[0], y-g.o[1]); },
    bridge:(xl,xr,y)=>{ const G=BASE.eyewear.browline, b=G.bridge, n0=xl+b.offL, n1=xr+b.offR, k=(n1-n0)/(b.x1-b.x0);
      return bake(glassLayer(b,G.rimColor), k, n0-b.x0*k, 1, y-b.oy); }
  }
};
const PARTS = {
  eyes: { dot: { draw:(x,y,side)=> onAnchor(BASE.eyes2.dot[side<0?'L':'R'], x, y, K) } },
  eyeliner: { none:null, ...Object.fromEntries(['dash','arc'].map(n=>[n,{ draw:(x,y,side)=> onAnchor(BASE.eyes2[n][side<0?'L':'R'], x, y, K) }])) },
  mouth: { line:{ draw:(x,y)=> onAnchor(BASE.mouth, x, y, K),
                  cig:[BASE.mouth.cig[0]-BASE.mouth.o[0], BASE.mouth.cig[1]-BASE.mouth.o[1]] },
    /* drawn on the template: kept at their offset from the mouth anchor; closed shapes get a dark inside */
    ...Object.fromEntries(Object.entries(BASE.mouths).map(([n,m])=>[n,{
      draw:(x,y)=> move(`${m.fill?`<path d="${m.fill}" fill="#262626"/>`:''}<path d="${m.ink}" fill="${K}" fill-rule="evenodd"/>`, x-m.o[0], y-m.o[1]),
      cig:[m.cig[0]-m.o[0], m.cig[1]-m.o[1]] }])) }
};
const WAITING = ['hat','props'];
const BROWS = { none:null, ...BASE.brows };
/* Suit, after Martín's reference: shirt V, tucked tie, notched lapels, centre seam.
   Everything is painted inside the torso except the lapels, and every edge gets a small
   hand-drawn wobble (fixed seed, so the same suit always looks the same). */
/* hand wobble: a seeded random walk (slow drift + small jitter), not a sine, so it reads as a hand not a wave */
function rng(seed){ let a=seed*9301+49297; return ()=>{ a=(a*9301+49297)%233280; return a/233280; }; }
function wob(pts, closed=true, amp=1.0, seed=1){
  const R=rng(seed), out=[], n=pts.length, segs=closed?n:n-1;
  let drift=0, vel=0;
  for(let i=0;i<segs;i++){
    const [x0,y0]=pts[i], [x1,y1]=pts[(i+1)%n], L=Math.hypot(x1-x0,y1-y0), k=Math.max(1,Math.round(L/5));
    const nx=-(y1-y0)/(L||1), ny=(x1-x0)/(L||1);
    for(let j=0;j<k;j++){
      const f=j/k;
      vel = vel*0.7 + (R()-0.5)*0.9*amp;              // the hand drifts a little...
      drift = Math.max(-amp*1.6, Math.min(amp*1.6, drift*0.85 + vel));
      const jit = (R()-0.5)*0.5*amp;                    // ...and trembles a little
      const taper = Math.min(1, j/1.5, (k-j)/1.5);      // corners and joins stay exactly where they are
      out.push([x0+(x1-x0)*f + nx*(drift+jit)*taper, y0+(y1-y0)*f + ny*(drift+jit)*taper]);
    }
  }
  if(!closed) out.push(pts[n-1]);
  const P=i=>out[closed?(i+out.length)%out.length:Math.max(0,Math.min(out.length-1,i))];
  let d=`M${out[0][0].toFixed(1)} ${out[0][1].toFixed(1)}`;
  for(let i=0;i<(closed?out.length:out.length-1);i++){
    const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
    d+=` C${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d+(closed?' Z':'');
}
const SUIT = (p, withTie=true, ID='') => { const T=TORSO_TOP, J=[200,T+95], mir=pts=>pts.map(([x,y])=>[400-x,y]);
  const lapel=[[171,T-6],[159,T+12],[154,T+27],[164,T+32],[149,T+53],J];            // both lapels end on the same point, where the seam starts
  const V=wob([[166,T-12],[234,T-12],[200,T+90]],true,0.8,3);                         // the tie only shows inside the shirt V: tucked in
  const thin=c=>`stroke="${shade(c)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  return `<path d="${BASE.body.d}" fill="${p.suit}"/>
    <g clip-path="url(#${ID}bodyclip)">
      <clipPath id="${ID}shirtclip"><path d="${V}"/></clipPath>
      <path d="${V}" fill="${p.shirt}"/>
      ${withTie ? `<g clip-path="url(#${ID}shirtclip)">
        <path d="${wob([[197,T+12],[203,T+12],[210,T+60],[205,T+110],[195,T+110],[190,T+60]],true,0.6,7)}" fill="${p.tie}" ${thin(p.tie)}/>
        <path d="${wob([[191,T+3],[209,T+3],[200,T+19]],true,0.4,5)}" fill="${p.tie}" ${thin(p.tie)}/>
      </g>` : ''}
      <path d="${wob(lapel,true,0.9,11)}" fill="${p.suit}" ${thin(p.suit)}/>
      <path d="${wob(mir(lapel),true,0.9,17)}" fill="${p.suit}" ${thin(p.suit)}/>
      <path d="${wob([J,[200,BASE.body.bot+4]],false,0.9,23)}" ${thin(p.suit)} fill="none"/>
    </g>
    <path d="${BASE.body.d}" fill="none" stroke="${shade(p.suit)}" stroke-width="${LW}" stroke-linejoin="round"/>`; };
const OUTFITS = { none:null, suit:(p,ID)=>SUIT(p,true,ID), 'suit-open':(p,ID)=>SUIT(p,false,ID) };
const NOSES = Object.fromEntries(Object.entries(BASE.noses).map(([n,o])=>[n,(x,y)=> onAnchor(o,x,y,K)]));
const HAIRS = { none:null, ...BASE.hair };
const FACIAL = BASE.facial;
export const MULTI = ['extras','facial'];
/* a face carries one of these at most; the page lists them as their own "Mustache" part */
export const STACHE = ['mustache','brush'];
const EXTRA_GREY = '#c4c4c4';   // wrinkles and marks read as shading, not ink
/* outlines of hair are a darker shade of the hair itself, never black */
const shade = (hex, k=0.62) => '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*k).toString(16).padStart(2,'0')).join('');
const EXTRAS = Object.keys(BASE.extras);
export const SHAPES = [
  {key:'headW', label:'Head width', min:.92, max:1.1},
  {key:'headH', label:'Head height', min:.9, max:1.08},
  {key:'bodyW', label:'Body width', min:.75, max:1.4},
  {key:'bodyH', label:'Body height', min:.85, max:1.12},
];
export const COLORS = ['skin','hair','facial','frames','outfit','suit','shirt','tie'];
/* sampled from Martín's chart of Susian leaders (1978-2009) */
export const SWATCHES = {
  skin:   [['White','#ffffff']],
  hair:   [['Serec','#bd8530'],['Razol','#5c4b43'],['Nozeslawna, Tessan','#4d1100'],['Lasmanna','#c3c3c3'],
           ['Black','#141210'],['Chestnut','#6b4a2e'],['Blonde','#e2c275'],['Ginger','#b5532a'],['White','#f2f2f2'],['Slate','#7a808a']],
  facial: [['Serec','#bd8530'],['Razol','#5c4b43'],['Nozeslawna, Tessan','#4d1100'],['Lasmanna','#c3c3c3'],
           ['Black','#141210'],['Chestnut','#6b4a2e'],['Blonde','#e2c275'],['Ginger','#b5532a'],['White','#f2f2f2'],['Slate','#7a808a']],
  outfit: [['White','#ffffff'],['Light grey','#d9d9d9'],['Sand','#d8c7a3'],['Olive','#5b6b3a'],['Rust','#a4452c'],['Teal','#1f6f78'],['Plum','#5b2a52'],['Charcoal','#2b2b2b']],
  suit:   [['Serec','#09135e'],['Nozeslawna','#02051a'],['Razol, Tessan','#0c0c0c'],['Lasmanna','#333333'],
           ['Brown','#4a3322'],['Burgundy','#4e0f1c'],['Forest','#12301f'],['Slate','#3c4656'],['Beige','#b8a98a'],['Light grey','#8f949c']],
  shirt:  [['Serec, Lasmanna','#ceedf4'],['Razol, Tessan','#ebebeb'],['Cream','#f6ecd2'],['Pale pink','#f4d6d8'],['Mint','#d4eedd'],['Lavender','#dcd6f0'],['Sky','#a9cbe8'],['Black','#161616']],
  tie:    [['Serec','#ed1c24'],['Tessan','#c40005'],['Razol','#00a2e8'],['Navy','#10205e'],['Gold','#d9a521'],['Green','#1f7a3d'],['Purple','#6a2c91'],['Black','#111111'],['Orange','#e8731a'],['Grey','#8a8a8a']],
  frames: [['Razol','#5b4900'],['Black','#111111'],['Tortoise','#6a3b17'],['Silver','#b9bec6'],['Gold','#c9a227'],['Red','#a3202a'],['Blue','#254a9c']]
};
export const DEFAULT_SPEC = { outfit:'none', brows:'none', eyes:'dot', eyeliner:'none', nose:'hook', mouth:'line', hair:'none', eyewear:'none', extras:[], facial:[], shape:{headW:1,headH:1,bodyW:1,bodyH:1}, palette:{skin:'#ffffff', hair:'#6b4a2e', facial:'#6b4a2e', frames:'#41230a', outfit:'#ffffff', suit:'#09135e', shirt:'#ceedf4', tie:'#ed1c24'} };

/* ---------- Compose ---------- */
export function compose(spec, { anchors=false, id='p', frame='full' } = {}){
  const s=normalizeSpec(spec), showAnchors=anchors, ID=String(id).replace(/[^A-Za-z0-9_-]/g,'')+'-';
  const p=s.palette, sh=s.shape;
  const grow=(sh.bodyH-1)*(TORSO_BOT-TORSO_TOP);            // torso grows upward; feet stay on the ground
  const BD=about(sh.bodyW, sh.bodyH, 200, TORSO_BOT);
  const UP=about(sh.headW, sh.headH, 200, CHIN, 0, -grow);
  const upY=y=>CHIN+(y-CHIN)*sh.headH-grow;
  const gap=EYE_GAP*sh.headW, eyeY=upY(200), xl=200-gap/2, xr=200+gap/2;
  const A = { eyeL:[xl,eyeY], eyeR:[xr,eyeY], browL:[xl,eyeY-15], browR:[xr,eyeY-15],
              nose:[200,upY(222)], mouth:[200,upY(264)], hat:[200,upY(HEAD.cy-HEAD.ry*0.55)] };
  const M=PARTS.mouth[s.mouth]; A.cig=[A.mouth[0]+M.cig[0], A.mouth[1]+M.cig[1]];
  A.brow=[200,eyeY-15]; A.cheekL=[xl,A.mouth[1]]; A.cheekR=[xr,A.mouth[1]];
  A.chin=[200, CHIN-grow];
  /* three kinds of hair: 'clip' sits inside the head, 'volume' is drawn over it, 'long' adds a back layer behind it */
  const HR = HAIRS[s.hair];
  /* outer silhouette of hair = body line weight; lines that fall over the face (bangs) keep Martín's thinner weight */
  /* one continuous fill, then the outline in two weights: body weight outside the head, Martín's thinner weight over the face */
  const hFill = d => bake(`<path d="${d}" fill="${p.hair}"/>`, ...UP);
  const hLine = (d,w) => bake(`<path d="${d}" fill="none" stroke="${shade(p.hair)}" stroke-width="${w}" stroke-linejoin="round"/>`, ...UP);
  const headIn  = `<clipPath id="${ID}hc">${bake(`<path d="${HEAD.d}"/>`, ...UP)}</clipPath>`;
  const headOut = `<mask id="${ID}ho" maskUnits="userSpaceOnUse" x="-40" y="-40" width="480" height="770"><rect x="-40" y="-40" width="480" height="770" fill="#fff"/>${bake(`<path d="${HEAD.d}" fill="#000"/>`, ...UP)}</mask>`;
  const hairBack = HR && HR.kind==='long' ? hFill(HR.back)+hLine(HR.back, LW) : '';
  const hairClip = HR && HR.kind==='clip' ? `<g clip-path="url(#${ID}hc)">${hFill(HR.d)}${hLine(HR.d, HR.sw)}${HR.detail ? bake(`<path d="${HR.detail}" fill="${shade(p.hair)}"/>`, ...UP) : ''}</g>` : '';
  const hairFront = HR && HR.kind==='long' ? `${hFill(HR.d)}<g clip-path="url(#${ID}hc)">${hLine(HR.d, HR.sw)}</g>` : '';
  const hairVolume = HR && HR.kind==='volume' ? `${hFill(HR.d)}<g mask="url(#${ID}ho)">${hLine(HR.d, LW)}</g><g clip-path="url(#${ID}hc)">${hLine(HR.d, HR.sw)}</g>` : '';
  /* long hair: the head outline disappears under the fringe, so hair flows into the back layer */
  const outlineMask = HR && HR.kind==='long' ? `<mask id="${ID}om" maskUnits="userSpaceOnUse" x="-40" y="-40" width="480" height="770"><rect x="-40" y="-40" width="480" height="770" fill="#fff"/>${bake(`<path d="${HR.d}" fill="#000" stroke="#000" stroke-width="7"/>`, ...UP)}</mask>` : '';
  const facial = s.facial.map(n=>{ const f=FACIAL[n], [x,y]=A[f.anchor];
    return move(`<path d="${f.fill}" fill="${p.facial}"/><path d="${f.ink}" fill="${shade(p.facial)}" fill-rule="evenodd"/>`, x-f.o[0], y-f.o[1]); }).join('');
  const extras = s.extras.map(n=> BASE.extras[n].map(pc=> onAnchor(pc, ...A[pc.anchor], EXTRA_GREY)).join('')).join('');
  const handDx=(sh.bodyW-1)*TORSO_HALF, handDy=-grow*0.45;
  const E=PARTS.eyes[s.eyes];
  const dot=(x,y)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#d6336c" stroke="#fff" stroke-width="1.2"/>`;
  const overlay = showAnchors ? `<g>
    <path d="M${(A.browL[0]-26).toFixed(1)} ${A.browL[1].toFixed(1)} L${(A.browR[0]+26).toFixed(1)} ${A.browR[1].toFixed(1)}" stroke="#d6336c" stroke-width="1" stroke-dasharray="3 3" fill="none"/>
    <path d="M${(200-HEAD.rx*sh.headW*0.8).toFixed(1)} ${A.hat[1].toFixed(1)} L${(200+HEAD.rx*sh.headW*0.8).toFixed(1)} ${A.hat[1].toFixed(1)}" stroke="#d6336c" stroke-width="1" stroke-dasharray="3 3" fill="none"/>
    ${[A.eyeL,A.eyeR,A.browL,A.browR,A.nose,A.mouth,A.cig,A.hat,A.chin].map(a=>dot(...a)).join('')}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame==='face' ? `50 ${(32-grow).toFixed(1)} 300 330` : frame==='bust' ? `-20 ${(-75-grow).toFixed(1)} 440 484` : '-40 -40 480 770'}" role="img" aria-label="Portrait">
  <defs>${headIn}${headOut}<clipPath id="${ID}bodyclip">${bake(`<path d="${BASE.body.d}"/>`, ...BD)}</clipPath></defs>
  ${hairBack}
  ${bake(`<path d="${BASE.legs}" ${ST()} fill="none"/>`, ...about(Math.sqrt(sh.bodyW),1,200,0))}
  ${move(`<path d="${BASE.handL}" fill="${p.skin}" ${ST()}/>`, -handDx, handDy)}
  ${move(`<path d="${BASE.handR}" fill="${p.skin}" ${ST()}/>`, handDx, handDy)}
  ${ OUTFITS[s.outfit] ? bake(OUTFITS[s.outfit](p,ID), ...BD)
    : bake(`<path d="${BASE.body.d}" fill="${p.outfit}" ${ST()}/>`, ...BD) }
  ${bake(`<path d="${HEAD.d}" fill="${p.skin}"/>`, ...UP)}
  ${hairClip}
  ${outlineMask}<g ${outlineMask?`mask="url(#${ID}om)"`:''}>${bake(`<path d="${HEAD.d}" fill="none" ${ST()}/>`, ...UP)}</g>
  ${hairFront}
  ${extras}
  ${E.draw(xl,eyeY,-1)}${E.draw(xr,eyeY,1)}
  ${PARTS.eyeliner[s.eyeliner] ? PARTS.eyeliner[s.eyeliner].draw(xl,eyeY,-1)+PARTS.eyeliner[s.eyeliner].draw(xr,eyeY,1) : ''}
  ${NOSES[s.nose](...A.nose)}
  ${(()=>{ const Bw=BROWS[s.brows]; if(!Bw) return '';
      /* brows sit on the brow line; with glasses on they rise just clear of the frame */
      const EW=BASE.eyewear[s.eyewear]; let lift=0;
      if(EW){ const clear=eyeY+EW.top-3, bottom=A.browL[1]+Math.max(Bw.L.bottom,Bw.R.bottom); lift=Math.max(0,bottom-clear); }
      return ['L','R'].map(sd=>{ const b=Bw[sd], [x,y]=sd==='L'?A.browL:A.browR;
        const art = b.shape ? `<path d="${b.shape}" fill="${p.facial}" stroke="${shade(p.facial)}" stroke-width="2.2" stroke-linejoin="round"/>`
          : `${b.fill?`<path d="${b.fill}" fill="${p.facial}"/>`:''}<path d="${b.ink}" fill="${shade(p.facial, b.fill?0.62:0.45)}" fill-rule="evenodd"/>`;
        return move(art, x-b.o[0], y-lift-b.o[1]); }).join(''); })()}
  ${M.draw(...A.mouth)}
  ${facial}
  ${hairVolume}
  ${EYEWEAR[s.eyewear] ? EYEWEAR[s.eyewear].side(xl,eyeY,-1,p)+EYEWEAR[s.eyewear].side(xr,eyeY,1,p)+EYEWEAR[s.eyewear].bridge(xl,xr,eyeY,p) : ''}
  ${overlay}
</svg>`;
}


export const SLOT_OPTIONS = {
  eyes: Object.keys(PARTS.eyes), eyeliner: Object.keys(PARTS.eyeliner), brows: Object.keys(BROWS),
  nose: Object.keys(NOSES), mouth: Object.keys(PARTS.mouth), hair: Object.keys(HAIRS),
  eyewear: Object.keys(EYEWEAR), outfit: Object.keys(OUTFITS),
  extras: EXTRAS, facial: Object.keys(FACIAL),
};
export const SLOT_ORDER = ['eyes','eyeliner','brows','nose','mouth','hair','facial','eyewear','outfit','extras'];

// Accepts whatever came out of frontmatter and fills gaps with defaults, so a
// half-written or older spec still draws instead of breaking the page.
export function normalizeSpec(raw){
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = { ...DEFAULT_SPEC, shape:{...DEFAULT_SPEC.shape}, palette:{...DEFAULT_SPEC.palette} };
  for (const k of SLOT_ORDER) {
    const opts = SLOT_OPTIONS[k];
    if (MULTI.includes(k)) {
      // the site's frontmatter reader keeps `[a, b]` as a string, so accept both forms
      const v = Array.isArray(r[k]) ? r[k] : (typeof r[k] === 'string' ? r[k].replace(/^\s*\[|\]\s*$/g, '').split(',') : []);
      s[k] = v.map(x => String(x).trim()).filter(x => opts.includes(x));
      if (k === 'facial') { const i = s[k].findIndex(x => STACHE.includes(x)); s[k] = s[k].filter((x, j) => !STACHE.includes(x) || j === i) }
    } else if (r[k] != null) {
      const v = String(r[k]).trim();
      if (opts.includes(v)) s[k] = v;
    }
  }
  for (const x of SHAPES) {
    const v = Number(r.shape?.[x.key]);
    if (Number.isFinite(v)) s.shape[x.key] = Math.min(x.max, Math.max(x.min, v));
  }
  for (const c of COLORS) {
    const v = r.palette?.[c];
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) s.palette[c] = v.trim().toLowerCase();
  }
  return s;
}

// The block to paste into a person article's frontmatter.
export function toYaml(spec){
  const s = normalizeSpec(spec);
  return ['portrait:', ...SLOT_ORDER.map(k => MULTI.includes(k) ? `  ${k}: [${s[k].join(', ')}]` : `  ${k}: ${s[k]}`),
    '  shape:', ...SHAPES.map(x=>`    ${x.key}: ${(+s.shape[x.key]).toFixed(2)}`),
    '  palette:', ...COLORS.map(c=>`    ${c}: "${s.palette[c]}"`)].join('\n');
}
