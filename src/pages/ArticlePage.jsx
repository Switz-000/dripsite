import React, { useEffect } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useArticle } from '../hooks/useVault'
import { getTypeLabel } from '../utils/markdown'
import { SITE } from '../config'
import Infobox from '../components/Infobox'
import { Loading, ErrorState } from '../components/Loading'

export default function ArticlePage() {
  // With path="article/*", the slug lives in params['*']
  const params = useParams()
  const slug = params['*']
  const { article, loading, error } = useArticle(slug)

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — ${SITE.name}`
    }
    return () => { document.title = SITE.name }
  }, [article])

  function getBreadcrumb(path) {
    if (!path) return []
    return path
      .split('/')
      .slice(0, -1)
      .map(p => p.replace(/^\d+ - /, '').trim())
      .filter(Boolean)
  }

  if (loading) return (
    <div className="page-inner">
      <Loading message="Retrieving article from archive..." />
    </div>
  )

  if (error) return (
    <div className="page-inner">
      <div className="breadcrumb">
        <Link to="/browse">Browse</Link>
      </div>
      <ErrorState message={error} />
    </div>
  )

  if (!article) return null

  const typeLabel = getTypeLabel(article.meta)
  const crumbs = getBreadcrumb(article.path)

  return (
    <div className="page-inner">
      <div className="breadcrumb">
        <Link to="/browse">Browse</Link>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span className="sep">/</span>
            <span>{c}</span>
          </React.Fragment>
        ))}
      </div>

      <header className="article-header">
        {typeLabel && <div className="article-type-badge">{typeLabel}</div>}
        <h1 className="article-title">{article.title}</h1>
        {article.meta.summary && (
          <p className="article-summary">{article.meta.summary}</p>
        )}
      </header>

      <div className="article-body">
        <Infobox meta={article.meta} title={article.title} />
        <div dangerouslySetInnerHTML={{ __html: article.html }} />
      </div>
    </div>
  )
}
