import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadBodies,
  loadExcerpts,
  loadIndexNotices,
  loadManifest,
  loadSource,
  loadStats,
  mergeStats,
  type LoadedSource,
  type Manifest,
  type SourceInfo,
  type Stats,
} from './lib/data'
import { bodyChunk, excerptChunk, type Notice } from './lib/rows'
import { SOURCE_ORDER, type SourceId } from './lib/sources'
import {
  readState,
  urlFor,
  type AppState,
} from './lib/appState'
import { docFromNotice, titleCaseSlug, type SearchDoc } from './lib/searchDocs'
import type { FullTextState } from './lib/types'
import { Header } from './components/Header'
import { DashboardTop, DashboardWidgets } from './components/Dashboard'
import { FilterBar } from './components/FilterBar'
import { ResultList } from './components/ResultList'
import { DetailPanel } from './components/DetailPanel'
import { Footer } from './components/Footer'
import { ProfileView } from './components/ProfileView'
import { CountersView } from './components/CountersView'
import type { PickOption } from './components/PickList'

interface WorkerResult {
  type: string
  results?: { id: string; score: number }[]
  took?: number
  seq?: number
  count?: number
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [sources, setSources] = useState<LoadedSource[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [state, setState] = useState<AppState>(readState)
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  const [workerReady, setWorkerReady] = useState(false)
  const [scores, setScores] = useState<Map<string, number> | null>(null)
  const [took, setTook] = useState<number | null>(null)
  const [fullText, setFullText] = useState<FullTextState>('off')
  const [fullProgress, setFullProgress] = useState<[number, number]>([0, 0])
  const [selIndex, setSelIndex] = useState(-1)
  const [closing, setClosing] = useState<Notice | null>(null)
  // noticeId -> excerpt, filled in as per-month sidecar chunks land.
  const [excerptMap, setExcerptMap] = useState<Map<string, string>>(
    () => new Map(),
  )

  const workerRef = useRef<Worker | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number>(0)
  const searchSeq = useRef(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // ---------- data loading ----------
  // Eager sources load up front. Split indexes (github) publish their
  // newest year parts first so the list paints early; the older parts
  // wait out a short delay so they stay off the first-paint critical
  // path, then stream in. Any filter, query, or deep link pulls them
  // forward immediately. Lazy indexes (the big google dump) are fetched
  // only on demand: when their source filter is selected or a deep-linked
  // detail id belongs to them. Stats files are tiny and load for every
  // source so dashboard totals stay accurate throughout.
  const pendingTails = useRef(new Map<string, () => void>())

  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then(async (m) => {
        if (cancelled) return
        setManifest(m)
        const eager = m.sources.filter((s) => !s.lazy)
        // Stats are tiny and every source's is needed for dashboard
        // totals, including lazy ones. Fetch them in parallel with the
        // indexes so stats and the first notices land together.
        const allStats = await Promise.all(m.sources.map(loadStats))
        if (cancelled) return
        setStats(mergeStats(allStats))
        const statsById = new Map<SourceId, Stats>(
          m.sources.map((s, i) => [s.id, allStats[i]]),
        )

        const loadedMap = new Map<SourceId, LoadedSource>()
        const apply = () => {
          if (cancelled) return
          const ordered = SOURCE_ORDER.filter((id) => loadedMap.has(id)).map(
            (id) => loadedMap.get(id)!,
          )
          setSources(ordered)
        }
        const publish = (
          info: SourceInfo,
          notices: Notice[],
          complete: boolean,
        ) => {
          const stats = statsById.get(info.id)
          if (!stats) return
          loadedMap.set(info.id, {
            info,
            stats,
            notices: [...notices],
            complete,
          })
          apply()
        }

        // Only the newest parts paint eagerly: Lantern counts every
        // request that finished before the observed LCP toward the
        // simulated LCP, so older parts wait out a delay, then load
        // sequentially so decode never becomes one long task. Three
        // monthly parts cover roughly a quarter thousand rows, enough
        // scroll buffer until the tail lands.
        const EAGER_PARTS = 3
        const TAIL_DELAY_MS = 4000

        const loadEager = async (info: SourceInfo) => {
          const parts = info.indexes ?? (info.index ? [info.index] : [])
          const notices: Notice[] = []
          for (const p of parts.slice(0, EAGER_PARTS)) {
            try {
              notices.push(...(await loadIndexNotices(p)))
            } catch {
              break
            }
            if (cancelled) return
            publish(info, notices, false)
          }
          const tail = parts.slice(EAGER_PARTS)
          if (!tail.length) {
            publish(info, notices, true)
            return
          }
          let started = false
          const runTail = async () => {
            if (started || cancelled) return
            started = true
            for (const p of tail) {
              if (cancelled) return
              try {
                notices.push(...(await loadIndexNotices(p)))
              } catch {
                /* keep whatever decoded so far */
              }
              publish(info, notices, false)
            }
            publish(info, notices, true)
          }
          pendingTails.current.set(info.id, () => void runTail())
          window.setTimeout(() => void runTail(), TAIL_DELAY_MS)
        }

        // Split-index sources go first: their newest part carries the
        // bulk of the recent-notices view, so the first paint is already
        // the final ordering and excerpt prefetches hit the right months.
        // Small single-file sources follow immediately after.
        const ordered = [...eager].sort(
          (a, b) => Number(b.indexes !== undefined) - Number(a.indexes !== undefined),
        )
        for (const info of ordered) {
          await loadEager(info)
          if (cancelled) return
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Searching or filtering needs the whole corpus; if a deferred index
  // tail has not started yet, pull it forward instead of waiting.
  useEffect(() => {
    for (const run of pendingTails.current.values()) run()
  }, [
    state.q,
    state.from,
    state.to,
    state.types,
    state.claimants,
    state.owners,
    state.counterOnly,
    state.source,
    state.detail,
    state.profile,
    state.view,
  ])

  // Lazy index loading, triggered by the source filter or a deep-linked
  // detail id. lazyInflight dedupes concurrent triggers.
  const lazyInflight = useRef(new Set<string>())
  useEffect(() => {
    if (!manifest) return
    for (const info of manifest.sources) {
      if (!info.lazy || lazyInflight.current.has(info.id)) continue
      const wanted =
        state.source === info.id ||
        (state.detail !== null && state.detail.startsWith(`${info.id}:`)) ||
        // `c:<source>:<key>` claimant profiles need that source's index.
        (state.profile !== null &&
          state.profile.startsWith(`c:${info.id}:`))
      if (!wanted) continue
      lazyInflight.current.add(info.id)
      loadSource(info)
        .then((s) => {
          setSources((prev) =>
            [...prev, s].sort(
              (a, b) =>
                SOURCE_ORDER.indexOf(a.info.id) - SOURCE_ORDER.indexOf(b.info.id),
            ),
          )
        })
        .catch(() => {
          lazyInflight.current.delete(info.id)
        })
    }
  }, [manifest, state.source, state.detail, state.profile])

  const notices = useMemo<Notice[] | null>(
    () => (sources.length === 0 ? null : sources.flatMap((s) => s.notices)),
    [sources],
  )

  // True once every eager (non-lazy) source has finished streaming its
  // index parts. Search docs wait for this so they are built once over
  // the complete corpus instead of per part.
  const indexesReady = useMemo(() => {
    if (!manifest) return false
    return manifest.sources
      .filter((s) => !s.lazy)
      .every((info) =>
        sources.some((s) => s.info.id === info.id && s.complete),
      )
  }, [manifest, sources])

  // ---------- excerpt sidecars ----------
  // Repo sources keep excerpts in per-month chunks under data/excerpts/.
  // The list asks for the months it renders (plus a prefetch margin); a
  // delayed sweep then feeds every remaining chunk to the search worker
  // so excerpt search covers the whole corpus without blocking paint.
  const excerptDisplayReq = useRef(new Set<string>())
  const excerptWorkerFed = useRef(new Set<string>())

  const postExcerpts = useCallback(
    (chunk: string, data: Record<string, string>) => {
      if (excerptWorkerFed.current.has(chunk)) return
      excerptWorkerFed.current.add(chunk)
      workerRef.current?.postMessage({
        type: 'excerpts',
        entries: Object.entries(data),
      })
    },
    [],
  )

  const ensureExcerpts = useCallback(
    (chunks: string[]) => {
      for (const c of chunks) {
        if (excerptDisplayReq.current.has(c)) continue
        excerptDisplayReq.current.add(c)
        loadExcerpts(c)
          .then((data) => {
            setExcerptMap((prev) => {
              const m = new Map(prev)
              for (const [k, v] of Object.entries(data)) m.set(k, v)
              return m
            })
            postExcerpts(c, data)
          })
          .catch(() => {
            excerptDisplayReq.current.delete(c)
          })
      }
    },
    [postExcerpts],
  )

  const sweepExcerpts = useCallback(
    (chunks: string[]) => {
      for (const c of chunks) {
        loadExcerpts(c)
          .then((data) => postExcerpts(c, data))
          .catch(() => {
            /* chunk missing or failed; display path can retry */
          })
      }
    },
    [postExcerpts],
  )

  useEffect(() => {
    if (!indexesReady || !notices) return
    const chunks = [
      ...new Set(
        notices
          .map(excerptChunk)
          .filter((c): c is string => c !== null),
      ),
    ]
    if (!chunks.length) return
    // Stay well clear of first paint: this only feeds the search worker.
    const t = window.setTimeout(() => sweepExcerpts(chunks), 5000)
    return () => window.clearTimeout(t)
  }, [indexesReady, notices, sweepExcerpts])

  // ---------- search worker ----------
  useEffect(() => {
    const w = new Worker(new URL('./lib/search.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = w
    w.onmessage = (e: MessageEvent<WorkerResult>) => {
      const m = e.data
      if (m.type === 'ready') {
        setWorkerReady(true)
      } else if (m.type === 'result') {
        if (m.seq !== undefined && m.seq !== searchSeq.current) return
        const map = new Map<string, number>()
        for (const r of m.results ?? []) map.set(r.id, r.score)
        setScores(map)
        setTook(m.took ?? null)
      } else if (m.type === 'fulltext-ready') {
        setFullText('ready')
      }
    }
    return () => w.terminate()
  }, [])

  const labelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of stats?.topClaimants ?? []) {
      m.set(c.key, c.label ?? c.key)
    }
    return m
  }, [stats])

  const claimantLabel = useCallback(
    (key: string) => {
      const hit = labelMap.get(key)
      if (hit) return hit
      // namespaced keys fall back to the bare claimant name
      const bare = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
      return titleCaseSlug(bare)
    },
    [labelMap],
  )

  useEffect(() => {
    const w = workerRef.current
    if (!w || !notices || !indexesReady) return
    let cancelled = false
    // Build docs in slices with event-loop yields so large indexes never
    // become one long main-thread task.
    void (async () => {
      const docs: SearchDoc[] = new Array(notices.length)
      const CHUNK = 4096
      for (let s = 0; s < notices.length; s += CHUNK) {
        if (cancelled) return
        const e = Math.min(s + CHUNK, notices.length)
        for (let i = s; i < e; i++) docs[i] = docFromNotice(notices[i], claimantLabel)
        if (e < notices.length) await new Promise((r) => setTimeout(r, 0))
      }
      if (!cancelled) w.postMessage({ type: 'init', docs })
    })()
    return () => {
      cancelled = true
    }
  }, [notices, stats, claimantLabel, indexesReady])

  // ---------- query -> worker ----------
  useEffect(() => {
    const w = workerRef.current
    if (!w || !workerReady) return
    const q = state.q.trim()
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const seq = ++searchSeq.current
      if (!q) {
        setScores(null)
        setTook(null)
        return
      }
      w.postMessage({ type: 'query', q, limit: 1000, seq })
    }, 90)
    return () => window.clearTimeout(debounceRef.current)
  }, [state.q, workerReady])

  // ---------- url sync ----------
  const applyState = useCallback(
    (next: AppState, opts?: { push?: boolean }) => {
      setState(next)
      setSelIndex(-1)
      if (opts?.push) {
        history.pushState(null, '', urlFor(next))
      } else {
        history.replaceState(null, '', urlFor(next))
      }
    },
    [],
  )

  const patch = useCallback(
    (p: Partial<AppState>) => {
      applyState({ ...stateRef.current, ...p }, { push: true })
    },
    [applyState],
  )

  const setQuery = useCallback(
    (q: string) => {
      applyState({ ...stateRef.current, q }, { push: false })
    },
    [applyState],
  )

  useEffect(() => {
    const onPop = () => {
      setState(readState())
      setSelIndex(-1)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ---------- filtering + sorting ----------
  const filtered = useMemo(() => {
    if (!notices) return []
    let list = notices
    const { from, to, types, claimants, owners, counterOnly, source } = state
    if (source) list = list.filter((n) => n.source === source)
    if (
      from ||
      to ||
      types.length ||
      claimants.length ||
      owners.length ||
      counterOnly
    ) {
      const typeSet = new Set(types)
      const cSet = new Set(claimants)
      const oSet = new Set(owners.map((o) => o.toLowerCase()))
      list = list.filter((n) => {
        const ym = n.date ? n.date.slice(0, 7) : ''
        if (from && ym < from) return false
        if (to && ym > to) return false
        if (typeSet.size && !typeSet.has(n.type)) return false
        if (cSet.size && !cSet.has(n.claimantKey)) return false
        if (
          oSet.size &&
          !n.targets.some((t) => {
            const tl = t.toLowerCase()
            return oSet.has(tl) || oSet.has(tl.split('/')[0])
          })
        ) {
          return false
        }
        if (counterOnly && !n.hasCounter) return false
        return true
      })
    }
    if (state.q && scores) {
      list = list.filter((n) => scores.has(n.id))
    }
    const sorted = [...list]
    const effective =
      state.sort === 'auto' ? (state.q ? 'rel' : 'new') : state.sort
    switch (effective) {
      case 'old':
        sorted.sort((a, b) =>
          (a.date || '9999') < (b.date || '9999')
            ? -1
            : (a.date || '9999') > (b.date || '9999')
              ? 1
              : 0,
        )
        break
      case 'url':
        sorted.sort(
          (a, b) =>
            b.urlCount - a.urlCount ||
            (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
        )
        break
      case 'rel':
        if (scores) {
          sorted.sort(
            (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
          )
        } else {
          sorted.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        }
        break
      default:
        sorted.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    }
    return sorted
  }, [notices, state, scores])

  const resetKey = useMemo(
    () =>
      [
        state.q,
        state.from,
        state.to,
        state.types.join(','),
        state.claimants.join(','),
        state.owners.join(','),
        state.counterOnly,
        state.sort,
      ].join('|'),
    [state],
  )

  const terms = useMemo(() => state.q.split(/\s+/).filter(Boolean), [state.q])

  // ---------- detail navigation ----------
  const detailIndex = useMemo(() => {
    if (!state.detail) return -1
    return filtered.findIndex((n) => n.id === state.detail)
  }, [filtered, state.detail])

  // Profile and counters views replace the list, so a notice opened from
  // there may not be in `filtered`. Fall back to the full corpus; prev/next
  // nav stays within `filtered` (detailIndex -1 disables it).
  const detailNotice = useMemo(() => {
    if (!state.detail || !notices) return null
    if (detailIndex >= 0) return filtered[detailIndex]
    return notices.find((n) => n.id === state.detail) ?? null
  }, [state.detail, notices, filtered, detailIndex])
  const pristine =
    state.q === '' &&
    !state.from &&
    !state.to &&
    state.types.length === 0 &&
    state.claimants.length === 0 &&
    state.owners.length === 0 &&
    !state.counterOnly

  const openDetail = useCallback(
    (index: number) => {
      const n = filtered[index]
      if (!n) return
      applyState({ ...stateRef.current, detail: n.id }, { push: true })
    },
    [filtered, applyState],
  )

  const navDetail = useCallback(
    (dir: 1 | -1) => {
      if (detailIndex < 0) return
      const next = detailIndex + dir
      if (next >= 0 && next < filtered.length) openDetail(next)
    },
    [detailIndex, filtered, openDetail],
  )

  const openDetailById = useCallback(
    (id: string) => {
      applyState({ ...stateRef.current, detail: id }, { push: true })
    },
    [applyState],
  )

  const openClaimantProfile = useCallback(
    (key: string) => {
      applyState(
        { ...stateRef.current, profile: `c:${key}`, view: '', detail: null },
        { push: true },
      )
    },
    [applyState],
  )

  const closeDetail = useCallback(() => {
    const cur = detailNotice
    if (cur) {
      setClosing(cur)
      window.setTimeout(() => {
        setClosing(null)
        applyState({ ...stateRef.current, detail: null }, { push: true })
      }, 170)
    } else {
      applyState({ ...stateRef.current, detail: null }, { push: true })
    }
  }, [detailNotice, applyState])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = stateRef.current
      if (s.detail) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault()
          navDetail(1)
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault()
          navDetail(-1)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          closeDetail()
        }
        return
      }
      // Profile and counters views replace the list; Escape backs out.
      if (s.profile || s.view) {
        if (e.key === 'Escape') {
          e.preventDefault()
          applyState({ ...s, profile: null, view: '' }, { push: true })
        }
        return
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelIndex((i) => Math.max(i - 1, -1))
      } else if (e.key === 'Enter' && selIndex >= 0) {
        e.preventDefault()
        openDetail(selIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered.length, selIndex, openDetail, navDetail, closeDetail, applyState])

  // ---------- full text search ----------
  const toggleFullText = useCallback(async () => {
    const w = workerRef.current
    if (!w || !notices) return
    if (fullText === 'ready') {
      w.postMessage({ type: 'fulltext-off' })
      setFullText('off')
      return
    }
    if (fullText === 'loading') return
    setFullText('loading')
    const chunks = [
      ...new Set(
        notices.map(bodyChunk).filter((c): c is string => c !== null),
      ),
    ].sort()
    setFullProgress([0, chunks.length])
    let done = 0
    let failed = 0
    const CONCURRENCY = 6
    let cursor = 0
    try {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (cursor < chunks.length) {
            const c = chunks[cursor++]
            try {
              const data = await loadBodies(c)
              w.postMessage({ type: 'bodies', entries: Object.entries(data) })
            } catch {
              failed++
            }
            done++
            setFullProgress([done, chunks.length])
          }
        }),
      )
      w.postMessage({ type: 'bodies', final: true })
      if (failed === chunks.length) {
        setFullText('error')
      }
    } catch {
      setFullText('error')
    }
  }, [fullText, notices])

  // ---------- theme ----------
  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  // ---------- derived ----------
  const claimantOptions: PickOption[] = useMemo(
    () =>
      (stats?.topClaimants ?? []).map((c) => ({
        value: c.key,
        label: c.label ?? claimantLabel(c.key),
        count: c.count,
      })),
    [stats, claimantLabel],
  )
  const ownerOptions: PickOption[] = useMemo(
    () =>
      (stats?.topOwners ?? []).map((o) => ({
        value: o.key,
        label: o.key,
        count: o.count,
      })),
    [stats],
  )
  const sourceOptions = useMemo(
    () =>
      (manifest?.sources ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        count: s.count,
      })),
    [manifest],
  )

