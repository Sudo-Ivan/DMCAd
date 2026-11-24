import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 412, height: 823 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const out = {}
  const header = document.querySelector('header')
  out.header = header?.getBoundingClientRect().height
  const main = document.querySelector('main')
  out.mainChildren = [...main.children].map(c => ({ cls: c.className.slice(0,60), h: c.getBoundingClientRect().height }))
  const top = main.querySelector('section')
  out.topSection = top?.getBoundingClientRect().height
  const grid = main.querySelector('.grid')
  out.grid = grid?.getBoundingClientRect().height
  const list = document.querySelector('[role="group"]')
  out.list = list?.getBoundingClientRect().height
  const widgets = [...document.querySelectorAll('main > div > div')].map(d=>d.getBoundingClientRect().height)
  out.footer = document.querySelector('footer')?.getBoundingClientRect().height
  out.docHeight = document.documentElement.scrollHeight
  return out
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
