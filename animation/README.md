# Animation

Animates the site's bowling-pin portraits. Same engine and same parts as the infobox
portraits (`src/portrait/engine.js`), so a newly traced part shows up in both at once.
Separate `package.json`, so the site build never installs the renderer.

## Quick start

```sh
cd animation
npm install                                   # once: installs the resvg renderer
npm run cast                                  # who can be animated (vault specs + placeholders)
npm run draft  -- scenes/lasman-signing.mjs   # 8 key frames on one contact sheet, seconds
npm run render -- scenes/lasman-signing.mjs   # full MP4 in out/
```

Options: `--frames 0,40,90` picks draft frames, `--landmarks` draws every landmark as a pink dot,
`--audio voice.wav@1.5` adds sound starting at 1.5 s. The vault is read from `VAULT_DIR`, or from
`../../dripstao/dripwiki` next to this repo on Martín's PC.

## How it fits together

| File | What it does |
|---|---|
| `../src/portrait/engine.js` | `compose(spec, {anim})` draws one posed frame. `landmarks(spec, anim)` says where everything is. `handOffset()` turns a target point into a hand position. Without `anim` it draws the normal still portrait. |
| `lib/play.mjs` | Plays presets on one character: springs, overshoot, waves, jumps, breathing, blinking. |
| `lib/scene.mjs` | Runs a scene file: places the cast on a set, applies beats and reactions. Browser-safe, so the site can play scenes live later. |
| `lib/render.mjs` | Draft contact sheets and full renders, in parallel across CPU cores, then ffmpeg. |
| `lib/cast.mjs` | Reads every `portrait:` block in the vault, plus `cast-extra.json`. |
| `lib/props.mjs` | Things hands hold: goblet, marker, pen. Placeholder art. |
| `presets/*.json` | Reusable moves: idle, wave, nod, point, shrug, hop, clap, toast. |
| `sets/*.mjs` | Backgrounds with named spots and furniture: `treaty-room`. |
| `scenes/*.mjs` | Scenes, written as data. |
| `cast-extra.json` | Placeholder looks for people with no spec in the vault yet (Cantij, the aides, Kolkov). |

## Landmarks

Every character, every frame, after that frame's lean, head tilt and jump:

`headTop headL headR eyeL eyeR brow nose mouth cig chin neck shoulderL shoulderR chest waist hips sideL sideR restL restR handL handR footL footR ground`

Aim hands at them instead of using raw numbers. Small `dx`/`dy` nudges are the only tuning, and the
same nudge works on every body. A hand is about 25 units in radius, so aim its centre that far clear.

```json
"handR": {"to": "headR", "dx": 40, "dy": -15}
```

## Writing a scene

```js
export default {
  length: 9.5,                                         // seconds
  set: { use: 'treaty-room', flags: ['Susia', 'Confia', 'Susia', 'Confia', 'Susia'] },
  cast: {
    lasmanna: { who: 'Grawolja Lasmanna', spot: 'seatL', props: { R: 'pen' },
                reactions: [{ always: 'scowl' }, { on: 'flash', do: 'flinch' }] },
  },
  events: { flash: { bursts: [[0.4, 6.25]] } },
  beats: [
    { who: 'lasmanna', t: [1.4, 3.5], sign: 'docL', hand: 'R', part: [0, .55] },
    { who: 'lasmanna', t: [3.7, 4.8], hand: 'L', to: 'brow', dx: -12, dy: -18 },
  ],
}
```

Beat kinds, each over a time window `t: [from, to]` with easing (`in`, `out`, default 0.25 s):

- `hand` + `to`: one of its own landmarks, a scene point `[x, y]`, another character's landmark
  `{ who, to }` (that character must be listed earlier in `cast`), or `{ nib: 'docL' }` (where the pen last wrote).
- `sign`: the pen follows the signature on a document of the set; `part` signs just a portion.
- `look`: `{ tilt, lean, hx, hy, brow }` blended in and out.
- `face`: `{ mouth, eyes: 'happy' | 'closed' | 'squeeze' }`.
- `nod`: small nods across the window.

Presets per character: `presets: [{ preset: 'wave', at: 2, side: 'L', size: .6, speed: .8 }]`.
Reactions: `{ always: 'scowl' | 'smile' }`, `{ on: 'flash', do: 'flinch' | 'grin' | 'blink', from, to }`.

## Known limits

- Hands are round mittens: rotating them shows nothing, and pointing, fists and holding need drawn hand poses.
- Characters only face forward; stage conversations with lean and head tilt toward each other.
- The `pill` mouth reads as chewing on loud lines; talking mouths are still to be drawn.
- Props (goblet, marker, pen) are Claude's placeholder drawings.
