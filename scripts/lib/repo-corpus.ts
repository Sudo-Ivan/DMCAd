// Builder for git-checkout DMCA corpora: github/dmca and lbryio/dmca.
// Both use the same year-dir layout of notice markdown files.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  isPlausibleClaimant,
  parseNotice,
  titleCaseSlug,
  TYPE_COUNTER,
} from '../../src/lib/parse'
import type { SourceId } from '../../src/lib/sources'
import {
  emptyStats,
  ROOT,
  topEntries,
  type SourceBuild,
} from './emit'

export interface RepoSpec {
  id: Extract<SourceId, 'github' | 'lbry'>
  repoUrl: string
  cacheDir: string // under .cache/
  envVar?: string // env var pointing at an existing checkout
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function ensureCheckout(spec: RepoSpec): { dir: string; sha: string } {
  const envDir = spec.envVar ? process.env[spec.envVar] : undefined
  if (envDir) {
    const sha = existsSync(join(envDir, '.git'))
      ? git(['rev-parse', 'HEAD'], envDir)
      : 'unknown'
    return { dir: envDir, sha }
  }
  const cache = join(ROOT, spec.cacheDir)
  if (!existsSync(join(cache, '.git'))) {
    console.log(`cloning ${spec.repoUrl} into ${spec.cacheDir}`)
    mkdirSync(join(cache, '..'), { recursive: true })
    execFileSync('git', ['clone', '--depth', '1', spec.repoUrl, cache], {
      stdio: 'inherit',
    })
  } else {
    console.log(`updating ${spec.cacheDir}`)
    try {
      git(['fetch', '--depth', '1', 'origin', 'HEAD'], cache)
      git(['reset', '--hard', 'FETCH_HEAD'], cache)
    } catch (e) {
      console.warn('git update failed, using existing checkout:', e)
    }
  }
  return { dir: cache, sha: git(['rev-parse', 'HEAD'], cache) }
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

// index.json row layout, keep in sync with src/lib/rows.ts
// [path, date, domain, claimantKey, type, urlCount, targets(csv),
//  excerpt, length, hasCounter]
type Row = [
  string, string, string, string, number, number, string, string, number, number,
]

export async function buildRepoCorpus(spec: RepoSpec): Promise<SourceBuild> {
  const { dir, sha } = ensureCheckout(spec)
  console.log(`[${spec.id}] source: ${dir} @ ${sha}`)

  const files: string[] = []
  for (const year of readdirSync(dir)) {
    if (!/^\d{4}$/.test(year)) continue
    for (const p of walk(join(dir, year))) files.push(p)
  }
  files.sort()
  console.log(`[${spec.id}] ${files.length} notice files`)

  const rows: Row[] = []
  const bodies = new Map<string, Record<string, string>>()
  const counterRepos = new Set<string>()
  const parsed: ReturnType<typeof parseNotice>[] = []

  let i = 0
  for (const file of files) {
    i++
    if (i % 2000 === 0) console.log(`[${spec.id}]   parsed ${i}/${files.length}`)
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
    const chunk = n.date ? n.date.slice(0, 7) : 'undated'
    const chunkKey = spec.id === 'lbry' ? `lbry/${chunk}` : chunk
    let body = bodies.get(chunkKey)
    if (!body) {
      body = {}
      bodies.set(chunkKey, body)
    }
    body[rel] = content
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

  const dates = parsed.map((n) => n.date).filter(Boolean).sort()
  const stats = emptyStats()
  stats.generatedAt = new Date().toISOString()
  stats.commit = sha
  stats.total = parsed.length
  stats.firstDate = dates[0] ?? ''
  stats.lastDate = dates[dates.length - 1] ?? ''
  stats.years = Object.fromEntries([...yearCounts.entries()].sort())
  stats.months = [...monthCounts.entries()].sort()
  stats.types = Object.fromEntries([...typeCounts.entries()].map(([t, c]) => [String(t), c]))
  stats.topClaimants = topEntries(claimantCounts, 120, labelFor)
  stats.claimantCount = claimantCounts.size
  stats.topOwners = topEntries(ownerCounts, 150)
  stats.topRepos = topEntries(repoCounts, 150)
  stats.withClaimant = withClaimant
  stats.withUrl = withUrl

  const index = {
    v: 1,
    source: spec.id,
    fields: [
      'path', 'date', 'domain', 'claimantKey', 'type', 'urlCount',
      'targets', 'excerpt', 'length', 'hasCounter',
    ],
    rows,
  }

  const idxSize = JSON.stringify(index).length
  console.log(
    `[${spec.id}] index ${(idxSize / 1024 / 1024).toFixed(2)} MB, ${rows.length} rows, ` +
      `${bodies.size} body chunks`,
  )

  return { id: spec.id, revision: sha, index, stats, bodies }
}
