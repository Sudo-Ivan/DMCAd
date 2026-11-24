import { describe, expect, it } from 'vitest'
import type { Notice } from '../src/lib/rows'
import {
  claimantProfile,
  counterStats,
  ownerProfile,
  repoProfile,
} from '../src/lib/profiles'
import {
  TYPE_COUNTER,
  TYPE_COPYRIGHT,
  TYPE_RETRACTION,
  TYPE_REVERSAL,
} from '../src/lib/parse'

let seq = 0
function notice(over: Partial<Notice>): Notice {
  seq++
  return {
    id: `github:p${seq}`,
    source: 'github',
    path: `p${seq}`,
    date: '2024-01-15',
    domain: '',
    claimantKey: 'github:acme',
    type: TYPE_COPYRIGHT,
    urlCount: 0,
    targets: [],
    excerpt: '',
    length: 0,
    hasCounter: false,
    meta: {},
    ...over,
  }
}

const fixture = () => [
  notice({
    id: 'a1',
    claimantKey: 'github:acme',
    date: '2024-01-10',
    type: TYPE_COPYRIGHT,
    urlCount: 3,
    domain: 'a.com',
    targets: ['OwnerOne/RepoA', 'OwnerOne/RepoB'],
  }),
  notice({
    id: 'a2',
    claimantKey: 'github:acme',
    date: '2024-02-05',
    type: TYPE_COUNTER,
    urlCount: 1,
    domain: 'a.com',
    targets: ['OwnerTwo/RepoC'],
  }),
  notice({
    id: 'a3',
    claimantKey: 'github:acme',
    date: '2025-06-01',
    type: TYPE_COPYRIGHT,
    urlCount: 2,
    domain: 'b.com',
    targets: [],
  }),
  notice({
    id: 'b1',
    claimantKey: 'github:other',
    date: '2024-03-01',
    type: TYPE_COPYRIGHT,
    targets: ['OwnerOne/RepoA'],
  }),
]

describe('claimantProfile', () => {
  it('aggregates notices for one claimantKey', () => {
    const p = claimantProfile(fixture(), 'github:acme')
    expect(p.total).toBe(3)
    expect(p.firstDate).toBe('2024-01-10')
    expect(p.lastDate).toBe('2025-06-01')
    expect(p.urlCountSum).toBe(6)
    expect(p.months).toEqual([
      ['2024-01', 1],
      ['2024-02', 1],
      ['2025-06', 1],
    ])
    expect(p.types).toEqual({ 1: 2, 2: 1 })
    expect(p.domains).toEqual([
      { key: 'a.com', count: 2 },
      { key: 'b.com', count: 1 },
    ])
    expect(p.sources).toEqual({ github: 3 })
  })

  it('dedupes owners within a notice and counts repos', () => {
    const p = claimantProfile(fixture(), 'github:acme')
    // RepoA + RepoB share OwnerOne: the owner counts once per notice.
    expect(p.owners).toEqual([
      { key: 'ownerone', count: 1 },
      { key: 'ownertwo', count: 1 },
    ])
    expect(p.targets).toEqual([
      { key: 'ownerone/repoa', count: 1 },
      { key: 'ownerone/repob', count: 1 },
      { key: 'ownertwo/repoc', count: 1 },
    ])
  })

  it('returns recent notices newest first', () => {
    const p = claimantProfile(fixture(), 'github:acme')
    expect(p.recent.map((n) => n.id)).toEqual(['a3', 'a2', 'a1'])
  })

  it('returns an empty profile for an unknown claimant', () => {
    const p = claimantProfile(fixture(), 'github:nobody')
    expect(p.total).toBe(0)
    expect(p.recent).toEqual([])
  })
})

