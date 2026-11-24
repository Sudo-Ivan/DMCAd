import { chromium } from 'playwright-core'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(10000)
const text = await page.evaluate(() => document.body.innerText)
console.log('--- first 1500 chars ---')
console.log(text.slice(0, 1500))
console.log('--- has source pills:', text.includes('Google Search'), '---')
console.log('---ERRORS---')
console.log(errors.slice(0, 8).join('\n') || 'none')
await page.screenshot({ path: '/tmp/dmcad-home.png' })
await browser.close()
