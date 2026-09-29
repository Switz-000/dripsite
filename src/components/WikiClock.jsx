import React, { useEffect, useState } from 'react'
import { CALENDARS, DEFAULT_CALENDAR, userTimeZone } from '../utils/calendars'

const STORAGE_KEY = 'dripwiki.calendar'

function loadCalendar() {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    if (CALENDARS.some(c => c.id === id)) return id
  } catch { /* storage unavailable */ }
  return DEFAULT_CALENDAR
}

export default function WikiClock() {
  const [calId, setCalId] = useState(DEFAULT_CALENDAR)
  const [now, setNow] = useState(null) // null until mounted: keeps SSR output stable

  useEffect(() => {
    setCalId(loadCalendar())
    setNow(new Date())
    // Tick every second so the minute rolls over on time.
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const onChange = e => {
    setCalId(e.target.value)
    try { localStorage.setItem(STORAGE_KEY, e.target.value) } catch { /* ignore */ }
  }

  const cal = CALENDARS.find(c => c.id === calId) ?? CALENDARS[0]
  const out = now ? cal.format(now, userTimeZone()) : null

  return (
    <div className="wiki-clock">
      <div className="wiki-clock-main">
        <div className="wiki-clock-time" aria-live="off">{out ? out.time : '--:--'}</div>
        <div className="wiki-clock-era">{out ? out.era : '\u00a0'}</div>
        <div className="wiki-clock-date">{out ? out.day : '\u00a0'}</div>
        <div className="wiki-clock-zone">{out ? out.zone : ' '}</div>
      </div>
      <label className="wiki-clock-select">
        <span>Calendar</span>
        <select value={calId} onChange={onChange}>
          {CALENDARS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
    </div>
  )
}
