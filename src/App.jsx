import React from 'react'
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
        <Route path="search" element={<SearchPage />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route path="map" element={<MapPage />} />
      </Route>
    </Routes>
  )
}
