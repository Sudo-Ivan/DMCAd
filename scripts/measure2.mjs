import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
for (const [w,h] of [[412,823],[1350,940]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => {
    const r = (el) => el ? Math.round(el.getBoundingClientRect().height*10)/10 : null
    const main = document.querySelector('main > div.space-y-4')
    const kids = main ? [...main.children].map(c => ({cls:(c.className||'').toString().slice(0,50), h:r(c)})) : []
    const section = main?.querySelector('section')
    const secKids = section ? [...section.children].map(c=>({cls:(c.className||'').toString().slice(0,40),h:r(c)})) : []
    const grid = main?.querySelector('.grid')
    const gridKids = grid ? [...grid.children].map(c=>({cls:(c.className||'').toString().slice(0,40),h:r(c)})) : []
    const leftCol = grid?.querySelector('.min-w-0')
    const leftKids = leftCol ? [...leftCol.children].map(c=>({cls:(c.className||'').toString().slice(0,40),h:r(c)})) : []
    return { doc: document.documentElement.scrollHeight, kids, secKids, gridKids, leftKids, footer: r(document.querySelector('footer')) }
  })
  console.log(w+'x'+h, JSON.stringify(info))
  await page.close()
}
await browser.close()
