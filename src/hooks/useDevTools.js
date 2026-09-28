import { useEffect, useState } from 'react'

// "Dev tools" is a per-browser switch, off by default and saved in this
// browser only. Read after mount so the prerendered HTML never includes it.
const KEY = 'drip-devtools'
const listeners = new Set()

export function useDevTools() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    try { setOn(localStorage.getItem(KEY) === '1') } catch {}
    listeners.add(setOn)
    return () => { listeners.delete(setOn) }
  }, [])
  function toggle() {
    const next = !on
    try { localStorage.setItem(KEY, next ? '1' : '0') } catch {}
    listeners.forEach(fn => fn(next))
  }
  return [on, toggle]
}
