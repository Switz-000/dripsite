// Contract for the article type module (src/utils/articleTypes.js). Written
// before the module existed: the reform is complete when this file passes
// unmodified.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { typeFromPath, singularLabel, pluralLabel, SIDEBAR_TYPES } from '../src/utils/articleTypes.js'
import { geoTypeFromPath } from '../src/utils/geo.js'

// ── Folder → type ─────────────────────────────────────────────
const PATHS = [
  ['01 - Susia/06 - Characters/Armadesh Versij.md', 'person'],
  ['01 - Susia/People/X.md', 'person'],
  ['01 - Susia/03 - Companies/Susia.md', 'company'],
  ['02 - Confia/Yarnojtes/Y.md', 'company'],
  ['01 - Susia/01 - States/Z.md', 'state'],
  ['01 - Susia/02 - Cities/Z.md', 'city'],
  ['99 - Rest of the World/Rivers/Nile.md', 'country'],
  ['x/Countries/A.md', 'country'],
  ['x/History/A.md', 'event'],
  ['x/Wars/A.md', 'event'],
  ['x/Legislation/A.md', 'law'],
  ['x/Federal/A.md', 'institution'],
  ['x/Municipal/A.md', 'institution'],
  ['x/Government/A.md', 'institution'],
  ['x/Goverment/A.md', 'institution'],
  ['x/Organizations/A.md', 'organization'],
  ['x/Parties/A.md', 'organization'],
  ['x/Religion/A.md', 'religion'],
  ['x/Traditions/A.md', 'tradition'],
  ['x/Sport/A.md', 'sport'],
  ['x/Crolball Clubs/A.md', 'sport'],
  ['x/Culture/A.md', 'concept'],
  ['x/Philosophy/A.md', 'concept'],
  ['x/Expressions/A.md', 'concept'],
  ['x/Misc/A.md', ''],
]

describe('typeFromPath', () => {
  test('each folder name gives its type', () => {
    for (const [p, type] of PATHS) assert.equal(typeFromPath(p), type, p)
  })

  test('numbering prefixes and case do not matter', () => {
    assert.equal(typeFromPath('x/3-Companies/A.md'), 'company')
    assert.equal(typeFromPath('x/12 -   Companies/A.md'), 'company')
    assert.equal(typeFromPath('x/PEOPLE/A.md'), 'person')
  })

  test('only folders count, never the file name', () => {
    assert.equal(typeFromPath('People.md'), '')
    assert.equal(typeFromPath('x/Misc/Characters.md'), '')
  })

  test('where folders disagree, the earlier rule wins', () => {
    assert.equal(typeFromPath('x/States/People/A.md'), 'person')
    assert.equal(typeFromPath('x/Cities/Companies/A.md'), 'company')
    assert.equal(typeFromPath('x/Cities/States/A.md'), 'state')
  })
})

describe('geoTypeFromPath', () => {
  test('answers for the three geography types only', () => {
    assert.equal(geoTypeFromPath('x/States/A.md'), 'state')
    assert.equal(geoTypeFromPath('x/Cities/A.md'), 'city')
    assert.equal(geoTypeFromPath('x/Countries/A.md'), 'country')
    assert.equal(geoTypeFromPath('99 - Rest of the World/A.md'), 'country')
    assert.equal(geoTypeFromPath('x/Characters/A.md'), null)
    assert.equal(geoTypeFromPath('x/Companies/A.md'), null)
    assert.equal(geoTypeFromPath('x/Misc/A.md'), null)
  })

  test('never contradicts typeFromPath', () => {
    for (const [p] of PATHS) {
      const t = typeFromPath(p)
      assert.equal(geoTypeFromPath(p), ['country', 'state', 'city'].includes(t) ? t : null, p)
    }
  })
})

// ── Labels ────────────────────────────────────────────────────
describe('labels', () => {
  test('singular, for an article\'s type line', () => {
    const expected = {
      person: 'Person', company: 'Corporation', state: 'State', city: 'City', country: 'Country',
      institution: 'Institution', law: 'Legislation', event: 'Event', war: 'Conflict', concept: 'Concept',
      tradition: 'Tradition', organization: 'Organization', sport: 'Sport', technology: 'Technology',
      structure: 'Structure', document: 'Document', religion: 'Religion',
    }
    for (const [type, label] of Object.entries(expected)) assert.equal(singularLabel(type), label, type)
  })

  test('singular is null for what it does not know', () => {
    for (const type of ['gadget', 'project', 'constructor', '', undefined, null]) {
      assert.equal(singularLabel(type), null, String(type))
    }
  })

  test('plural, for the Browse buttons', () => {
    const expected = {
      person: 'People', company: 'Companies', state: 'States', city: 'Cities', country: 'Countries',
      event: 'Events', law: 'Laws', institution: 'Institutions', concept: 'Concepts', tradition: 'Traditions',
      religion: 'Religion', sport: 'Sport', organization: 'Organizations', project: 'Projects',
    }
    for (const [type, label] of Object.entries(expected)) assert.equal(pluralLabel(type), label, type)
  })

  test('plural falls back to the capitalised type with an s', () => {
    assert.equal(pluralLabel('gadget'), 'Gadgets')
    assert.equal(pluralLabel('war'), 'Wars')
  })
})

describe('SIDEBAR_TYPES', () => {
  test('the sidebar\'s By Type links, in order, with the sidebar\'s own words', () => {
    assert.deepEqual(SIDEBAR_TYPES, [
      { type: 'person', label: 'People' },
      { type: 'company', label: 'Corporations' },
      { type: 'state', label: 'States' },
      { type: 'city', label: 'Cities' },
      { type: 'country', label: 'Countries' },
      { type: 'event', label: 'Events' },
      { type: 'law', label: 'Legislation' },
      { type: 'institution', label: 'Institutions' },
      { type: 'concept', label: 'Concepts' },
      { type: 'organization', label: 'Organizations' },
    ])
  })
})

// ── The old tables are gone ───────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

function sources(rel) {
  const out = []
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const p = `${rel}/${entry.name}`
    if (entry.isDirectory()) out.push(...sources(p))
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(p)
  }
  return out
}
const mentioning = (pattern, allow = ['src/utils/articleTypes.js']) =>
  ['src', 'scripts', 'animation/lib'].flatMap(sources).filter(p => !allow.includes(p) && pattern.test(read(p)))

describe('article type knowledge lives in one place', () => {
  test('the folder rules are only in the type module', () => {
    assert.deepEqual(mentioning(/'yarnojtes'|'crolball'|'goverment'|'expressions'/), [])
  })

  test('the old functions and tables are gone', () => {
    assert.deepEqual(mentioning(/\b(guessTypeFromPath|getTypeLabel|TYPE_LABELS)\b/), [])
  })

  test('the sidebar builds its type links from the module', () => {
    const s = read('src/components/Layout.jsx')
    assert.ok(!s.includes('browse?type=company'), 'Layout.jsx still hardcodes a type link')
    assert.ok(s.includes('SIDEBAR_TYPES'), 'Layout.jsx does not use SIDEBAR_TYPES')
  })

  test('the type module loads in plain Node: relative imports with .js endings only', () => {
    const s = read('src/utils/articleTypes.js')
    for (const m of s.matchAll(/from\s+'([^']+)'/g)) {
      assert.match(m[1], /^\.{1,2}\/.*\.js$/, `import '${m[1]}'`)
    }
  })
})
