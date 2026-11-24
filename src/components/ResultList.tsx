import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Notice } from '../lib/rows'
import { excerptChunk } from '../lib/rows'
import { ResultCard } from './ResultCard'

interface Props {
  items: Notice[]
  claimantLabel: (key: string) => string
  terms: string[]
  selectedIndex: number
  onOpen: (index: number) => void
  resetKey: string
  // noticeId -> excerpt, filled in as per-month sidecar chunks land.
  excerpts: Map<string, string>
  // Called with the sidecar chunks covering the rendered window plus a
  // prefetch margin, so scrolling stays ahead of the fetches.
  onExcerptsNeeded: (chunks: string[]) => void
  onOpenClaimant?: (claimantKey: string) => void
}

// How far past the rendered window to prefetch excerpt chunks, in rows.
const PREFETCH_ROWS = 60

export function ResultList({
  items,
  claimantLabel,
  terms,
  selectedIndex,
  onOpen,
  resetKey,
  excerpts,
  onExcerptsNeeded,
  onOpenClaimant,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 8,
    getItemKey: (i) => items[i]?.path ?? i,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const chunks = new Set<string>()
    const first = virtualItems[0]?.index ?? -1
    const last = virtualItems[virtualItems.length - 1]?.index ?? -1
    if (first >= 0 && last >= first) {
      const lo = Math.max(0, first - PREFETCH_ROWS)
      const hi = Math.min(items.length - 1, last + PREFETCH_ROWS)
      for (let i = lo; i <= hi; i++) {
        const n = items[i]
        if (!n) continue
        const c = excerptChunk(n)
        if (c) chunks.add(c)
      }
    }
    onExcerptsNeeded([...chunks])
  }, [virtualItems, items, onExcerptsNeeded])

  useEffect(() => {
    if (selectedIndex < 0) return
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
  }, [resetKey])

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-400px)] min-h-[400px] overflow-y-auto"
      role="group"
      aria-label="Search results"
    >
      <div
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualItems.map((vi) => {
          const n = items[vi.index]
          if (!n) return null
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
                padding: '5px 0',
              }}
            >
              <ResultCard
                notice={n}
                excerpt={excerpts.get(n.id)}
                claimantLabel={claimantLabel(n.claimantKey)}
                terms={terms}
                selected={vi.index === selectedIndex}
                onClick={() => onOpen(vi.index)}
                onOpenClaimant={onOpenClaimant}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
