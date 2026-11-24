import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  Check,
  ChevronDown,
  SearchX,
  X,
} from 'lucide-react'
import type { AppState } from '../lib/appState'
import type { FullTextState, SortMode } from '../lib/types'
import type { SourceId } from '../lib/sources'
import { SOURCE_LABELS } from '../lib/sources'
import type { PickOption } from './PickList'
import { PickList } from './PickList'
import { TYPE_NAMES } from '../lib/parse'

interface Props {
  state: AppState
  onPatch: (p: Partial<AppState>) => void
  total: number
  shown: number
  took: number | null
  claimantLabel: (key: string) => string
  claimantOptions: PickOption[]
  ownerOptions: PickOption[]
  sourceOptions: { id: SourceId; label: string; count: number }[]
  fullText: FullTextState
  fullProgress: [number, number]
  onToggleFullText: () => void
}

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'new', label: 'Newest' },
  { id: 'old', label: 'Oldest' },
  { id: 'rel', label: 'Relevance' },
  { id: 'url', label: 'Most URLs' },
]

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-edge bg-panel px-2 py-0.5 text-[11.5px] text-ink">
      {label}
      <button
        onClick={onRemove}
        className="rounded-full p-0.5 text-ink3 transition hover:bg-panel2 hover:text-ink"
        aria-label={`Remove filter ${label}`}
      >
        <X size={11} />
      </button>
    </span>
  )
}

function Switch({
  on,
  onChange,
  label,
  disabled,
  title,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      disabled={disabled}
      title={title}
      className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-150 ${
        on
          ? 'border-accent/40 bg-accent-soft text-accent'
          : 'border-edge bg-panel text-ink2 hover:text-ink'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-150 ${
          on ? 'bg-accent' : 'bg-edge2'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all duration-150 ${
            on ? 'left-[16px]' : 'left-[2px]'
          }`}
        />
      </span>
      {label}
    </button>
  )
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (s: SortMode) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = SORTS.find((s) => s.id === value) ?? SORTS[0]

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowUpDown size={13} className="text-ink3" />
        {current.label}
        <ChevronDown
          size={12}
          className={`opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-md border border-edge bg-raised p-1 shadow-md">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onChange(s.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink transition hover:bg-panel2"
            >
              <span className="w-4 shrink-0">
                {s.id === value && <Check size={13} className="text-accent" />}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function FilterBar({
  state,
  onPatch,
  total,
  shown,
  took,
  claimantLabel,
  claimantOptions,
  ownerOptions,
  sourceOptions,
  fullText,
  fullProgress,
  onToggleFullText,
}: Props) {
  const hasFilters =
    state.q !== '' ||
    state.from !== '' ||
    state.to !== '' ||
    state.types.length > 0 ||
    state.claimants.length > 0 ||
    state.owners.length > 0 ||
    state.counterOnly ||
    state.source !== ''

  const chips = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = []
    if (state.from || state.to) {
      const label =
        state.from === state.to
          ? state.from
          : state.from && state.to
            ? `${state.from} to ${state.to}`
            : state.from
              ? `${state.from} onward`
              : `until ${state.to}`
      out.push({
        key: 'range',
        label,
        remove: () => onPatch({ from: '', to: '' }),
      })
    }
    for (const t of state.types) {
      out.push({
        key: `ty${t}`,
        label: TYPE_NAMES[t] ?? 'Other',
        remove: () =>
          onPatch({ types: state.types.filter((x) => x !== t) }),
      })
    }
    for (const c of state.claimants) {
      out.push({
        key: `c${c}`,
        label: claimantLabel(c),
        remove: () =>
          onPatch({ claimants: state.claimants.filter((x) => x !== c) }),
      })
    }
    for (const o of state.owners) {
      out.push({
        key: `o${o}`,
        label: `@${o}`,
        remove: () => onPatch({ owners: state.owners.filter((x) => x !== o) }),
      })
    }
    if (state.counterOnly) {
      out.push({
        key: 'cn',
        label: 'Has counter-notice',
        remove: () => onPatch({ counterOnly: false }),
      })
    }
    if (state.source) {
      out.push({
        key: 'src',
        label: SOURCE_LABELS[state.source],
        remove: () => onPatch({ source: '' }),
      })
    }
    return out
  }, [state, onPatch, claimantLabel])

  return (
    <div className="space-y-2.5">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} onRemove={c.remove} />
          ))}
          {state.q && (
            <Chip label={`"${state.q}"`} onRemove={() => onPatch({ q: '' })} />
          )}
          {hasFilters && (
            <button
              onClick={() =>
                onPatch({
                  q: '',
                  from: '',
                  to: '',
                  types: [],
                  claimants: [],
                  owners: [],
                  counterOnly: false,
                  source: '',
                })
              }
              className="text-[12px] font-medium text-accent transition hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5 text-[13px] text-ink2">
          <ArrowDownWideNarrow size={14} className="text-ink3" />
          <span className="tabular-nums">
            {shown.toLocaleString()}
            {state.q || hasFilters ? ` of ${total.toLocaleString()}` : ''} notices
          </span>
          {took !== null && state.q && (
            <span className="text-ink3">· {took}ms</span>
          )}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <select
            value={state.source}
            onChange={(e) => onPatch({ source: e.target.value as SourceId | '' })}
            className="h-8 rounded-md border border-edge bg-panel px-2 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:text-ink"
            aria-label="Source"
          >
            <option value="">All sources</option>
            {sourceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.count.toLocaleString()})
              </option>
            ))}
          </select>
          <PickList
            label="Claimant"
            options={claimantOptions}
            selected={state.claimants}
            onToggle={(v) =>
              onPatch({
                claimants: state.claimants.includes(v)
                  ? state.claimants.filter((x) => x !== v)
                  : [...state.claimants, v],
              })
            }
          />
          <PickList
            label="Owner"
            options={ownerOptions}
            selected={state.owners}
            onToggle={(v) =>
              onPatch({
                owners: state.owners.includes(v)
                  ? state.owners.filter((x) => x !== v)
                  : [...state.owners, v],
              })
            }
          />
          <Switch
            on={state.counterOnly}
            onChange={(v) => onPatch({ counterOnly: v })}
            label="Has counter-notice"
          />
          <Switch
            on={fullText === 'ready'}
            onChange={onToggleFullText}
            disabled={fullText === 'loading'}
            label={
              fullText === 'loading'
                ? `Text ${fullProgress[0]}/${fullProgress[1]}`
                : 'Full text'
            }
            title="Search full notice text. Loads all bodies once, about 20 MB."
          />
          <SortMenu value={state.sort} onChange={(s) => onPatch({ sort: s })} />
        </div>
      </div>

      {shown === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-edge2 bg-panel px-4 py-3 text-[13px] text-ink2">
          <SearchX size={15} className="text-ink3" />
          No notices match. Try a shorter query or clear some filters.
        </div>
      )}
    </div>
  )
}
