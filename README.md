# Dripsite

Live at https://dripsite.vercel.app

The site for the Dripstao wiki. The articles live in [dripwiki](https://github.com/Switz-000/dripwiki), an Obsidian vault. This repo is only the code.

## How it works

`npm run build` does two things:

1. `vite build` builds the React app.
2. `scripts/prerender.mjs` downloads dripwiki and writes a real HTML page for every article, plus `/`, `/wiki`, `/browse` and `/map`, so pages load without waiting on GitHub and search engines can read them. It also writes `robots.txt`, `sitemap.xml` and `404.html`, and tells IndexNow (Bing) which pages changed.

In the browser the app starts from the page it was served with and checks GitHub in the background for edits made after the build.

Article URLs come from the file name: `Armadesh Versij.md` is `/article/armadesh-versij`. Old links with the base64 vault path still work and redirect to the new URL.

## Updating

- Pushing to `main` here makes Vercel rebuild.
- Vault edits: dripwiki has a workflow (`.github/workflows/nightly-rebuild.yml`) that rebuilds the site once a night if anything was pushed there. It can also be run by hand from dripwiki's Actions tab.

## Config

Site text, featured articles, blocked crawlers, the link preview image, theme colours and the IndexNow key are in `src/config.js`. The repo it reads from is `REPO_CONFIG` in `src/utils/github.js`.

## Running locally

```
npm install
npm run dev                            # dev server
npm run build                          # full build into dist/, downloads dripwiki
VAULT_DIR=../dripwiki npm run build    # same, with a local copy of the vault
```
