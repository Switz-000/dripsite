// Contract for the person record module (src/person/record.js). Written before
// the module existed: the reform is complete when this file passes unmodified.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  personRecord, hasValue, compact, parseWikilink, plainText,
  isConvicted, RECORD_STATUSES, recordStatus,
  occupations, occupationTitles,
  quickStats, titleKicker, tabs, lifeline, parties, organizations,
  normalizeFilterValue, matchesFilters,
} from '../src/person/record.js'

const rec = raw => personRecord(raw)
const plain = x => JSON.parse(JSON.stringify(x))
const filters = (...pairs) => new Map(pairs.map(([k, vals]) => [k, new Set(vals)]))

// ── Raw frontmatter → record ──────────────────────────────────
describe('personRecord', () => {
  test('old flat birth and death keys become nested blocks', () => {
    const r = rec({ birth_year: 1900, birth_city: 'Vila', death_year: 1950, death_cause: 'Fever' })
    assert.deepEqual(r.birth, { year: 1900, city: 'Vila', state: null, country: null })
    assert.deepEqual(r.death, { year: 1950, city: null, state: null, country: null, cause: 'Fever' })
  })

  test('a nested block wins over flat keys', () => {
    const r = rec({ birth: { year: 1 }, birth_year: 2 })
    assert.equal(r.birth.year, 1)
  })

  test('aliases and occupation given as a comma string become lists', () => {
    const r = rec({ aliases: 'A, B,, C', occupation: 'Lawyer, Politician' })
    assert.deepEqual(r.aliases, ['A', 'B', 'C'])
    assert.deepEqual(r.occupation, ['Lawyer', 'Politician'])
  })

  test('a lone occupation object becomes a one-item list', () => {
    assert.deepEqual(rec({ occupation: { title: 'Judge' } }).occupation, [{ title: 'Judge' }])
  })

  test('charges become objects, and a lone charge becomes a one-item list', () => {
    assert.deepEqual(rec({ criminal_charges: ['Treason', { charge: 'Fraud' }] }).criminal_charges,
      [{ charge: 'Treason' }, { charge: 'Fraud' }])
    assert.deepEqual(rec({ criminal_charges: 'Treason' }).criminal_charges, [{ charge: 'Treason' }])
    assert.deepEqual(rec({ criminal_charges: { charge: 'Fraud' } }).criminal_charges, [{ charge: 'Fraud' }])
    assert.equal(rec({}).criminal_charges, undefined)
  })

  test('titles get start, end and a clean list of parties', () => {
    const [t, bare, junk] = rec({
      titles: [
        { title: 'Mayor', start_year: 1900, end_year: 1904, parties: ['[[Red]]', null, ''] },
        { title: 'Nothing else' },
        null,
      ],
    }).titles
    assert.equal(t.start, 1900)
    assert.equal(t.end, 1904)
    assert.deepEqual(t._parties, ['[[Red]]'])
    assert.equal(t.start_year, 1900)             // the raw keys stay
    assert.equal(bare.start, null)
    assert.equal(bare.end, null)
    assert.deepEqual(bare._parties, [])
    assert.equal(junk, null)
  })

  test('roles get start and end', () => {
    const [r] = rec({ roles: [{ role: 'Editor', start_year: 1925 }] }).roles
    assert.equal(r.start, 1925)
    assert.equal(r.end, null)
  })

  test('the input is not changed', () => {
    const raw = { birth_year: 1900, occupation: 'A, B', criminal_charges: ['X'], titles: [{ title: 'T', start_year: 1 }] }
    const before = plain(raw)
    rec(raw)
    assert.deepEqual(plain(raw), before)
  })

  test('nothing in, empty record out', () => {
    assert.deepEqual(rec(undefined), {})
    assert.deepEqual(rec(null), {})
  })

  test('every view copes with an empty record', () => {
    const r = rec({})
    assert.deepEqual(quickStats(r), [])
    assert.deepEqual(tabs(r), [])
    assert.deepEqual(lifeline(r), [])
    assert.deepEqual(occupations(r), [])
    assert.deepEqual(occupationTitles(r), [])
    assert.deepEqual(parties(r), [])
    assert.deepEqual(organizations(r), [])
    assert.equal(titleKicker(r), 'Person')
    assert.equal(recordStatus(r), 'Clean record')
  })
})

