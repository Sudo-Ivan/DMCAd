# DMCA Notices

Static viewer for the DMCA takedown notices in
[github/dmca](https://github.com/github/dmca). Vite, React, TypeScript,
Tailwind. No backend; the dataset is prebuilt JSON under `public/data/`.

## Run

```sh
pnpm install
pnpm data      # builds public/data from a github/dmca checkout
pnpm dev
```

`pnpm data` clones github/dmca into `.cache/dmca` (shallow) or uses an
existing checkout:

```sh
DMCA_DIR=/path/to/dmca pnpm data
```

Other scripts: `pnpm build`, `pnpm preview`, `pnpm test`, `pnpm typecheck`,
`pnpm lint`.

## Data

`scripts/build-data.ts` walks the notice files and writes:

- `public/data/index.json`: one row per notice (path, date, domain,
  claimant key, type, URL count, repo targets, excerpt). Powers the list,
  filters, and charts. About 5.6 MB raw, 1.6 MB gzipped.
- `public/data/bodies/<year>-<month>.json`: raw notice text, fetched when
  you open a notice or turn on full-text search.
- `public/data/stats.json`: monthly and yearly counts, top claimants,
  top targeted owners, type breakdown, source commit SHA.

Claimant names are best-effort. Notices that never name a claimant fall
back to a slug-derived label, so coverage is partial. Type detection
covers copyright notices, counter-notices, retractions, reversals, and
1201 anti-circumvention claims.

## Layout

```
src/lib/parse.ts         notice parsing, shared by build, tests, app
src/lib/search.worker.ts MiniSearch index in a web worker
src/lib/markdown.tsx     small markdown renderer, no raw HTML
src/components/          header, dashboard, timeline, filters, list, detail
scripts/build-data.ts    dataset builder
tests/                   parser unit tests and fixtures
```

Search runs in a worker. Full-text search is opt-in and downloads all
body chunks once. All UI state lives in the query string, so views are
shareable. `.github/workflows/deploy.yml` rebuilds the data daily and
deploys to GitHub Pages; set `BASE_PATH` in repo variables if Pages is
not at the root.
