import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page-inner">
      <div style={{ paddingTop: 60 }}>
        <div className="article-type-badge">404</div>
        <h1 className="article-title" style={{ marginTop: 10 }}>Article Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 16, marginBottom: 32 }}>
          This article does not exist in the archive, or the link may be broken.
        </p>
        <Link to="/" style={{ color: 'var(--link)' }}>← Return to overview</Link>
      </div>
    </div>
  )
}
