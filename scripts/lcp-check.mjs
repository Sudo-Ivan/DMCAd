import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 412, height: 823 } })
await page.addInitScript(() => {
  window.__lcp = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__lcp.push({ t: e.startTime, url: e.url, text: e.element?.textContent?.slice(0,80), tag: e.element?.tagName, cls: e.element?.className?.slice?.(0,80) })
  }).observe({ type: 'largest-contentful-paint', buffered: true })
})
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
console.log(JSON.stringify(await page.evaluate(() => window.__lcp), null, 1))
await browser.close()
