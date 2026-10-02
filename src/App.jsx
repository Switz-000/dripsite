import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ArticlePage from './pages/ArticlePage'
import BrowsePage from './pages/BrowsePage'
import ChronologyPage from './pages/ChronologyPage'
import SearchPage from './pages/SearchPage'
import NotFoundPage from './pages/NotFoundPage'
import MapPage from './pages/MapPage'
import LandingPage from './pages/LandingPage'
import PortraitsPage from './pages/PortraitsPage'
// loaded only when opened, so readers never download the animation player
const AnimatePage = lazy(() => import('./pages/AnimatePage'))

export default function App() {
  return (
    <Routes>  
      {/* Out-of-universe landing page, outside the wiki's in-universe Layout */}
      <Route path="/" element={<LandingPage />} />

      {/* Everything in-universe. A pathless route, so it adds the Layout
          without adding anything to the URL. */}
      <Route element={<Layout />}>
        <Route path="wiki" element={<HomePage />} />
        {/* Use * so base64 slugs with any char are captured cleanly */}
        <Route path="article/*" element={<ArticlePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="chronology" element={<ChronologyPage />} />
        <Route path="chronology/spans" element={<ChronologyPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="dev/portraits" element={<PortraitsPage />} />
        <Route path="dev/animate" element={<Suspense fallback={<div className="page-inner">Loading the animation player…</div>}><AnimatePage /></Suspense>} />
        <Route path="*" element={<NotFoundPage />} />
        <Route path="map" element={<MapPage />} />
      </Route>
    </Routes>
  )
}
