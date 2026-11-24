import { slugFromPath } from './parse'
import type { Notice } from './rows'
import { titleCaseSlug } from './parse'

export interface SearchDoc {
  id: string
  c: string // claimant label
  k: string // claimant key (source-namespaced)
  s: string // slug
  t: string // targets csv + org for google
  x: string // excerpt
  d: string // domain
  v: string // source id
}

export function docFromNotice(
  n: Notice,
  labelFor: (key: string) => string,
): SearchDoc {
  return {
    id: n.id,
    c: n.claimant ?? labelFor(n.claimantKey),
    k: n.claimantKey,
    s: slugFromPath(n.path),
    t: [n.targets.join(' '), n.meta.org ?? ''].join(' ').trim(),
    x: n.excerpt,
    d: n.domain,
    v: n.source,
  }
}

export { titleCaseSlug }
