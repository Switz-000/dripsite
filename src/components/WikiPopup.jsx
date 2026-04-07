import React from 'react'
import { Link } from 'react-router-dom'
import { marked } from 'marked'
import { getTypeLabel } from '../utils/markdown'

export default function WikiPopup({ data, slug, x, y, visible, onMouseEnter, onMouseLeave, onClose }) {
  if (!data) return null

  const W = 284
  const H = 160
  let left = x + 20
  let top  = y

  if (left + W > window.innerWidth - 8)  left = x - 16 - W
  if (top  + H > window.innerHeight - 8) top  = window.innerHeight - H - 8
  if (left < 8) left = 8
  if (top  < 8) top  = 8

  const typeLabel = data.type ? getTypeLabel({ type: data.type }) : null
  const summaryHtml = data.summary ? marked.parseInline(data.summary) : ''

  return (
    <Link
      to={`/article/${slug}`}
      className={`wiki-popup${visible ? ' is-visible' : ''}`}
      style={{ left, top }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClose}
    >
      {data.imageUrl && (
        <img className="wiki-popup-image" src={data.imageUrl} alt="" loading="lazy" />
      )}
      <div className="wiki-popup-body">
        {typeLabel && <div className="wiki-popup-type">{typeLabel}</div>}
        <div className="wiki-popup-title">{data.title}</div>
        {summaryHtml && (
          <div
            className="wiki-popup-summary"
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        )}
      </div>
    </Link>
  )
}
