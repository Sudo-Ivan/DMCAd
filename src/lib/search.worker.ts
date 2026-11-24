/// <reference lib="webworker" />
import MiniSearch from 'minisearch'

// Search worker. The main thread posts compact docs; this builds a
// MiniSearch index for metadata fields and, when full-text mode is on, a
// second index over notice bodies.

interface Doc {
  id: string
  c: string // claimant label
  k: string // claimant key
  s: string // slug
  t: string // targets csv
  x: string // excerpt
  d: string // domain
  v: string // source id
}

interface BodyDoc {
  id: string
  body: string
}

let metaIndex: MiniSearch<Doc> | null = null
let fullIndex: MiniSearch<BodyDoc> | null = null
// Excerpt text lives in per-month sidecar files for repo sources, so it
// cannot ride along in the init docs. Chunks are posted as they load
// (visible months first, then a background sweep) and indexed here so
// excerpt search keeps working without the index carrying the text.
let excerptIndex: MiniSearch<{ id: string; x: string }> | null = null
const bodies = new Map<string, string>()
let fullReady = false

function buildMeta(docs: Doc[]) {
  metaIndex = new MiniSearch<Doc>({
    fields: ['c', 'k', 's', 't', 'x', 'd', 'v'],
    storeFields: [],
    searchOptions: {
      prefix: true,
      fuzzy: 0.15,
      boost: { c: 3, k: 3, s: 2, t: 2, x: 1, d: 0.5, v: 0.5 },
    },
  })
  metaIndex.addAll(docs)
}

function buildFull() {
  if (fullReady || bodies.size === 0) return
  const docs: BodyDoc[] = []
  for (const [id, body] of bodies) docs.push({ id, body })
  fullIndex = new MiniSearch<BodyDoc>({
    fields: ['body'],
    storeFields: [],
    searchOptions: { prefix: true, fuzzy: 0.1 },
  })
  fullIndex.addAll(docs)
  fullReady = true
}

function addExcerpts(entries: [string, string][]) {
  if (!entries.length) return
  if (!excerptIndex) {
    excerptIndex = new MiniSearch<{ id: string; x: string }>({
      fields: ['x'],
      storeFields: [],
      // Matches the 'x' field boost in the meta index.
      searchOptions: { prefix: true, fuzzy: 0.15 },
    })
  }
  excerptIndex.addAll(entries.map(([id, x]) => ({ id, x })))
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'init') {
    buildMeta(msg.docs)
    postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'excerpts') {
    addExcerpts(msg.entries as [string, string][])
    return
  }
  if (msg.type === 'bodies') {
    for (const [id, text] of msg.entries as [string, string][]) {
      bodies.set(id, text)
    }
    if (msg.final) {
      buildFull()
      postMessage({ type: 'fulltext-ready', count: bodies.size })
    }
    return
  }
  if (msg.type === 'fulltext-off') {
    fullIndex = null
    fullReady = false
    return
  }
  if (msg.type === 'query') {
    const q = (msg.q as string).trim()
    const started = performance.now()
    if (!q) {
      postMessage({ type: 'result', results: [], took: 0 })
      return
    }
    const limit = (msg.limit as number) ?? 500
    const meta = (metaIndex?.search(q) ?? []).slice(0, limit)
    const merged = new Map<string, number>()
    for (const r of meta) {
      merged.set(r.id, (merged.get(r.id) ?? 0) + r.score)
    }
    if (fullIndex) {
      const full = fullIndex.search(q).slice(0, limit * 2)
      for (const r of full) {
        merged.set(r.id, (merged.get(r.id) ?? 0) + r.score * 0.6)
      }
    }
    if (excerptIndex) {
      for (const r of excerptIndex.search(q).slice(0, limit)) {
        merged.set(r.id, (merged.get(r.id) ?? 0) + r.score)
      }
    }
    const results = [...merged.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }))
    postMessage({
      type: 'result',
      results,
      took: Math.round((performance.now() - started) * 100) / 100,
      full: fullIndex !== null,
    })
  }
}
