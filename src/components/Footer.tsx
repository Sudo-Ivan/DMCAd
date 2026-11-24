import type { Stats } from '../lib/data'
import type { SourceInfo } from '../lib/data'

const SOURCE_LINKS: Record<string, { label: string; href: string }> = {
  github: { label: 'github/dmca', href: 'https://github.com/github/dmca' },
  google: {
    label: 'Google Transparency Report',
    href: 'https://transparencyreport.google.com/copyright/removals',
  },
  wikimedia: {
    label: 'Wikimedia Foundation',
    href: 'https://foundation.wikimedia.org/wiki/Legal:DMCA',
  },
  lbry: { label: 'lbryio/dmca', href: 'https://github.com/lbryio/dmca' },
}

export function Footer({
  stats,
  sources,
}: {
  stats: Stats | null
  sources?: SourceInfo[]
}) {
  const year = new Date().getFullYear().toString()
  const shown = sources?.length
    ? sources.map((s) => s.id)
    : ['github']
  return (
    <footer className="mt-auto border-t border-edge py-8 text-[12px] text-ink3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4">
        <span>
          Data from{' '}
          {shown.map((id, i) => {
            const l = SOURCE_LINKS[id]
            if (!l) return null
            return (
              <span key={id}>
                {i > 0 && ', '}
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-accent transition hover:underline"
                >
                  {l.label}
                </a>
              </span>
            )
          })}
          {stats?.commit && /^[0-9a-f]{40}$/i.test(stats.commit) && (
            <>
              {' '}
              at{' '}
              <a
                href={`https://github.com/github/dmca/commit/${stats.commit}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent transition hover:underline"
              >
                {stats.commit.slice(0, 7)}
              </a>
            </>
          )}
        </span>
        {stats?.generatedAt && (
          <span>
            built {new Date(stats.generatedAt).toLocaleDateString()}
          </span>
        )}
        <span className="ml-auto">
          Unofficial viewer. Not affiliated with the data sources.
        </span>
      </div>
      <div className="mx-auto mt-3 max-w-6xl px-4 text-[11px] text-ink3">
        © {year}
      </div>
    </footer>
  )
}
