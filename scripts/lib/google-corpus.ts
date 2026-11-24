// Builder for the Google Transparency Report copyright-removals data.
//
// requests.csv has ~58M rows (one per removal request). Shipping one
// index record per request is infeasible, so the index aggregates by
// copyright owner: owners with at least MIN_REQUESTS requests or
// MIN_URLS total URLs become one record each, carrying request/URL
// totals, date range, yearly breakdown, and top reporting org.
//
// The deflate member is cached in .cache/google keyed by the zip's
// Last-Modified header (see scripts/google-fetch.mjs) and inflated
// on the fly while parsing.

import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'
import { join } from 'node:path'
import {
  csvLineOpen,
  parseGoogleRow,
  splitCsvLine,
  type GoogleRequest,
} from '../../src/lib/google'
import { hasVisibleName, normalizeClaimantKey, TYPE_REQUEST } from '../../src/lib/parse'
import { ROOT, emptyStats, topEntries, type SourceBuild } from './emit'

const CSV = join(ROOT, '.cache', 'google', 'requests.csv.deflate')
const FETCH = join(ROOT, 'scripts', 'google-fetch.mjs')

const MIN_REQUESTS = 10
const MIN_URLS = 1000
// Owners reach speculative detail tracking (org + yearly maps) once they
// pass this many requests; final qualification is decided at the end.
const SPECULATIVE = 5

interface OwnerAgg {
  name: string
  requests: number
  removed: number
  notIndexed: number
  noAction: number
  pending: number
  abuser: number
  first: string
  last: string
  orgs?: Map<string, number>
  years?: Map<string, number>
}

function ensureGoogleData() {
  if (!existsSync(CSV)) {
    console.log('[google] requests.csv.deflate not cached, fetching via range requests')
  }
  execFileSync('node', [FETCH], { stdio: 'inherit' })
  if (!existsSync(CSV)) throw new Error('google requests.csv.deflate missing after fetch')
}

// Row iterator that reassembles records spanning multiple physical
// lines (quoted fields may contain newlines). The CSV is stored as a
// raw deflate member and inflated while streaming.
async function* records(): AsyncGenerator<GoogleRequest> {
  const inflated = new PassThrough()
  inflated.setEncoding('utf-8')
  const done = pipeline(createReadStream(CSV), createInflateRaw(), inflated)
  done.catch(() => {}) // the rejection is surfaced by `await done` below
  const rl = createInterface({
    input: inflated,
    crlfDelay: Infinity,
  })
  try {
    let first = true
    let pending = ''
    for await (const raw of rl) {
      if (first) {
        first = false
        continue
      }
      if (!pending) {
        if (!csvLineOpen(raw)) {
          const r = parseGoogleRow(splitCsvLine(raw))
          if (r) yield r
        } else {
          pending = raw
        }
        continue
      }
      pending += '\n' + raw
      if (!csvLineOpen(pending)) {
        const r = parseGoogleRow(splitCsvLine(pending))
        pending = ''
        if (r) yield r
      }
    }
    if (pending) {
      const r = parseGoogleRow(splitCsvLine(pending))
      if (r) yield r
    }
  } finally {
    rl.close()
    inflated.destroy()
    await done
  }
}