// ── One definition of "empty" ─────────────────────────────────
describe('hasValue and compact', () => {
  test('empty things', () => {
    for (const v of [null, undefined, '', '   ', [], [null, ''], {}, { a: null }, false, { posthumous: false }, [{ a: [] }]]) {
      assert.equal(hasValue(v), false, JSON.stringify(v))
    }
  })

  test('filled things', () => {
    for (const v of ['x', true, 0, [0], ['x'], { a: { b: 'x' } }, [{ in_absentia: true }]]) {
      assert.equal(hasValue(v), true, JSON.stringify(v))
    }
  })

  test('compact keeps the filled entries of a list and nothing of a non-list', () => {
    assert.deepEqual(compact([{ charge: '' }, { charge: 'x' }, null, 'y', '']), [{ charge: 'x' }, 'y'])
    assert.deepEqual(compact('x'), [])
    assert.deepEqual(compact(undefined), [])
  })
})

describe('wikilinks in values', () => {
  test('parseWikilink', () => {
    assert.deepEqual(parseWikilink('[[Page]]'), { page: 'Page', display: 'Page' })
    assert.deepEqual(parseWikilink('[[Page|Shown]]'), { page: 'Page', display: 'Shown' })
    assert.deepEqual(parseWikilink('[[Page#Sec]]'), { page: 'Page', display: 'Sec' })
    assert.deepEqual(parseWikilink('[[Page#Sec|Shown]]'), { page: 'Page', display: 'Shown' })
    assert.equal(parseWikilink('plain'), null)
    assert.equal(parseWikilink('a [[b]]'), null)
    assert.equal(parseWikilink(42), null)
  })

  test('plainText drops the brackets of a whole-value wikilink', () => {
    assert.equal(plainText('[[Page]]'), 'Page')
    assert.equal(plainText('[[Page|Shown]]'), 'Shown')
    assert.equal(plainText('[[Page#Sec]]'), 'Sec')
    assert.equal(plainText('plain'), 'plain')
    assert.equal(plainText('a [[b]]'), 'a [[b]]')
    for (const v of [null, undefined, '']) assert.equal(plainText(v), '')
  })
})

// ── Criminal record ───────────────────────────────────────────
describe('verdicts', () => {
  test('isConvicted', () => {
    const yes = ['Guilty', 'guilty', 'Found guilty on two counts', 'Convicted']
    const no = ['Not guilty', 'not  guilty', 'NOT GUILTY', 'Acquitted', 'Dismissed', '']
    for (const verdict of yes) assert.equal(isConvicted({ verdict }), true, verdict)
    for (const verdict of no) assert.equal(isConvicted({ verdict }), false, verdict)
    assert.equal(isConvicted({}), false)
    assert.equal(isConvicted(null), false)
  })

  test('the statuses, in the order the filter shows them', () => {
    assert.deepEqual(RECORD_STATUSES, ['Clean record', 'Convict', 'Acquitted'])
  })

  test('recordStatus', () => {
    const status = criminal_charges => recordStatus(rec({ criminal_charges }))
    assert.equal(status(undefined), 'Clean record')
    assert.equal(status([]), 'Clean record')
    assert.equal(status([{ charge: '', plea: null }]), 'Clean record')
    assert.equal(status([{ in_absentia: false, served: false }]), 'Clean record')   // template defaults are not a charge
    assert.equal(status([{ charge: 'Fraud', verdict: 'Guilty' }]), 'Convict')
    assert.equal(status([{ charge: 'Fraud', verdict: 'Not guilty' }]), 'Acquitted')
    assert.equal(status([{ charge: 'Fraud', verdict: 'Acquitted' }]), 'Acquitted')
    assert.equal(status([{ charge: 'Fraud' }]), 'Acquitted')                       // charged, no conviction
    assert.equal(status([{ charge: 'A', verdict: 'Not guilty' }, { charge: 'B', verdict: 'Guilty' }]), 'Convict')
    assert.equal(status('Treason'), 'Acquitted')
  })
})

