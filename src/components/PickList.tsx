import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export interface PickOption {
  value: string
  label: string
  count?: number
}

interface Props {
  label: string
  options: PickOption[]
  selected: string[]
  onToggle: (value: string) => void
  placeholder?: string
}

export function PickList({ label, options, selected, onToggle, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
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

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    if (!ql) return options.slice(0, 60)
    return options
      .filter((o) => o.label.toLowerCase().includes(ql) || o.value.toLowerCase().includes(ql))
      .slice(0, 60)
  }, [options, q])

  const selCount = selected.length

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-150 ${
          selCount > 0
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-edge bg-panel text-ink2 hover:text-ink'
        }`}
      >
        {label}
        {selCount > 0 && (
          <span className="rounded bg-accent px-1 text-[10px] font-semibold text-white">
            {selCount}
          </span>
        )}
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border border-edge bg-panel shadow-md">
          <div className="border-b border-edge p-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink3"
              />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder ?? `Filter ${label.toLowerCase()}...`}
                className="h-8 w-full rounded-lg border border-edge bg-panel2 pl-8 pr-2 text-[13px] outline-none focus:border-accent"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {filtered.map((o) => {
              const on = selected.includes(o.value)
              return (
                <li key={o.value}>
                  <button
                    onClick={() => onToggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:bg-panel2"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? 'border-accent bg-accent text-white' : 'border-edge2'
                      }`}
                    >
                      {on && <Check size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {o.label}
                    </span>
                    {o.count !== undefined && (
                      <span className="text-[11px] tabular-nums text-ink3">
                        {o.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-[12px] text-ink3">
                No matches
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
