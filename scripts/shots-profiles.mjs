import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = '/tmp/dmca-shots/profiles'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

// Wait until the "Notices" stat stops changing (split-index tails done)
// or timeout. Returns when stable for two consecutive polls.
async function waitSettled(page, timeoutMs = 60000) {
  const t0 = Date.now()
  let last = ''
  let stable = 0
  while (Date.now() - t0 < timeoutMs) {
    const text = await page.locator('main').innerText().catch(() => '')
    const m = text.match(/[\d,]+/)?.[0] ?? ''
    if (m && m === last) {
      stable++
      if (stable >= 2) return
    } else {
      stable = 0
      last = m
    }
    await page.waitForTimeout(1500)
  }
}

async function shot(name, { url = BASE, width = 1440, height = 900, dark, actions, wait = 0, fullPage = false, settle = true }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (settle) await waitSettled(page)
  await page.waitForTimeout(wait)
  if (actions) await actions(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  console.log(name, errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'ok')
  await ctx.close()
}

const CLAIMANT = '?p=c:github:webkul'
const OWNER = '?p=o:izzihector'
const REPO = '?p=r:itisinx/xerinfuscator'
const COUNTERS = '?v=counters'

await shot('claimant-light-desktop', { url: BASE + CLAIMANT })
await shot('claimant-dark-desktop', { url: BASE + CLAIMANT, dark: true })
await shot('owner-light-desktop', { url: BASE + OWNER })
await shot('owner-dark-desktop', { url: BASE + OWNER, dark: true })
await shot('repo-light-desktop', { url: BASE + REPO })
await shot('repo-dark-desktop', { url: BASE + REPO, dark: true })
await shot('counters-light-desktop', { url: BASE + COUNTERS })
await shot('counters-dark-desktop', { url: BASE + COUNTERS, dark: true })
await shot('claimant-light-mobile', { url: BASE + CLAIMANT, width: 390, height: 844 })
await shot('counters-dark-mobile', { url: BASE + COUNTERS, width: 390, height: 844, dark: true })

// detail opened from a profile's recent list
await shot('profile-detail-light', {
  url: BASE + CLAIMANT,
  actions: async (p) => {
    await p.locator('main [role="button"]').first().click()
    await p.waitForTimeout(1600)
  },
})

await browser.close()
console.log('done ->', OUT)