// ── Occupations ───────────────────────────────────────────────
describe('occupations', () => {
  const r = rec({
    occupation: ['Lawyer', { title: 'Senator', start_year: 1900 }, { title: 'Judge', start_year: 1910, end_year: 1920 }, '', { title: '' }, '  Poet '],
  })

  test('title and span of each', () => {
    assert.deepEqual(occupations(r), [
      { title: 'Lawyer', span: null },
      { title: 'Senator', span: '1900–present' },
      { title: 'Judge', span: '1910–1920' },
      { title: '  Poet ', span: null },
    ])
  })

  test('titles only, trimmed, no blanks', () => {
    assert.deepEqual(occupationTitles(r), ['Lawyer', 'Senator', 'Judge', 'Poet'])
  })

  test('an end year alone still gives a span', () => {
    assert.deepEqual(occupations(rec({ occupation: [{ title: 'X', end_year: 1950 }] })),
      [{ title: 'X', span: '?–1950' }])
  })
})

// ── Header views ──────────────────────────────────────────────
describe('quickStats', () => {
  const mayor = { title: 'Mayor', start_year: 1900, end_year: 1904 }
  const emperor = { title: '[[Emperor]] of the Federated States', start_year: 1910, end_year: 1920 }

  test('age at death needs both years', () => {
    assert.deepEqual(quickStats(rec({ birth: { year: 1900 }, death: { year: 1950 } })),
      [{ label: 'Age at death', value: 50, unit: 'yrs' }])
    assert.deepEqual(quickStats(rec({ birth: { year: 1900 } })), [])
  })

  test('one office', () => {
    assert.deepEqual(quickStats(rec({ titles: [mayor] })),
      [{ label: 'Office', value: '1900–04', sub: 'Mayor', subLink: null }])
  })

  test('the highest of several offices, with its link', () => {
    assert.deepEqual(quickStats(rec({ titles: [mayor, emperor] })),
      [{ label: 'Highest office', value: '1910–20', sub: 'Emperor', subLink: 'Emperor' }])
  })

  test('office with missing years, and a name only its parties give', () => {
    const [s] = quickStats(rec({ titles: [{ title: '', parties: ['[[Red]]'] }] }))
    assert.equal(s.value, '?–?')
    assert.equal(s.sub, 'Red')
    assert.equal(s.subLink, null)
  })

  test('office names are shortened', () => {
    const sub = title => quickStats(rec({ titles: [{ title, start_year: 1, end_year: 2 }] }))[0].sub
    assert.equal(sub('President of the Council'), 'Pres.')
    assert.equal(sub('Member of the General Government of the Republic'), 'Gen. Gov.')
  })

  test('honours', () => {
    assert.deepEqual(quickStats(rec({ awards: [{ title: 'Medal', posthumous: true }] })),
      [{ label: 'Honour', value: 1, sub: 'posthumous' }])
    assert.deepEqual(quickStats(rec({ awards: [{ title: 'A', posthumous: true }, { title: 'B' }] })),
      [{ label: 'Honours', value: 2, sub: 'awarded' }])
  })

  test('charges: convicted only on a real conviction', () => {
    const stat = verdict => quickStats(rec({ criminal_charges: [{ charge: 'Fraud', verdict }] }))
    assert.deepEqual(stat('Guilty'), [{ label: 'Charges', value: 1, sub: 'convicted' }])
    assert.deepEqual(stat('guilty'), [{ label: 'Charges', value: 1, sub: 'convicted' }])
    assert.deepEqual(stat('Not guilty'), [{ label: 'Charges', value: 1, sub: '—' }])   // the old /guilty/i bug
    assert.deepEqual(stat('Acquitted'), [{ label: 'Charges', value: 1, sub: '—' }])
    assert.deepEqual(quickStats(rec({ criminal_charges: [{ charge: '' }] })), [])
  })

  test('at most three, in this order', () => {
    const all = {
      birth: { year: 1900 }, death: { year: 1960 },
      titles: [mayor], awards: [{ title: 'Medal' }],
      criminal_charges: [{ charge: 'Fraud', verdict: 'Guilty' }],
    }
    assert.deepEqual(quickStats(rec(all)).map(s => s.label), ['Age at death', 'Office', 'Honour'])
    const { birth, death, ...noAge } = all
    assert.deepEqual(quickStats(rec(noAge)).map(s => s.label), ['Office', 'Honour', 'Charges'])
  })
})

