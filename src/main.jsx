import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { THEME } from './config'
import { primeVault } from './hooks/useVault'

// Apply any non-null theme overrides from config.js as CSS variables
const root = document.documentElement
Object.entries(THEME).forEach(([key, value]) => {
  if (value !== null && value !== undefined) {
    root.style.setProperty('--' + key, value)
  }
})

// Prerendered pages carry the data they were built from (see
// scripts/prerender.mjs). Load it first, so the app's first render matches
// what's already on screen instead of starting over with a spinner.
const preload = document.getElementById('preload')
if (preload) primeVault(JSON.parse(preload.textContent))

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
