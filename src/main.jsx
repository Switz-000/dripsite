import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { THEME } from './config'

// Apply any non-null theme overrides from config.js as CSS variables
const root = document.documentElement
Object.entries(THEME).forEach(([key, value]) => {
  if (value !== null && value !== undefined) {
    root.style.setProperty('--' + key, value)
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