describe('titleKicker', () => {
  test('first occupation, string or object', () => {
    assert.equal(titleKicker(rec({ occupation: ['Lawyer', 'Poet'] })), 'Lawyer')
    assert.equal(titleKicker(rec({ occupation: [{ title: 'Senator' }] })), 'Senator')
    assert.equal(titleKicker(rec({ occupation: 'Judge, Poet' })), 'Judge')
  })

  test('a martyr is a treason-type charge plus a recorded cause of death', () => {
    const r = (charge, cause) => rec({
      occupation: ['Lawyer'],
      criminal_charges: [{ charge }],
      ...(cause ? { death: { year: 1900, cause } } : {}),
    })
    assert.equal(titleKicker(r('High TREASON', 'Executed')), 'Lawyer · Martyr')
    assert.equal(titleKicker(r('Sedition', 'Executed')), 'Lawyer · Martyr')
    assert.equal(titleKicker(r('Rebellion', 'Executed')), 'Lawyer · Martyr')
    assert.equal(titleKicker(r('Treason')), 'Lawyer')
    assert.equal(titleKicker(r('Fraud', 'Executed')), 'Lawyer')
  })

  test('without an occupation: Martyr, the type, or Person', () => {
    assert.equal(titleKicker(rec({ criminal_charges: [{ charge: 'Treason' }], death: { cause: 'Shot' } })), 'Martyr')
    assert.equal(titleKicker(rec({ type: 'person' })), 'person')
    assert.equal(titleKicker(rec({})), 'Person')
  })
})

describe('tabs', () => {
  const ids = raw => tabs(rec(raw)).map(t => t.id)

  test('one tab per group that has something in it', () => {
    assert.deepEqual(ids({}), [])
    assert.deepEqual(ids({ sex: 'f' }), ['facts'])
    assert.deepEqual(ids({ occupation: ['x'] }), ['career'])
    assert.deepEqual(ids({ party: '[[P]]' }), ['career'])
    assert.deepEqual(ids({ known_for: ['[[X]]'] }), ['legacy'])
    assert.deepEqual(ids({ criminal_charges: [{ charge: 'x' }] }), ['record'])
  })

  test('a template default is not content', () => {
    assert.deepEqual(ids({ enhanced: false }), [])
    assert.deepEqual(ids({ enhanced: true }), ['facts'])
    assert.deepEqual(ids({ criminal_charges: [{ charge: '' }] }), [])
  })

  test('old flat keys count once migrated', () => {
    assert.deepEqual(ids({ birth_year: 1900 }), ['facts'])
  })

  test('order and labels', () => {
    assert.deepEqual(tabs(rec({
      criminal_charges: [{ charge: 'x' }], known_for: ['a'], occupation: ['b'], sex: 'f',
    })), [
      { id: 'facts', label: 'Facts' },
      { id: 'career', label: 'Career' },
      { id: 'legacy', label: 'Legacy' },
      { id: 'record', label: 'Record' },
    ])
  })
})

