// Shared emit helpers for source builders: index rows, stats, bodies.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Stats, TopEntry } from '../../src/lib/data'
import type { SourceId } from '../../src/lib/sources'
import { SOURCE_LABELS } from '../../src/lib/sources'
import { claimantKeyFor } from '../../src/lib/rows'

export const ROOT = new URL('../..', import.meta.url).pathname
export const OUT = join(ROOT, 'public', 'data')

export interface SourceBuild {
  id: SourceId
  revision: string // commit sha, api date, zip last-modified, ...
  index: { v: number; source: SourceId; fields: string[]; rows: unknown[][] }
  stats: Stats
  bodies: Map<string, Record<string, string>> // chunk path -> {key: text}
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

export function emitSource(b: SourceBuild) {
  writeJson(join(OUT, 'src', `${b.id}.json`), b.index)
  writeJson(join(OUT, 'stats', `${b.id}.json`), b.stats)
  for (const [chunk, body] of b.bodies) {
    // Keys are namespaced with the source id so they line up with
    // Notice.id (`${source}:${path}`) in the detail panel and the
    // full-text search worker.
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
