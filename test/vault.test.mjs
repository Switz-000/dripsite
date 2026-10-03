// Contract for the vault module (src/vault). Written before the module existed:
// the reform is complete when this file passes unmodified.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createVault } from '../src/vault/vault.js'
import { githubAdapter } from '../src/vault/githubAdapter.js'
import { diskAdapter } from '../scripts/vault.mjs'
import { REPO_CONFIG, rawFileUrl } from '../src/utils/github.js'

// ── A small vault ─────────────────────────────────────────────
const SUSIA    = '01 - Susia/03 - Companies/Susia.md'
const ARMADESH = '01 - Susia/06 - Characters/Armadesh Versij.md'
const BAD      = '01 - Susia/06 - Characters/Bad Portrait.md'
const YARIO    = '01 - Susia/06 - Characters/Yário Kolkov.md'
const FLAG     = '00 - Meta/Images/Country Flags/Susia.png'

const FILES = {
  [SUSIA]: '---\ntype: country\n---\nSusia is a republic.\n\n| Leader | Years |\n|---|---|\n| [[Armadesh Versij]] | 1900 |\n\n- [[Yário Kolkov]]\n',
  [ARMADESH]: '---\ntype: person\nfull_name: Armadesh Versij\nportrait:\n  eyes: dot\n  shape:\n    headW: 1.05\n---\nArmadesh Versij was a philosopher of the Susian republic and wrote many long books.\n',
  // `portrait:` that is not a block must count as "no portrait"
  [BAD]: '---\ntype: person\nportrait: none\n---\nA person whose portrait field is not a block, which must count as no portrait.\n',
  [YARIO]: '---\ntype: person\nfull_name: Yário Kolkov\n---\nYário Kolkov was a theorist of the Great Transition and a writer of pamphlets.\n',
  [FLAG]: 'not really a png',
  '00 - Meta/Images/Country Flags/notes.txt': 'not an image',
  '00 - Meta/Class/Person.md': '---\nfields: []\n---\n',
  '.obsidian/app.json': '{}',
  'LICENSE': 'Free as in freedom.',
}
const ARTICLES = [SUSIA, ARMADESH, BAD, YARIO]
const SLUGS = ['susia', 'armadesh-versij', 'bad-portrait', 'yario-kolkov']
const PORTRAIT = { eyes: 'dot', shape: { headW: 1.05 } }

const plain = x => JSON.parse(JSON.stringify(x))
const sorted = xs => [...xs].sort()

// ── Adapters under test ───────────────────────────────────────
function memoryAdapter(files) {
  return {
    listFiles: async () => Object.keys(files),
    readText: async p => (Object.hasOwn(files, p) ? files[p] : null),
  }
}

function counting(adapter) {
  const calls = { listFiles: 0, readText: [] }
  return {
    calls,
    listFiles: () => { calls.listFiles++; return adapter.listFiles() },
    readText: p => { calls.readText.push(p); return adapter.readText(p) },
  }
}

