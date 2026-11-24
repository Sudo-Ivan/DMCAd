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

export interface IndexFile {
  v: number
  fields: string[]
  rows: unknown[][]
}

const BASE = import.meta.env.BASE_URL

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`)
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export function loadIndex(): Promise<IndexFile> {
  return fetchJson<IndexFile>('index.json')
}

export function loadStats(): Promise<Stats> {
  return fetchJson<Stats>('stats.json')
}

const bodyCache = new Map<string, Promise<Record<string, string>>>()

export function loadBodies(chunk: string): Promise<Record<string, string>> {
  let p = bodyCache.get(chunk)
  if (!p) {
    p = fetchJson<Record<string, string>>(`bodies/${chunk}.json`)
    bodyCache.set(chunk, p)
  }
  return p
}
