# DMCAd

Searchable viewer for DMCA takedown notices and search delisting
requests, aggregated from four public sources. Vite, React,
TypeScript, Tailwind. No backend; the dataset is prebuilt JSON under
`public/data/`.

## Run

```sh
pnpm install
pnpm data      # builds public/data from all sources
pnpm dev
```

`pnpm data` fetches and parses every source (see below). Repos are
cached under `.cache/` and refreshed on each run; `DMCA_DIR=/path`
points the GitHub source at an existing checkout instead of cloning.

Other scripts: `pnpm build`, `pnpm preview`, `pnpm test`,
`pnpm typecheck`, `pnpm lint`.

## Sources

- **GitHub** ([github/dmca](https://github.com/github/dmca)): notice
  markdown files in year directories, parsed from headers and body
  text.
- **Google Search**
  ([Transparency Report](https://transparencyreport.google.com/copyright/removals)):
  the `requests.csv` member of the public removals zip, fetched with
  HTTP range requests instead of downloading the full archive. One index record per
  copyright owner that filed at least 10 requests or 1,000 URLs,
  carrying request and URL totals, date range, yearly breakdown, and
  top reporting org. Smaller filers are aggregated away.
- **Wikimedia**
  ([foundation.wikimedia.org](https://foundation.wikimedia.org/wiki/Category:DMCA)):
  `Legal:DMCA` pages enumerated through the MediaWiki API, including
  `{{DMCA}}` template fields, letter bodies, `File:` attachments, and
  linked Commons files.
- **LBRY** ([lbryio/dmca](https://github.com/lbryio/dmca)): same
  markdown layout as github/dmca.

Every record carries a `source` field; the UI filters by source via
the dashboard pills, the filter bar select, or `?src=` in the URL.

## Data layout

`scripts/build-data.ts` writes, per source:

- `public/data/sources.json`: manifest with per-source counts, date
  ranges, and file paths.
- `public/data/src/<source>.json`: one positional-row index per
  source. Unknown fields land in `Notice.meta` for detail rendering.
- `public/data/stats/<source>.json`: monthly and yearly counts, top
  claimants, type breakdown, upstream revision.
- `public/data/bodies/**.json`: raw notice text chunked by month
  (per source), fetched when you open a notice or enable full-text
  search. Google records have no bodies.

Body keys are namespaced `source:path` to match record ids. Claimant
keys are namespaced the same way so facets merge cleanly across
sources.

## Layout

```
src/lib/sources.ts       source ids, labels, order
src/lib/rows.ts          index row codec -> unified Notice shape
src/lib/parse.ts         github/lbry notice parsing, shared helpers
src/lib/google.ts        Transparency Report CSV parser
src/lib/wikimedia.ts     Legal:DMCA wikitext/API parser
src/lib/data.ts          manifest + per-source loaders, stats merge
src/lib/search.worker.ts MiniSearch index in a web worker
src/lib/markdown.tsx     small markdown renderer, no raw HTML
src/components/          header, dashboard, timeline, filters, list, detail
scripts/build-data.ts    dataset builder entry point
scripts/lib/             per-source corpus builders
scripts/google-fetch.mjs range-request fetcher for the Google zip
tests/                   parser unit tests and fixtures
```

Search runs in a worker. Full-text search is opt-in and downloads all
body chunks once. All UI state lives in the query string, so views are
shareable. `.github/workflows/deploy.yml` rebuilds the data daily and
deploys to GitHub Pages; set `BASE_PATH` in repo variables if Pages is
not at the root.
