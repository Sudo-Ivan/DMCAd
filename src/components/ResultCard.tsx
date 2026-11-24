import { useMemo } from 'react'
import { Link2 } from 'lucide-react'
import type { Notice } from '../lib/rows'
import { excerptChunk } from '../lib/rows'
import { TYPE_NAMES } from '../lib/parse'
import { SOURCE_LABELS } from '../lib/sources'

// Thin-bordered text tags. Copyright and anti-circumvention stay neutral;
// the rarer types keep a colored label.
export const TYPE_BADGE: Record<number, string> = {
  0: 'border-edge text-ink3',
  1: 'border-edge text-ink2',
  2: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  3: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  4: 'border-violet-500/40 text-violet-700 dark:text-violet-400',
  5: 'border-edge text-ink2',
  6: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
  7: 'border-indigo-500/40 text-indigo-700 dark:text-indigo-400',
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const nodes = useMemo(() => {
    const clean = terms.map((t) => t.trim()).filter((t) => t.length >= 2)
    if (!clean.length) return [text]
    const re = new RegExp(`(${clean.map(escapeRe).join('|')})`, 'gi')
    const parts = text.split(re)
    return parts.map((p, i) =>
      i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
    )
  }, [text, terms])
  return <>{nodes}</>
}

interface Props {
  notice: Notice
  // Resolved excerpt from the sidecar chunk; undefined while the chunk is
  // still in flight. Sources with inline excerpts ignore this.
  excerpt?: string
  claimantLabel: string
  terms: string[]
  selected: boolean
  onClick: () => void
  // When set, the claimant name becomes a link to its profile page.
  onOpenClaimant?: (claimantKey: string) => void
}

export function TypeBadge({ type }: { type: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border bg-panel px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${TYPE_BADGE[type] ?? TYPE_BADGE[0]}`}
    >
      {TYPE_NAMES[type] ?? 'Other'}
    </span>
  )
}

export function ResultCard({ notice: n, excerpt, claimantLabel, terms, selected, onClick, onOpenClaimant }: Props) {
  const targets = n.targets
  const shown = targets.slice(0, 3)
  const rest = targets.length - shown.length
  const ex = excerpt ?? n.excerpt
  // Repo sources keep a reserved excerpt line while the sidecar chunk is
  // in flight so cards never change height when the text lands.
  const sidecar = excerptChunk(n) !== null
  const pending = excerpt === undefined && sidecar

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`group relative block w-full cursor-pointer rounded-lg border bg-panel px-4 py-2.5 text-left transition-colors duration-150 ${
        selected
          ? 'border-accent'
          : 'border-edge hover:border-edge2'
      }`}
    >
      <span
        className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent transition-opacity duration-150 ${
          selected ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="flex items-center gap-3">
        <span className="w-[86px] shrink-0 font-mono text-[11px] tabular-nums text-ink3">
          {n.date || 'undated'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight text-ink">
          {onOpenClaimant ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenClaimant(n.claimantKey)
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className="inline-block max-w-full truncate align-bottom hover:text-accent hover:underline"
            >
              <Highlight text={claimantLabel} terms={terms} />
            </button>
          ) : (
            <Highlight text={claimantLabel} terms={terms} />
          )}
        </span>
        <span className="shrink-0 rounded border border-edge bg-panel2 px-1.5 py-px text-[10px] font-medium text-ink3">
          {SOURCE_LABELS[n.source]}
        </span>
        <TypeBadge type={n.type} />
      </div>

      {(ex || pending || sidecar) && (
        <p className="mt-1 line-clamp-2 min-h-10 pl-[98px] text-[12.5px] leading-5 text-ink2">
          {pending ? (
            <span className="mt-1 block h-4 w-3/5 animate-pulse rounded bg-panel2" />
          ) : (
            <Highlight text={ex} terms={terms} />
          )}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[98px]">
        {shown.map((t) => (
          <span
            key={t}
            className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink2"
          >
            {t}
          </span>
        ))}
        {rest > 0 && (
          <span className="text-[11px] text-ink3">+{rest} more</span>
        )}
        {n.hasCounter && (
          <span className="rounded border border-emerald-500/40 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Has counter-notice
          </span>
        )}
        {n.urlCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] tabular-nums text-ink3">
            <Link2 size={11} />
            {n.urlCount}
          </span>
        )}
      </div>
    </div>
  )
}
