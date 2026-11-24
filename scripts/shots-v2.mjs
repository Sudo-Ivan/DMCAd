import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = '/tmp/dmca-shots/v2'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function shot(name, { url = BASE, width = 1440, height = 900, dark, actions, wait = 1500 }) {
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

// dashboard, both themes, desktop + mobile
await shot('dashboard-light-desktop', { wait: 2500 })
await shot('dashboard-dark-desktop', { dark: true, wait: 2500 })
await shot('dashboard-light-mobile', { width: 390, height: 844, wait: 2500 })
await shot('dashboard-dark-mobile', { dark: true, width: 390, height: 844, wait: 2500 })

// search results nintendo, both themes desktop + mobile light
await shot('search-nintendo-light-desktop', {
  actions: async (p) => { await typeSearch(p, 'nintendo') },
})
await shot('search-nintendo-dark-desktop', {
  dark: true,
  actions: async (p) => { await typeSearch(p, 'nintendo') },
})
await shot('search-mobile', {
  width: 390,
  height: 844,
  actions: async (p) => { await typeSearch(p, 'nintendo') },
})

// filter dropdown open (claimant picklist)
await shot('filter-dropdown-open', {
  actions: async (p) => {
    await p.click('button:has-text("Claimant")')
    await p.waitForTimeout(400)
  },
})

// notice detail, both themes, desktop + mobile
await shot('detail-light-desktop', {
  actions: async (p) => {
    await typeSearch(p, 'odoo')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})
await shot('detail-dark-desktop', {
  dark: true,
  actions: async (p) => {
    await typeSearch(p, 'odoo')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})
await shot('detail-light-mobile', {
  width: 390,
  height: 844,
  actions: async (p) => {
    await typeSearch(p, 'sony')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})
await shot('detail-dark-mobile', {
  dark: true,
  width: 390,
  height: 844,
  actions: async (p) => {
    await typeSearch(p, 'sony')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})

// timeline hover tooltip
await shot('timeline-tooltip', {
  actions: async (p) => {
    const box = await p.locator('div[role="img"]').boundingBox()
    if (box) {
      await p.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45)
      await p.waitForTimeout(400)
    }
  },
})

// logo close-up: header mark + favicon rendered at 16/32/64px
await shot('logo-header', {
  actions: async (p) => {
    const logo = p.locator('header svg').first()
    await logo.screenshot({ path: `${OUT}/logo-header-30.png` })
  },
})
{
  const ctx = await browser.newContext({ viewport: { width: 200, height: 120 } })
  const page = await ctx.newPage()
  await page.setContent(`<!doctype html><body style="margin:0;display:flex;gap:24px;align-items:center;justify-content:center;height:120px;background:#888">
    <img src="file:///mnt/projects/GH-DMCAd/public/favicon.svg" width="16" height="16">
    <img src="file:///mnt/projects/GH-DMCAd/public/favicon.svg" width="32" height="32">
    <img src="file:///mnt/projects/GH-DMCAd/public/favicon.svg" width="64" height="64">
  </body>`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/logo-sizes-16-32-64.png` })
  await ctx.close()
}

await browser.close()
console.log('done ->', OUT)
