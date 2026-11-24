import { useEffect, useMemo } from 'react'
import { ArrowLeft, Filter } from 'lucide-react'
import type { Notice } from '../lib/rows'
import { excerptChunk } from '../lib/rows'
import type { AppState } from '../lib/appState'
import type { TopEntry } from '../lib/data'
import {
  claimantProfile,
  ownerProfile,
  repoProfile,
  type EntityProfile,
} from '../lib/profiles'
import { TYPE_NAMES } from '../lib/parse'
import { SOURCE_LABELS, type SourceId } from '../lib/sources'
import { RankRow, Stat, TYPE_HEX } from './Dashboard'
import { MonthChart } from './MonthChart'
import { ResultCard } from './ResultCard'

interface Props {
  // Raw profile ref: `c:<claimantKey>` | `o:<owner>` | `r:<owner>/<repo>`.
  profile: string
  notices: Notice[] | null
  // True while the source backing this profile is still streaming in.
  loading: boolean
  state: AppState
  onPatch: (p: Partial<AppState>) => void
  claimantLabel: (key: string) => string
  excerpts: Map<string, string>
  onExcerptsNeeded: (chunks: string[]) => void
  onOpenDetail: (id: string) => void
}

type SectionKind = 'domain' | 'owner' | 'repo' | 'claimant'

interface Section {
  title: string
  entries: TopEntry[]
  kind: SectionKind
  mono?: boolean
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-64 animate-pulse rounded-md border border-edge bg-panel" />
      <div className="flex gap-x-10 border-b border-edge pb-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-14 animate-pulse rounded bg-panel2" />
            <div className="h-5 w-16 animate-pulse rounded bg-panel2" />
          </div>
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-lg border border-edge bg-panel"
          />
        ))}
      </div>
    </div>
  )
}

