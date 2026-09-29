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

// Wall-clock parts of `now` in the viewer's timezone. Only month/day/time are
// real; the year is always WIKI_YEAR.
function localParts(now, tz) {
  const parts = {}
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)) parts[p.type] = p.value
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    time: `${parts.hour}:${parts.minute}`,
  }
}

function gregorian(now, tz) {
  const { month, day, time } = localParts(now, tz)
  const weekday = WEEKDAYS[new Date(Date.UTC(WIKI_YEAR, month - 1, day)).getUTCDay()]
  return {
    time,
    year: String(WIKI_YEAR),
    month: MONTHS[month - 1],
    day: `${weekday}, ${day}`,
    zone: tz.replace(/_/g, ' '),
  }
}

// ── Dripstanian Standard Calendar (DSC) ──────────────────────
// Ten months alternating 36/37 days (365 total). In a leap year (every four
// years) the last month, Verenio, is renamed Verene and gains a day (38).
// Year 1950 (Gregorian) is AMS, the year Solimao died. Later years are the
// offset from 1950 in Roman numerals (2000 → L); earlier ones are the offset
// in Arabic numerals + "AS" (1770 → 180 AS).
//
// Assumption: the DSC year starts on 1 January, so the day of the (leap) year
// maps straight onto the months below. 2088 is a leap year, hence Verene.
const DSC_EPOCH = 1950
const DSC_MONTHS = [
  { name: 'Theosio', days: 36 }, { name: 'Olodio', days: 37 },
  { name: 'Vartelio', days: 36 }, { name: 'Boralio', days: 37 },
  { name: 'Mantichevio', days: 36 }, { name: 'Agamilio', days: 37 },
  { name: 'Veronicio', days: 36 }, { name: 'Jartio', days: 37 },
  { name: 'Lichevio', days: 36 }, { name: 'Verenio', days: 37 },
]
const LEAP_MONTH = { name: 'Verene', days: 38 }

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, r] of map) while (n >= v) { out += r; n -= v }
  return out
}

export function dscYearLabel(gYear) {
  const d = gYear - DSC_EPOCH
  if (d === 0) return 'AMS'
  return d > 0 ? toRoman(d) : `${-d} AS`
}

// dayOfYear is 1-based in a year of the given length.
export function dscDate(gYear, dayOfYear) {
  const months = DSC_MONTHS.map((m, i) =>
    i === DSC_MONTHS.length - 1 && isLeap(gYear) ? LEAP_MONTH : m)
  let left = dayOfYear
  for (const m of months) {
    if (left <= m.days) return { name: m.name, day: left, length: m.days }
    left -= m.days
  }
  const last = months[months.length - 1]
  return { name: last.name, day: last.days, length: last.days }
}

function dsc(now, tz) {
  const { month, day, time } = localParts(now, tz)
  const doy = Math.round((Date.UTC(WIKI_YEAR, month - 1, day) - Date.UTC(WIKI_YEAR, 0, 1)) / 86400000) + 1
  const d = dscDate(WIKI_YEAR, doy)
  return {
    time,
    year: dscYearLabel(WIKI_YEAR),
    month: d.name,
    day: `Day ${d.day} of ${d.length}`,
    zone: tz.replace(/_/g, ' '),
  }
}

export const CALENDARS = [
  { id: 'gregorian', label: 'Gregorian', format: gregorian },
  { id: 'dsc', label: 'Dripstanian Standard', format: dsc },
]

export const DEFAULT_CALENDAR = 'gregorian'
