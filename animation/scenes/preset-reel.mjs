// Every preset on two very different bodies (stout Serec, slight Lasmanna), to check that
// moves aimed at landmarks land right on any build. Lasmanna mirrors to her left hand.
export default {
  title: 'Preset reel',
  length: 15,
  set: { use: 'studio' },
  cast: {
    serec:    { who: 'Boris Serec', spot: 'left', presets: [
      { preset: 'idle' }, { preset: 'wave', at: 0.5 }, { preset: 'nod', at: 3.2 }, { preset: 'point', at: 4.5 },
      { preset: 'shrug', at: 6.2 }, { preset: 'clap', at: 8.2 }, { preset: 'hop', at: 10.6 }, { preset: 'toast', at: 13 } ] },
    lasmanna: { who: 'Grawolja Lasmanna', spot: 'right', presets: [
      { preset: 'idle' }, { preset: 'wave', at: 0.5, side: 'L' }, { preset: 'nod', at: 3.2 }, { preset: 'point', at: 4.5, side: 'L' },
      { preset: 'shrug', at: 6.2 }, { preset: 'clap', at: 8.2 }, { preset: 'hop', at: 10.6, size: .6 }, { preset: 'toast', at: 13, side: 'L' } ] },
  },
  beats: [
  ],
}
