import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeIndex, excerptChunk, type Notice } from '../src/lib/rows'
import {
  loadExcerpts,
  loadIndexNotices,
  loadSource,
  type SourceInfo,
} from '../src/lib/data'
import type { Stats } from '../src/lib/data'

const FIELDS = [
  'path', 'date', 'domain', 'claimantKey', 'type', 'urlCount',
  'targets', 'length', 'hasCounter',
]

// v2 repo index row: no excerpt field (moved to per-month sidecars).
const ROW = [
  '2024/2024-05-01-acme.markdown', '2024-05-01', 'github.com', 'acme',
  0, 2, 'acme/repo,acme/other', 1234, 0,
]

function notice(over: Partial<Notice> = {}): Notice {
  return {
    id: 'github:2024/2024-05-01-acme.markdown',
    source: 'github',
    path: '2024/2024-05-01-acme.markdown',
    date: '2024-05-01',
    domain: 'github.com',
    claimantKey: 'github:acme',
    type: 0,
    urlCount: 2,
    targets: ['acme/repo', 'acme/other'],
    excerpt: '',
    length: 1234,
    hasCounter: false,
    meta: {},
    ...over,
  }
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response
}

function stubFetch(map: Record<string, unknown>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const key = url.replace(/^.*\/data\//, '')
    if (!(key in map)) {
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }
    return jsonResponse(map[key])
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decodeIndex v2 shape', () => {
  it('decodes rows without an excerpt field', () => {
    const idx = {
      v: 2,
      source: 'github' as const,
      fields: FIELDS,
      rows: [ROW],
    }
    const [n] = decodeIndex(idx)
    expect(n.excerpt).toBe('')
    expect(n.targets).toEqual(['acme/repo', 'acme/other'])
    expect(n.claimantKey).toBe('github:acme')
    expect(n.id).toBe('github:2024/2024-05-01-acme.markdown')
  })
})

describe('excerptChunk', () => {
  it('maps repo sources to per-month sidecar chunks', () => {
    expect(excerptChunk(notice())).toBe('github-2024-05')
    expect(
      excerptChunk(notice({ source: 'lbry', id: 'lbry:x', path: 'x' })),
    ).toBe('lbry-2024-05')
  })

  it('returns null for sources with inline excerpts', () => {
    expect(
      excerptChunk(notice({ source: 'wikimedia', id: 'wikimedia:x' })),
    ).toBeNull()
    expect(
      excerptChunk(notice({ source: 'google', id: 'google:x' })),
    ).toBeNull()
  })

  it('handles undated notices', () => {
    expect(excerptChunk(notice({ date: '' }))).toBe('github-undated')
  })
})

describe('loadExcerpts', () => {
  it('fetches the sidecar and caches repeat calls', async () => {
    const calls = stubFetch({
      'excerpts/github-2024-05.json': {
        'github:2024/2024-05-01-acme.markdown': 'a notice excerpt',
      },
    })
    const a = await loadExcerpts('github-2024-05')
    const b = await loadExcerpts('github-2024-05')
    expect(a).toEqual({
      'github:2024/2024-05-01-acme.markdown': 'a notice excerpt',
    })
    expect(b).toBe(a)
    expect(calls.filter((c) => c.includes('excerpts/'))).toHaveLength(1)
  })
})

const STATS: Stats = {
  generatedAt: '2024-01-01T00:00:00Z',
  commit: 'abc',
  total: 2,
  firstDate: '2024-01-01',
  lastDate: '2024-02-01',
  years: { '2024': 2 },
  months: [['2024-01', 1], ['2024-02', 1]],
  types: { '0': 2 },
  topClaimants: [],
  claimantCount: 0,
  topOwners: [],
  topRepos: [],
  withClaimant: 0,
  withUrl: 0,
}

describe('loadIndexNotices / loadSource', () => {
  it('decodes a single index part', async () => {
    stubFetch({
      'src/github-2024.json': {
        v: 2,
        source: 'github',
        fields: FIELDS,
        rows: [ROW],
      },
    })
    const notices = await loadIndexNotices('src/github-2024.json')
    expect(notices).toHaveLength(1)
    expect(notices[0].excerpt).toBe('')
  })

  it('loads split index parts and stats for a source', async () => {
    stubFetch({
      'src/github-2024.json': {
        v: 2, source: 'github', fields: FIELDS, rows: [ROW],
      },
      'src/github-2023.json': {
        v: 2, source: 'github', fields: FIELDS, rows: [],
      },
      'stats/github.json': STATS,
    })
    const info: SourceInfo = {
      id: 'github',
      label: 'GitHub',
      count: 1,
      firstDate: '2024-01-01',
      lastDate: '2024-02-01',
      indexes: ['src/github-2024.json', 'src/github-2023.json'],
      stats: 'stats/github.json',
    }
    const loaded = await loadSource(info)
    expect(loaded.complete).toBe(true)
    expect(loaded.notices).toHaveLength(1)
    expect(loaded.stats.total).toBe(2)
  })
})
