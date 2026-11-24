// Data source identifiers shared by the build script, the loader, and the UI.

export type SourceId = 'github' | 'google' | 'wikimedia' | 'lbry'

export const SOURCE_ORDER: SourceId[] = ['github', 'google', 'wikimedia', 'lbry']

export const SOURCE_LABELS: Record<SourceId, string> = {
  github: 'GitHub',
  google: 'Google Search',
  wikimedia: 'Wikimedia',
  lbry: 'LBRY',
}

// Canonical upstream location for each source, used by the footer and the
// detail panel's external link.
export const SOURCE_URLS: Record<SourceId, string> = {
  github: 'https://github.com/github/dmca',
  google: 'https://transparencyreport.google.com/copyright/overview',
  wikimedia: 'https://foundation.wikimedia.org/wiki/Category:DMCA',
  lbry: 'https://github.com/lbryio/dmca',
}
