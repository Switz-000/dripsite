# Animation

Animates the site's bowling-pin portraits. Same engine and same parts as the infobox
portraits (`src/portrait/engine.js`), so a newly traced part shows up in both at once.
Separate `package.json`, so the site build never installs the renderer.

## Quick start

```sh
cd animation
npm install                                   # once: installs the resvg renderer
npm run cast                                  # who can be animated (vault specs + placeholders)
npm run check  -- scenes/lasman-signing.mjs   # problems in words: hands in furniture, heads off frame, jumps, bad beats
npm run draft  -- scenes/lasman-signing.mjs   # 8 key frames on one contact sheet, seconds
npm run render -- scenes/lasman-signing.mjs   # full MP4 in out/
```

Draft options: `--frames 0,40,90` picks frames, `--small` makes a quarter-size sheet, `--focus lasmanna`
crops every cell to one character, `--landmarks` draws every landmark as a pink dot.
Render options: `--audio voice.wav@1.5` adds sound starting at 1.5 s.

Safety checks, run before a pull request that touches them:

```sh
npm run check:portraits          # every vault portrait (and 300 random ones) identical to origin/main? exit 1 if not
npm run test:player              # builds the site and drives /dev/animate in Chromium (19 checks); --export adds an MP4
npm run test:words               # the word-timing converter
```

`test:player` needs a Chromium for playwright-core: run `npx playwright install chromium` once on a PC.

## Word timings for voice lines

```sh
npm run words -- ~/tudo/projects/claude-space/kolkov-2009/audio/lines/scene_01 --prompt "Kolkov, Raroska, Troli Ustaras"
```

Writes `<take>.words.json` next to every take (skipping `raw/` folders and takes already done): each word
with its start and end in seconds. It uses the whisper.cpp build and large-v3 model in
`claude-space/tools/whisper.cpp` on the GPU through Vulkan (`--whisper <folder>` or `WHISPER_CPP` to use
another). `--prompt` lists names so whisper spells them right; `--force` redoes everything. The vault is read from `VAULT_DIR`, or from
`../../dripstao/dripwiki` next to this repo on Martín's PC.

## Working in the browser

Turn on **dev tools** (bottom of the sidebar) and open **Animation** (`/dev/animate`). It plays any scene in
`animation/scenes/` live, with the same engine the command line uses.

- **Play and step:** space plays, arrows step a frame, shift+arrows a second. The timeline shows each
  character's beats (click one to jump to it and select its line) and the camera flashes.
- **Edit:** change the scene file in the editor and the stage re-runs. Errors appear under the editor.
  Edits are kept in this browser until you save, so a refresh never loses work. **Revert** goes back to the repo version.
- **Drag to fix:** pause, then drag a hand. The beat driving that hand gets new `dx`/`dy` (or a new
  `to: [x, y]` point). If no beat drives the hand at that moment, a new one-second beat is added. Signing beats
  follow the ink and can't be dragged. Tick **Landmarks** to see every landmark (hover one for its name).
- **New:** type a name, pick a starting point (one character, two people talking, signing at a table) and press New.
- **Add beat:** pick a character and a snippet (hand above the head, shield the eyes, hand on someone's
  shoulder, look at someone, lean in, recoil, nod, smile...) and it is added at the playhead, one second long.
- **Check:** the checker runs after every change. Problems are listed under the timeline (click one to jump
  there) and marked on the character's lane in red (errors) or yellow (warnings).
- **Save to GitHub:** commits `animation/scenes/<name>.mjs` to dripsite with the same token the portrait
  composer uses (it needs write access to dripsite). The site redeploys with it.
- **Export MP4:** silent, encoded in the browser at exact 24 fps. Chrome and Edge make H.264; browsers
  without an H.264 encoder fall back to VP9 or AV1 in the same .mp4. For sound, use `npm run render -- ... --audio`.

The editor patches beats line by line, so keep **one beat per line** inside `beats: [ ... ]`.

## How it fits together

| File | What it does |
|---|---|
| `../src/portrait/engine.js` | `compose(spec, {anim})` draws one posed frame. `landmarks(spec, anim)` says where everything is. `handOffset()` turns a target point into a hand position. Without `anim` it draws the normal still portrait. |
| `lib/play.mjs` | Plays presets on one character: springs, overshoot, waves, jumps, breathing, blinking. |
| `lib/scene.mjs` | Runs a scene file: places the cast on a set, applies beats and reactions. Browser-safe. |
| `lib/check.mjs` | The scene checker (browser-safe); `lib/check-cli.mjs` is `npm run check`. |
| `lib/render.mjs`, `lib/load-node.mjs` | Draft contact sheets and full renders, in parallel across CPU cores, then ffmpeg. |
| `tools/` | `check-portraits.mjs`, `test-player.mjs`, `word-timings.mjs`, `test-words.mjs` |
| `lib/cast.mjs` | Reads every `portrait:` block in the vault, plus `cast-extra.json`. `lib/portrait-block.mjs` is the shared reader. |
| `../src/pages/AnimatePage.jsx`, `../src/animate/` | The `/dev/animate` page: loading, scene text patching, MP4 export, saving. |
| `lib/props.mjs` | Things hands hold: goblet, marker, pen. Placeholder art. |
| `presets/*.json` | Reusable moves: idle, wave, nod, point, shrug, hop, clap, toast. |
| `sets/*.mjs` | Backgrounds with named spots and furniture: `treaty-room`, `studio` (plain, spots left, centre, right), `gallery` (three framed portraits, spots frameL, frameC, frameR, floor; `names` for the plates). |
| `scenes/*.mjs` | Scenes, written as data: `lasman-signing`, `preset-reel` (every preset on two bodies), `lasmanna-predecessors` (her 2009 quote, captions verbatim from the vault). |
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
- `walk: x`: walks to scene x over the window, stepping and waddling.

Scene-level extras:

- `captions: [{ t: [from, to], text }]` for subtitles, or `style: 'title'` with `'Name\nsecond line'` for a lower-third card.
- A cast member with `layer: 'front'` is drawn over the set's foreground (someone walking past picture frames).
- A spot with `clip: [x0, y0, x1, y1]` keeps its character inside that rectangle (a living portrait in a frame);
  the checker ignores that character's hands when they are outside it.

Presets per character: `presets: [{ preset: 'wave', at: 2, side: 'L', size: .6, speed: .8 }]`.
Reactions: `{ always: 'scowl' | 'smile' }`, `{ on: 'flash', do: 'flinch' | 'grin' | 'blink', from, to }`.

## Known limits

- Hands are round mittens: rotating them shows nothing, and pointing, fists and holding need drawn hand poses.
- Characters only face forward; stage conversations with lean and head tilt toward each other.
- The `pill` mouth reads as chewing on loud lines; talking mouths are still to be drawn.
- Props (goblet, marker, pen) are Claude's placeholder drawings.
