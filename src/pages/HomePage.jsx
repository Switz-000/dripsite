import React from 'react'
import { Link } from 'react-router-dom'
import { useFileTree, pathToSlug } from '../hooks/useVault'
import { Loading } from '../components/Loading'

// Featured articles to show on the front page — update these slugs to your actual pages
const FEATURED = [
  { slug: '01 - Susia/03 - Susia', label: 'Susia', desc: 'The Techno-Federative Republic' },
  { slug: '01 - Susia/01 - Goverment/Federal/Yarnojte', label: 'Yarnojtes', desc: 'Strategic monopoly corporations' },
  { slug: '01 - Susia/04 - History/Continental Divide', label: 'Continental Divide', desc: 'The cold war with Confia, 1957–1977' },
  { slug: '01 - Susia/05 - Culture/Susian Exceptionalism', label: 'Susian Exceptionalism', desc: 'National identity and civilizational myth' },
  { slug: '01 - Susia/06 - Characters/Armadesh Versij', label: 'Armadesh Versij', desc: 'Philosopher, martyr, father of liberty' },
  { slug: '01 - Susia/06 - Characters/Yário Kolkov', label: 'Yário Kolkov', desc: 'Theorist of the Great Transition' },
]

const CATEGORIES = [
  { label: 'People', desc: 'Presidents, philosophers, executives', path: '/browse?type=person' },
  { label: 'Corporations', desc: 'Yarnojtes and major companies', path: '/browse?type=company' },
  { label: 'Geography', desc: 'States, cities, and territories', path: '/browse?type=state' },
  { label: 'History', desc: 'Wars, events, and eras', path: '/browse?type=event' },
  { label: 'Law & Policy', desc: 'Legislation, treaties, doctrines', path: '/browse?type=law' },
  { label: 'Culture', desc: 'Philosophy, sport, tradition', path: '/browse?type=concept' },
]

export default function HomePage() {
  const { tree, loading } = useFileTree()

  const articleCount = tree?.length ?? 0

  return (
    <div className="page-inner">
      <div className="home-hero">
        <div className="overline">Classified Archive — Public Access Tier</div>
        <h1>The <em>Susia</em> Encyclopedia</h1>
        <p>
          A comprehensive reference for the Techno-Federative Republic of Susia,
          its history, institutions, corporations, and people.
          {articleCount > 0 && <> {articleCount} articles indexed.</>}
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <Loading message="Loading index…" />
      ) : (
        <div className="home-stats">
          <div className="stat-cell">
            <div className="stat-number">{articleCount}</div>
            <div className="stat-label">Articles</div>
          </div>
          <div className="stat-cell">
            <div className="stat-number">9</div>
            <div className="stat-label">States</div>
          </div>
          <div className="stat-cell">
            <div className="stat-number">6</div>
            <div className="stat-label">Yarnojtes</div>
          </div>
        </div>
      )}

      {/* Featured articles */}
      <div className="home-categories" style={{ marginBottom: 40 }}>
        <h2>Featured Articles</h2>
        <div className="category-grid">
          {FEATURED.map(f => (
            <Link
              key={f.slug}
              to={`/article/${encodeURIComponent(f.slug.replace(/\//g, '__'))}`}
              className="category-card"
            >
              <div className="cat-name">{f.label}</div>
              <div className="cat-desc">{f.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Browse by category */}
      <div className="home-categories">
        <h2>Browse by Category</h2>
        <div className="category-grid">
          {CATEGORIES.map(c => (
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
