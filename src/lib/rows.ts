// Source index row codec. Each source ships an index file
// {v, source, fields, rows} where rows are positional arrays aligned to
// the fields legend. decodeIndex zips fields to values and maps them to
// the unified Notice shape; source-specific extras land in `meta`.

import { normalizeClaimantKey } from './parse'
import type { SourceId } from './sources'

export interface SourceIndexFile {
  v: number
  source: SourceId
  fields: string[]
  rows: unknown[][]
}

export interface Notice {
  id: string // `${source}:${path}`, unique across sources
  source: SourceId
  path: string // stable key within the source
  date: string
  domain: string
  claimantKey: string // `${source}:${normalized name}`
  claimant?: string // display-ready name when the source provides one
  type: number
  urlCount: number
  targets: string[]
  excerpt: string
  length: number
  hasCounter: boolean
  files?: string[] // wikimedia: infringing commons File: titles
  attachments?: string[] // wikimedia: notice PDF urls
  meta: Record<string, string>
}

// Fields every source index may carry. Anything else in a row is copied
// into Notice.meta for per-source detail rendering.
const KNOWN_FIELDS = new Set([
  'path', 'date', 'domain', 'claimantKey', 'claimant', 'type', 'urlCount',
  'targets', 'excerpt', 'length', 'hasCounter', 'id', 'files', 'attachments',
])

const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : undefined

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const truthy = (v: unknown): boolean =>
  v === true || v === 1 || v === '1' || v === 'true'

export function claimantKeyFor(source: SourceId, rawKey: string): string {
  return `${source}:${rawKey || 'unknown'}`
}

function toNotice(source: SourceId, rec: Record<string, unknown>): Notice {
  const path = str(rec.path ?? rec.id)
  const rawKey = str(rec.claimantKey) || normalizeClaimantKey(path) || 'unknown'
  const targetsRaw = str(rec.targets)
  const meta: Record<string, string> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (!KNOWN_FIELDS.has(k) && v !== null && v !== undefined && v !== '') {
      meta[k] = str(v)
    }
  }
  const claimant = str(rec.claimant)
  return {
    id: `${source}:${path}`,
    source,
    path,
    date: str(rec.date),
    domain: str(rec.domain),
    claimantKey: claimantKeyFor(source, rawKey),
    claimant: claimant ? claimant.slice(0, 90) : undefined,
    type: num(rec.type),
    urlCount: num(rec.urlCount),
    targets: targetsRaw ? targetsRaw.split(',').filter(Boolean) : [],
    excerpt: str(rec.excerpt),
    length: num(rec.length),
    hasCounter: truthy(rec.hasCounter),
    files: strList(rec.files),
    attachments: strList(rec.attachments),
    meta,
  }
}

export function decodeIndex(idx: SourceIndexFile): Notice[] {
  const out: Notice[] = new Array(idx.rows.length)
  for (let i = 0; i < idx.rows.length; i++) {
    const r = idx.rows[i]
    const rec: Record<string, unknown> = {}
    for (let j = 0; j < idx.fields.length; j++) rec[idx.fields[j]] = r[j]
    out[i] = toNotice(idx.source, rec)
  }
  return out
}

export function yearOf(n: Notice): number {
  return n.date && n.date.length >= 4 ? parseInt(n.date.slice(0, 4), 10) || 0 : 0
}

// YYYY-MM for full dates, YYYY for year-precision dates, 'undated' otherwise.
export function monthOf(n: Notice): string {
  if (!n.date) return 'undated'
  return n.date.length >= 7 ? n.date.slice(0, 7) : n.date.slice(0, 4)
}

// bodies chunk path relative to data/bodies/, or null when the source has
// no bodies (google).
export function bodyChunk(n: Notice): string | null {
  if (n.source === 'google') return null
  if (n.source === 'wikimedia') return 'wikimedia'
  const ym = monthOf(n)
  return n.source === 'lbry' ? `lbry/${ym}` : ym
}
