import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Notice } from '../lib/rows'
import { ResultCard } from './ResultCard'

interface Props {
  items: Notice[]
  claimantLabel: (key: string) => string
  terms: string[]
  selectedIndex: number
  onOpen: (index: number) => void
  resetKey: string
}

export function ResultList({
  items,
  claimantLabel,
  terms,
  selectedIndex,
  onOpen,
  resetKey,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 8,
    getItemKey: (i) => items[i]?.path ?? i,
  })

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
      role="listbox"
      aria-label="Search results"
    >
      <div
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
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
                claimantLabel={claimantLabel(n.claimantKey)}
                terms={terms}
                selected={vi.index === selectedIndex}
                onClick={() => onOpen(vi.index)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
