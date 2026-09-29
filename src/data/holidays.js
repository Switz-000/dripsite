// In-world holidays. On a holiday the /wiki clock shows the country's flag
// (waving) and confetti in the flag's colours.
//
// Dates are DSC dates (see utils/calendars.js), so a holiday lands on the
// same DSC day whichever calendar the viewer has selected:
//   id       – stable key
//   name     – shown on the banner
//   country  – must match a file in the vault's "Country Flags" folder
//              (case-insensitive, e.g. "Susia")
//   month    – DSC month number, 1 = Theosio … 10 = Verenio / Verene
//   day      – day of that month (1–36/37; up to 38 for Verene)
//
// Example:
//   { id: 'foundation-day', name: 'Foundation Day', country: 'Susia', month: 4, day: 12 },
//
// To preview the effect without a matching date, open /wiki?holiday=Susia
// (any country that has a flag).

export const HOLIDAYS = []

export function holidayFor(dsc) {
  if (!dsc) return null
  return HOLIDAYS.find(h => h.month === dsc.index + 1 && h.day === dsc.day) ?? null
}
