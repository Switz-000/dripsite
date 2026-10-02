// Lasmanna on her predecessors, 2009. The captions are her words, verbatim, from her interview with
// the Five of Goretopol' (vault: 02 - Confia/06 - People/Grawolja Lasmanna.md, Quotes).
// STAGING IS NOT CANON: the gallery, the walk and the living portraits illustrate the quote.
// Baljueewić = Japlen Baljueewic Razol; Kateljuba = Katerina Armoljubca Nožeslawna (links in the quote).
export default {
  title: 'Lasmanna on her predecessors',
  length: 16.8,
  set: { use: 'gallery', names: ['Boris Serec', 'Japlen Razol', 'Katerina Armoljubca Nožeslawna'] },
  cast: {
    serec:    { who: 'Boris Serec', spot: 'frameL' },
    razol:    { who: 'Japlen Razol', spot: 'frameC' },
    kan:      { who: 'Katerina Armoljubca Nožeslawna', spot: 'frameR' },
    lasmanna: { who: 'Grawolja Lasmanna', at: [1390, 700], layer: 'front', reactions: [{ always: 'scowl' }] },
  },
  captions: [
    { t: [0.2, 2.6],   style: 'title', text: "Grawolja Lasmanna\nInterview with the Five of Goretopol', 2009" },
    { t: [2.4, 5.0],   text: 'Serec, of course, was corrupted to the core,' },
    { t: [5.2, 8.6],   text: "but Baljueewić could have cut the ragged-sleeves' main paypigs, opened up trade, ended Sturdy Industry," },
    { t: [8.8, 11.0],  text: "but he preferred reliance on Serec's popularity from those unsustainable practices..." },
    { t: [11.2, 13.4], text: "Even Kateljuba didn't cut it fully, for Armotos' sake!" },
    { t: [13.6, 16.6], text: 'No, as for me... I would rather do what is necessary.' },
  ],
  beats: [
    // she walks in and stops between Serec and Razol
    { who: 'lasmanna', t: [0, 2.3], walk: 440 },
    // "Serec, of course, was corrupted to the core": points up at him; his smile goes
    { who: 'lasmanna', t: [2.5, 4.9],   hand: 'L', to: { who: 'serec', to: 'headR' }, dx: 70, dy: 30, in: .3 },
    { who: 'lasmanna', t: [2.5, 4.9],   look: { tilt: -4, lean: -1 } },
    { who: 'serec',    t: [0, 3.4],     face: { mouth: 'smile' } },
    { who: 'serec',    t: [3.4, 5.6],   look: { lean: -3, tilt: -5, hy: -2, brow: 5 }, face: { mouth: 'wavy' } },
    // on to Razol
    { who: 'lasmanna', t: [5.0, 6.1],   walk: 840 },
    { who: 'lasmanna', t: [6.2, 8.5],   hand: 'L', to: { who: 'razol', to: 'headR' }, dx: 70, dy: 30, in: .3 },
    { who: 'lasmanna', t: [6.2, 8.5],   look: { tilt: -4, lean: -1 } },
    { who: 'lasmanna', t: [6.6, 7.6],   nod: 1 },
    { who: 'razol',    t: [5.6, 8.6],   look: { tilt: 3, hx: 2 }, face: { mouth: 'short' } },
    // "...from those unsustainable practices": a sideways wave back at Serec; Serec looks pleased with himself
    { who: 'lasmanna', t: [8.9, 10.8],  hand: 'L', to: 'shoulderL', dx: -70, dy: -50, in: .3 },
    { who: 'lasmanna', t: [8.9, 10.8],  look: { tilt: -6, hx: -4 } },
    { who: 'serec',    t: [9.2, 10.9],  face: { mouth: 'smile', eyes: 'happy' } },
    { who: 'serec',    t: [9.4, 10.6],  nod: 1 },
    { who: 'razol',    t: [8.8, 11.0],  look: { tilt: -4, hx: -3 } },
    // "Even Kateljuba didn't cut it fully": she rounds on KAN, who glares back
    { who: 'lasmanna', t: [11.3, 13.2], hand: 'R', to: { who: 'kan', to: 'headL' }, dx: -70, dy: 30, in: .3 },
    { who: 'lasmanna', t: [11.3, 13.2], look: { tilt: 5, lean: 1.5, brow: 4 } },
    { who: 'lasmanna', t: [12.6, 13.3], face: { mouth: 'open' } },
    { who: 'kan',      t: [11.6, 16.8], look: { tilt: -4, hx: -3, brow: 7 }, face: { mouth: 'wavy' } },
    // "No, as for me...": centre stage, hand on her chest, every portrait turns to her
    { who: 'lasmanna', t: [13.3, 14.3], walk: 640 },
    { who: 'lasmanna', t: [14.3, 16.8], hand: 'R', to: 'chest', dx: 25, dy: 0, in: .35 },
    { who: 'lasmanna', t: [14.3, 16.8], look: { hy: -3, brow: -3 } },
    { who: 'serec',    t: [13.8, 16.8], look: { tilt: 4, lean: 1.5, hx: 3 }, face: { mouth: 'wavy' } },
    { who: 'razol',    t: [13.8, 16.8], look: { hy: 4, brow: 3 } },
  ],
}