  const pendingSource = useMemo(() => {
    if (!state.source || !manifest) return null
    const info = manifest.sources.find((s) => s.id === state.source)
    if (!info?.lazy) return null
    return sources.some((s) => s.info.id === state.source) ? null : info
  }, [state.source, manifest, sources])

  // True while a source backing the profile/counters view may still be
  // streaming: lazy indexes not yet fetched, or split-index tails pending.
  const viewLoading = useMemo(() => {
    if (!manifest) return false
    const relevant = new Set<SourceId>()
    if (state.profile) {
      if (state.profile.startsWith('c:')) {
        relevant.add(state.profile.slice(2).split(':')[0] as SourceId)
      } else {
        relevant.add('github')
        relevant.add('lbry')
      }
    } else if (state.view === 'counters') {
      relevant.add('github')
      relevant.add('lbry')
    } else {
      return false
    }
    return [...relevant].some((id) => {
      const info = manifest.sources.find((s) => s.id === id)
      if (!info) return false
      const loaded = sources.find((s) => s.info.id === id)
      return info.lazy ? !loaded : !loaded?.complete
    })
  }, [state.profile, state.view, manifest, sources])

  // ---------- render ----------
  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          q=""
          onQuery={() => {}}
          inputRef={inputRef}
          dark={dark}
          onToggleTheme={toggleTheme}
        />
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="text-lg font-semibold">No data found</h1>
          <p className="mt-2 text-sm text-ink2">
            The app needs the generated dataset. Build it with{' '}
            <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[13px]">
              pnpm data
            </code>{' '}
            then reload. Details are in the README.
          </p>
          {import.meta.env.DEV && (
            <p className="mt-3 font-mono text-[11px] text-ink3">{loadError}</p>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        q={state.q}
        onQuery={setQuery}
        onOpenFirst={() => {
          if (filtered.length > 0) openDetail(0)
        }}
        inputRef={inputRef}
        dark={dark}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {!stats || !manifest ? (
          <DashboardSkeleton />
        ) : state.profile ? (
          <ProfileView
            profile={state.profile}
            notices={notices}
            loading={viewLoading}
            state={state}
            onPatch={patch}
            claimantLabel={claimantLabel}
            excerpts={excerptMap}
            onExcerptsNeeded={ensureExcerpts}
            onOpenDetail={openDetailById}
          />
        ) : state.view === 'counters' ? (
          <CountersView
            notices={notices}
            loading={viewLoading}
            claimantLabel={claimantLabel}
            excerpts={excerptMap}
            onExcerptsNeeded={ensureExcerpts}
            onBack={() => patch({ view: '' })}
            onOpenProfile={(p) => patch({ profile: p, view: '' })}
            onOpenDetail={openDetailById}
          />
        ) : (
          <div className="space-y-4">
            <DashboardTop stats={stats} state={state} onPatch={patch} sources={manifest.sources} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                <FilterBar
                  state={state}
                  onPatch={patch}
                  total={notices?.length ?? 0}
                  shown={notices ? filtered.length : 0}
                  loading={!notices}
                  took={took}
                  claimantLabel={claimantLabel}
                  claimantOptions={claimantOptions}
                  ownerOptions={ownerOptions}
                  sourceOptions={sourceOptions}
                  fullText={fullText}
                  fullProgress={fullProgress}
                  onToggleFullText={toggleFullText}
                />
                {pristine && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
                      Recent notices
                    </span>
                    <span className="h-px flex-1 bg-edge" />
                  </div>
                )}
                {pendingSource ? (
                  <div className="flex h-[calc(100vh-400px)] min-h-[400px] items-center justify-center rounded-lg border border-edge bg-panel text-[13px] text-ink2">
                    Loading {pendingSource.label} index…
                  </div>
                ) : notices ? (
                  <ResultList
                    items={filtered}
                    claimantLabel={claimantLabel}
                    terms={terms}
                    selectedIndex={selIndex}
                    onOpen={openDetail}
                    resetKey={resetKey}
                    excerpts={excerptMap}
                    onExcerptsNeeded={ensureExcerpts}
                    onOpenClaimant={openClaimantProfile}
                  />
                ) : (
                  <ListSkeleton />
                )}
              </div>

              <aside className="hidden xl:block">
                <div className="sticky top-20">
                  <DashboardWidgets
                    stats={stats}
                    state={state}
                    onPatch={patch}
                    claimantLabel={claimantLabel}
                  />
                </div>
              </aside>
            </div>

            <div className="xl:hidden [content-visibility:auto] [contain-intrinsic-size:auto_640px]">
              <DashboardWidgets
                stats={stats}
                state={state}
                onPatch={patch}
                claimantLabel={claimantLabel}
              />
            </div>
          </div>
        )}
      </main>

      <Footer stats={stats} sources={manifest?.sources} />

      <DetailPanel
        notice={detailNotice ?? closing}
        closing={!detailNotice && closing !== null}
        claimantLabel={claimantLabel}
        sha={stats?.commit ?? ''}
        onClose={closeDetail}
        onNav={navDetail}
        canPrev={detailIndex > 0}
        canNext={detailIndex >= 0 && detailIndex < filtered.length - 1}
        onOpenClaimant={openClaimantProfile}
      />
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="h-[calc(100vh-400px)] min-h-[400px] overflow-hidden">
      <div className="space-y-2 p-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-edge bg-panel"
          />
        ))}
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  // Fill the viewport so the footer starts below the fold. Otherwise the
  // footer is visible during loading and gets pushed down by the real
  // content, which Lighthouse counts as a large layout shift.
  return (
    <div className="min-h-[calc(100vh-4rem)] space-y-4">
      <div className="h-14 animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="h-[190px] animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[400px] animate-pulse rounded-lg border border-edge bg-panel" />
        <div className="hidden h-[300px] animate-pulse rounded-lg border border-edge bg-panel xl:block" />
      </div>
    </div>
  )
}
