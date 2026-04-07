import React, { useRef, useState, useEffect } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useArticle, useFileTree } from '../hooks/useVault'
import { getTypeLabel } from '../utils/markdown'
import { wikilinkToSlug } from '../utils/github'
import { SITE } from '../config'
import Infobox from '../components/Infobox'
import { Loading, ErrorState } from '../components/Loading'
import { fetchPreview } from '../utils/previews'
import WikiPopup from '../components/WikiPopup'

export default function ArticlePage() {
  // With path="article/*", the slug lives in params['*']
  const params = useParams()
  const slug = params['*']
  const { article, loading, error } = useArticle(slug)
  const { tree } = useFileTree()

  const bodyRef = useRef(null)
  const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, data: null, slug: null })
  const hoverTimerRef = useRef(null)
  const hideTimerRef = useRef(null)
  const fetchTokenRef = useRef(0)

  const cancelHide = () => clearTimeout(hideTimerRef.current)
  const scheduleHide = () => {
    hideTimerRef.current = setTimeout(() => {
      setPopup(p => ({ ...p, visible: false }))
    }, 120)
  }

  useEffect(() => {
    const el = bodyRef.current
    if (!el || !tree) return

    function onOver(e) {
      const link = e.target.closest('a.wikilink')
      if (!link) return
      const linkSlug = link.getAttribute('href')?.replace('/article/', '')
      if (!linkSlug) return
      cancelHide()
      clearTimeout(hoverTimerRef.current)
      const mx = e.clientX, my = e.clientY
      const token = ++fetchTokenRef.current
      hoverTimerRef.current = setTimeout(async () => {
        const data = await fetchPreview(linkSlug, tree)
        if (fetchTokenRef.current !== token) return
        if (data) setPopup({ visible: true, x: mx, y: my, data, slug: linkSlug })
      }, 350)
    }

    function onOut(e) {
      const link = e.target.closest('a.wikilink')
      if (!link) return
      if (link.contains(e.relatedTarget)) return
      clearTimeout(hoverTimerRef.current)
      fetchTokenRef.current++
      scheduleHide()
    }

    el.addEventListener('mouseover', onOver)
    el.addEventListener('mouseout', onOut)
    return () => {
      el.removeEventListener('mouseover', onOver)
      el.removeEventListener('mouseout', onOut)
      clearTimeout(hoverTimerRef.current)
      clearTimeout(hideTimerRef.current)
    }
  }, [tree, article])

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

  const HTML_IMG_RE = /<img[^>]+src="([^"]+)"/
  const infoboxImage = HTML_IMG_RE.exec(article.html)?.[1] ?? null
  const wikilinkFn = tree ? (text) => wikilinkToSlug(text, tree) : null

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
        <Infobox meta={article.meta} title={article.title} imageUrl={infoboxImage} wikilinkFn={wikilinkFn} />
        <div dangerouslySetInnerHTML={{ __html: article.html }} />
      </div>
    </div>

    <WikiPopup
      data={popup.data}
      slug={popup.slug}
      x={popup.x}
      y={popup.y}
      visible={popup.visible}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onClose={() => setPopup(p => ({ ...p, visible: false }))}
    />
  </>
  )
}