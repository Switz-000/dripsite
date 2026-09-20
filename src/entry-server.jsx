// ============================================================
// BUILD-TIME RENDERER (used only by scripts/prerender.mjs)
// ============================================================
// Vite compiles this into a Node module during the build. It renders the
// same <App /> the browser runs, for one URL, into an HTML string, so
// crawlers get the real page and visitors see it before any JS loads.
import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App'

export { primeVault, buildArticle } from './hooks/useVault'
export { buildFlagMap } from './utils/github'
export { infoboxImageOf, countryFlagOf } from './utils/articleImage'

export function render(url) {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  )
}
