import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = '/tmp/dmca-shots/v3'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function shot(name, { url = BASE, width = 1440, height = 900, dark, actions, wait = 1800 }) {
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
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'ok')
  await ctx.close()
}

const typeSearch = async (page, q) => {
  await page.fill('input[aria-label="Search notices"]', q)
  await page.waitForTimeout(1000)
}

await shot('dashboard-light-desktop', { wait: 2500 })
await shot('dashboard-dark-desktop', { dark: true, wait: 2500 })
await shot('dashboard-light-mobile', { width: 390, height: 844, wait: 2500 })
await shot('search-nintendo-light-desktop', {
  actions: async (p) => { await typeSearch(p, 'nintendo') },
})
await shot('search-nintendo-dark-desktop', {
  dark: true,
  actions: async (p) => { await typeSearch(p, 'nintendo') },
})
await shot('detail-light-desktop', {
  actions: async (p) => {
    await typeSearch(p, 'odoo')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})

// logo at 16/32/64 on white and dark backgrounds, icon served by preview
for (const [name, bg] of [['white', '#ffffff'], ['dark', '#1a1a1e']]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 140 } })
  const page = await ctx.newPage()
  await page.setContent(`<!doctype html><body style="margin:0;background:${bg};display:flex;gap:28px;align-items:center;justify-content:center;height:140px">
    <img src="${BASE}favicon.svg" width="16" height="16" alt="">
    <img src="${BASE}favicon.svg" width="32" height="32" alt="">
    <img src="${BASE}favicon.svg" width="64" height="64" alt="">
  </body>`)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/logo-16-32-64-${name}.png` })
  console.log(`logo-${name}`, 'ok')
  await ctx.close()
}

await browser.close()
console.log('done ->', OUT)