describe('ownerProfile', () => {
  it('matches the owner segment case-insensitively', () => {
    const p = ownerProfile(fixture(), 'OWNERTWO')
    expect(p.total).toBe(1)
    expect(p.recent[0].id).toBe('a2')
    expect(p.claimants).toEqual([{ key: 'github:acme', count: 1 }])
  })

  it('also matches a full owner/repo target exactly', () => {
    const p = ownerProfile(fixture(), 'ownerone/repoa')
    expect(p.total).toBe(2) // a1 and b1 both target ownerone/repoa
  })

  it('aggregates claimants and repos across sources', () => {
    const list = fixture().concat(
      notice({
        id: 'l1',
        source: 'lbry',
        claimantKey: 'lbry:acme',
        date: '2020-05-05',
        targets: ['OwnerOne/RepoA'],
      }),
    )
    const p = ownerProfile(list, 'ownerone')
    expect(p.total).toBe(3)
    expect(p.claimants).toEqual([
      { key: 'github:acme', count: 1 },
      { key: 'github:other', count: 1 },
      { key: 'lbry:acme', count: 1 },
    ])
    expect(p.sources).toEqual({ github: 2, lbry: 1 })
  })
})

describe('repoProfile', () => {
  it('matches targets case-insensitively', () => {
    const p = repoProfile(fixture(), 'OwnerOne/RepoA')
    expect(p.total).toBe(2)
    expect(p.claimants.map((c) => c.key).sort()).toEqual([
      'github:acme',
      'github:other',
    ])
  })

  it('does not match other repos under the same owner', () => {
    const p = repoProfile(fixture(), 'ownerone/repob')
    expect(p.total).toBe(1)
    expect(p.recent[0].id).toBe('a1')
  })
})

describe('counterStats', () => {
  const counters = () => [
    notice({
      id: 'c1',
      claimantKey: 'github:filer1',
      type: TYPE_COUNTER,
      date: '2024-01-05',
      targets: ['victim/repo1'],
    }),
    notice({
      id: 'c2',
      claimantKey: 'github:filer2',
      type: TYPE_RETRACTION,
      date: '2024-02-10',
      targets: ['victim/repo1', 'other/repo2'],
    }),
    notice({
      id: 'c3',
      claimantKey: 'github:filer1',
      type: TYPE_REVERSAL,
      date: '2024-03-01',
      targets: [],
    }),
    notice({
      id: 'v1',
      claimantKey: 'github:victimco',
      type: TYPE_COPYRIGHT,
      date: '2024-01-01',
      targets: ['victim/repo1'],
      hasCounter: true,
    }),
    notice({
      id: 'v2',
      claimantKey: 'github:victimco',
      type: TYPE_COPYRIGHT,
      date: '2024-01-02',
      targets: ['victim/repo2'],
      hasCounter: true,
    }),
    notice({
      id: 'x1',
      claimantKey: 'github:plain',
      type: TYPE_COPYRIGHT,
      date: '2024-01-03',
    }),
  ]

  it('counts counter-type notices by type', () => {
    const s = counterStats(counters())
    expect(s.counter).toBe(1)
    expect(s.retraction).toBe(1)
    expect(s.reversal).toBe(1)
    expect(s.countered).toBe(2)
  })

  it('groups months across the three types only', () => {
    const s = counterStats(counters())
    // v1/v2/x1 share 2024-01 but are not counter types.
    expect(s.months).toEqual([
      ['2024-01', 1],
      ['2024-02', 1],
      ['2024-03', 1],
    ])
    expect(s.monthsByType[TYPE_COUNTER]).toEqual([['2024-01', 1]])
    expect(s.monthsByType[TYPE_RETRACTION]).toEqual([['2024-02', 1]])
    expect(s.monthsByType[TYPE_REVERSAL]).toEqual([['2024-03', 1]])
  })

  it('ranks countered claimants, countered repos, and filers', () => {
    const s = counterStats(counters())
    expect(s.topCounteredClaimants).toEqual([
      { key: 'github:victimco', count: 2 },
    ])
    expect(s.topCounteredRepos).toEqual([
      { key: 'victim/repo1', count: 2 },
      { key: 'other/repo2', count: 1 },
    ])
    expect(s.topFilers).toEqual([
      { key: 'github:filer1', count: 2 },
      { key: 'github:filer2', count: 1 },
    ])
  })

  it('returns recent counter-type notices newest first', () => {
    const s = counterStats(counters())
    expect(s.recent.map((n) => n.id)).toEqual(['c3', 'c2', 'c1'])
  })
})
