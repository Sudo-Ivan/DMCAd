import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const browser = await chromium.launch()

async function inspect(name, url, { width = 1440, height = 900, dark, actions, wait = 2000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(wait)
  if (actions) await actions(page)
  await page.waitForTimeout(600)

  const info = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]
    const rect = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null
    return {
      title: document.title,
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      bodyScrollW: document.body.scrollWidth,
      clientW: document.documentElement.clientWidth,
      cards: qa('[role="button"][tabindex="0"]').length,
      svgRects: qa('svg rect').length,
      marks: qa('mark').length,
      resultCountText: q('main')?.innerText.match(/[\d,]+ notices?/)?.[0] ?? null,
      statValues: qa('main section > div:first-child > div, main > div > section > div > div').length,
      timelinePresent: !!q('svg[aria-label*="month"]'),
      chips: qa('main span.rounded-full').length,
      pickers: qa('button').length,
      footerText: q('footer')?.innerText.slice(0, 120) ?? null,
      detailOpen: !!q('[role="dialog"]'),
      darkClass: document.documentElement.classList.contains('dark'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
    }
  })
  console.log(`\n=== ${name} (${width}x${height}${dark ? ' dark' : ''})`)
  console.log(JSON.stringify(info, null, 1))
  if (errors.length) console.log('ERRORS:', errors.slice(0, 5))
  await ctx.close()
}

await inspect('dashboard-desktop', BASE, { wait: 3000 })
await inspect('dashboard-dark', BASE, { dark: true, wait: 3000 })
await inspect('dashboard-mobile', BASE, { width: 390, height: 844, wait: 3000 })
await inspect('search-nintendo', BASE, {
  actions: async (p) => { await p.fill('input[aria-label="Search notices"]', 'nintendo'); await p.waitForTimeout(1200) },
})
await inspect('detail-open', BASE, {
  actions: async (p) => {
    await p.fill('input[aria-label="Search notices"]', 'odoo')
    await p.waitForTimeout(1200)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(1800)
  },
})
await inspect('counter-filter', BASE + '?ty=2', { wait: 2500 })
await inspect('claimant-filter', BASE + '?c=sony', { wait: 2500 })

await browser.close()
