// Builds the static dataset consumed by the app.
//
//   pnpm data                 fetch/parse all sources, write public/data
//   DMCA_DIR=/path pnpm data  parse an existing github/dmca checkout
//
// Outputs (all under public/data/):
//   sources.json              manifest: per-source id, label, counts, files
//   src/<source>.json         one index file per source (positional rows)
//   stats/<source>.json       precomputed aggregates per source
//   bodies/**.json            raw notice text, chunked per source

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRepoCorpus } from './lib/repo-corpus'
import { buildGoogleCorpus } from './lib/google-corpus'
import { buildWikimediaCorpus } from './lib/wikimedia-corpus'
import { emitSource, OUT, type SourceBuild } from './lib/emit'
import { SOURCE_LABELS, SOURCE_ORDER, type SourceId } from '../src/lib/sources'

// SKIP_SOURCES=google,wikimedia skips individual builders (used by CI,
// where the lazy google corpus is too heavy to fetch for a Lighthouse run).
// SKIP_BODIES=1 skips writing bodies/** (only needed for full-text search).
const SKIP_SOURCES = new Set(
  (process.env.SKIP_SOURCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

async function main() {
  // regenerate everything so stale chunks never linger
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const builds: SourceBuild[] = []
  const run = async (
    label: string,
    fn: () => Promise<SourceBuild>,
  ): Promise<void> => {
    if (SKIP_SOURCES.has(label)) {
      console.log(`[build] ${label} skipped via SKIP_SOURCES`)
      return
    }
    try {
      builds.push(await fn())
    } catch (e) {
      // one flaky source should not sink the whole dataset; the manifest
      // only lists sources that built successfully.
      console.error(`[build] ${label} failed, skipping:`, e)
    }
  }

  await run('github', () =>
    buildRepoCorpus({
      id: 'github',
      repoUrl: 'https://github.com/github/dmca.git',
      cacheDir: join('.cache', 'dmca'),
      envVar: 'DMCA_DIR',
    }),
  )

  await run('google', buildGoogleCorpus)
  await run('wikimedia', buildWikimediaCorpus)

  await run('lbry', () =>
    buildRepoCorpus({
      id: 'lbry',
      repoUrl: 'https://github.com/lbryio/dmca.git',
      cacheDir: join('.cache', 'lbry-dmca'),
    }),
  )

  if (builds.length === 0) {
    console.error('[build] every source failed')
    process.exit(1)
  }

  const byId = new Map<SourceId, SourceBuild>(builds.map((b) => [b.id, b]))
  const sources = SOURCE_ORDER.filter((id) => byId.has(id)).map((id) => {
    const b = byId.get(id)!
    return {
      id,
      label: SOURCE_LABELS[id],
      count: b.stats.total,
      firstDate: b.stats.firstDate,
      lastDate: b.stats.lastDate,
      index: `src/${id}.json`,
      stats: `stats/${id}.json`,
      commit: b.revision,
      ...(b.lazy ? { lazy: true } : {}),
    }
  })

  writeFileSync(
    join(OUT, 'sources.json'),
    JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), sources }),
  )

  for (const b of builds) emitSource(b)

  const total = builds.reduce((a, b) => a + b.stats.total, 0)
  console.log(`[build] ${total} records across ${builds.length} sources -> ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
