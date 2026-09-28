import React, { useRef, useEffect } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { useArticle, useFileTree, useFlags, usePeople } from '../hooks/useVault'
import { getTypeLabel } from '../utils/markdown'
import { wikilinkToSlug, pathToSlug } from '../utils/github'
import { infoboxImageOf, countryFlagOf } from '../utils/articleImage'
import { decoratePeople } from '../utils/peopleLists'
import { SITE } from '../config'
import Infobox from '../components/Infobox'
import PersonInfobox from '../components/PersonInfobox'
import { Loading, ErrorState } from '../components/Loading'
import { useLinkPreview } from '../hooks/useLinkPreview'
import WikiPopup from '../components/WikiPopup'

export default function ArticlePage() {
  // With path="article/*", the slug lives in params['*']
  const params = useParams()
  const slug = params['*']
  const { article, loading, error } = useArticle(slug)
  const { tree } = useFileTree()
  const flags = useFlags()
  const people = usePeople(article?.html, tree)
  const navigate = useNavigate()
  const location = useLocation()

  const bodyRef = useRef(null)
  const popup = useLinkPreview(bodyRef, tree, { rebind: [article] })

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — ${SITE.name}`
    }
    return () => { document.title = SITE.name }
  }, [article])

  // Old base64 links and hand-typed names resolve too. Once the article is
  // found, swap the address bar to its canonical slug so every article has
  // exactly one URL. `replace` keeps the old URL out of the back button.
  useEffect(() => {
    // article.slug is the slug it was loaded for. After back/forward the URL
    // changes a render before the article does; redirecting on that stale
    // article bounces between the two pages forever.
    if (!article || article.slug !== slug) return
    const canonical = pathToSlug(article.path)
    if (slug !== canonical) {
      navigate(`/article/${canonical}${location.hash}`, { replace: true })
    }
  }, [article, slug])

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

  const infoboxImage = infoboxImageOf(article)
  const wikilinkFn = tree ? (text) => wikilinkToSlug(text, tree) : null

  const flagUrl = countryFlagOf(article, flags)

  return (
    <>
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

      <div className="article-body" ref={bodyRef}>
        {article.meta.type === 'person'
          ? <PersonInfobox meta={article.meta} title={article.title} imageUrl={infoboxImage} wikilinkFn={wikilinkFn} />
          : <Infobox meta={article.meta} title={article.title} imageUrl={infoboxImage} flagUrl={flagUrl} wikilinkFn={wikilinkFn} />
        }
        <div dangerouslySetInnerHTML={{ __html: decoratePeople(article.html, people) }} />
      </div>
    </div>

    <WikiPopup data={popup.data} slug={popup.slug} x={popup.x} y={popup.y} visible={popup.visible}
      onMouseEnter={popup.onMouseEnter} onMouseLeave={popup.onMouseLeave} onClose={popup.onClose} />
  </>
  )
}