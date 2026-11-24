// Builds the static dataset consumed by the app.
//
//   pnpm data                 clone/update .cache/dmca, parse, write public/data
//   DMCA_DIR=/path pnpm data  parse an existing checkout instead
//
// Outputs:
//   public/data/index.json    one lightweight row per notice
//   public/data/bodies/*.json raw notice text, chunked by year-month
//   public/data/stats.json    precomputed aggregates for the dashboard

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  isPlausibleClaimant,
  parseNotice,
  titleCaseSlug,
  TYPE_COUNTER,
} from '../src/lib/parse'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'public', 'data')
const CACHE = join(ROOT, '.cache', 'dmca')
const REPO_URL = 'https://github.com/github/dmca.git'

// index.json row layout, keep in sync with src/lib/rows.ts
// [path, date, domain, claimantKey, type, urlCount, targets(csv),
//  excerpt, length, hasCounterTarget]

type Row = [
  string, string, string, string, number, number, string, string, number, number,
]

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function ensureCheckout(): { dir: string; sha: string } {
  const envDir = process.env.DMCA_DIR
  if (envDir) {
    const sha = existsSync(join(envDir, '.git'))
      ? git(['rev-parse', 'HEAD'], envDir)
      : 'unknown'
    return { dir: envDir, sha }
  }
  if (!existsSync(join(CACHE, '.git'))) {
    console.log(`cloning ${REPO_URL} into .cache/dmca`)
    mkdirSync(join(ROOT, '.cache'), { recursive: true })
    execFileSync('git', ['clone', '--depth', '1', REPO_URL, CACHE], {
      stdio: 'inherit',
    })
  } else {
    console.log('updating .cache/dmca')
    try {
      git(['fetch', '--depth', '1', 'origin', 'HEAD'], CACHE)
      git(['reset', '--hard', 'FETCH_HEAD'], CACHE)
    } catch (e) {
      console.warn('git update failed, using existing checkout:', e)
    }
  }
  return { dir: CACHE, sha: git(['rev-parse', 'HEAD'], CACHE) }
}

function* walk(dir: string): Generator<string> {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'data' || ent.name === '.github') continue
      yield* walk(p)
    } else if (/\.(md|markdown)$/i.test(ent.name)) {
      yield p
    }
  }
}

function topEntries(map: Map<string, number>, n: number, label?: (k: string) => string) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => (label ? { key: k, count, label: label(k) } : { key: k, count }))
}

