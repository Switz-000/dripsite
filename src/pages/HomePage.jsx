import React from 'react'
import { Link } from 'react-router-dom'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading } from '../components/Loading'
import { HOME, HOME_STATS, FEATURED_ARTICLES, HOME_CATEGORIES } from '../config'

function renderTitle(title) {
  const parts = title.split(/(\*[^*]+\*)/g)
  return parts.map((part, i) =>
    part.startsWith('*') && part.endsWith('*')
      ? <em key={i}>{part.slice(1, -1)}</em>
      : part
  )
}

// Convert a vault path (as written in config) to the correct base64 slug
function vaultPathToSlug(vaultPath) {
  // Config paths use __ as separator for readability; convert back to /
  const normalized = vaultPath.replace(/__/g, '/')
  // pathToSlug expects a .md path, but config omits .md — that's fine,
  // slugToPath will match by decoded path anyway
  const clean = normalized.replace(/\.md$/, '')
  return btoa(unescape(encodeURIComponent(clean)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function HomePage() {
  const { tree, loading } = useFileTree()
  const articleCount = tree ? tree.length : 0

  // Build featured slugs once tree is loaded, matching by title fragment
  const featuredWithSlugs = FEATURED_ARTICLES.map(f => {
    if (!tree) return { ...f, resolvedSlug: vaultPathToSlug(f.slug) }
    // Try to find the actual file in the tree so the slug is exact
    const normalized = f.slug.replace(/__/g, '/').toLowerCase()
    const match = tree.find(file => {
      const fp = file.path.replace(/\.md$/, '').toLowerCase()
      return fp === normalized || fp.endsWith('/' + normalized.split('/').pop())
    })
    return {
      ...f,
      resolvedSlug: match ? pathToSlug(match.path) : vaultPathToSlug(f.slug),
    }
  })

  return (
    <div className="page-inner">
      <div className="home-hero">
        <div className="overline">{HOME.overline}</div>
        <h1>{renderTitle(HOME.title)}</h1>
        <p>
          {HOME.subtitle}
          {articleCount > 0 && <> {articleCount.toLocaleString()} articles indexed.</>}
        </p>
      </div>

      {loading ? (
        <Loading message="Loading index..." />
      ) : (
        <div className="home-stats">
          <div className="stat-cell">
            <div className="stat-number">{articleCount}</div>
            <div className="stat-label">Articles</div>
          </div>
          {HOME_STATS.map(s => (
            <div className="stat-cell" key={s.label}>
              <div className="stat-number">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="home-categories" style={{ marginBottom: 36 }}>
        <h2>Featured Articles</h2>
        <div className="category-grid">
          {featuredWithSlugs.map(f => (
            <Link key={f.slug} to={`/article/${f.resolvedSlug}`} className="category-card">
              <div className="cat-name">{f.label}</div>
              <div className="cat-desc">{f.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="home-categories">
        <h2>Browse by Category</h2>
        <div className="category-grid">
          {HOME_CATEGORIES.map(c => (
            <Link key={c.label} to={c.path} className="category-card">
              <div className="cat-name">{c.label}</div>
              <div className="cat-desc">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
