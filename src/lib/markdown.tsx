import type { ReactNode } from 'react'

// Minimal markdown renderer. Produces React elements only, never raw HTML,
// so notice text cannot inject markup.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  // token pattern: bold, italic, code, link, bare url
  const re =
    /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]*\]\([^)\s]+\))|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(https?:\/\/[^\s<>"'`[\]{}]+)/g
  let last = 0
  let k = 0
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const tok = m[0]
    const key = `${keyPrefix}-${k++}`
    if (tok.startsWith('**')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(
        <code
          key={key}
          className="rounded bg-panel2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/)
      if (lm) {
        out.push(
          <a
            key={key}
            href={lm[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {lm[1] || lm[2]}
          </a>,
        )
      } else {
        out.push(tok)
      }
    } else if (tok.startsWith('__')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>)
    } else {
      out.push(
        <a
          key={key}
          href={tok}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {tok}
        </a>,
      )
    }
    last = idx + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  let key = 0

  const isUl = (l: string) => /^\s*[-*•]\s+/.test(l)
  const isOl = (l: string) => /^\s*\d+[.)]\s+/.test(l)
  const isHr = (l: string) => /^\s*([-*_])\s*(\1\s*){2,}$/.test(l)

  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    if (!t) {
      i++
      continue
    }

    // fenced code
    if (t.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-edge bg-panel2 p-3 font-mono text-[13px] leading-relaxed"
        >
          {buf.join('\n')}
        </pre>,
      )
      continue
    }

    // heading
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const cls =
        level <= 2
          ? 'mt-5 mb-2 text-[15px] font-semibold'
          : 'mt-4 mb-1.5 text-[14px] font-semibold'
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(h[2], `h${key}`)}
        </div>,
      )
      i++
      continue
    }

    // horizontal rule
    if (isHr(line)) {
      blocks.push(<hr key={key++} className="my-4 border-edge" />)
      i++
      continue
    }

    // blockquote (possibly multi-line)
    if (/^>/.test(t)) {
      const buf: string[] = []
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 border-l-2 border-edge2 pl-3 text-ink2"
        >
          {buf.map((l, j) => (
            <p key={j} className="my-1">
              {renderInline(l, `q${key}-${j}`)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }

    // unordered list
    if (isUl(line)) {
      const items: string[] = []
      while (i < lines.length && isUl(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ul${key}-${j}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // ordered list
    if (isOl(line)) {
      const items: string[] = []
      while (i < lines.length && isOl(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ol${key}-${j}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // paragraph: gather until blank line or block start
    const buf: string[] = []
    while (i < lines.length) {
      const l = lines[i]
      const lt = l.trim()
      if (!lt) break
      if (
        lt.startsWith('```') ||
        /^(#{1,4})\s/.test(lt) ||
        /^>/.test(lt) ||
        isUl(l) ||
        isOl(l) ||
        isHr(l)
      ) {
        break
      }
      buf.push(lt)
      i++
    }
    blocks.push(
      <p key={key++} className="my-2.5 leading-relaxed">
        {renderInline(buf.join(' '), `p${key}`)}
      </p>,
    )
  }

  return <div className="text-[14px] text-ink">{blocks}</div>
}
