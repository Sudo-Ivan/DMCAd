import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react'
import type { Notice } from '../lib/rows'
import { bodyChunk } from '../lib/rows'
import { loadBodies } from '../lib/data'
import { claimantFromText, extractUrls, slugFromPath } from '../lib/parse'
import { Markdown } from '../lib/markdown'
import { TypeBadge } from './ResultCard'

interface Props {
  notice: Notice | null
  closing?: boolean
  claimantLabel: (key: string) => string
  sha: string
  onClose: () => void
  onNav: (dir: 1 | -1) => void
  canPrev: boolean
  canNext: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="relative shrink-0">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="rounded-md p-1 text-ink3 transition hover:bg-panel2 hover:text-ink"
        aria-label="Copy URL"
        title="Copy URL"
      >
        {copied ? <Check size={12} className="text-teal-500" /> : <Copy size={12} />}
      </button>
      {copied && (
        <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-medium text-canvas shadow-md">
          Copied
        </span>
      )}
    </span>
  )
}

interface BodyProps {
  notice: Notice
  onExtracted?: (name: string | null) => void
}

function NoticeBody({ notice, onExtracted }: BodyProps) {
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadBodies(bodyChunk(notice))
      .then((chunk) => {
        if (cancelled) return
        const text = chunk[notice.path] ?? ''
        setBody(text)
        onExtracted?.(claimantFromText(text))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  const urls = useMemo(() => (body ? extractUrls(body) : []), [body])

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-edge2 p-6 text-center text-[13px] text-ink2">
        Could not load the notice text for this chunk.
      </div>
    )
  }
  if (body === null) {
    return (
      <div className="space-y-3">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-panel2"
            style={{ width: `${90 - (i % 4) * 11}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {notice.targets.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Targeted repositories
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {notice.targets.map((t) => (
              <a
                key={t}
                href={`https://github.com/${t}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-edge bg-panel px-2 py-1 font-mono text-[12px] text-ink transition hover:border-accent hover:text-accent"
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      )}

      {urls.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            URLs in notice ({urls.length})
          </h3>
          <ul className="space-y-1">
            {urls.slice(0, 60).map((u) => {
              const hm = u.match(/^https?:\/\/([^/]+)(.*)$/)
              const host = hm?.[1] ?? u
              const rest = hm?.[2] ?? ''
              return (
                <li
                  key={u}
                  className="flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2 py-1 transition-colors duration-150 hover:border-edge2"
                >
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate font-mono text-[11.5px]"
                    title={u}
                  >
                    <span className="font-medium text-ink">{host}</span>
                    <span className="text-ink3">{rest || '/'}</span>
                  </a>
                  <CopyButton text={u} />
                </li>
              )
            })}
          </ul>
          {urls.length > 60 && (
            <p className="mt-1 text-[11px] text-ink3">
              +{urls.length - 60} more
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
        <FileText size={12} />
        Notice text
      </div>
      <Markdown text={body} />
    </>
  )
}

export function DetailPanel({
  notice,
  closing = false,
  claimantLabel,
  sha,
  onClose,
  onNav,
  canPrev,
  canNext,
}: Props) {
  const [extractedFor, setExtractedFor] = useState<{
    path: string
    name: string | null
  } | null>(null)

  if (!notice) return null

  const extracted =
    extractedFor?.path === notice.path ? extractedFor.name : null
  const displayClaimant = extracted ?? claimantLabel(notice.claimantKey)
  const ref = /^[0-9a-f]{40}$/i.test(sha) ? sha : 'master'
  const ghUrl = `https://github.com/github/dmca/blob/${ref}/${notice.path}`
  const slug = slugFromPath(notice.path)

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Notice detail">
      <div
        className={`absolute inset-0 bg-black/40 ${closing ? '' : 'backdrop-in'}`}
        onClick={onClose}
      />
      <aside
        className={`${closing ? 'panel-out' : 'panel-in'} absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-edge bg-canvas shadow-xl`}
      >
        <div className="flex items-start gap-3 border-b border-edge px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[16px] font-semibold tracking-tight">
                {displayClaimant}
              </h2>
              <TypeBadge type={notice.type} />
              {notice.hasCounter && (
                <span className="rounded border border-emerald-500/40 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  Has counter-notice
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink3">
              <span className="font-mono">{notice.date || 'undated'}</span>
              {notice.domain && <span>{notice.domain}</span>}
              <span className="font-mono">{slug}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onNav(-1)}
              disabled={!canPrev}
              className="rounded-lg border border-edge bg-panel p-1.5 text-ink2 transition hover:text-ink disabled:opacity-40"
              aria-label="Previous notice"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => onNav(1)}
              disabled={!canNext}
              className="rounded-lg border border-edge bg-panel p-1.5 text-ink2 transition hover:text-ink disabled:opacity-40"
              aria-label="Next notice"
            >
              <ChevronRight size={16} />
            </button>
            <a
              href={ghUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-edge bg-panel p-1.5 text-ink2 transition hover:text-ink"
              aria-label="View source on GitHub"
              title="View source on GitHub"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={onClose}
              className="rounded-lg border border-edge bg-panel p-1.5 text-ink2 transition hover:text-ink"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <NoticeBody
            key={notice.path}
            notice={notice}
            onExtracted={(name) =>
              setExtractedFor({ path: notice.path, name })
            }
          />
        </div>

        <div className="border-t border-edge px-5 py-2.5 text-[11px] text-ink3">
          <span className="font-mono">{notice.path}</span>
          {' · '}
          {notice.length.toLocaleString()} chars
        </div>
      </aside>
    </div>
  )
}
