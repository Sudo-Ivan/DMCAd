import { useState } from 'react'
import type { Stats } from '../lib/data'
import type { LoadedSource } from '../lib/data'
import type { AppState } from '../lib/appState'
import { TYPE_NAMES } from '../lib/parse'
import { Timeline } from './Timeline'

interface TopProps {
  stats: Stats
  state: AppState
  onPatch: (p: Partial<AppState>) => void
  sources?: LoadedSource[]
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink3">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink3">{sub}</div>}
    </div>
  )
}

export function DashboardTop({ stats, state, onPatch, sources }: TopProps) {
  const years = Object.keys(stats.years).length

  return (
    <section className="space-y-4">
      {sources && sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onPatch({ source: '' })}
            className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 ${
              state.source === ''
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-edge bg-panel text-ink2 hover:text-ink'
            }`}
          >
            All sources
          </button>
          {sources.map((s) => (
            <button
              key={s.info.id}
              onClick={() =>
                onPatch({
                  source: state.source === s.info.id ? '' : s.info.id,
                })
              }
              className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 ${
                state.source === s.info.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-edge bg-panel text-ink2 hover:text-ink'
              }`}
            >
              {s.info.label}
              <span className="ml-1.5 tabular-nums text-ink3">
                {s.info.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-x-10 gap-y-3 border-b border-edge pb-4">
        <Stat
          label="Notices"
          value={stats.total.toLocaleString()}
          sub={`${stats.withUrl.toLocaleString()} with URLs`}
        />
        <Stat
          label="Years"
          value={String(years)}
          sub={`${stats.firstDate.slice(0, 4)} to ${stats.lastDate.slice(0, 4)}`}
        />
        <Stat
          label="Claimants"
          value={stats.claimantCount.toLocaleString()}
          sub={`${((stats.withClaimant / stats.total) * 100).toFixed(0)}% detected in text`}
        />
        <Stat
          label="Last notice"
          value={stats.lastDate || 'n/a'}
          sub={stats.commit && stats.commit !== 'unknown' ? `src ${stats.commit.slice(0, 7)}` : undefined}
        />
      </div>

      <div className="rounded-lg border border-edge bg-panel p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-ink">Notices per month</h2>
          <span className="text-[11px] text-ink3">drag to filter</span>
        </div>
        <Timeline
          months={stats.months}
          from={state.from}
          to={state.to}
          onBrush={(f, t) => onPatch({ from: f, to: t })}
        />
      </div>
    </section>
  )
}

function Bar({ pct, color = 'var(--color-accent)' }: { pct: number; color?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-panel2">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(2, pct)}%`, background: color }}
      />
    </div>
  )
}

const TYPE_HEX: Record<number, string> = {
  0: '#94a3b8',
  1: '#3b82f6',
  2: '#10b981',
  3: '#f59e0b',
  4: '#8b5cf6',
  5: '#f43f5e',
  6: '#0ea5e9',
  7: '#6366f1',
}

interface WidgetsProps {
  stats: Stats
  state: AppState
  onPatch: (p: Partial<AppState>) => void
  claimantLabel: (key: string) => string
}

const toggleIn = <T,>(arr: T[], v: T): T[] =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

type Tab = 'claimants' | 'owners' | 'repos' | 'types'

const TABS: { id: Tab; label: string }[] = [
  { id: 'claimants', label: 'Claimants' },
  { id: 'owners', label: 'Owners' },
  { id: 'repos', label: 'Repos' },
  { id: 'types', label: 'Types' },
]

function RankRow({
  rank,
  label,
  count,
  pct,
  active,
  mono,
  color,
  onClick,
}: {
  rank: number
  label: React.ReactNode
  count: number
  pct: number
  active: boolean
  mono?: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-panel2 ${
          active ? 'bg-accent-soft/60' : ''
        }`}
      >
        <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink3">
          {rank}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] text-ink ${mono ? 'font-mono text-[12px]' : ''}`}
        >
          {label}
        </span>
        <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-ink3">
          {count.toLocaleString()}
        </span>
      </button>
      <div className="ml-7 mr-1.5 mt-0.5">
        <Bar pct={pct} color={color} />
      </div>
    </li>
  )
}

export function DashboardWidgets({ stats, state, onPatch, claimantLabel }: WidgetsProps) {
  const [tab, setTab] = useState<Tab>('claimants')
  const maxClaimant = stats.topClaimants[0]?.count ?? 1
  const maxOwner = stats.topOwners[0]?.count ?? 1
  const maxRepo = stats.topRepos[0]?.count ?? 1
  const typeEntries = Object.entries(stats.types)
    .map(([t, c]) => [parseInt(t, 10), c] as [number, number])
    .sort((a, b) => b[1] - a[1])
  const maxType = typeEntries[0]?.[1] ?? 1
  const total = stats.total

  return (
    <div className="rounded-lg border border-edge bg-panel">
      <div className="flex gap-4 border-b border-edge px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 py-2 text-[12px] font-medium transition-colors duration-150 ${
              tab === t.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ink3 hover:text-ink2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === 'claimants' && (
          <ul className="space-y-1">
            {stats.topClaimants.slice(0, 12).map((c, i) => {
              const active = state.claimants.includes(c.key)
              return (
                <RankRow
                  key={c.key}
                  rank={i + 1}
                  label={c.label ?? claimantLabel(c.key)}
                  count={c.count}
                  pct={(c.count / maxClaimant) * 100}
                  active={active}
                  onClick={() =>
                    onPatch({ claimants: toggleIn(state.claimants, c.key) })
                  }
                />
              )
            })}
          </ul>
        )}

        {tab === 'owners' && (
          <ul className="space-y-1">
            {stats.topOwners.slice(0, 12).map((o, i) => {
              const active = state.owners.includes(o.key)
              return (
                <RankRow
                  key={o.key}
                  rank={i + 1}
                  label={o.key}
                  count={o.count}
                  pct={(o.count / maxOwner) * 100}
                  active={active}
                  mono
                  color="var(--color-ink3)"
                  onClick={() =>
                    onPatch({ owners: toggleIn(state.owners, o.key) })
                  }
                />
              )
            })}
          </ul>
        )}

        {tab === 'repos' && (
          <ul className="space-y-1">
            {stats.topRepos.slice(0, 12).map((r, i) => {
              const owner = r.key.split('/')[0]
              const active = state.owners.includes(owner)
              return (
                <RankRow
                  key={r.key}
                  rank={i + 1}
                  label={r.key}
                  count={r.count}
                  pct={(r.count / maxRepo) * 100}
                  active={active}
                  mono
                  color="var(--color-ink3)"
                  onClick={() =>
                    onPatch({ owners: toggleIn(state.owners, owner) })
                  }
                />
              )
            })}
          </ul>
        )}

        {tab === 'types' && (
          <ul className="space-y-1">
            {typeEntries.map(([t, c], i) => {
              const active = state.types.includes(t)
              return (
                <li key={t}>
                  <button
                    onClick={() =>
                      onPatch({ types: toggleIn(state.types, t) })
                    }
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-panel2 ${
                      active ? 'bg-accent-soft/60' : ''
                    }`}
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink3">
                      {i + 1}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: TYPE_HEX[t] ?? TYPE_HEX[0] }}
                    />
                    <span className="w-32 shrink-0 truncate text-[13px] text-ink">
                      {TYPE_NAMES[t] ?? 'Other'}
                    </span>
                    <span className="flex-1">
                      <Bar
                        pct={(c / maxType) * 100}
                        color={TYPE_HEX[t] ?? TYPE_HEX[0]}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-ink3">
                      {((c / total) * 100).toFixed(1)}%
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
