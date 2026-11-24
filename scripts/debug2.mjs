import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const browser = await chromium.launch()

const countText = async (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('main span')].find((e) =>
      /^[\d,]+( of [\d,]+)? notices/.test(e.textContent?.trim() ?? ''),
    )
    return el?.textContent?.trim() ?? 'NOT FOUND'
  })

async function go(url, wait = 2200) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  const c = await countText(page)
  console.log(url.replace(BASE, ''), '->', c)
  await ctx.close()
}

await go(BASE)
await go(BASE + '?ty=2')
await go(BASE + '?ty=5')
await go(BASE + '?c=sony')
await go(BASE + '?c=mcgraw-hill')
await go(BASE + '?o=microsoft')
await go(BASE + '?cn=1')
await go(BASE + '?f=2024-01&t=2024-06')
await go(BASE + '?f=2011-01&t=2011-12')
await go(BASE + '?s=url')
await go(BASE + '?s=old')

// mobile overflow recheck
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const w = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }))
  console.log('mobile overflow:', JSON.stringify(w))
  await ctx.close()
}

// search latency sample
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  for (const q of ['nintendo', 'sony', 'minecraft', 'the', 'zzzznomatch']) {
    await page.fill('input[aria-label="Search notices"]', q)
    await page.waitForTimeout(800)
    const t = await page.evaluate(() =>
      [...document.querySelectorAll('main span')].find((e) => /· [\d.]+ms/.test(e.textContent ?? ''))?.textContent?.trim() ?? 'n/a',
    )
    const c = await countText(page)
    console.log(`q=${q}: ${c} | ${t}`)
  }
  await ctx.close()
}
await browser.close()
