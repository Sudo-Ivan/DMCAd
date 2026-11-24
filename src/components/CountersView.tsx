import { useEffect, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Notice } from '../lib/rows'
import { excerptChunk } from '../lib/rows'
import { counterStats } from '../lib/profiles'
import { TYPE_COUNTER, TYPE_NAMES, TYPE_RETRACTION, TYPE_REVERSAL } from '../lib/parse'
import { TYPE_HEX, RankRow, Stat } from './Dashboard'
import { MonthChart } from './MonthChart'
import { ResultCard } from './ResultCard'

interface Props {
  notices: Notice[] | null
  // True while the github/lbry indexes are still streaming in.
  loading: boolean
  claimantLabel: (key: string) => string
  excerpts: Map<string, string>
  onExcerptsNeeded: (chunks: string[]) => void
  onBack: () => void
  onOpenProfile: (profile: string) => void
  onOpenDetail: (id: string) => void
}

const COUNTER_TYPES = [TYPE_COUNTER, TYPE_RETRACTION, TYPE_REVERSAL]

function CountersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-56 animate-pulse rounded-md border border-edge bg-panel" />
      <div className="flex gap-x-10 border-b border-edge pb-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-panel2" />
            <div className="h-5 w-14 animate-pulse rounded bg-panel2" />
          </div>
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-lg border border-edge bg-panel" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-lg border border-edge bg-panel"
          />
        ))}
      </div>
    </div>
  )
}

interface RankSectionProps {
  title: string
  entries: { key: string; count: number }[]
  labelFor: (key: string) => string
  mono?: boolean
  onOpen: (key: string) => void
}

function RankSection({ title, entries, labelFor, mono, onOpen }: RankSectionProps) {
  const max = entries[0]?.count ?? 1
  return (
    <div className="min-w-0 rounded-lg border border-edge bg-panel p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="px-1.5 py-1 text-[12px] text-ink3">None recorded</p>
      ) : (
        <ul className="space-y-1">
          {entries.slice(0, 10).map((e, i) => (
            <RankRow
              key={e.key}
              rank={i + 1}
              label={labelFor(e.key)}
              count={e.count}
              pct={(e.count / max) * 100}
              active={false}
              mono={mono}
              color={mono ? 'var(--color-ink3)' : undefined}
              onClick={() => onOpen(e.key)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function CountersView({
  notices,
  loading,
  claimantLabel,
  excerpts,
  onExcerptsNeeded,
  onBack,
  onOpenProfile,
  onOpenDetail,
}: Props) {
  const stats = useMemo(
    () => (notices ? counterStats(notices) : null),
    [notices],
  )

  useEffect(() => {
    const chunks = [
      ...new Set(
        (stats?.recent ?? [])
          .map(excerptChunk)
          .filter((c): c is string => c !== null),
      ),
    ]
    if (chunks.length) onExcerptsNeeded(chunks)
  }, [stats, onExcerptsNeeded])

  if (!stats || ((stats.counter + stats.retraction + stats.reversal) === 0 && loading)) {
    return <CountersSkeleton />
  }

  if (!stats || stats.counter + stats.retraction + stats.reversal === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge2 bg-panel px-4 py-10 text-center">
        <p className="text-[13px] text-ink2">
          No counter-notices, retractions or reversals in the loaded data.
        </p>
        <button
          onClick={onBack}
          className="mt-3 text-[12px] font-medium text-accent transition hover:underline"
        >
          Back to all notices
        </button>
      </div>
    )
  }

  const perType = COUNTER_TYPES.map(
    (t) => new Map(stats.monthsByType[t] ?? []),
  )
  const monthSet = new Set<string>()
  for (const m of perType) for (const ym of m.keys()) monthSet.add(ym)
  const chartMonths: [string, number[]][] = [...monthSet]
    .sort()
    .map((ym) => [ym, perType.map((m) => m.get(ym) ?? 0)])

  const openClaimant = (key: string) => onOpenProfile(`c:${key}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft size={13} />
          All notices
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Counter-notices
          </h1>
          <p className="text-[12px] text-ink3">
            Retractions and reversals in the GitHub and LBRY data
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-3 border-b border-edge pb-4">
        <Stat
          label="Counter-notices"
          value={stats.counter.toLocaleString()}
        />
        <Stat
          label="Retractions"
          value={stats.retraction.toLocaleString()}
        />
        <Stat
          label="Reversals"
          value={stats.reversal.toLocaleString()}
        />
        <Stat
          label="Notices countered"
          value={stats.countered.toLocaleString()}
          sub="flagged in index"
        />
      </div>

      <div className="rounded-lg border border-edge bg-panel p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-ink">
            Counter activity per month
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-ink3">
            {COUNTER_TYPES.map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: TYPE_HEX[t] }}
                />
                {TYPE_NAMES[t]}
              </span>
            ))}
          </div>
        </div>
        <MonthChart
          months={chartMonths}
          colors={COUNTER_TYPES.map((t) => TYPE_HEX[t])}
          labels={COUNTER_TYPES.map((t) => TYPE_NAMES[t] ?? '')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <RankSection
          title="Claimants whose notices were countered"
          entries={stats.topCounteredClaimants}
          labelFor={claimantLabel}
          onOpen={(key) => openClaimant(key)}
        />
        <RankSection
          title="Repos that got countered"
          entries={stats.topCounteredRepos}
          labelFor={(key) => key}
          mono
          onOpen={(key) => onOpenProfile(`r:${key}`)}
        />
        <RankSection
          title="Who files them"
          entries={stats.topFilers}
          labelFor={claimantLabel}
          onOpen={(key) => openClaimant(key)}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
          Recent counter-notices
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <div className="space-y-2">
        {stats.recent.map((n) => (
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
