import React from 'react'

export function Loading({ message = 'Retrieving from archive…' }) {
  return (
    <div className="loading-state">
      <div className="loading-dot" />
      <div className="loading-dot" />
      <div className="loading-dot" />
      <span>{message}</span>
    </div>
  )
}

export function ErrorState({ message }) {
  return (
    <div className="error-state">
      <strong>Failed to load</strong>
      {message}
    </div>
  )
}
