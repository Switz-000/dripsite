import React, { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useArticle } from '../hooks/useVault'
import { getTypeLabel } from '../utils/markdown'
import Infobox from '../components/Infobox'
import { Loading, ErrorState } from '../components/Loading'

export default function ArticlePage() {
  const { slug } = useParams()
  const { article, loading, error } = useArticle(slug)

  useEffect(() => {
    if (article) document.title = `${article.title} — Susia Encyclopedia`
    return () => { document.title = 'Susia — Encyclopedia' }
  }, [article])

  // Derive a friendly breadcrumb from the path
  function getBreadcrumb(path) {
    if (!path) return []
    const parts = path.split('/').slice(0, -1) // drop filename
    return parts.map(p => p.replace(/^\d+ - /, '')) // strip "01 - " prefixes
  }

  if (loading) return (
    <div className="page-inner">
      <Loading message="Retrieving article from archive…" />
    </div>
  )

  if (error) return (
    <div className="page-inner">
      <ErrorState message={error} />
    </div>
  )

  if (!article) return null

  const typeLabel = getTypeLabel(article.meta)
  const crumbs = getBreadcrumb(article.path)

  return (
    <div className="page-inner">
      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <div className="breadcrumb">
          <Link to="/browse">Browse</Link>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span className="sep">/</span>
              <span>{c}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Article header */}
      <header className="article-header">
        {typeLabel && <div className="article-type-badge">{typeLabel}</div>}
        <h1 className="article-title">{article.title}</h1>
        {article.meta.summary && (
          <p className="article-summary">{article.meta.summary}</p>
        )}
      </header>

      {/* Infobox + body */}
      <div className="article-body">
        <Infobox meta={article.meta} title={article.title} />
        <div dangerouslySetInnerHTML={{ __html: article.html }} />
      </div>
    </div>
  )
}
