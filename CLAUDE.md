# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The website for the Dripstao wiki (live at https://dripsite.vercel.app). This repo is only code. The articles live in a separate Obsidian vault, [Switz-000/dripwiki](https://github.com/Switz-000/dripwiki), which the site reads at build time and again in the browser. Which repo it reads is `REPO_CONFIG` in [src/utils/github.js](src/utils/github.js).

## Commands

```sh
npm install
npm run dev                            # Vite dev server (.claude/launch.json runs it on port 5174)
npm run build                          # vite build, then scripts/prerender.mjs; downloads dripwiki into .vault/
VAULT_DIR=../dripwiki npm run build    # same, reading a local copy of the vault instead of downloading
npm run preview                        # serve dist/
npm test                               # node --test test/*.test.mjs
node --test --test-name-pattern="refreshArticle" test/vault.test.mjs   # one test by name
```

Tests use Node's built-in runner, with no extra dependency; so far they cover the vault module ([test/vault.test.mjs](test/vault.test.mjs)), the person record ([test/person.test.mjs](test/person.test.mjs)) and the article types ([test/articleTypes.test.mjs](test/articleTypes.test.mjs)). There is no linter. A full `npm run build` is the check that the prerender still works: it renders every article through the real components, so a component that breaks under server rendering fails there.

Animation tool (separate package, see [animation/README.md](animation/README.md)):

```sh
cd animation && npm install
npm run cast                                  # who can be animated
npm run draft  -- scenes/lasman-signing.mjs   # contact sheet of key frames
npm run render -- scenes/lasman-signing.mjs   # full MP4 in animation/out/ (needs ffmpeg)
```

It finds the vault from `VAULT_DIR`, then a sibling `dripstao/dripwiki` folder, then `.vault/` left by a site build.

