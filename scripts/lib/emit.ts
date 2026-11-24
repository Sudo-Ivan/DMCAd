// Shared emit helpers for source builders: index rows, stats, bodies.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Stats, TopEntry } from '../../src/lib/data'
import type { SourceId } from '../../src/lib/sources'
import { SOURCE_LABELS } from '../../src/lib/sources'
import { claimantKeyFor, type SourceIndexFile } from '../../src/lib/rows'

export const ROOT = new URL('../..', import.meta.url).pathname
export const OUT = join(ROOT, 'public', 'data')

export interface IndexPart {
  // file name under src/, without extension (e.g. 'github-2026')
  file: string
  index: SourceIndexFile
}

export interface SourceBuild {
  id: SourceId
  revision: string // commit sha, api date, zip last-modified, ...
  // Exactly one of `index` (single file) or `indexes` (split parts, loaded
  // in order) is set. Split parts let the app paint from the newest slice
  // while the rest stream in.
  index?: SourceIndexFile
  indexes?: IndexPart[]
  stats: Stats
  bodies: Map<string, Record<string, string>> // chunk path -> {key: text}
  // Per-month excerpt sidecars: chunk name (e.g. 'github-2024-01') ->
  // {bare path: excerpt}. Always emitted, even under SKIP_BODIES, because
  // the default result list renders excerpts.
  excerpts?: Map<string, Record<string, string>>
  lazy?: boolean
}

export function topEntries(
  map: Map<string, number>,
  n: number,
  label?: (k: string) => string,
): TopEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => (label ? { key: k, count, label: label(k) } : { key: k, count }))
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data))
}

// SKIP_BODIES=1 omits bodies/** (full-text search data) for builds that do
// not need it, e.g. CI Lighthouse runs. Excerpt sidecars are NOT gated:
// the default view renders them.
const SKIP_BODIES = process.env.SKIP_BODIES === '1'

export function emitSource(b: SourceBuild) {
  if (b.indexes) {
    for (const p of b.indexes) {
      writeJson(join(OUT, 'src', `${p.file}.json`), p.index)
    }
  } else if (b.index) {
    writeJson(join(OUT, 'src', `${b.id}.json`), b.index)
  }
  writeJson(join(OUT, 'stats', `${b.id}.json`), b.stats)
  for (const [chunk, ex] of b.excerpts ?? []) {
    // Keys are namespaced with the source id so they line up with
    // Notice.id (`${source}:${path}`), same convention as bodies/**.
    const keyed: Record<string, string> = {}
    for (const [k, v] of Object.entries(ex)) keyed[`${b.id}:${k}`] = v
    writeJson(join(OUT, 'excerpts', `${chunk}.json`), keyed)
  }
  if (SKIP_BODIES) return
  for (const [chunk, body] of b.bodies) {
    const keyed: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) keyed[`${b.id}:${k}`] = v
    writeJson(join(OUT, 'bodies', `${chunk}.json`), keyed)
  }
}

// Stats keys stay bare inside each per-source file; the app loader
// namespaces claimant keys with the source id when merging. Owner/repo
// keys are shared github.com namespaces and stay bare.
export function emptyStats(): Stats {
  return {
    generatedAt: '',
    commit: '',
    total: 0,
    firstDate: '',
    lastDate: '',
    years: {},
    months: [],
    types: {},
    topClaimants: [],
    claimantCount: 0,
    topOwners: [],
    topRepos: [],
    withClaimant: 0,
    withUrl: 0,
  }
}

export { claimantKeyFor, SOURCE_LABELS }
