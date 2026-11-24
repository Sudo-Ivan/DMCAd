import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import compression from 'compression'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// `vite preview` serves dist/ uncompressed while the deployed Pages site
// serves gzip. Compress preview responses too so local Lighthouse runs see
// the same transfer sizes as production.
function previewGzip(): Plugin {
  return {
    name: 'preview-gzip',
    configurePreviewServer(server) {
      // compression types itself as an express handler; connect wants the
      // node req/res signature, which is what it actually calls.
      const gzip = compression({ threshold: 1024 }) as unknown as (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void,
      ) => void
      server.middlewares.use(gzip)
    },
  }
}

// Emits preload links for the files the app fetches on startup, read from
// the built manifest so the list can never go stale when the corpus rolls
// to a new month or a source is skipped. Mirrors the eager set in
// src/App.tsx: manifest, every stats file, and the first EAGER_PARTS index
// parts of each non-lazy source.
const DATA_PRELOADS = '<!--app-data-preloads-->'
const EAGER_PARTS = 3

function dataPreloads(): Plugin {
  let base = '/'
  return {
    name: 'data-preloads',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml(html) {
      if (!html.includes(DATA_PRELOADS)) return html
      const link = (p: string) =>
        `    <link rel="preload" as="fetch" href="${base}data/${p}" crossorigin />`
      const tags = [link('sources.json')]
      try {
        const manifest = JSON.parse(
          readFileSync(resolve('public/data/sources.json'), 'utf8'),
        )
        for (const s of manifest.sources ?? []) {
          if (s.stats) tags.push(link(s.stats))
          if (s.lazy) continue
          const parts = s.indexes ?? (s.index ? [s.index] : [])
          for (const p of parts.slice(0, EAGER_PARTS)) tags.push(link(p))
        }
      } catch {
        // no dataset built yet, emit the manifest link only
      }
      return html.replace(DATA_PRELOADS, tags.join('\n'))
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), previewGzip(), dataPreloads()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    exclude: ['**/node_modules/**', '**/.cache/**', '**/dist/**'],
  },
})
