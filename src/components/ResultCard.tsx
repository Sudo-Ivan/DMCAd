import { useMemo } from 'react'
import { Link2 } from 'lucide-react'
import type { Notice } from '../lib/rows'
import { TYPE_NAMES } from '../lib/parse'

// Thin-bordered text tags. Copyright and anti-circumvention stay neutral;
// the rarer types keep a colored label.
export const TYPE_BADGE: Record<number, string> = {
  0: 'border-edge text-ink3',
  1: 'border-edge text-ink2',
  2: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  3: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  4: 'border-violet-500/40 text-violet-700 dark:text-violet-400',
  5: 'border-edge text-ink2',
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
  claimantLabel: string
  terms: string[]
  selected: boolean
  onClick: () => void
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

export function ResultCard({ notice: n, claimantLabel, terms, selected, onClick }: Props) {
  const targets = n.targets
  const shown = targets.slice(0, 3)
  const rest = targets.length - shown.length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
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
          <Highlight text={claimantLabel} terms={terms} />
        </span>
        <TypeBadge type={n.type} />
      </div>

      {n.excerpt && (
        <p className="mt-1 line-clamp-2 pl-[98px] text-[12.5px] leading-5 text-ink2">
          <Highlight text={n.excerpt} terms={terms} />
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
