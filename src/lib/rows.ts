// index.json row codec. The build script emits positional rows; this is
// the single place that knows the field order.

export const F = {
  path: 0,
  date: 1,
  domain: 2,
  claimantKey: 3,
  type: 4,
  urlCount: 5,
  targets: 6,
  excerpt: 7,
  length: 8,
  hasCounter: 9,
} as const

export interface Notice {
  path: string
  date: string
  domain: string
  claimantKey: string
  type: number
  urlCount: number
  targets: string[]
  excerpt: string
  length: number
  hasCounter: boolean
}

export function decodeRow(r: unknown[]): Notice {
  const targetsRaw = r[F.targets] as string
  return {
    path: r[F.path] as string,
    date: (r[F.date] as string) ?? '',
    domain: (r[F.domain] as string) ?? '',
    claimantKey: (r[F.claimantKey] as string) ?? '',
    type: (r[F.type] as number) ?? 0,
    urlCount: (r[F.urlCount] as number) ?? 0,
    targets: targetsRaw ? targetsRaw.split(',') : [],
    excerpt: (r[F.excerpt] as string) ?? '',
    length: (r[F.length] as number) ?? 0,
    hasCounter: (r[F.hasCounter] as number) === 1,
  }
}

export function yearOf(n: Notice): number {
  return n.date ? parseInt(n.date.slice(0, 4), 10) : 0
}

export function monthOf(n: Notice): string {
  return n.date ? n.date.slice(0, 7) : 'undated'
}

// bodies/<chunk>.json key: YYYY-MM, or "undated" for notices without a date
export function bodyChunk(n: Notice): string {
  return monthOf(n)
}