const { owner, repo, branch } = REPO_CONFIG
const TREE_URL = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
const RAW_PREFIX = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`

// Answers like GitHub does, from a plain { path: text } object
function fakeGitHub(files) {
  const requests = []
  const respond = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  })
  const fetch = async input => {
    const url = String(input)
    requests.push(url)
    if (url === TREE_URL) {
      const dirs = new Set()
      for (const p of Object.keys(files)) {
        const parts = p.split('/')
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
      }
      return respond(200, {
        tree: [
          ...[...dirs].map(p => ({ path: p, type: 'tree' })),
          ...Object.keys(files).map(p => ({ path: p, type: 'blob' })),
        ],
      })
    }
    if (url.startsWith(RAW_PREFIX)) {
      const p = url.slice(RAW_PREFIX.length).split('/').map(decodeURIComponent).join('/')
      return Object.hasOwn(files, p) ? respond(200, files[p]) : respond(404, 'Not Found')
    }
    return respond(500, 'unexpected request: ' + url)
  }
  return { fetch, requests }
}

// A real folder on disk holding the same vault, plus a .git folder to ignore
let dir
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dripsite-vault-'))
  for (const [p, text] of Object.entries(FILES)) {
    const file = path.join(dir, p)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  fs.mkdirSync(path.join(dir, '.git'))
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
})
after(() => fs.rmSync(dir, { recursive: true, force: true }))

const ADAPTERS = {
  'in-memory': () => memoryAdapter(FILES),
  'disk': () => diskAdapter(dir),
  'GitHub': () => githubAdapter({ fetch: fakeGitHub(FILES).fetch }),
}

// ── The same answers whatever is behind the seam ──────────────
for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`vault over the ${name} adapter`, () => {
    test('files() lists every file', async () => {
      const v = createVault(make())
      assert.deepEqual(sorted(await v.files()), sorted(Object.keys(FILES)))
    })

    test('tree() is the articles only, as { path, type } objects', async () => {
      const v = createVault(make())
      const tree = await v.tree()
      assert.deepEqual(sorted(tree.map(f => f.path)), sorted(ARTICLES))
      assert.ok(tree.every(f => f.type === 'blob'))
      assert.equal(v.peekTree(), tree)
    })

    test('flags() maps a lowercase country name to its image', async () => {
      const v = createVault(make())
      const flags = await v.flags()
      assert.ok(flags instanceof Map)
      assert.deepEqual([...flags], [['susia', rawFileUrl(FLAG)]])
      assert.equal(v.peekFlags(), flags)
    })

    test('text() reads a file and rejects for a missing one; textOrNull() gives null', async () => {
      const v = createVault(make())
      assert.equal(await v.text(SUSIA), FILES[SUSIA])
      await assert.rejects(v.text('nope.md'))
      assert.equal(await v.textOrNull('LICENSE'), FILES.LICENSE)
      assert.equal(await v.textOrNull('chronology.json'), null)
    })

    test('meta() is the frontmatter, and peekMeta() has it afterwards', async () => {
      const v = createVault(make())
      assert.equal(v.peekMeta(ARMADESH), undefined)
      const meta = await v.meta(ARMADESH)
      assert.equal(meta.type, 'person')
      assert.equal(meta.full_name, 'Armadesh Versij')
      assert.equal(v.peekMeta(ARMADESH), meta)
    })

    test('article() is the rendered article, or null for an unknown slug', async () => {
      const v = createVault(make())
      assert.equal(v.peekArticle('susia'), undefined)
      const a = await v.article('susia')
      assert.equal(a.slug, 'susia')
      assert.equal(a.path, SUSIA)
      assert.equal(a.title, 'Susia')
      assert.equal(a.meta.type, 'country')
      assert.ok(a.html.includes('<a href="/article/armadesh-versij" class="wikilink">Armadesh Versij</a>'))
      assert.ok(a.html.includes('<a href="/article/yario-kolkov" class="wikilink">Yário Kolkov</a>'))
      assert.equal(typeof a.summary, 'string')
      assert.ok(!a.fromBuild)
      assert.equal(v.peekArticle('susia'), a)
      assert.equal((await v.article('armadesh-versij')).title, 'Armadesh Versij')
      assert.equal(await v.article('no-such-article'), null)
    })

    test('person() is { portrait } for a person and false for anything else', async () => {
      const v = createVault(make())
      assert.equal(v.peekPerson('yario-kolkov'), undefined)
      assert.deepEqual(plain(await v.person('armadesh-versij')), { portrait: PORTRAIT })
      assert.deepEqual(plain(await v.person('yario-kolkov')), { portrait: null })
      assert.deepEqual(plain(await v.person('bad-portrait')), { portrait: null })
      assert.equal(await v.person('susia'), false)
      assert.equal(await v.person('no-such-article'), false)
      assert.deepEqual(plain(v.peekPerson('yario-kolkov')), { portrait: null })
      assert.equal(v.peekPerson('susia'), false)
    })

    test('people() lists every person by name and reports progress', async () => {
      const v = createVault(make())
      const seen = []
      const people = await v.people((done, total) => seen.push([done, total]))
      assert.deepEqual(plain(people), [
        { path: ARMADESH, name: 'Armadesh Versij', portrait: PORTRAIT },
        { path: BAD, name: 'Bad Portrait', portrait: null },
        { path: YARIO, name: 'Yário Kolkov', portrait: null },
      ])
      assert.equal(seen.length, ARTICLES.length)
      assert.deepEqual(seen.at(-1), [ARTICLES.length, ARTICLES.length])
    })
  })
}

// ── Build and browser must agree ──────────────────────────────
test('the disk vault (build) and the GitHub vault (browser) give the same articles and people', async () => {
  const build = createVault(diskAdapter(dir))
  const browser = createVault(githubAdapter({ fetch: fakeGitHub(FILES).fetch }))
  for (const slug of [...SLUGS, 'no-such-article']) {
    assert.deepEqual(plain(await browser.article(slug)), plain(await build.article(slug)), `article ${slug}`)
    assert.deepEqual(plain(await browser.person(slug)), plain(await build.person(slug)), `person ${slug}`)
  }
})

// ── Caching and de-duplication ────────────────────────────────
describe('caching', () => {
  test('a file is read once, however it is asked for', async () => {
    const a = counting(memoryAdapter(FILES))
    const v = createVault(a)
    const [t1, t2] = await Promise.all([v.text(ARMADESH), v.text(ARMADESH)])
    assert.equal(t1, t2)
    await v.meta(ARMADESH)
    await v.article('armadesh-versij')
    await v.person('armadesh-versij')
    await v.people()
    assert.equal(a.calls.readText.filter(p => p === ARMADESH).length, 1)
  })

  test('the vault is listed once for tree, files and flags', async () => {
    const a = counting(memoryAdapter(FILES))
    const v = createVault(a)
    await Promise.all([v.tree(), v.flags(), v.files(), v.tree()])
    await v.article('susia')
    assert.equal(a.calls.listFiles, 1)
  })
})

// ── Data baked into a prerendered page ────────────────────────
const built = async (slug, files = FILES) => plain(await createVault(memoryAdapter(files)).article(slug))

describe('build data', () => {
  test('nothing is known before prime()', () => {
    const v = createVault(memoryAdapter(FILES))
    assert.equal(v.peekTree(), null)
    assert.equal(v.peekFlags(), null)
    assert.equal(v.peekArticle('susia'), undefined)
    assert.equal(v.peekPerson('susia'), undefined)
  })

  test('prime() makes it available at once, without reading anything', async () => {
    const a = counting(memoryAdapter(FILES))
    const v = createVault(a)
    const article = await built('susia')
    v.prime()
    v.prime({
      tree: ARTICLES,
      flags: [['susia', rawFileUrl(FLAG)]],
      article,
      people: { 'yario-kolkov': { portrait: null }, susia: false },
    })
    assert.deepEqual(v.peekTree(), ARTICLES.map(p => ({ path: p, type: 'blob' })))
    assert.ok(v.peekFlags() instanceof Map)
    assert.deepEqual([...v.peekFlags()], [['susia', rawFileUrl(FLAG)]])
    assert.equal(v.peekArticle('susia').html, article.html)
    assert.equal(v.peekArticle('susia').fromBuild, true)
    assert.deepEqual(v.peekPerson('yario-kolkov'), { portrait: null })
    assert.equal(v.peekPerson('susia'), false)
    assert.equal(await v.article('susia'), v.peekArticle('susia'))
    assert.equal(a.calls.listFiles, 0)
    assert.deepEqual(a.calls.readText, [])
  })

  test('tree() keeps the build copy when the live vault lists the same articles', async () => {
    const liveOrder = (await createVault(memoryAdapter(FILES)).tree()).map(f => f.path)
    const v = createVault(memoryAdapter(FILES))
    v.prime({ tree: liveOrder })
    const baked = v.peekTree()
    assert.equal(await v.tree(), baked)
    assert.equal(v.peekTree(), baked)
  })

  test('tree() replaces the build copy when the live vault differs', async () => {
    const v = createVault(memoryAdapter(FILES))
    v.prime({ tree: [SUSIA] })
    const baked = v.peekTree()
    const live = await v.tree()
    assert.notEqual(live, baked)
    assert.deepEqual(sorted(live.map(f => f.path)), sorted(ARTICLES))
    assert.equal(v.peekTree(), live)
  })

  test('a failed listing leaves the build copy in place, and the next try can succeed', async () => {
    let down = true
    const v = createVault({
      listFiles: async () => { if (down) throw new Error('GitHub is down'); return Object.keys(FILES) },
      readText: async () => null,
    })
    v.prime({ tree: [SUSIA] })
    const baked = v.peekTree()
    await assert.rejects(v.tree(), /GitHub is down/)
    assert.equal(v.peekTree(), baked)
    down = false
    assert.equal((await v.tree()).length, ARTICLES.length)
  })

  test('refreshArticle() reports nothing when the vault has not changed, and reads once', async () => {
    const a = counting(memoryAdapter(FILES))
    const v = createVault(a)
    v.prime({ tree: ARTICLES, article: await built('susia') })
    const [r1, r2] = await Promise.all([v.refreshArticle('susia'), v.refreshArticle('susia')])
    assert.equal(r1, null)
    assert.equal(r2, null)
    assert.equal(a.calls.readText.filter(p => p === SUSIA).length, 1)
  })

  test('refreshArticle() hands back the live article when the vault changed', async () => {
    const edited = { ...FILES, [SUSIA]: FILES[SUSIA].replace('Susia is a republic.', 'Susia is a techno-federative republic.') }
    const old = await built('susia')
    const v = createVault(memoryAdapter(edited))
    v.prime({ tree: ARTICLES, article: old })
    const live = await v.refreshArticle('susia')
    assert.ok(live)
    assert.ok(live.html.includes('techno-federative'))
    assert.notEqual(live.html, old.html)
    assert.ok(!live.fromBuild)
    assert.equal(v.peekArticle('susia'), live)
  })

  test('refreshArticle() keeps the build copy when the read fails', async () => {
    const v = createVault({
      listFiles: async () => ARTICLES,
      readText: async () => { throw new Error('offline') },
    })
    v.prime({ tree: ARTICLES, article: await built('susia') })
    assert.equal(await v.refreshArticle('susia'), null)
    assert.equal(v.peekArticle('susia').fromBuild, true)
  })

  test('refreshArticle() has nothing to do for an article that did not come from the build', async () => {
    const v = createVault(memoryAdapter(FILES))
    assert.equal(await v.refreshArticle('susia'), null)
    await v.article('susia')
    assert.equal(await v.refreshArticle('susia'), null)
  })
})

// ── The GitHub adapter on its own ─────────────────────────────
describe('GitHub adapter', () => {
  test('one tree request lists the vault, directories left out', async () => {
    const gh = fakeGitHub(FILES)
    const a = githubAdapter({ fetch: gh.fetch })
    assert.deepEqual(sorted(await a.listFiles()), sorted(Object.keys(FILES)))
    assert.deepEqual(gh.requests, [TREE_URL])
  })

  test('reads text from raw.githubusercontent.com with the path encoded; 404 is null', async () => {
    const gh = fakeGitHub(FILES)
    const a = githubAdapter({ fetch: gh.fetch })
    assert.equal(await a.readText(YARIO), FILES[YARIO])
    assert.deepEqual(gh.requests, [rawFileUrl(YARIO)])
    assert.equal(await a.readText('nope.md'), null)
  })

  test('other failures say which status', async () => {
    const failing = status => githubAdapter({
      fetch: async () => ({ ok: false, status, text: async () => '', json: async () => ({}) }),
    })
    await assert.rejects(failing(403).listFiles(), /403/)
    await assert.rejects(failing(500).readText(SUSIA), /500/)
  })
})

// ── The old ways into the vault are gone ──────────────────────
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
const outsideVault = () => ['src', 'scripts', 'animation/lib'].flatMap(sources).filter(p => !p.startsWith('src/vault/'))
const mentioning = (pattern, allow = []) => outsideVault().filter(p => !allow.includes(p) && pattern.test(read(p)))

describe('nothing reads the vault behind the module\'s back', () => {
  test('no cache is reachable from outside src/vault', () => {
    assert.deepEqual(mentioning(/\b(articleCache|metaCache|peopleCache)\b/), [])
  })

  test('the old fetch helpers are gone', () => {
    assert.deepEqual(mentioning(/\b(fetchMarkdown|getFileTree|getFlagMap|fetchMeta)\b/), [])
  })

  test('only the GitHub adapter and the portrait export talk to api.github.com', () => {
    assert.deepEqual(mentioning(/api\.github\.com/, ['src/portrait/vaultPortraits.js']), [])
  })

  test('the prerender asks the vault instead of working things out itself', () => {
    const s = read('scripts/prerender.mjs')
    for (const word of ['personAt', 'treeObjects', 'parseFrontmatter', 'buildFlagMap']) {
      assert.ok(!s.includes(word), `scripts/prerender.mjs still mentions ${word}`)
    }
  })

  test('the animation cast uses the shared folder walk and flags path', () => {
    const s = read('animation/lib/cast.mjs')
    assert.ok(!/function\s+walk\b/.test(s), 'cast.mjs still has its own walk')
    assert.ok(!s.includes('Country Flags'), 'cast.mjs still hardcodes the flags folder')
    assert.ok(s.includes('scripts/vault.mjs'), 'cast.mjs does not import scripts/vault.mjs')
  })
})
