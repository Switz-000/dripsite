import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ArticlePage from './pages/ArticlePage'
import BrowsePage from './pages/BrowsePage'
import SearchPage from './pages/SearchPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="article/:slug" element={<ArticlePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
