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
  masthead:    'Freely provided by Troli Ustaras, in the spirit of open knowledge',
  // Shown at the bottom of the sidebar
  footer:      'Content on this encyclopedia is freely available under the YM TU-(C4) license.',
  // Public address, used for the sitemap and canonical links
  url:         'https://dripsite.vercel.app',
  // Picture shown in link previews (WhatsApp, Discord...) for pages that
  // have none of their own. Articles use their infobox image or flag first.
  image:       'https://raw.githubusercontent.com/Switz-000/dripwiki/main/00%20-%20Meta/Images/Susia%20Modernista%20Mapa.png',
}

// ── IndexNow ──────────────────────────────────────────────────
// Tells Bing, and DuckDuckGo through Bing, which pages are new or changed
// on each production build. See section 5 of scripts/prerender.mjs.
// The key is public on purpose: the build serves it at /<key>.txt, which
// proves to the search engines that whoever submits URLs owns the site.
export const INDEXNOW_KEY = 'a999f8ca15a8c88ccab529249f0c4bef'

// ── Crawlers (robots.txt) ─────────────────────────────────────
// robots.txt is generated at build time by scripts/prerender.mjs.
// These AI training crawlers are told to stay out, in line with the
// LICENSE's text and data mining reservation. Search engines, and
// fetchers acting on a person's request, are still allowed.
export const BLOCKED_CRAWLERS = [
  'GPTBot',             // OpenAI, model training
  'ClaudeBot',          // Anthropic, model training
  'Google-Extended',    // Google, Gemini training (does not affect Google Search)
  'CCBot',              // Common Crawl, an open web archive many labs train on
  'Applebot-Extended',  // Apple, model training
  'meta-externalagent', // Meta, model training
]

// ── Home page hero text ──────────────────────────────────────
export const HOME = {
  overline:  'Provided by Troli Ustaras',
  // Use *word* to make it italic+blue in the title
  title:     'The *Dripstan* Encyclopedia',
  subtitle:  'A comprehensive reference for the Dripstan continenent, its history, institutions, corporations, and people.',
}

// ── Landing page (out of universe) ───────────────────────────
// The page at /, outside the wiki's in-universe frame. It explains the
// project to someone who has never heard of it; the wiki's own home page
// is now at /wiki. Any text starting with "TODO" is highlighted on the
// page, so unfinished spots are easy to see.
export const LANDING = {
  pageTitle: 'The Dripstao Project',          // browser tab title
  // Shown under the title in search results. Left out of the page while it
  // still starts with TODO, so a placeholder never reaches Google.
  description: 'TODO: one or two sentences for search results',
  title:     'Dripstao',
  byline:    'TODO: one line under the title',
  cta:       'Enter the wiki',    // button that goes to /wiki
  sections: [
    {
      heading: 'What is Dripstao?',
      paragraphs: [
        'Dripstao (or Dripstão in portuguese) is a speculative-fiction worldbuilding project centered on the Techno-Federative Republic of Susia and Confia the United Syndicates of Confia, spanning roughly 500 years of in-universe history and tracing how its political philosophy, institutions, economics, culture, and language evolved. ',
      ],
    },
    {
      heading: 'Our philosophy',
      paragraphs: [
        'We believe that history is created through mechanisms. There should never be hand-picked results. There is no grand narrative where the world serves the characters. Every institution has scars, every idea has a history, and every absurd tragedy is produced by a thousand rational choices of men who will never live to see it.',
      ],
    },
    {
      heading: 'How to read the wiki',
      paragraphs: [
        'TODO: the wiki is written from inside the world. Say so here, so nobody takes the articles for real history.',
      ],
    },
    {
      heading: 'Where to start',
      paragraphs: [
        'TODO: a sentence pointing new readers somewhere.',
      ],
      // Optional list of links under the paragraphs
      links: [
        { label: 'Susia',               to: '/article/susia' },
        { label: 'The map',             to: '/map' },
        { label: 'Browse all articles', to: '/browse' },
      ],
    },
    {
      heading: 'Who makes it',
      paragraphs: [
        'TODO: the authors, and how the project started.',
      ],
    },
        {
      heading: 'Join the community',
      paragraphs: [
        'Ask questions, give feedback, and discuss the world with other readers and contributors! Everyone is welcome! (Except Tekurs)',
      ],
      // Optional list of links under the paragraphs
      links: [
        { label: 'Our Discord server',               to: 'https://discord.gg/CnEmsQkmtP' },
        { label: 'The map',             to: '/map' },
        { label: 'Browse all articles', to: '/browse' },
      ],
    },
  ],
  // The license text itself is read from the LICENSE file in dripwiki,
  // so the site never keeps a second copy that could drift out of sync.
  licenseHeading: 'License',
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
    slug:  '01 - Susia__01 - Goverment__Municipal__Free Economic Zone ',
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
  // Backgrounds — warm near-black replaced with cool blue-tinted darks
  'bg':           '#0d1117',   // deep navy-black (was warm #101418)
  'bg-surface':   '#161c24',   // cool dark navy (was warm grey #202122)
  'bg-elevated':  '#1e2a38',   // muted slate-navy (was neutral #313233)

  // Text — warm parchment cooled slightly, still readable and professional
  'text-primary':   '#d6d9de', // cool off-white (was warm #dbd8d0)
  'text-secondary': '#6b7685', // cool blue-grey (was warm brown-grey #777373)
  'text-muted':     '#4e5a68', // deeper cool slate (was warm #8a837a)

  // Accents — shifted slightly more cobalt/electric, less pure blue
  'text-accent':  '#4a8ff5',   // vivid cobalt (was #4980e7, subtly brighter)
  'link':         '#7aaee8',   // desaturated sky-blue (was warm #8fb1e5)
  'link-hover':   '#4a8ff5',   // matches accent for cohesion
  'link-visited': '#9b8ec4',

  // Borders — cooled down considerably
  'border':        '#2a3441',   // cool dark steel
  'border-strong': '#3a4d60',   // stronger border for infobox outlines, scrollbar
  'rule':          '#141b24',   // deep navy rule (was warm #1a1814)
  'bg-rule':       '#1c2530',   // subtle row separator inside infoboxes/lifelines
  'link-missing':  '#4a5a6a',   // muted steel-blue for missing wikilinks
}