Environment variables: `VAULT_DIR` and `VAULT_TARBALL_URL` (build), `VITE_GITHUB_TOKEN` (optional, raises the browser's GitHub API limit), `VERCEL_ENV=production` (turns on the IndexNow submission).

## Architecture

### One app, rendered twice

The same `<App />` ([src/App.jsx](src/App.jsx)) runs in the browser ([src/main.jsx](src/main.jsx)) and in Node at build time ([src/entry-server.jsx](src/entry-server.jsx)).

`npm run build` runs `vite build`, then [scripts/prerender.mjs](scripts/prerender.mjs), which:

1. loads the vault from disk ([scripts/vault.mjs](scripts/vault.mjs)),
2. compiles `entry-server.jsx` into `.ssr/` with a second Vite build,
3. calls `primeVault(data)` then `render(url)` for `/`, `/wiki`, `/browse`, `/map`, `/chronology` and every article, and writes each as `dist/<url>/index.html` with the data it was built from in a `<script id="preload">`,
4. writes `robots.txt`, `sitemap.xml`, `404.html`, and `spa.html` (the plain shell for routes that aren't prerendered),
5. on production builds, submits changed URLs to IndexNow, tracked through `dist/indexnow.json`.

In the browser, `main.jsx` passes the same preload JSON to `primeVault` before the first render, so the page starts from what is already on screen. The vault module then checks GitHub in the background for vault edits made after the build.

What follows from this:

- **Code shared with the build must run in plain Node.** `scripts/*.mjs` and the tests import `src/config.js`, `src/vault/`, `src/person/record.js`, `src/utils/articleTypes.js`, `src/utils/geo.js`, `src/utils/slugs.js`, `src/utils/github.js` and `src/utils/markdown.js` directly, without Vite. So those files write relative imports with the `.js` ending, and `github.js` reads `import.meta.env?.VITE_GITHUB_TOKEN` with `?.`. Anything else the prerender needs from `src/` goes through the exports of `entry-server.jsx`.
- **Components must render without a browser.** No `window`, `document` or `localStorage` during render; read them in an effect (see [src/hooks/useDevTools.js](src/hooks/useDevTools.js)).
- **The build and the browser must produce the same article.** Both read through the vault module, so the article, the person rule and what counts as an article (`isArticlePath` in `github.js`) are each written once.
- **A new route needs three edits**: the route in `App.jsx`, a rewrite in [vercel.json](vercel.json) (to its prerendered `index.html`, or to `/spa.html` if it is client-only), and a `writePage` call in `prerender.mjs` if it should be prerendered. Unknown URLs get `404.html`, which is still the full app.

### Vault data

- Everything read from the vault goes through [src/vault/vault.js](src/vault/vault.js): the file list, article text, frontmatter, the rendered article, who is a person and their portrait, plus all caching. `createVault(adapter)` takes the place the files come from as an adapter with two functions, `listFiles()` and `readText(path)`.
  - [src/vault/githubAdapter.js](src/vault/githubAdapter.js) is the browser's: one recursive GitHub tree request, and text from raw.githubusercontent.com, which has no API rate limit. [src/vault/index.js](src/vault/index.js) exports the one `vault` the browser uses.
  - `diskAdapter(dir)` in [scripts/vault.mjs](scripts/vault.mjs) is the build's. The animation tool uses that file's `walk` too.
  - Don't fetch vault files or keep a cache of them anywhere else; the test scans the source for that.
- [src/hooks/useVault.js](src/hooks/useVault.js) holds the React hooks, which only subscribe a component to the vault's answers. `peek*` functions give what is already known for a first render; the async ones fetch.
- Writing to the vault (the portrait export) is separate: [src/portrait/vaultPortraits.js](src/portrait/vaultPortraits.js).
- Article URLs come from the file name only, not the folder ([src/utils/slugs.js](src/utils/slugs.js)): `01 - Susia/06 - Characters/Armadesh Versij.md` is `/article/armadesh-versij`. Old base64-of-path URLs still resolve and redirect. `FEATURED_ARTICLES` in `config.js` still uses the old `path__with__underscores` form.
- [src/utils/markdown.js](src/utils/markdown.js) has its own frontmatter parser and turns Obsidian `[[wikilinks]]` and `![[image]]` embeds into links and images before `marked` runs.
- `00 - Meta/` in the vault is not articles: it holds images, country flags and the Metadata Menu class files that [src/utils/classSchema.js](src/utils/classSchema.js) reads to build the Browse page's filters.
- `chronology.json` and `LICENSE` are read from the vault, not kept here. `chronology.json` is generated by a script in dripwiki.
- Site text, featured articles, blocked crawlers, theme colours and the IndexNow key are in [src/config.js](src/config.js). `THEME` overrides the CSS variables in `styles.css`, and the prerender inlines it to avoid a flash of the default palette.

### People and article types

- [src/person/record.js](src/person/record.js) is the one place that reads a person's frontmatter. `personRecord(raw)` normalises it (old flat keys, comma strings, string charges); everything the infobox header, its tabs, the lifeline and Browse's filters need is derived from that record (`quickStats`, `tabs`, `lifeline`, `recordStatus`, `occupations`, `matchesFilters`…). What counts as empty (`hasValue`) and what counts as a conviction (`isConvicted`) are each written once there. `PersonInfobox.jsx` and `BrowsePage.jsx` only render and call it; the test scans both for the old logic.
- [src/utils/articleTypes.js](src/utils/articleTypes.js) is one table of article types: the folder rule behind `typeFromPath`, the singular label for an article's type line, the plural label for Browse, and the sidebar's "By Type" links. `geoTypeFromPath` in `geo.js` is a filter over it. A new type is a new row there.

### Routes

`/` is the out-of-universe landing page, outside `Layout`. Everything else is the in-universe wiki inside `Layout`; the wiki's own home is `/wiki`. `/dev/portraits` and `/dev/sketch` are tools, served from the plain shell.

### Portraits

Person articles can carry a `portrait:` block in their frontmatter. [src/portrait/engine.js](src/portrait/engine.js) turns that spec into an SVG string with `compose(spec)`.

- The engine is pure string code with no DOM, so it runs in the browser, in the prerender and in the animation tool. Keep it that way.
- [src/portrait/parts.json](src/portrait/parts.json) holds the drawn parts as traced paths, all on one line (about 94 KB). Don't read it whole; query it with a script.
- Every part sits on an anchor owned by the head. Stretching a figure moves coordinates instead of scaling the drawing, so line widths stay constant.
- `normalizeSpec` fills gaps in whatever came out of frontmatter, so old or partial specs still draw. `toYaml` writes the block back.
- `/dev/portraits` ([src/pages/PortraitsPage.jsx](src/pages/PortraitsPage.jsx)) is the composer. Its people list comes from `vault.people()`. It can commit a spec into the vault through the GitHub contents API ([src/portrait/vaultPortraits.js](src/portrait/vaultPortraits.js)) with a token kept in the browser.
- `/dev/sketch` ([src/pages/SketchPage.jsx](src/pages/SketchPage.jsx), [src/sketch/sketchpad.js](src/sketch/sketchpad.js)) is a raster sketchpad for drawing new parts over a faded portrait. Saving only works on the dev server: the `sketch-saver` plugin in [vite.config.js](vite.config.js) writes `sketches/<slug>/` (`ink.png`, `fill.png`, `preview.png`, `sketch.json`). The PNGs are 2 px per world unit over the viewBox `-40 -40 480 770`. Those sketches are then traced into `parts.json` and wired into the engine by hand.

### Animation

[animation/](animation/) animates the same portraits and has its own `package.json`, so the site build never installs the renderer (resvg). It imports `src/portrait/engine.js` directly: `compose(spec, {anim})` draws a posed frame and `landmarks(spec, anim)` reports where each body point is. A part added to the engine shows up in both the site and the animations. `lib/register.mjs` is a Node loader hook that lets plain Node import `parts.json` the way Vite does. Scenes, sets and presets are data files; the scene format and the landmark list are documented in [animation/README.md](animation/README.md).

## Deployment

Vercel rebuilds on every push to `main`. Vault edits reach the site through a nightly workflow in dripwiki that triggers a rebuild if anything was pushed there. Between builds, the browser's background check picks up vault edits.
