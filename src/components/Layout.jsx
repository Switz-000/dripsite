import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useFileTree } from '../hooks/useVault'
import { SITE } from '../config'

export default function Layout() {
  const { tree } = useFileTree()
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) navigate('/search?q=' + encodeURIComponent(query.trim()))
  }

  const articleCount = tree ? tree.length : '...'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="layout">
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle navigation">
        =
      </button>

      <aside className={'sidebar ' + (sidebarOpen ? 'open' : '')}>
        <div className="sidebar-logo">
          <Link to="/">
            <div className="wordmark">{SITE.name}</div>
            <div className="subtitle">{SITE.tagline}</div>
          </Link>
        </div>

        <div className="sidebar-search">
          <form onSubmit={handleSearch}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search articles..."
              type="search"
            />
          </form>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-section">
            <div className="sidebar-nav-label">Navigation</div>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Overview</NavLink>
            <NavLink to="/browse" className={({ isActive }) => isActive ? 'active' : ''}>Browse All</NavLink>
            <NavLink to="/search" className={({ isActive }) => isActive ? 'active' : ''}>Search</NavLink>
          </div>
          <div className="sidebar-nav-section">
            <div className="sidebar-nav-label">By Type</div>
            <Link to="/browse?type=person">People</Link>
            <Link to="/browse?type=company">Corporations</Link>
            <Link to="/browse?type=state">States</Link>
            <Link to="/browse?type=city">Cities</Link>
            <Link to="/browse?type=country">Countries</Link>
            <Link to="/browse?type=event">Events</Link>
            <Link to="/browse?type=law">Legislation</Link>
            <Link to="/browse?type=institution">Institutions</Link>
            <Link to="/browse?type=concept">Concepts</Link>
            <Link to="/browse?type=organization">Organizations</Link>
          </div>
        </nav>

        <div className="sidebar-footer">
          {articleCount} articles<br />
          {SITE.footer}
        </div>
      </aside>

      <main className="main-content">
        <div className="masthead">
          <span>{SITE.masthead}</span>
          <span className="masthead-title">{today}</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
