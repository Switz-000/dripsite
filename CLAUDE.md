# Dripsite: notes for Claude

The site for the Dripstao wiki (live at https://dripsite.vercel.app). Articles live in the
**dripwiki** vault (GitHub `Switz-000/dripwiki`; on Martín's PC `/home/martin/tudo/dripstao/dripwiki`).
This repo is only code. Read `README.md` for how the build works.

## Commands

```
npm install
npm run dev                                   # dev server
VAULT_DIR=<path to dripwiki> npm run build    # full build + prerender (without VAULT_DIR it downloads the vault)
cd animation && npm install                   # animation tools (separate package); the rest run from animation/
npm run check:portraits                       # every portrait identical to origin/main? (exit 1 if not)
npm run test:player                           # builds the site and drives /dev/animate in Chromium
npm run check -- scenes/<scene>.mjs           # a scene's problems in words
npm run test:words                            # word-timing converter
```

## Rules

- **Work on a branch and open a pull request; Martín merges.** Never push to `main`. From a Claude Code
  session, `gh pr create` fails (GraphQL is blocked): use `gh api repos/Switz-000/dripsite/pulls -f title=... -f head=... -f base=main -f body=...`.
- **Portraits must not change by accident.** Any change to `src/portrait/engine.js` or `parts.json` needs
  `npm run check:portraits` (in `animation/`) to report 0 changed, unless the change is meant to alter portraits.
  Animation-only engine features go behind the `anim` argument of `compose()`.
- **Client-only routes need a rewrite in `vercel.json`** to `/spa.html` (like `/dev/portraits` and
  `/dev/animate`), or a refresh on that URL is a 404 on Vercel.
- **Keep dev tools out of the reader's bundle:** load dev pages with `React.lazy` and check that
  `dist/assets/index-*.js` does not contain their code after a build.
- **Changes to `/dev/animate` or `src/animate/` need `npm run test:player` to pass.** It is how the
  player gets tested; it caught a dead-keyboard bug and a phone overflow that eyeballing missed.
- **Run `npm run build` with the vault before opening a PR.** It must end with "482 of 482 articles" (or
  whatever the current article count is) and no prerender errors.
- Code under `animation/lib/` that the site imports must stay browser-safe (no `fs` or Node imports).

## Map

| Where | What |
|---|---|
| `src/config.js` | Site text, featured articles, crawlers, theme, IndexNow key |
| `src/utils/github.js` | `REPO_CONFIG` (which vault repo the site reads), tree and file fetching |
| `scripts/prerender.mjs`, `scripts/vault.mjs` | Build-time vault download and static pages |
| `src/portrait/` | Character portraits: `engine.js`, `parts.json` (traced from Martín's drawings), vault read/write |
| `src/pages/PortraitsPage.jsx` | `/dev/portraits` composer (dev tools) |
| `src/pages/AnimatePage.jsx`, `src/animate/` | `/dev/animate` live animation player (dev tools) |
| `animation/` | Animation library, presets, sets, scenes, renderer. Start with `animation/README.md`. |

## Style

- Talk to Martín as "you". No em dashes anywhere: code comments, docs, commit messages, PR text.
- The vault is canon for the Dripstao world. Never write to it unless Martín asks, and flag anything
  a scene or page implies that the vault doesn't say.
