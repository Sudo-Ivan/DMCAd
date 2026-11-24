import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  months: [string, number][]
  from: string
  to: string
  onBrush: (from: string, to: string) => void
}

const H = 132
const PAD_L = 10
const PAD_R = 10
const PAD_T = 14
const PAD_B = 24

export function Timeline({ months, from, to, onBrush }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [brush, setBrush] = useState<{ a: number; b: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ start: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const n = months.length
  const max = Math.max(...months.map((m) => m[1]), 1)
  const plotW = Math.max(1, width - PAD_L - PAD_R)
  const slot = plotW / n
  const plotH = H - PAD_T - PAD_B

  const idxFromX = useCallback(
    (clientX: number) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect || n === 0) return 0
      const x = clientX - rect.left - PAD_L
      return Math.min(n - 1, Math.max(0, Math.floor(x / slot)))
    },
    [n, slot],
  )

  const selA = brush ? Math.min(brush.a, brush.b) : -1
  const selB = brush ? Math.max(brush.a, brush.b) : -1

  const onDown = (e: React.PointerEvent) => {
    const i = idxFromX(e.clientX)
    drag.current = { start: i, moved: false }
    setBrush({ a: i, b: i })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const i = idxFromX(e.clientX)
    setHover(i)
    if (!drag.current) return
    if (i !== drag.current.start) drag.current.moved = true
    setBrush({ a: drag.current.start, b: i })
  }
  const onUp = () => {
    if (!drag.current || !brush) {
      drag.current = null
      return
    }
    const { start, moved } = drag.current
    const a = Math.min(start, brush.b)
    const b = Math.max(start, brush.b)
    drag.current = null
    setBrush(null)
    onBrush(months[a][0], moved || a !== b ? months[b][0] : months[a][0])
  }
  const onLeave = () => setHover(null)

  let fA = -1
  let fB = -1
  if (from || to) {
    fA = from ? months.findIndex(([m]) => m >= from) : 0
    fB = to
      ? (() => {
          const i = months.findIndex(([m]) => m > to)
          return i === -1 ? n - 1 : i - 1
        })()
      : n - 1
    if (fA === -1) fA = 0
    if (fB === -1) fB = n - 1
  }

  // year ticks: thin out so labels never collide (~46px per label)
  const pxPerYear = slot * 12
  const yearStep = Math.max(1, Math.ceil(46 / Math.max(pxPerYear, 1)))
  const yearTicks: { x: number; label: string }[] = []
  months.forEach(([m], i) => {
    if (m.endsWith('-01') && parseInt(m.slice(0, 4), 10) % yearStep === 0) {
      yearTicks.push({ x: PAD_L + i * slot + slot / 2, label: m.slice(0, 4) })
    }
  })

  const barX = (i: number) => PAD_L + i * slot + 0.5
  const barW = Math.max(1, slot - 1)
  const baseY = PAD_T + plotH

  const tip =
    hover !== null && hover >= 0 && hover < n
      ? { m: months[hover][0], c: months[hover][1], x: PAD_L + hover * slot + slot / 2 }
      : null

  return (
    <div
      ref={wrapRef}
      className="relative w-full cursor-crosshair select-none touch-pan-y"
      style={{ height: H }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onLeave}
      role="img"
      aria-label="Notices per month. Drag to filter by date range."
    >
      <svg width={width} height={H} className="block">
        <text
          x={width - PAD_R}
          y={PAD_T - 4}
          textAnchor="end"
          fontSize={9.5}
          fill="var(--color-ink3)"
          fontFamily="var(--font-mono)"
        >
          {max.toLocaleString()}
        </text>
        <line
          x1={PAD_L}
          x2={width - PAD_R}
          y1={baseY + 0.5}
          y2={baseY + 0.5}
          stroke="var(--color-edge2)"
        />
        {months.map(([m, c], i) => {
          const h = Math.max(1, (c / max) * (plotH - 6))
          const inFilter = fA >= 0 && i >= fA && i <= fB
          const inBrush = selA >= 0 && i >= selA && i <= selB
          const isHover = hover === i
          const active = inBrush || inFilter || isHover
          return (
            <rect
              key={m}
              x={barX(i)}
              y={baseY - h}
              width={barW}
              height={h}
              rx={Math.min(1.5, barW / 2)}
              fill="var(--color-accent)"
              opacity={inBrush ? 1 : active ? 0.85 : 0.45}
            />
          )
        })}
        {selA >= 0 && (
          <rect
            x={PAD_L + selA * slot}
            y={PAD_T - 2}
            width={(selB - selA + 1) * slot}
            height={plotH + 2}
            fill="var(--color-accent)"
            opacity={0.1}
            rx={3}
          />
        )}
        {selA >= 0 &&
          [selA, selB].map((edge, k) => {
            const x = PAD_L + edge * slot + (k === 0 ? 0 : slot)
            return (
              <g key={k}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_T - 4}
                  y2={baseY}
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                />
                <rect
                  x={x - 3}
                  y={PAD_T - 8}
                  width={6}
                  height={10}
                  rx={3}
                  fill="var(--color-accent)"
                />
              </g>
            )
          })}
        {yearTicks.map((t) => (
          <text
            key={t.label + t.x}
            x={Math.min(Math.max(t.x, PAD_L + 16), width - PAD_R - 16)}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-ink3)"
          >
            {t.label}
          </text>
        ))}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-edge bg-raised px-2 py-1 text-[11px] shadow-md"
          style={{
            left: Math.min(Math.max(tip.x, 48), width - 48),
          }}
        >
          <span className="font-mono text-ink2">{tip.m}</span>
          <span className="ml-1.5 font-semibold tabular-nums text-ink">
            {tip.c.toLocaleString()}
          </span>
          <span className="ml-1 text-ink3">notices</span>
        </div>
      )}
    </div>
  )
}
