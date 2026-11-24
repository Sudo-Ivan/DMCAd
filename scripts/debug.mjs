import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const browser = await chromium.launch()

// find overflowing elements on mobile
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const wide = await page.evaluate(() => {
    const out = []
    const limit = document.documentElement.clientWidth
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width > limit + 1 || r.right > limit + 1) {
        out.push({
          tag: el.tagName,
          cls: (el.className?.toString() ?? '').slice(0, 80),
          w: Math.round(r.width),
          right: Math.round(r.right),
        })
      }
      if (out.length > 15) break
    }
    return out
  })
  console.log('overflowing elements:', JSON.stringify(wide, null, 1))
  await ctx.close()
}

// precise counts for search + filters
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const countText = async () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll('main span, main div')]
      const m = els.map((e) => e.textContent).find((t) => /of [\d,]+ notices|^[\d,]+ notices/.test(t ?? ''))
      return m ?? document.querySelector('main')?.innerText.slice(0, 400)
    })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  console.log('initial:', await countText())
  await page.fill('input[aria-label="Search notices"]', 'nintendo')
  await page.waitForTimeout(1500)
  console.log('nintendo:', await countText())
  // check worker search actually engaged: look for "ms" timing text
  console.log('timing:', await page.evaluate(() => document.querySelector('main')?.innerText.match(/· [\d.]+ms/)?.[0] ?? 'none'))
  await page.goto(BASE + '?ty=2', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log('ty=2:', await countText())
  await page.goto(BASE + '?c=sony', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log('c=sony:', await countText())
  await page.goto(BASE + '?f=2024-01&t=2024-06', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log('range:', await countText())
  await ctx.close()
}
await browser.close()
