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

export default function HomePage() {
  const { tree, loading } = useFileTree()
  const articleCount = tree ? tree.length : 0

  // The slug comes from the filename alone, so there's no need to wait for
  // the tree. Config paths use __ in place of / (see config.js).
  const featuredWithSlugs = FEATURED_ARTICLES.map(f => ({
    ...f,
    resolvedSlug: pathToSlug(f.slug.replace(/__/g, '/')),
  }))

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
