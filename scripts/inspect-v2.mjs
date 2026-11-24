import { chromium } from 'playwright-core'

const BASE = 'http://localhost:4173/'
const browser = await chromium.launch()

async function check(name, { url = BASE, width = 1440, height = 900, dark, actions }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2200)
  if (actions) await actions(page)
  const r = await page.evaluate(() => {
    const out = {}
    out.scrollW = document.documentElement.scrollWidth
    out.clientW = document.documentElement.clientWidth
    out.hOverflow = out.scrollW > out.clientW + 1
    const header = document.querySelector('header')
    out.headerH = header?.getBoundingClientRect().height
    const logo = header?.querySelector('svg')
    out.logoSize = logo ? { w: logo.getBoundingClientRect().width, h: logo.getBoundingClientRect().height } : null
    const wordmark = [...(header?.querySelectorAll('span,div') ?? [])].find(e => e.textContent?.trim() === 'DMCA')
    out.wordmarkVisible = !!wordmark && wordmark.getBoundingClientRect().width > 0
    const search = document.querySelector('input[aria-label="Search notices"]')
    out.searchW = search?.getBoundingClientRect().width
    // timeline
    const tl = document.querySelector('div[role="img"]')
    if (tl) {
      const svg = tl.querySelector('svg')
      const texts = [...svg.querySelectorAll('text')]
      out.tlTexts = texts.map(t => {
        const b = t.getBoundingClientRect()
        return { s: t.textContent, x: Math.round(b.x), w: Math.round(b.width) }
      })
      out.tlBox = (() => { const b = svg.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width) } })()
    }
    // hero
    out.hero = !!document.querySelector('h1')
    // result count line
    const m = document.body.innerText.match(/([\d,]+) notices?/)
    out.countText = m ? m[0] : null
    // first result card
    const card = document.querySelector('main article, main [role="button"], main li')
    out.cardFound = !!card
    return out
  })
  console.log('===', name, dark ? '(dark)' : '(light)', width + 'px')
  console.log(JSON.stringify(r, null, 1))
  if (errors.length) console.log('ERRORS:', errors.slice(0, 3))
  await ctx.close()
}

await check('desktop', {})
await check('desktop-dark', { dark: true })
await check('mobile', { width: 390, height: 844 })
await check('mobile-dark', { width: 390, height: 844, dark: true })
await check('search', { actions: async (p) => { await p.fill('input[aria-label="Search notices"]', 'nintendo'); await p.waitForTimeout(1200) } })
await check('mobile-search', { width: 390, height: 844, actions: async (p) => { await p.fill('input[aria-label="Search notices"]', 'nintendo'); await p.waitForTimeout(1200) } })
await check('filter-open', { actions: async (p) => { await p.click('button:has-text("Claimant")'); await p.waitForTimeout(400) } })
await check('detail', { actions: async (p) => { await p.fill('input[aria-label="Search notices"]', 'odoo'); await p.waitForTimeout(1000); await p.keyboard.press('Enter'); await p.waitForTimeout(1800) } })
await check('mobile-detail', { width: 390, height: 844, actions: async (p) => { await p.fill('input[aria-label="Search notices"]', 'sony'); await p.waitForTimeout(1000); await p.keyboard.press('Enter'); await p.waitForTimeout(1800) } })

await browser.close()
console.log('done')
