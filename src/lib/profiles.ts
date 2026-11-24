// Entity profile aggregation. Pure functions over the loaded Notice list so
// they stay unit-testable; the views pick which sections to render.

import type { Notice } from './rows'
import type { TopEntry } from './data'
import {
  TYPE_COUNTER,
  TYPE_RETRACTION,
  TYPE_REVERSAL,
} from './parse'

const RECENT_LIMIT = 15
const TOP_LIMIT = 20
const COUNTER_TYPES = new Set([TYPE_COUNTER, TYPE_RETRACTION, TYPE_REVERSAL])

export interface EntityProfile {
  key: string
  total: number
  firstDate: string
  lastDate: string
  urlCountSum: number
  withCounter: number
  months: [string, number][]
  types: Record<number, number>
  domains: TopEntry[]
  targets: TopEntry[] // owner/repo, lowercased
  owners: TopEntry[] // owner segment, lowercased
  claimants: TopEntry[] // claimantKey
  sources: Record<string, number>
  recent: Notice[]
}

export interface CounterStats {
  counter: number
  retraction: number
  reversal: number
  countered: number // notices flagged hasCounter
  months: [string, number][] // all counter-type notices combined
  monthsByType: Record<number, [string, number][]>
  topCounteredClaimants: TopEntry[] // claimantKey of notices with hasCounter
  topCounteredRepos: TopEntry[] // targets of counter-type notices
  topFilers: TopEntry[] // claimantKey of the counter-type notices
  recent: Notice[]
}

const ymOf = (n: Notice): string | null =>
  n.date && n.date.length >= 7 ? n.date.slice(0, 7) : null

function byCountDesc(m: Map<string, number>): TopEntry[] {
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, TOP_LIMIT)
}

// Shared aggregation over an already-filtered notice set.
function aggregate(list: Notice[], key: string): EntityProfile {
  const months = new Map<string, number>()
  const types = new Map<number, number>()
  const domains = new Map<string, number>()
  const targets = new Map<string, number>()
  const owners = new Map<string, number>()
  const claimants = new Map<string, number>()
  const sources = new Map<string, number>()
  let firstDate = ''
  let lastDate = ''
  let urlCountSum = 0
  let withCounter = 0
  const dated: Notice[] = []

  for (const n of list) {
    const ym = ymOf(n)
    if (ym) months.set(ym, (months.get(ym) ?? 0) + 1)
    types.set(n.type, (types.get(n.type) ?? 0) + 1)
    if (n.domain) domains.set(n.domain, (domains.get(n.domain) ?? 0) + 1)
    // Dedupe targets within a notice so one letter hitting two repos of the
    // same owner still counts the owner once.
    const seenTargets = new Set<string>()
    const seenOwners = new Set<string>()
    for (const t of n.targets) {
      const tl = t.toLowerCase()
      if (!seenTargets.has(tl)) {
        seenTargets.add(tl)
        targets.set(tl, (targets.get(tl) ?? 0) + 1)
      }
      const owner = tl.split('/')[0]
      if (!seenOwners.has(owner)) {
        seenOwners.add(owner)
        owners.set(owner, (owners.get(owner) ?? 0) + 1)
      }
    }
    claimants.set(n.claimantKey, (claimants.get(n.claimantKey) ?? 0) + 1)
    sources.set(n.source, (sources.get(n.source) ?? 0) + 1)
    urlCountSum += n.urlCount
    if (n.hasCounter) withCounter++
    if (n.date) {
      dated.push(n)
      if (!firstDate || n.date < firstDate) firstDate = n.date
      if (n.date > lastDate) lastDate = n.date
    }
  }

  dated.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return {
    key,
    total: list.length,
    firstDate,
    lastDate,
    urlCountSum,
    withCounter,
    months: [...months.entries()].sort(),
    types: Object.fromEntries(types),
    domains: byCountDesc(domains),
    targets: byCountDesc(targets),
    owners: byCountDesc(owners),
    claimants: byCountDesc(claimants),
    sources: Object.fromEntries(sources),
    recent: dated.slice(0, RECENT_LIMIT),
  }
}

export function claimantProfile(
  notices: Notice[],
  claimantKey: string,
): EntityProfile {
  return aggregate(
    notices.filter((n) => n.claimantKey === claimantKey),
    claimantKey,
  )
}

// Same owner semantics as the list filter: a target matches when the full
// `owner/repo` equals the value or its owner segment does.
export function ownerProfile(notices: Notice[], owner: string): EntityProfile {
  const o = owner.toLowerCase()
  const list = notices.filter((n) =>
    n.targets.some((t) => {
      const tl = t.toLowerCase()
      return tl === o || tl.split('/')[0] === o
    }),
  )
  return aggregate(list, `o:${owner}`)
}

export function repoProfile(notices: Notice[], repo: string): EntityProfile {
  const r = repo.toLowerCase()
  const list = notices.filter((n) =>
    n.targets.some((t) => t.toLowerCase() === r),
  )
  return aggregate(list, `r:${repo}`)
}

export function counterStats(notices: Notice[]): CounterStats {
  const counterList = notices.filter((n) => COUNTER_TYPES.has(n.type))
  const months = new Map<string, number>()
  const monthsByType = new Map<number, Map<string, number>>()
  const counteredClaimants = new Map<string, number>()
  const counteredRepos = new Map<string, number>()
  const filers = new Map<string, number>()
  let counter = 0
  let retraction = 0
  let reversal = 0
  let countered = 0

  for (const n of notices) {
    if (n.hasCounter) {
      countered++
      counteredClaimants.set(
        n.claimantKey,
        (counteredClaimants.get(n.claimantKey) ?? 0) + 1,
      )
    }
  }

  for (const n of counterList) {
    if (n.type === TYPE_COUNTER) counter++
    else if (n.type === TYPE_RETRACTION) retraction++
    else if (n.type === TYPE_REVERSAL) reversal++

    const ym = ymOf(n)
    if (ym) {
      months.set(ym, (months.get(ym) ?? 0) + 1)
      let per = monthsByType.get(n.type)
      if (!per) {
        per = new Map()
        monthsByType.set(n.type, per)
      }
      per.set(ym, (per.get(ym) ?? 0) + 1)
    }

    filers.set(n.claimantKey, (filers.get(n.claimantKey) ?? 0) + 1)
    const seen = new Set<string>()
    for (const t of n.targets) {
      const tl = t.toLowerCase()
      if (!tl.includes('/') || seen.has(tl)) continue
      seen.add(tl)
      counteredRepos.set(tl, (counteredRepos.get(tl) ?? 0) + 1)
    }
  }

  const dated = [...counterList].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )

  const byType = (t: number): [string, number][] =>
    [...(monthsByType.get(t)?.entries() ?? [])].sort()

  return {
    counter,
    retraction,
    reversal,
    countered,
    months: [...months.entries()].sort(),
    monthsByType: {
      [TYPE_COUNTER]: byType(TYPE_COUNTER),
      [TYPE_RETRACTION]: byType(TYPE_RETRACTION),
      [TYPE_REVERSAL]: byType(TYPE_REVERSAL),
    },
    topCounteredClaimants: byCountDesc(counteredClaimants),
    topCounteredRepos: byCountDesc(counteredRepos),
    topFilers: byCountDesc(filers),
    recent: dated.slice(0, RECENT_LIMIT),
  }
}
