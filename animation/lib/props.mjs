// Hand props, drawn around the hand centre (0,0); the hand is drawn on top, so it grips them.
// PLACEHOLDER ART by Claude in the portrait line weights, until Martín draws real ones.
// Each exports its tip/contact point where the scene needs one (pen nib, marker tip).


export function goblet(f, v={}){
  const slosh = Math.max(-5, Math.min(5, (v.ry||0)*0.5));          // foam rises when the glass moves up fast
  const k=f%3;                                                      // foam edge boils on threes like the suit
  const fy=-100-Math.max(0,-slosh)*0.6;
  return `<g transform="scale(1.25)" stroke="#000" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="0" cy="16" rx="21" ry="6" fill="#dfeaee" stroke-width="3.2"/>
    <path d="M-4 -36 L-4 14 L4 14 L4 -36 Z" fill="#dfeaee" stroke-width="3.2"/>
    <path d="M-33 -100 L33 -100 C33 -60 23 -38 0 -36 C-23 -38 -33 -60 -33 -100 Z" fill="#e9a52b" stroke-width="4"/>
    <path d="M-22 -92 C-22 -66 -16 -52 -8 -46" fill="none" stroke="#f6d27a" stroke-width="4"/>
    <path d="M-35 -100 C-${38+k} ${fy-12} -24 ${fy-20} -15 ${fy-11} C-9 ${fy-25+k} 9 ${fy-25} 13 ${fy-12} C${23+k} ${fy-21} ${39} ${fy-12} 35 -100 Z" fill="#fffdf6" stroke-width="4"/>
  </g>`;
}
// Felt marker held pointing left; the tip is at (-46, 4) from the hand centre.
export const MARKER_TIP=[-46,4];
export function marker(){
  return `<g stroke="#000" stroke-linejoin="round" stroke-width="4">
    <path d="M-36 -3 L-46 4 L-36 9 Z" fill="#111"/>
    <path d="M-36 -6 L-12 -6 L-12 12 L-36 12 Z" fill="#111"/>
    <path d="M-12 -7 L22 -7 L22 13 L-12 13 Z" fill="#f2f2f2"/>
  </g>`;
}
// Fountain pen held point-down to the left; the nib is at PEN_TIP from the hand centre.
export const PEN_TIP=[-22,30];
export function pen(){
  return `<g stroke="#000" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-22 30 L-17 18 L-12 22 Z" fill="#d9b54a" stroke-width="2.5"/>
    <path d="M-17 18 L14 -34 L22 -29 L-12 22 Z" fill="#1a1a1a" stroke-width="3.5"/>
    <path d="M8 -24 L12 -31" stroke="#d9b54a" stroke-width="3"/>
  </g>`;
}
export const PROPS = { goblet, marker: () => marker(), pen: () => pen() }
