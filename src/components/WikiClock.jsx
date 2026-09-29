import React, { useEffect, useState } from 'react'
import { CALENDARS, DEFAULT_CALENDAR, userTimeZone, dscToday } from '../utils/calendars'
import { holidayFor } from '../data/holidays'
import { useFlags } from '../hooks/useVault'
import { flagUrlFor } from '../utils/github'
import { flagPalette } from '../utils/flagColors'
import { WavingFlag, Confetti } from './HolidayEffects'

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

  // Today's holiday, if any. ?holiday=<Country> previews the effect.
  const flags = useFlags()
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get('holiday'))
  }, [])
  const holiday = preview
    ? { name: 'Holiday preview', country: preview }
    : now ? holidayFor(dscToday(now, userTimeZone())) : null
  const flagSrc = holiday ? flagUrlFor(holiday.country, flags) : null
  const [palette, setPalette] = useState(null)
  useEffect(() => {
    setPalette(null)
    if (!flagSrc) return
    let alive = true
    flagPalette(flagSrc).then(p => { if (alive) setPalette(p) })
    return () => { alive = false }
  }, [flagSrc])

  const onChange = e => {
    setCalId(e.target.value)
    try { localStorage.setItem(STORAGE_KEY, e.target.value) } catch { /* ignore */ }
  }

  const cal = CALENDARS.find(c => c.id === calId) ?? CALENDARS[0]
  const out = now ? cal.format(now, userTimeZone()) : null

  const blank = '\u00a0'
  return (
    <div className={`wiki-clock${flagSrc ? ' is-holiday' : ''}`}>
      {flagSrc && palette && <Confetti colors={palette} />}
      <div className="wiki-clock-head">
        <div className="wiki-clock-live">
          <span className="wiki-clock-dot" aria-hidden="true" />
          <span>{out ? out.zone : blank}</span>
        </div>
        <select value={calId} onChange={onChange} aria-label="Calendar">
          {CALENDARS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {flagSrc && (
        <div className="wiki-clock-holiday" style={palette ? { '--holiday': palette[0] } : undefined}>
          <WavingFlag src={flagSrc} name={holiday.country} />
          <div>
            <div className="wiki-clock-holiday-name">{holiday.name}</div>
            <div className="wiki-clock-holiday-country">{holiday.country}</div>
          </div>
        </div>
      )}
      <div className="wiki-clock-body">
        <div className="wiki-clock-date">
          <div className={`wiki-clock-year${out && out.year.length > 5 ? ' long' : ''}`}>{out ? out.year : blank}</div>
          <div className="wiki-clock-month">{out ? out.month : blank}</div>
          <div className="wiki-clock-day">{out ? out.day : blank}</div>
        </div>
        <div className="wiki-clock-time" aria-live="off">{out ? out.time : '--:--'}</div>
      </div>
    </div>
  )
}
