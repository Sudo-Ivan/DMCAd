import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = '/tmp/dmca-shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function shot(name, { url = BASE, width = 1440, height = 900, dark, actions, wait = 1200, fullPage = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(wait)
  if (actions) await actions(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  console.log(name, errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'ok')
  await ctx.close()
}

const typeSearch = async (page, q) => {
  await page.fill('input[aria-label="Search notices"]', q)
  await page.waitForTimeout(900)
}

// dashboard light desktop
await shot('dashboard-light-desktop', { wait: 2500 })
// dashboard dark desktop
await shot('dashboard-dark-desktop', { dark: true, wait: 2500 })
// dashboard mobile light
await shot('dashboard-light-mobile', { width: 390, height: 844, wait: 2500 })
// search results
await shot('search-results-light', {
  actions: async (p) => { await typeSearch(p, 'nintendo') },
  wait: 1500,
})
// search dark
await shot('search-results-dark', {
  dark: true,
  actions: async (p) => { await typeSearch(p, 'nintendo') },
  wait: 1500,
})
// detail panel
await shot('detail-light', {
  actions: async (p) => {
    await typeSearch(p, 'odoo')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1500)
  },
  wait: 1500,
})
// detail dark mobile
await shot('detail-dark-mobile', {
  dark: true,
  width: 390,
  height: 844,
  actions: async (p) => {
    await typeSearch(p, 'sony')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1500)
  },
  wait: 1500,
})
// filtered view (type counter-notice)
await shot('filter-counter-light', {
  url: BASE + '?ty=2',
  wait: 2000,
})

await browser.close()
console.log('done ->', OUT)