async function main() {
  const { dir, sha } = ensureCheckout()
  console.log(`source: ${dir} @ ${sha}`)

  const files: string[] = []
  for (const year of readdirSync(dir)) {
    if (!/^\d{4}$/.test(year)) continue
    for (const p of walk(join(dir, year))) files.push(p)
  }
  files.sort()
  console.log(`${files.length} notice files`)

  const rows: Row[] = []
  const bodies = new Map<string, Record<string, string>>()
  const counterRepos = new Set<string>()
  const parsed: ReturnType<typeof parseNotice>[] = []

  let i = 0
  for (const file of files) {
    i++
    if (i % 2000 === 0) console.log(`  parsed ${i}/${files.length}`)
    const rel = relative(dir, file).split(sep).join('/')
    let content = ''
    try {
      content = readFileSync(file, 'utf-8')
    } catch {
      // unreadable file, keep empty record
    }
    const n = parseNotice(rel, content)
    parsed.push(n)
    if (n.type === TYPE_COUNTER) {
      for (const t of n.targets) counterRepos.add(t.toLowerCase())
    }
    const ym = n.date ? n.date.slice(0, 7) : 'undated'
    let chunk = bodies.get(ym)
    if (!chunk) {
      chunk = {}
      bodies.set(ym, chunk)
    }
    chunk[rel] = content
  }

  const claimantCounts = new Map<string, number>()
  const claimantLabels = new Map<string, Map<string, number>>()
  const keyBase = new Map<string, string>()
  const ownerCounts = new Map<string, number>()
  const repoCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()
  const yearCounts = new Map<string, number>()
  const typeCounts = new Map<number, number>()
  let withClaimant = 0
  let withUrl = 0

  for (const n of parsed) {
    // Only notices with a detected claimant feed the claimant facets and
    // top-claimants list. Anonymous notices keep their slug-derived
    // claimantKey for row filtering but are not claimants.
    if (n.hasClaimant && n.claimantKey) {
      if (!keyBase.has(n.claimantKey)) keyBase.set(n.claimantKey, n.base)
      claimantCounts.set(n.claimantKey, (claimantCounts.get(n.claimantKey) ?? 0) + 1)
      let labels = claimantLabels.get(n.claimantKey)
      if (!labels) {
        labels = new Map()
        claimantLabels.set(n.claimantKey, labels)
      }
      labels.set(n.claimant, (labels.get(n.claimant) ?? 0) + 1)
    }
    if (n.hasClaimant) withClaimant++
    if (n.urlCount > 0) withUrl++
    for (const t of n.targets) {
      const owner = t.split('/')[0].toLowerCase()
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1)
      repoCounts.set(t.toLowerCase(), (repoCounts.get(t.toLowerCase()) ?? 0) + 1)
    }
    const ym = n.date ? n.date.slice(0, 7) : 'undated'
    monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1)
    if (n.year) yearCounts.set(String(n.year), (yearCounts.get(String(n.year)) ?? 0) + 1)
    typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1)

    const hasCounter = n.targets.some((t) => counterRepos.has(t.toLowerCase())) ? 1 : 0
    rows.push([
      n.path, n.date, n.domain, n.claimantKey, n.type,
      n.urlCount, n.targets.join(','), n.excerpt, n.length, hasCounter,
    ])
  }

  // claimant display label: most frequent plausible raw claimant string
  // per key; fall back to the title-cased slug base when every extracted
  // variant looks like a clause.
  const labelFor = (k: string) => {
    const labels = claimantLabels.get(k)
    if (labels) {
      let best = ''
      let bestN = 0
      for (const [name, count] of labels) {
        if (!isPlausibleClaimant(name)) continue
        if (count > bestN) {
          best = name
          bestN = count
        }
      }
      if (best) return best
    }
    const base = keyBase.get(k)
    return base ? titleCaseSlug(base) : k
  }

  mkdirSync(join(OUT, 'bodies'), { recursive: true })

  const index = {
    v: 1,
    fields: [
      'path', 'date', 'domain', 'claimantKey', 'type', 'urlCount',
      'targets', 'excerpt', 'length', 'hasCounter',
    ],
    rows,
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))

  for (const [ym, chunk] of [...bodies.entries()].sort()) {
    writeFileSync(join(OUT, 'bodies', `${ym}.json`), JSON.stringify(chunk))
  }

  const dates = parsed.map((n) => n.date).filter(Boolean).sort()
  const stats = {
    generatedAt: new Date().toISOString(),
    commit: sha,
    total: parsed.length,
    firstDate: dates[0] ?? '',
    lastDate: dates[dates.length - 1] ?? '',
    years: Object.fromEntries([...yearCounts.entries()].sort()),
    months: [...monthCounts.entries()].sort().map(([m, c]) => [m, c]),
    types: Object.fromEntries([...typeCounts.entries()].map(([t, c]) => [String(t), c])),
    topClaimants: topEntries(claimantCounts, 120, labelFor),
    claimantCount: claimantCounts.size,
    topOwners: topEntries(ownerCounts, 150),
    topRepos: topEntries(repoCounts, 150),
    withClaimant,
    withUrl,
  }
  writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats))

  const idxSize = statSync(join(OUT, 'index.json')).size
  console.log(`index.json: ${(idxSize / 1024 / 1024).toFixed(2)} MB, ${rows.length} rows`)
  console.log(`bodies: ${bodies.size} chunks`)
  console.log(`claimant coverage: ${((withClaimant / parsed.length) * 100).toFixed(1)}%`)
  console.log(`url coverage: ${((withUrl / parsed.length) * 100).toFixed(1)}%`)
  console.log(`done`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
