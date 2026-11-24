import type { Notice, SourceIndexFile } from './rows'
import { decodeIndexAsync } from './rows'
import type { SourceId } from './sources'

export interface TopEntry {
  key: string
  count: number
  label?: string
}

export interface Stats {
  generatedAt: string
  commit: string
  total: number
  firstDate: string
  lastDate: string
  years: Record<string, number>
  months: [string, number][]
  types: Record<string, number>
  topClaimants: TopEntry[]
  claimantCount: number
  topOwners: TopEntry[]
  topRepos: TopEntry[]
  withClaimant: number
  withUrl: number
}

export interface SourceInfo {
  id: SourceId
  label: string
  count: number
  firstDate: string
  lastDate: string
  index?: string // path under data/, e.g. src/github.json
  // Split index parts under data/, loaded in order (newest first). When
  // present, `index` is unset.
  indexes?: string[]
  stats: string // path under data/, e.g. stats/github.json
  commit?: string // upstream revision: sha, api date, zip last-modified
  lazy?: boolean // large index, fetched only when needed
}

export interface Manifest {
  v: number
  generatedAt: string
  sources: SourceInfo[]
}

export interface LoadedSource {
  info: SourceInfo
  stats: Stats
  notices: Notice[]
  // False while a split index is still streaming parts in. Search docs
  // are only built once every loaded source reports complete.
  complete: boolean
}

const BASE = import.meta.env.BASE_URL

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`)
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export function loadManifest(): Promise<Manifest> {
  return fetchJson<Manifest>('sources.json')
}

// Stats files are tiny; they load for every source up front so dashboard
// totals stay accurate even while a lazy index is still unfetched.
// Claimant keys are stored bare per source; namespace them so they line
// up with Notice.claimantKey (`${source}:${key}`) after merging.
export async function loadStats(info: SourceInfo): Promise<Stats> {
  const stats = await fetchJson<Stats>(info.stats)
  stats.topClaimants = stats.topClaimants.map((e) => ({
    ...e,
    key: `${info.id}:${e.key}`,
  }))
  return stats
}

// Fetches and decodes a single index file (src/<source>.json or one
// src/<source>-<year>.json part of a split index).
export async function loadIndexNotices(path: string): Promise<Notice[]> {
  const idx = await fetchJson<SourceIndexFile>(path)
  return decodeIndexAsync(idx)
}

// Loads every index file for a source (single `index` or ordered
// `indexes` parts) and decodes them into notices. Used for lazy sources;
// eager split sources go through the progressive loader in App.tsx so
// first paint only waits on the newest parts.
export async function loadSource(info: SourceInfo): Promise<LoadedSource> {
  const parts = info.indexes ?? (info.index ? [info.index] : [])
  const [stats, files] = await Promise.all([
    loadStats(info),
    Promise.all(parts.map((p) => fetchJson<SourceIndexFile>(p))),
  ])
  const notices: Notice[] = []
  for (const f of files) {
    const decoded = await decodeIndexAsync(f)
    // push(...decoded) would spread the whole index as call arguments and
    // overflow the stack on the 155k-row google dump.
    for (const n of decoded) notices.push(n)
  }
  return { info, stats, notices, complete: true }
}

export function loadBodies(chunk: string): Promise<Record<string, string>> {
  return bodyCache(chunk)
}

const bodyCacheMap = new Map<string, Promise<Record<string, string>>>()
function bodyCache(chunk: string): Promise<Record<string, string>> {
  let p = bodyCacheMap.get(chunk)
  if (!p) {
    p = fetchJson<Record<string, string>>(`bodies/${chunk}.json`)
    bodyCacheMap.set(chunk, p)
  }
  return p
}

// Excerpt sidecars: {noticeId: excerpt} per month chunk. Cached like
// bodies so scroll prefetch and the search sweep share one fetch.
export function loadExcerpts(chunk: string): Promise<Record<string, string>> {
  return excerptCache(chunk)
}

const excerptCacheMap = new Map<string, Promise<Record<string, string>>>()
function excerptCache(chunk: string): Promise<Record<string, string>> {
  let p = excerptCacheMap.get(chunk)
  if (!p) {
    p = fetchJson<Record<string, string>>(`excerpts/${chunk}.json`)
    excerptCacheMap.set(chunk, p)
  }
  return p
}

function mergeTopEntries(lists: TopEntry[][], cap = 300): TopEntry[] {
  const m = new Map<string, TopEntry>()
  for (const list of lists) {
    for (const e of list) {
      const cur = m.get(e.key)
      if (cur) {
        cur.count += e.count
        if (!cur.label && e.label) cur.label = e.label
      } else {
        m.set(e.key, { ...e })
      }
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, cap)
}

// Merge per-source stats into the aggregate shape the dashboard expects.
// Claimant/owner/repo keys are already source-namespaced at build time.
export function mergeStats(sources: Stats[]): Stats {
  const months = new Map<string, number>()
  const years: Record<string, number> = {}
  const types: Record<string, number> = {}
  let total = 0
  let withClaimant = 0
  let withUrl = 0
  let claimantCount = 0
  let firstDate = ''
  let lastDate = ''
  let generatedAt = ''
  const topClaimants: TopEntry[][] = []
  const topOwners: TopEntry[][] = []
  const topRepos: TopEntry[][] = []

  for (const s of sources) {
    total += s.total
    withClaimant += s.withClaimant
    withUrl += s.withUrl
    claimantCount += s.claimantCount
    if (s.firstDate && (!firstDate || s.firstDate < firstDate)) firstDate = s.firstDate
    if (s.lastDate && s.lastDate > lastDate) lastDate = s.lastDate
    if (s.generatedAt > generatedAt) generatedAt = s.generatedAt
    for (const [y, c] of Object.entries(s.years)) {
      years[y] = (years[y] ?? 0) + c
    }
    for (const [m, c] of s.months) {
      months.set(m, (months.get(m) ?? 0) + c)
    }
    for (const [t, c] of Object.entries(s.types)) {
      types[t] = (types[t] ?? 0) + c
    }
    topClaimants.push(s.topClaimants)
    topOwners.push(s.topOwners)
    topRepos.push(s.topRepos)
  }

  return {
    generatedAt,
    commit: '',
    total,
    firstDate,
    lastDate,
    years,
    months: [...months.entries()].sort(),
    types,
    topClaimants: mergeTopEntries(topClaimants),
    claimantCount,
    topOwners: mergeTopEntries(topOwners, 200),
    topRepos: mergeTopEntries(topRepos, 200),
    withClaimant,
    withUrl,
  }
}
