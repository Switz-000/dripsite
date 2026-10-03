// What kinds of article the vault has, and what each is called.
//
// One row per type, in the order the folder rules are tried: the first row a
// path satisfies wins, so a person filed under States is still a person. The
// folder names are the vault's, with the "NN - " numbering stripped.
//
//   folders   a folder with exactly this name
//   contains  a folder whose name contains this
//   anywhere  the path as a whole contains this
//   singular  how an article's own type line reads
//   plural    how the Browse buttons read (default: the type, capitalised, plus s)
//
// Plain JS with relative imports, so the prerender and the tests load it too.

const ROWS = [
  { type: 'person',       singular: 'Person',       plural: 'People',        folders: ['people', 'characters'] },
  { type: 'company',      singular: 'Corporation',  plural: 'Companies',     folders: ['companies', 'yarnojtes'] },
  { type: 'state',        singular: 'State',        plural: 'States',        folders: ['states'] },
  { type: 'city',         singular: 'City',         plural: 'Cities',        folders: ['cities'] },
  { type: 'country',      singular: 'Country',      plural: 'Countries',     folders: ['countries'], anywhere: 'rest of the world' },
  { type: 'event',        singular: 'Event',        plural: 'Events',        folders: ['history', 'wars'] },
  { type: 'law',          singular: 'Legislation',  plural: 'Laws',          folders: ['legislation'] },
  { type: 'institution',  singular: 'Institution',  plural: 'Institutions',  folders: ['federal', 'municipal', 'government', 'goverment'] },
  { type: 'organization', singular: 'Organization', plural: 'Organizations', folders: ['organizations', 'parties'] },
  { type: 'religion',     singular: 'Religion',     plural: 'Religion',      folders: ['religion'] },
  { type: 'tradition',    singular: 'Tradition',    plural: 'Traditions',    folders: ['traditions'] },
  { type: 'sport',        singular: 'Sport',        plural: 'Sport',         folders: ['sport'], contains: 'crolball' },
  { type: 'concept',      singular: 'Concept',      plural: 'Concepts',      folders: ['culture', 'philosophy', 'expressions'] },
  // types an article can declare that no folder implies
  { type: 'war',          singular: 'Conflict' },
  { type: 'technology',   singular: 'Technology' },
  { type: 'structure',    singular: 'Structure' },
  { type: 'document',     singular: 'Document' },
  { type: 'project',      plural: 'Projects' },
]

const BY_TYPE = new Map(ROWS.map(row => [row.type, row]))

// The sidebar's "By Type" links. It says Corporations and Legislation where
// Browse says Companies and Laws.
export const SIDEBAR_TYPES = [
  ['person', 'People'], ['company', 'Corporations'], ['state', 'States'], ['city', 'Cities'],
  ['country', 'Countries'], ['event', 'Events'], ['law', 'Legislation'], ['institution', 'Institutions'],
  ['concept', 'Concepts'], ['organization', 'Organizations'],
].map(([type, label]) => ({ type, label }))

// "01 - Susia/06 - Characters/Armadesh Versij.md" → ['susia', 'characters']
function folders(path) {
  return path
    .toLowerCase()
    .split('/')
    .slice(0, -1)
    .map(p => p.replace(/^\d+\s*-\s*/, '').trim())
}

// The type a file's folders say it is, or '' when they say nothing.
export function typeFromPath(path) {
  const segments = folders(path)
  const whole = path.toLowerCase()
  for (const row of ROWS) {
    if (row.folders?.some(name => segments.includes(name))) return row.type
    if (row.contains && segments.some(s => s.includes(row.contains))) return row.type
    if (row.anywhere && whole.includes(row.anywhere)) return row.type
  }
  return ''
}

// "Person", "Corporation"…; null for a type with no such line.
export function singularLabel(type) {
  return BY_TYPE.get(type)?.singular ?? null
}

// "People", "Companies"…; an unknown type is capitalised and given an s.
export function pluralLabel(type) {
  return BY_TYPE.get(type)?.plural ?? (type.charAt(0).toUpperCase() + type.slice(1) + 's')
}
