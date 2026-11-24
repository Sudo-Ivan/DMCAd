import type { SortMode } from './types'

export interface AppState {
  q: string
  from: string // YYYY-MM
  to: string // YYYY-MM
  types: number[]
  claimants: string[]
  owners: string[]
  counterOnly: boolean
  sort: SortMode
  detail: string | null // notice path
}

export const DEFAULT_STATE: AppState = {
  q: '',
  from: '',
  to: '',
  types: [],
  claimants: [],
  owners: [],
  counterOnly: false,
  sort: 'auto',
  detail: null,
}

export function readState(): AppState {
  const p = new URLSearchParams(window.location.search)
  const csv = (k: string) =>
    (p.get(k) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return {
    q: p.get('q') ?? '',
    from: p.get('f') ?? '',
    to: p.get('t') ?? '',
    types: csv('ty')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)),
    claimants: csv('c'),
    owners: csv('o'),
    counterOnly: p.get('cn') === '1',
    sort: (['auto', 'new', 'old', 'rel', 'url'].includes(p.get('s') ?? '')
      ? (p.get('s') as SortMode)
      : 'auto'),
    detail: p.get('n'),
  }
}

export function stateToParams(s: AppState): URLSearchParams {
  const p = new URLSearchParams()
  if (s.q) p.set('q', s.q)
  if (s.from) p.set('f', s.from)
  if (s.to) p.set('t', s.to)
  if (s.types.length) p.set('ty', s.types.join(','))
  if (s.claimants.length) p.set('c', s.claimants.join(','))
  if (s.owners.length) p.set('o', s.owners.join(','))
  if (s.counterOnly) p.set('cn', '1')
  if (s.sort !== 'auto') p.set('s', s.sort)
  if (s.detail) p.set('n', s.detail)
  return p
}

export function urlFor(s: AppState): string {
  const p = stateToParams(s)
  const qs = p.toString()
  return qs ? `?${qs}` : window.location.pathname
}
