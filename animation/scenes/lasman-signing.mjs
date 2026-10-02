// Signing of the Lasman Economic Initiative (Susia-Confia customs union).
// Lasmanna signs for Confia, hating every camera flash; Cantij signs for Susia and loves them.
// CANON NOTES: Cantij and both aides are placeholders (see cast-extra.json). The vault gives three
// signing dates (1995 in Susia.md, 2000 in Filevir Matri, ratification 1999 in Grawolja Lasmanna),
// so the scene shows no date.
export default {
  title: 'Signing of the Lasman Economic Initiative',
  length: 9.5,
  set: { use: 'treaty-room', flags: ['Susia', 'Confia', 'Susia', 'Confia', 'Susia'] },
  cast: {
    lasmanna: { who: 'Grawolja Lasmanna', spot: 'seatL', nudge: [0, -22], props: { R: 'pen' },
                reactions: [{ always: 'scowl' }, { on: 'flash', do: 'flinch' }] },
    cantij:   { who: 'Cantij', spot: 'seatR', props: { L: 'pen' },
                reactions: [{ always: 'smile' }, { on: 'flash', do: 'grin', from: 6.3 }] },
    aideL:    { who: 'Aide (glasses)', spot: 'standL', reactions: [{ on: 'flash', do: 'blink' }] },
    aideR:    { who: 'Aide (tall)', spot: 'standR', reactions: [{ on: 'flash', do: 'blink' }] },
  },
  events: { flash: { bursts: [[0.4, 6.25]], extra: [6.67, 6.79, 7, 7.08, 7.33, 7.54, 7.71, 8, 8.21, 8.5] } },
  beats: [
    // Lasmanna: two goes at the signature, shields her eyes in between, blocks the cameras at the end
    { who: 'lasmanna', t: [0.3, 3.67],  hand: 'L', to: [352, 500] },
    { who: 'lasmanna', t: [1.42, 3.5],  sign: 'docL', hand: 'R', part: [0, .55] },
    { who: 'lasmanna', t: [1.42, 3.5],  look: { tilt: 5, lean: 2, hy: 6 } },
    { who: 'lasmanna', t: [3.5, 5.17],  hand: 'R', to: { nib: 'docL' }, dy: -14 },
    { who: 'lasmanna', t: [3.67, 4.75], hand: 'L', to: 'brow', dx: -12, dy: -18, in: .3 },
    { who: 'lasmanna', t: [4.75, 6.83], hand: 'L', to: [352, 500] },
    { who: 'lasmanna', t: [5.17, 6.25], sign: 'docL', hand: 'R', part: [.55, 1] },
    { who: 'lasmanna', t: [5.17, 6.25], look: { tilt: 5, lean: 2, hy: 6 } },
    { who: 'lasmanna', t: [6.25, 9.5],  hand: 'R', to: { nib: 'docL' }, dx: 30, dy: 4 },
    { who: 'lasmanna', t: [6.83, 9.5],  hand: 'L', to: 'mouth', dx: 12, dy: 18, in: .2 },
    { who: 'lasmanna', t: [6.83, 9.5],  look: { tilt: -4 }, face: { mouth: 'open' } },
    // Cantij: one steady signature, then looks up into the flashes and nods to the press
    { who: 'cantij', t: [0.3, 9.5],   hand: 'R', to: [948, 500] },
    { who: 'cantij', t: [1.67, 6.17], sign: 'docR', hand: 'L' },
    { who: 'cantij', t: [1.67, 6.17], look: { tilt: -4, hy: 6, lean: -1.5 } },
    { who: 'cantij', t: [6.17, 9.5],  hand: 'L', to: { nib: 'docR' }, dx: -26, dy: 6 },
    { who: 'cantij', t: [6.4, 9.5],   look: { hy: -2, brow: -5 } },
    { who: 'cantij', t: [7.1, 8.2],   nod: 1 },
    // aides: one leans over Lasmanna's folder, the other rests a hand on Cantij's shoulder
    { who: 'aideL', t: [0, 9.5], look: { lean: 3.5, tilt: 7, hx: 4, hy: 4, brow: 2 }, in: 0 },
    { who: 'aideL', t: [0, 9.5], hand: 'R', to: [236, 478], in: 0 },
    { who: 'aideR', t: [0, 9.5], look: { lean: -2.5, tilt: -6, hy: 3, hx: -3 }, in: 0 },
    { who: 'aideR', t: [0, 9.5], hand: 'L', to: { who: 'cantij', to: 'shoulderR' }, dx: 0, dy: 0, in: 0 },
    { who: 'aideR', t: [7.3, 8.3], face: { mouth: 'smile' } },
  ],
}
