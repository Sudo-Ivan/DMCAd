// Static monthly bar chart for the profile and counters views. Unlike
// Timeline this has no brush: each column is a flex slot sized by the
// browser, stacked segments align with `colors`, and the native title
// attribute carries the per-month breakdown.

interface Props {
  // Sorted [ym, counts] pairs; counts[i] pairs with colors[i].
  months: [string, number[]][]
  colors: string[]
  labels?: string[]
}

export function MonthChart({ months, colors, labels }: Props) {
  if (!months.length) return null
  const max = Math.max(
    1,
    ...months.map(([, counts]) => counts.reduce((a, b) => a + b, 0)),
  )
  return (
    <div>
      <div className="flex h-28 items-end gap-px">
        {months.map(([ym, counts]) => {
          const tip =
            labels && labels.length > 1
              ? `${ym}: ${counts
                  .map((c, i) => (c > 0 ? `${labels[i]} ${c.toLocaleString()}` : ''))
                  .filter(Boolean)
                  .join(', ') || '0'}`
              : `${ym}: ${counts
                  .reduce((a, b) => a + b, 0)
                  .toLocaleString()}`
          return (
            <div
              key={ym}
              className="flex min-w-0 flex-1 flex-col-reverse"
              style={{ height: '100%' }}
              title={tip}
            >
              {counts.map((c, i) =>
                c > 0 ? (
                  <div
                    key={i}
                    style={{
                      height: `${(c / max) * 100}%`,
                      background: colors[i] ?? colors[0],
                    }}
                  />
                ) : null,
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink3">
        <span>{months[0][0]}</span>
        <span>{months[months.length - 1][0]}</span>
      </div>
    </div>
  )
}
