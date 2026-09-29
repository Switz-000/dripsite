// Calendar systems selectable on the /wiki clock.
//
// To add a fictional calendar, append an entry to CALENDARS:
//   id     – stable key (persisted in localStorage)
//   label  – shown in the dropdown
//   format(now: Date, tz: string) → { time, year, month, day, zone }
//     time – e.g. "14:32"
//     year  – big number/era, e.g. "2088"
//     month – month (or equivalent) name, e.g. "March"
//     day   – small line, e.g. "Tuesday, 4"
//     zone – small caption under the clock
//
// The wiki is set in 2088, so the Gregorian calendar keeps the real month,
// day and time of day but always shows the year 2088.

export const WIKI_YEAR = 2088

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

export function userTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function gregorian(now, tz) {
  const parts = {}
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)) parts[p.type] = p.value

  const month = Number(parts.month)
  const day = Number(parts.day)
  const weekday = WEEKDAYS[new Date(Date.UTC(WIKI_YEAR, month - 1, day)).getUTCDay()]
  return {
    time: `${parts.hour}:${parts.minute}`,
    day: `${weekday}, ${day}`,
    year: String(WIKI_YEAR),
    month: MONTHS[month - 1],
    zone: tz.replace(/_/g, ' '),
  }
}

export const CALENDARS = [
  { id: 'gregorian', label: 'Gregorian', format: gregorian },
]

export const DEFAULT_CALENDAR = 'gregorian'
