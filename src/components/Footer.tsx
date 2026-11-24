import type { Stats } from '../lib/data'

export function Footer({ stats }: { stats: Stats | null }) {
  const year = new Date().getFullYear().toString()
  return (
    <footer className="mt-auto border-t border-edge py-8 text-[12px] text-ink3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4">
        <span>
          Data from{' '}
          <a
            href="https://github.com/github/dmca"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent transition hover:underline"
          >
            github/dmca
          </a>
          {stats?.commit && stats.commit !== 'unknown' && (
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
          Unofficial viewer. Not affiliated with GitHub.
        </span>
      </div>
      <div className="mx-auto mt-3 max-w-6xl px-4 text-[11px] text-ink3/60">
        © {year}
      </div>
    </footer>
  )
}
