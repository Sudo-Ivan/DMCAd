import { slugFromPath } from './parse'
import type { Notice } from './rows'
import { titleCaseSlug } from './parse'

export interface SearchDoc {
  id: string
  c: string
  k: string
  s: string
  t: string
  x: string
  d: string
}

export function docsFromNotices(
  notices: Notice[],
  labelFor: (key: string) => string,
): SearchDoc[] {
  return notices.map((n) => ({
    id: n.path,
    c: labelFor(n.claimantKey),
    k: n.claimantKey,
    s: slugFromPath(n.path),
    t: n.targets.join(' '),
    x: n.excerpt,
    d: n.domain,
  }))
}

export { titleCaseSlug }
