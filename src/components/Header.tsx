import { useEffect } from 'react'
import { Moon, Search, Sun, X } from 'lucide-react'
import { Logo } from './Logo'

interface Props {
  q: string
  onQuery: (q: string) => void
  onOpenFirst?: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  dark: boolean
  onToggleTheme: () => void
}

export function Header({ q, onQuery, onOpenFirst, inputRef, dark, onToggleTheme }: Props) {

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inputRef])

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-canvas">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <a href="./" className="flex shrink-0 items-center gap-2">
          <Logo size={26} />
          <span className="hidden text-[14px] font-semibold tracking-tight sm:block">
            DMCA
            <span className="ml-1.5 font-normal text-ink2">Notices</span>
          </span>
          <span className="text-[14px] font-semibold tracking-tight sm:hidden">
            DMCA
          </span>
        </a>

        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
          />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpenFirst?.()
              } else if (e.key === 'Escape') {
                if (q) {
                  onQuery('')
                } else {
                  ;(e.target as HTMLInputElement).blur()
                }
              }
            }}
            placeholder="Search claimants, repos, excerpts..."
            aria-label="Search notices"
            className="h-9 w-full rounded-lg border border-edge bg-panel pl-9 pr-14 text-[13.5px] text-ink outline-none transition placeholder:text-ink3 focus:border-accent"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {q ? (
              <button
                onClick={() => onQuery('')}
                className="pointer-events-auto rounded p-1 text-ink3 transition hover:bg-panel2 hover:text-ink"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : (
              <kbd className="hidden rounded border border-edge bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-ink3 sm:block">
                /
              </kbd>
            )}
          </div>
        </div>

        <button
          onClick={onToggleTheme}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-panel text-ink2 transition hover:border-edge2 hover:text-ink"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  )
}
