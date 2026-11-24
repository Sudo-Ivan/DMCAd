import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadBodies, loadIndex, loadStats, type Stats } from './lib/data'
import { decodeRow, monthOf, type Notice } from './lib/rows'
import {
  readState,
  urlFor,
  type AppState,
} from './lib/appState'
import { docsFromNotices, titleCaseSlug } from './lib/searchDocs'
import type { FullTextState } from './lib/types'
import { Header } from './components/Header'
import { DashboardTop, DashboardWidgets } from './components/Dashboard'
import { FilterBar } from './components/FilterBar'
import { ResultList } from './components/ResultList'
import { DetailPanel } from './components/DetailPanel'
import { Footer } from './components/Footer'
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
  const [notices, setNotices] = useState<Notice[] | null>(null)
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

  const workerRef = useRef<Worker | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number>(0)
  const searchSeq = useRef(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // ---------- data loading ----------
  useEffect(() => {
    let cancelled = false
    Promise.all([loadIndex(), loadStats()])
      .then(([idx, st]) => {
        if (cancelled) return
        setNotices(idx.rows.map(decodeRow))
        setStats(st)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    (key: string) => labelMap.get(key) ?? titleCaseSlug(key),
    [labelMap],
  )

  useEffect(() => {
    if (!notices || !stats || !workerRef.current) return
    const docs = docsFromNotices(notices, claimantLabel)
    workerRef.current.postMessage({ type: 'init', docs })
  }, [notices, stats, claimantLabel])

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
    const { from, to, types, claimants, owners, counterOnly } = state
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
      list = list.filter((n) => scores.has(n.path))
    }
    const sorted = [...list]
    const effective =
      state.sort === 'auto' ? (state.q ? 'rel' : 'new') : state.sort
    switch (effective) {
      case 'old':
        sorted.sort((a, b) =>
          (a.date || '9999').localeCompare(b.date || '9999'),
        )
        break
      case 'url':
        sorted.sort(
          (a, b) => b.urlCount - a.urlCount || b.date.localeCompare(a.date),
        )
        break
      case 'rel':
        if (scores) {
          sorted.sort(
            (a, b) => (scores.get(b.path) ?? 0) - (scores.get(a.path) ?? 0),
          )
        } else {
          sorted.sort((a, b) => b.date.localeCompare(a.date))
        }
        break
      default:
        sorted.sort((a, b) => b.date.localeCompare(a.date))
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
    return filtered.findIndex((n) => n.path === state.detail)
  }, [filtered, state.detail])

  const detailNotice = detailIndex >= 0 ? filtered[detailIndex] : null
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
      applyState({ ...stateRef.current, detail: n.path }, { push: true })
    },
    [filtered, applyState],
  )

  const navDetail = useCallback(
    (dir: 1 | -1) => {
      const next = detailIndex + dir
      if (next >= 0 && next < filtered.length) openDetail(next)
    },
    [detailIndex, filtered, openDetail],
  )

  const closeDetail = useCallback(() => {
    const cur = detailIndex >= 0 ? filtered[detailIndex] : null
    if (cur) {
      setClosing(cur)
      window.setTimeout(() => {
        setClosing(null)
        applyState({ ...stateRef.current, detail: null }, { push: true })
      }, 170)
    } else {
      applyState({ ...stateRef.current, detail: null }, { push: true })
    }
  }, [detailIndex, filtered, applyState])

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
  }, [filtered.length, selIndex, openDetail, navDetail, closeDetail])

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
    const chunks = [...new Set(notices.map(monthOf))].sort()
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
        {!notices || !stats ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-4">
            <DashboardTop stats={stats} state={state} onPatch={patch} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                <FilterBar
                  state={state}
                  onPatch={patch}
                  total={notices.length}
                  shown={filtered.length}
                  took={took}
                  claimantLabel={claimantLabel}
                  claimantOptions={claimantOptions}
                  ownerOptions={ownerOptions}
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
                <ResultList
                  items={filtered}
                  claimantLabel={claimantLabel}
                  terms={terms}
                  selectedIndex={selIndex}
                  onOpen={openDetail}
                  resetKey={resetKey}
                />
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

            <div className="xl:hidden">
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

      <Footer stats={stats} />

      <DetailPanel
        notice={detailNotice ?? closing}
        closing={!detailNotice && closing !== null}
        claimantLabel={claimantLabel}
        sha={stats?.commit ?? ''}
        onClose={closeDetail}
        onNav={navDetail}
        canPrev={detailIndex > 0}
        canNext={detailIndex >= 0 && detailIndex < filtered.length - 1}
      />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-14 animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="h-[190px] animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[400px] animate-pulse rounded-lg border border-edge bg-panel" />
        <div className="hidden h-[300px] animate-pulse rounded-lg border border-edge bg-panel xl:block" />
      </div>
    </div>
  )
}
