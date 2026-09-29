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
// Ten months alternating 36/37 days (365 total). Every fourth DSC year is a
// leap year: the last month, Verenio, is renamed Verene and gains a day (38).
// There is no century correction, so the DSC slowly drifts against the
// Gregorian calendar (~1 day per 128 years). That is intentional.
//
// DSC year 0 is AMS (Gregorian 1950, the year Solimao died). Later years are
// Roman numerals (2000 → L); earlier ones are Arabic + "AS" (1770 → 180 AS).
//
// Anchor: DSC year 138 (CXXXVIII) begins on 1 January of the wiki year (2088).
// The clock keeps the real month/day, so it counts the days elapsed since
// that anchor and walks them through DSC years; a 365-day year 138 therefore
// ends one day before Gregorian 2088 does.
const DSC_EPOCH = 1950
const DSC_ANCHOR_YEAR = WIKI_YEAR - DSC_EPOCH // 138
const DSC_MONTHS = [
  { name: 'Theosio', days: 36 }, { name: 'Olodio', days: 37 },
  { name: 'Vartelio', days: 36 }, { name: 'Boralio', days: 37 },
  { name: 'Mantichevio', days: 36 }, { name: 'Agamilio', days: 37 },
  { name: 'Veronicio', days: 36 }, { name: 'Jartio', days: 37 },
  { name: 'Lichevio', days: 36 }, { name: 'Verenio', days: 37 },
]
const LEAP_MONTH = { name: 'Verene', days: 38 }

const isDscLeap = y => y % 4 === 0
const dscYearLength = y => (isDscLeap(y) ? 366 : 365)

export function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, r] of map) while (n >= v) { out += r; n -= v }
  return out
}

// y is a DSC year number (0 = AMS, negative = before Solimao).
export function dscYearLabel(y) {
  if (y === 0) return 'AMS'
  return y > 0 ? toRoman(y) : `${-y} AS`
}

// dayOfYear is 1-based within DSC year y.
export function dscDate(y, dayOfYear) {
  const months = DSC_MONTHS.map((m, i) =>
    i === DSC_MONTHS.length - 1 && isDscLeap(y) ? LEAP_MONTH : m)
  let left = dayOfYear
  for (const m of months) {
    if (left <= m.days) return { name: m.name, day: left, length: m.days }
    left -= m.days
  }
  const last = months[months.length - 1]
  return { name: last.name, day: last.days, length: last.days }
}

// daysSinceAnchor is 0 on 1 Jan of the anchor year.
export function dscFromAnchorDays(daysSinceAnchor) {
  let y = DSC_ANCHOR_YEAR
  let left = daysSinceAnchor
  while (left >= dscYearLength(y)) { left -= dscYearLength(y); y++ }
  return { year: y, ...dscDate(y, left + 1) }
}

function dsc(now, tz) {
  const { month, day, time } = localParts(now, tz)
  const elapsed = Math.round((Date.UTC(WIKI_YEAR, month - 1, day) - Date.UTC(WIKI_YEAR, 0, 1)) / 86400000)
  const d = dscFromAnchorDays(elapsed)
  return {
    time,
    year: dscYearLabel(d.year),
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
