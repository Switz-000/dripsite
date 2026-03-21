# Dripwiki

A Wikipedia-style encyclopedia site that reads directly from the [dripwiki](https://github.com/Switz-000/dripwiki) Obsidian vault on GitHub.

## How it works

- Fetches the file tree from the GitHub API on first load
- Fetches individual `.md` files as you navigate to articles
- Parses YAML frontmatter → infobox
- Resolves `[[wikilinks]]` → internal navigation links
- Strips Obsidian-specific syntax (dataview blocks, `%%` comments)
- Full-text search via Fuse.js (title + path, no pre-indexing needed)

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import that repo
3. Framework preset: **Vite**
4. Click Deploy — that's it

The `vercel.json` handles SPA routing automatically.

## Configuration

Everything lives in `src/utils/github.js`:

```js
export const REPO_CONFIG = {
  owner: 'Switz-000',
  repo:  'dripwiki',
  branch: 'main',
  rootPath: '',        // subfolder if needed, e.g. 'vault'
  token: null,         // only needed for private repos
}
```

For private repos: create a `.env` file with `VITE_GITHUB_TOKEN=ghp_yourtoken`
and add the same variable in Vercel's Environment Variables settings.

## Updating featured articles

Edit the `FEATURED` array in `src/pages/HomePage.jsx` to link to articles
using their vault path with `/` replaced by `__`.

Example: `01 - Susia/06 - Characters/Armadesh Versij`
becomes slug: `01 - Susia__06 - Characters__Armadesh Versij`

## GitHub API rate limits

- Unauthenticated: 60 requests/hour per IP
- With a token: 5,000/hour

The app caches the file tree and each article in memory for the session,
so in practice you'll only hit the API once per article per visit.
Adding a `VITE_GITHUB_TOKEN` (read-only, public_repo scope) is recommended
for a public site with real traffic.