// ── Lifeline ──────────────────────────────────────────────────
describe('lifeline', () => {
  const r = rec({
    birth: { year: 1900, city: '[[Vila]]', country: 'Susia' },
    death: { year: 1960, cause: 'Old age', city: 'Vila' },
    education: [
      { year: 1920, degree: 'Law', institution: '[[Univ|The University]]' },
      { degree: 'No year' },
    ],
    titles: [
      {
        title: '[[Mayor]]', start_year: 1930, end_year: 1934, seat: '[[Vila]]',
        parties: ['[[Red|Reds]]', 'Blue'], appointer: '[[Emperor]]', notes: 'Short',
      },
      { title: 'No start' },
    ],
    roles: [{ role: 'Editor', start_year: 1925, employer: '[[Daily]]' }],
    military_service: [
      {
        start_year: 1915, end_year: 1918, rank: 'Captain', branch: '[[Army]]',
        allegiance: '[[Susia]]', conflicts: ['[[War A]]', '', '[[War B]]'],
      },
      { rank: 'Colonel' },
    ],
  })

  test('events in year order, entries without a start year left out', () => {
    assert.deepEqual(lifeline(r), [
      { year: 1900, kind: 'birth', title: 'Born', location: 'Vila, Susia' },
      { year: 1915, kind: 'military', title: 'Captain, Army', span: '1915–1918', party: 'Susia', location: 'War A, War B', notes: null },
      { year: 1920, kind: 'event', title: 'Law', location: 'The University' },
      { year: 1925, kind: 'event', title: 'Editor', span: '1925–?', location: 'Daily', notes: null },
      { year: 1930, kind: 'office', title: 'Mayor', span: '1930–1934', location: 'Vila', party: 'Reds, Blue · appt. Emperor', notes: 'Short' },
      { year: 1960, kind: 'death', title: 'Old age', location: 'Vila' },
    ])
  })

  test('the lifeline never carries a wikilink', () => {
    const walk = v => {
      if (typeof v === 'string') assert.ok(!v.includes('[['), v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(lifeline(r))
  })

  test('gaps get plain defaults', () => {
    const events = lifeline(rec({
      death: { year: 1900 },
      education: [{ year: 1890 }],
      titles: [{ start_year: 1895 }],
      roles: [{ start_year: 1896 }],
      military_service: [{ start_year: 1897 }],
    }))
    assert.deepEqual(events.map(e => e.title), ['Degree', 'Title', 'Role', 'Military service', 'Died'])
    assert.equal(events[1].span, '1895–?')
  })
})

describe('parties and organizations', () => {
  test('the list and the single value merged, without repeats', () => {
    assert.deepEqual(parties(rec({ parties: ['[[A]]', '[[B]]'], party: '[[A]]' })), ['[[A]]', '[[B]]'])
    assert.deepEqual(parties(rec({ party: 'X' })), ['X'])
    assert.deepEqual(organizations(rec({ organizations: ['O1'], organization: 'O2' })), ['O1', 'O2'])
    assert.deepEqual(organizations(rec({ organization: '' })), [])
  })
})

// ── Browse filters run against the record ─────────────────────
describe('matchesFilters', () => {
  test('values compare lowercase and without wikilink brackets', () => {
    assert.equal(normalizeFilterValue('[[Susia|The Republic]]'), 'the republic')
    assert.equal(normalizeFilterValue('[[Page#Sec]]'), 'page')
    assert.equal(normalizeFilterValue(' Foo '), 'foo')
    assert.equal(normalizeFilterValue(null), '')
    assert.equal(normalizeFilterValue(undefined), '')
  })

  test('no filters, or only empty ones, match everything', () => {
    assert.equal(matchesFilters(rec({}), new Map()), true)
    assert.equal(matchesFilters(rec({}), filters(['sex', []])), true)
  })

  test('occupation: strings, objects and comma strings', () => {
    const f = v => filters(['occupation', [v]])
    assert.equal(matchesFilters(rec({ occupation: ['Lawyer'] }), f('lawyer')), true)
    assert.equal(matchesFilters(rec({ occupation: ['Lawyer'] }), f('judge')), false)
    assert.equal(matchesFilters(rec({ occupation: [{ title: 'Judge' }] }), f('judge')), true)
    assert.equal(matchesFilters(rec({ occupation: { title: 'Judge' } }), f('judge')), true)
    assert.equal(matchesFilters(rec({ occupation: 'Lawyer, Judge' }), f('judge')), true)
    assert.equal(matchesFilters(rec({}), f('judge')), false)
  })

  test('record_status uses the same rule as the infobox', () => {
    const f = v => filters(['record_status', [v]])
    assert.equal(matchesFilters(rec({}), f('clean record')), true)
    assert.equal(matchesFilters(rec({ criminal_charges: [{ charge: 'x', verdict: 'Guilty' }] }), f('convict')), true)
    assert.equal(matchesFilters(rec({ criminal_charges: [{ charge: 'x', verdict: 'Not guilty' }] }), f('convict')), false)
    assert.equal(matchesFilters(rec({ criminal_charges: [{ charge: 'x', verdict: 'Not guilty' }] }), f('acquitted')), true)
  })

  test('nested keys look inside blocks and lists of blocks', () => {
    const guilty = rec({ criminal_charges: [{ charge: 'x', verdict: 'Guilty' }] })
    assert.equal(matchesFilters(guilty, filters(['criminal_charges.verdict', ['guilty']])), true)
    assert.equal(matchesFilters(guilty, filters(['criminal_charges.verdict', ['acquitted']])), false)
    assert.equal(matchesFilters(rec({ birth: { country: '[[Susia]]' } }), filters(['birth.country', ['susia']])), true)
    assert.equal(matchesFilters(rec({}), filters(['birth.country', ['susia']])), false)
  })

  test('old flat birth keys are found through the record', () => {
    assert.equal(matchesFilters(rec({ birth_year: 1900, birth_country: 'Susia' }), filters(['birth.country', ['susia']])), true)
  })

  test('top-level fields, scalar or list', () => {
    assert.equal(matchesFilters(rec({ sex: 'Female' }), filters(['sex', ['female']])), true)
    assert.equal(matchesFilters(rec({ sex: 'Female' }), filters(['sex', ['male']])), false)
    assert.equal(matchesFilters(rec({ ethnicity: ['[[Kolk]]', 'Other'] }), filters(['ethnicity', ['kolk']])), true)
    assert.equal(matchesFilters(rec({}), filters(['sex', ['female']])), false)
  })

  test('all active filters must match', () => {
    const r = rec({ sex: 'Female', occupation: ['Judge'] })
    assert.equal(matchesFilters(r, filters(['sex', ['female']], ['occupation', ['judge']])), true)
    assert.equal(matchesFilters(r, filters(['sex', ['female']], ['occupation', ['poet']])), false)
  })

  test('articles that are not people filter on their plain frontmatter', () => {
    assert.equal(matchesFilters({ type: 'city', country: '[[Susia]]' }, filters(['country', ['susia']])), true)
  })
})

// ── The old logic is gone from the components ─────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('the components only render', () => {
  test('PersonInfobox keeps none of the person logic', () => {
    const s = read('src/components/PersonInfobox.jsx')
    for (const word of ['normalizeMeta', 'officeRank', 'highestOffice', 'function buildQuickStats', 'function buildTabs',
      'function titleKicker', 'function hasVal', 'function compact', 'function stripWL', 'function parseWL']) {
      assert.ok(!s.includes(word), `PersonInfobox.jsx still has ${word}`)
    }
    assert.ok(!/\/guilty\//.test(s), 'PersonInfobox.jsx still tests a verdict itself')
    assert.ok(s.includes('person/record.js'), 'PersonInfobox.jsx does not import the record module')
  })

  test('BrowsePage keeps none of the person logic', () => {
    const s = read('src/pages/BrowsePage.jsx')
    for (const word of ['function recordStatus', 'function articleMatchesSubFilters', 'function normalizeVal', 'RECORD_OPTIONS']) {
      assert.ok(!s.includes(word), `BrowsePage.jsx still has ${word}`)
    }
    assert.ok(!/guilty|convict/.test(s), 'BrowsePage.jsx still tests a verdict itself')
    assert.ok(s.includes('person/record.js'), 'BrowsePage.jsx does not import the record module')
  })

  test('Infobox no longer lists the old flat person keys', () => {
    const s = read('src/components/Infobox.jsx')
    for (const word of ['birth_year', 'death_year', 'birth_city', 'death_cause']) {
      assert.ok(!s.includes(word), `Infobox.jsx still lists ${word}`)
    }
  })

  test('the record module loads in plain Node: relative imports with .js endings only', () => {
    const s = read('src/person/record.js')
    for (const m of s.matchAll(/from\s+'([^']+)'/g)) {
      assert.match(m[1], /^\.{1,2}\/.*\.js$/, `import '${m[1]}'`)
    }
  })
})