export async function buildGoogleCorpus(): Promise<SourceBuild> {
  ensureGoogleData()
  const meta = JSON.parse(readFileSync(join(ROOT, '.cache', 'google', 'meta.json'), 'utf-8'))
  const revision = meta.lastModified ?? 'unknown'
  console.log(`[google] parsing ${CSV}`)

  const owners = new Map<number, OwnerAgg>()
  let rows = 0

  for await (const r of records()) {
    rows++
    if (rows % 10_000_000 === 0) console.log(`[google]   ${rows} rows`)

    const oid = parseInt(r.ownerId, 10)
    if (!Number.isFinite(oid)) continue
    let agg = owners.get(oid)
    if (!agg) {
      agg = {
        name: '', requests: 0, removed: 0, notIndexed: 0, noAction: 0,
        pending: 0, abuser: 0, first: '', last: '',
      }
      owners.set(oid, agg)
    }
    if (!agg.name && r.owner) agg.name = r.owner
    agg.requests++
    agg.removed += r.removed
    agg.notIndexed += r.notIndexed
    agg.noAction += r.noAction
    agg.pending += r.pending
    if (r.abuser) agg.abuser++
    if (r.date) {
      if (!agg.first || r.date < agg.first) agg.first = r.date
      if (r.date > agg.last) agg.last = r.date
    }
    if (agg.requests === SPECULATIVE) {
      agg.orgs = new Map()
      agg.years = new Map()
    }
    if (agg.orgs && r.org) agg.orgs.set(r.org, (agg.orgs.get(r.org) ?? 0) + 1)
    if (agg.years && r.date.length >= 4) {
      const y = r.date.slice(0, 4)
      agg.years.set(y, (agg.years.get(y) ?? 0) + 1)
    }
  }
  console.log(`[google] ${rows} requests, ${owners.size} distinct owners`)

  // qualify: repeat filers or high URL volume
  const quals: { oid: number; a: OwnerAgg }[] = []
  for (const [oid, a] of owners) {
    const urls = a.removed + a.notIndexed + a.noAction + a.pending
    if (a.requests >= MIN_REQUESTS || urls >= MIN_URLS) quals.push({ oid, a })
  }
  console.log(`[google] ${quals.length} owners qualify (>=${MIN_REQUESTS} reqs or >=${MIN_URLS} urls)`)

  quals.sort((x, y) => y.a.requests - x.a.requests || y.a.last.localeCompare(x.a.last))

  const indexRows: unknown[][] = []
  const monthBuckets = new Map<string, number>()
  const yearBuckets = new Map<string, number>()
  const typeCounts = new Map<number, number>()
  const claimantCounts = new Map<string, number>()
  const claimantLabels = new Map<string, Map<string, number>>()
  let withUrl = 0
  let firstDate = ''
  let lastDate = ''

  for (const { oid, a } of quals) {
    const name = a.name || `Owner ${oid}`
    const key = normalizeClaimantKey(name) || 'unknown'
    const urls = a.removed + a.notIndexed + a.noAction + a.pending
    const ym = a.last ? a.last.slice(0, 7) : 'undated'
    monthBuckets.set(ym, (monthBuckets.get(ym) ?? 0) + 1)
    if (a.last.length >= 4) {
      const y = a.last.slice(0, 4)
      yearBuckets.set(y, (yearBuckets.get(y) ?? 0) + 1)
    }
    typeCounts.set(TYPE_REQUEST, (typeCounts.get(TYPE_REQUEST) ?? 0) + 1)
    claimantCounts.set(key, (claimantCounts.get(key) ?? 0) + 1)
    let labels = claimantLabels.get(key)
    if (!labels) {
      labels = new Map()
      claimantLabels.set(key, labels)
    }
    labels.set(name, (labels.get(name) ?? 0) + 1)
    if (urls > 0) withUrl++
    if (a.first && (!firstDate || a.first < firstDate)) firstDate = a.first
    if (a.last && a.last > lastDate) lastDate = a.last

    // top reporting org by request count
    let org = ''
    if (a.orgs && a.orgs.size) {
      let best = ''
      let bestN = -1
      for (const [o, c] of a.orgs) {
        if (c > bestN) {
          best = o
          bestN = c
        }
      }
      org = best
    }
    const years = a.years
      ? [...a.years.entries()].sort().map(([y, c]) => `${y}:${c}`).join(';')
      : ''

    const excerpt =
      `${a.requests.toLocaleString('en-US')} delisting request${a.requests === 1 ? '' : 's'}, ` +
      `${urls.toLocaleString('en-US')} URL${urls === 1 ? '' : 's'} requested`

    indexRows.push([
      `owner-${oid}`, a.last, '', key, hasVisibleName(name) ? name : '', TYPE_REQUEST, urls, '',
      excerpt, 0, 0,
      a.requests, a.removed, a.notIndexed, a.noAction, a.pending, a.abuser,
      a.first, a.last, years, org,
    ])
  }

  const stats = emptyStats()
  stats.generatedAt = new Date().toISOString()
  stats.commit = revision
  stats.total = indexRows.length
  stats.firstDate = firstDate
  stats.lastDate = lastDate
  stats.years = Object.fromEntries([...yearBuckets.entries()].sort())
  stats.months = [...monthBuckets.entries()].sort()
  stats.types = Object.fromEntries([...typeCounts.entries()].map(([t, c]) => [String(t), c]))
  stats.topClaimants = topEntries(claimantCounts, 120, (k) => {
    const labels = claimantLabels.get(k)
    if (!labels) return k
    let best = ''
    let bestN = 0
    for (const [name, count] of labels) {
      if (!hasVisibleName(name)) continue
      if (count > bestN) {
        best = name
        bestN = count
      }
    }
    return best || k
  })
  stats.claimantCount = claimantCounts.size
  stats.withUrl = withUrl
  stats.withClaimant = claimantCounts.size

  const index = {
    v: 1,
    source: 'google' as const,
    fields: [
      'path', 'date', 'domain', 'claimantKey', 'claimant', 'type', 'urlCount',
      'targets', 'excerpt', 'length', 'hasCounter',
      'requests', 'removed', 'notIndexed', 'noAction', 'pending', 'abuser',
      'firstDate', 'lastDate', 'years', 'org',
    ],
    rows: indexRows,
  }

  const idxJson = JSON.stringify(index)
  const { gzipSync } = await import('node:zlib')
  const gz = gzipSync(idxJson).length
  console.log(
    `[google] index ${(idxJson.length / 1024 / 1024).toFixed(1)} MB raw, ` +
      `${(gz / 1024 / 1024).toFixed(1)} MB gzip, ${indexRows.length} rows`,
  )

  return {
    id: 'google',
    revision,
    index,
    stats,
    bodies: new Map(),
    lazy: gz > 1_500_000,
  }
}
