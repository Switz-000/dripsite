// ============================================================
// DRIPWIKI — SITE CUSTOMIZATION
// Edit this file to change text, colors, and content
// without touching any component code.
// ============================================================

// ── Site identity ────────────────────────────────────────────
export const SITE = {
  name:        'Dripwiki',
  tagline:     'The Free Encyclopedia',
  description: 'A comprehensive reference for the nations, people, and history of the Dripstan continent.',
  // Shown in the masthead bar at the top of every page
  masthead:    'Dripwiki — Encyclopedia of the Dripstan Continent',
  // Shown at the bottom of the sidebar
  footer:      'Sourced from github.com/Switz-000/dripwiki',
}

// ── Home page hero text ──────────────────────────────────────
export const HOME = {
  overline:  'Provided by Troli Ustaras',
  // Use *word* to make it italic+red in the title
  title:     'The *Dripstão* Encyclopedia',
  subtitle:  'A comprehensive reference for the Techno-Federative Republic of Susia, its history, institutions, corporations, and people.',
}

// ── Stats shown on home page ─────────────────────────────────
// articleCount is filled automatically; the others you set manually
export const HOME_STATS = [
  { label: 'States',    value: '9'  },
  { label: 'Yarnojtes', value: '6'  },
  { label: 'Nations',   value: '20' },
]

// ── Featured articles ─────────────────────────────────────────
// slug: vault path with / replaced by __
// These cards appear on the home page
export const FEATURED_ARTICLES = [
  {
    slug:  '01 - Susia__03 - Companies__Susia',
    label: 'Susia',
    desc:  'The Techno-Federative Republic',
  },
  {
    slug:  '01 - Susia__01 - Goverment__Federal__Yarnojte',
    label: 'Yarnojte',
    desc:  'A susian corporation granted strategic status',
  },
  {
    slug:  '01 - Susia/01 - Goverment/Municipal/Free Economic Zone ',
    label: 'Free Economic Zone',
    desc:  'A city-scale territory governed by a Yarnojte',
  },
  {
    slug:  '01 - Susia__04 - History__Continental Divide',
    label: 'Continental Divide',
    desc:  'The cold war with Confia, 1957-1977',
  },
  {
    slug:  '01 - Susia__06 - Characters__Armadesh Versij',
    label: 'Armadesh Versij',
    desc:  'Philosopher, martyr, father of liberty',
  },
  {
    slug:  '01 - Susia__06 - Characters__Yário Kolkov',
    label: 'Yário Kolkov',
    desc:  'Theorist of the Great Transition',
  },
]

// ── Browse categories on home page ───────────────────────────
export const HOME_CATEGORIES = [
  { label: 'People',       desc: 'Presidents, philosophers, executives', path: '/browse?type=person'       },
  { label: 'Corporations', desc: 'Yarnojtes and major companies',         path: '/browse?type=company'      },
  { label: 'Geography',    desc: 'States, cities, and territories',       path: '/browse?type=state,country,city,fez'},
  { label: 'History',      desc: 'Wars, events, and eras',                path: '/browse?type=event,war'        },
  { label: 'Law & Policy', desc: 'Legislation, treaties, doctrines',      path: '/browse?type=law,institution,treaty,sport'},
  { label: 'Culture',      desc: 'Philosophy, sport, tradition, religion',  path: '/browse?type=concept,tradition,religion,sport' },
]

// ── Color theme ───────────────────────────────────────────────
// These override the CSS variables in styles.css.
// Set to null to use the defaults from CSS.
//
// Current defaults (editorial light theme):
//   bg:            #f7f4ef   ← page background (off-white paper)
//   bg-surface:    #ffffff   ← sidebar + infobox background
//   bg-elevated:   #f2efe9   ← subtle elevated surfaces
//   text-primary:  #1a1814   ← main ink color
//   text-accent:   #8b1a1a   ← deep red (badges, hover)
//   link:          #2c4a7a   ← body link color (blue)
//   link-hover:    #8b1a1a   ← link hover (red)
//   border:        #d8d2c8   ← light rule lines
//   rule:          #1a1814   ← thick structural rules
//
// Example — swap to a dark theme:
//   bg:           '#0e0d0b'
//   bg-surface:   '#151410'
//   text-primary: '#e8e2d5'
//   text-accent:  '#c8a84b'
//
export const THEME = {
  'bg':           '#101418',
  'bg-surface':   '#202122',
  'bg-elevated':  null,
  'text-primary': '#dbd8d0',
  'text-secondary': '#777373',
  'text-muted':   null,
  'text-accent':  '#4980e7',
  'link':         '#8fb1e5',
  'link-hover':   '#5480e9',
  'border':       null,
  'rule':         null,
}