export function ProfileView({
  profile,
  notices,
  loading,
  state,
  onPatch,
  claimantLabel,
  excerpts,
  onExcerptsNeeded,
  onOpenDetail,
}: Props) {
  const sep = profile.indexOf(':')
  const kind = profile.slice(0, sep)
  const value = profile.slice(sep + 1)

  const data = useMemo<EntityProfile | null>(() => {
    if (!notices) return null
    if (kind === 'c') return claimantProfile(notices, value)
    if (kind === 'o') return ownerProfile(notices, value)
    if (kind === 'r') return repoProfile(notices, value)
    return null
  }, [notices, kind, value])

  useEffect(() => {
    const chunks = [
      ...new Set(
        (data?.recent ?? [])
          .map(excerptChunk)
          .filter((c): c is string => c !== null),
      ),
    ]
    if (chunks.length) onExcerptsNeeded(chunks)
  }, [data, onExcerptsNeeded])

  const openProfile = (p: string) => onPatch({ profile: p, view: '' })
  const openClaimant = (key: string) => openProfile(`c:${key}`)

  const onFilterNotices = () => {
    if (kind === 'c') {
      const claimants = state.claimants.includes(value)
        ? state.claimants.filter((x) => x !== value)
        : [...state.claimants, value]
      onPatch({ profile: null, claimants })
    } else if (kind === 'o') {
      const owners = state.owners.includes(value)
        ? state.owners.filter((x) => x !== value)
        : [...state.owners, value]
      onPatch({ profile: null, owners })
    } else {
      // The owner filter also matches a full `owner/repo` target, so a repo
      // profile filters down to just that repository.
      const repo = value.toLowerCase()
      const owners = state.owners.includes(repo)
        ? state.owners.filter((x) => x !== repo)
        : [...state.owners, repo]
      onPatch({ profile: null, owners })
    }
  }

  if (!data || (data.total === 0 && loading)) {
    return <ProfileSkeleton />
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge2 bg-panel px-4 py-10 text-center">
        <p className="text-[13px] text-ink2">No notices found for this profile.</p>
        <p className="mt-1 font-mono text-[11px] text-ink3">{profile}</p>
        <button
          onClick={() => onPatch({ profile: null })}
          className="mt-3 text-[12px] font-medium text-accent transition hover:underline"
        >
          Back to all notices
        </button>
      </div>
    )
  }

  const title =
    kind === 'c' ? claimantLabel(value) : kind === 'o' ? `@${value}` : value
  const sourceEntries = Object.entries(data.sources).sort(
    (a, b) => b[1] - a[1],
  )
  const typeEntries = Object.entries(data.types)
    .map(([t, c]) => [parseInt(t, 10), c] as [number, number])
    .sort((a, b) => b[1] - a[1])

  // Sections differ per entity kind. Rows deep-link into the matching
  // profile; domains are display-only.
  const sections: Section[] = []
  if (kind === 'c') {
    sections.push(
      { title: 'Top domains', entries: data.domains, kind: 'domain' },
      { title: 'Top owners', entries: data.owners, kind: 'owner' },
      { title: 'Top repos', entries: data.targets, kind: 'repo', mono: true },
    )
  } else if (kind === 'o') {
    const o = value.toLowerCase()
    sections.push(
      { title: 'Top claimants', entries: data.claimants, kind: 'claimant' },
      {
        title: 'Top repos',
        entries: data.targets.filter((t) => t.key.split('/')[0] === o),
        kind: 'repo',
        mono: true,
      },
      { title: 'Top domains', entries: data.domains, kind: 'domain' },
    )
  } else {
    sections.push(
      { title: 'Top claimants', entries: data.claimants, kind: 'claimant' },
      { title: 'Top domains', entries: data.domains, kind: 'domain' },
    )
  }

  const rowSpec = (s: Section) => (e: TopEntry) => {
    switch (s.kind) {
      case 'owner':
        return {
          profile: `o:${e.key}`,
          active: state.owners.includes(e.key),
        }
      case 'repo':
        return {
          profile: `r:${e.key}`,
          active:
            state.owners.includes(e.key.split('/')[0]) ||
            state.owners.includes(e.key),
        }
      case 'claimant':
        return {
          profile: `c:${e.key}`,
          active: state.claimants.includes(e.key),
        }
      default:
        return { profile: null, active: false }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onPatch({ profile: null })}
          className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft size={13} />
          All notices
        </button>
        <h1
          className={
            kind === 'r'
              ? 'font-mono text-base font-semibold tracking-tight'
              : 'text-lg font-semibold tracking-tight'
          }
        >
          {title}
        </h1>
        {sourceEntries.length > 1 &&
          sourceEntries.map(([s, c]) => (
            <span
              key={s}
              className="rounded border border-edge bg-panel2 px-1.5 py-px text-[10px] font-medium text-ink3"
            >
              {SOURCE_LABELS[s as SourceId] ?? s}
              <span className="ml-1 tabular-nums">{c.toLocaleString()}</span>
            </span>
          ))}
        <button
          onClick={onFilterNotices}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:text-ink"
        >
          <Filter size={13} />
          Filter notices
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-3 border-b border-edge pb-4">
        <Stat label="Notices" value={data.total.toLocaleString()} />
        <Stat
          label="URLs"
          value={data.urlCountSum.toLocaleString()}
          sub="links listed"
        />
        <Stat label="First" value={data.firstDate || 'n/a'} />
        <Stat label="Last" value={data.lastDate || 'n/a'} />
        <Stat
          label="Countered"
          value={data.withCounter.toLocaleString()}
          sub="have counter-notices"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-lg border border-edge bg-panel p-3">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-ink">
              Notices per month
            </h2>
          </div>
          <MonthChart
            months={data.months.map(
              ([ym, c]): [string, number[]] => [ym, [c]],
            )}
            colors={['var(--color-accent)']}
          />
        </div>

        <div className="min-w-0 rounded-lg border border-edge bg-panel p-3">
          <h2 className="mb-2 text-[13px] font-semibold text-ink">Notice types</h2>
          <ul className="space-y-1">
            {typeEntries.map(([t, c]) => (
              <li key={t} className="flex items-center gap-2 px-1.5 py-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TYPE_HEX[t] ?? TYPE_HEX[0] }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {TYPE_NAMES[t] ?? 'Other'}
                </span>
                <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-ink3">
                  {c.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => {
          const max = s.entries[0]?.count ?? 1
          const spec = rowSpec(s)
          return (
            <div
              key={s.title}
              className="min-w-0 rounded-lg border border-edge bg-panel p-3"
            >
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
                {s.title}
              </h3>
              {s.entries.length === 0 ? (
                <p className="px-1.5 py-1 text-[12px] text-ink3">None recorded</p>
              ) : (
                <ul className="space-y-1">
                  {s.entries.slice(0, 10).map((e, i) => {
                    const r = spec(e)
                    return (
                      <RankRow
                        key={e.key}
                        rank={i + 1}
                        label={e.key}
                        count={e.count}
                        pct={(e.count / max) * 100}
                        active={r.active}
                        mono={s.mono}
                        color={s.mono ? 'var(--color-ink3)' : undefined}
                        onClick={
                          r.profile ? () => openProfile(r.profile!) : undefined
                        }
                      />
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
          Recent notices
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <div className="space-y-2">
        {data.recent.map((n) => (
          <ResultCard
            key={n.id}
            notice={n}
            excerpt={excerpts.get(n.id)}
            claimantLabel={claimantLabel(n.claimantKey)}
            terms={[]}
            selected={false}
            onClick={() => onOpenDetail(n.id)}
            onOpenClaimant={openClaimant}
          />
        ))}
      </div>
    </div>
  )
}
