// Calendar systems selectable on the /wiki clock.
//
// To add a fictional calendar, append an entry to CALENDARS:
//   id     – stable key (persisted in localStorage)
//   label  – shown in the dropdown
//   format(now: Date, tz: string) → { time, day, era, zone }
//     time – e.g. "14:32"
//     day  – small lead-in, e.g. "Tuesday, 4"
//     era  – large part (month + year), e.g. "March 2088"
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
    era: `${MONTHS[month - 1]} ${WIKI_YEAR}`,
    zone: tz.replace(/_/g, ' '),
  }
}

export const CALENDARS = [
  { id: 'gregorian', label: 'Gregorian', format: gregorian },
]

export const DEFAULT_CALENDAR = 'gregorian'
