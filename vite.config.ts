import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import compression from 'compression'
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

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), previewGzip()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    exclude: ['**/node_modules/**', '**/.cache/**', '**/dist/**'],
  },
})
