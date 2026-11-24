import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const browser = await chromium.launch()

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

async function open(url, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitSettled(page)
  await page.waitForTimeout(500)
  return { ctx, page, errors }
}

const info = async (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  return {
    url: location.href.replace(location.origin, ''),
    h1: q('main h1')?.innerText ?? null,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    cards: qa('main [role="button"]').length,
    headings: qa('main h2, main h3').map((e) => e.innerText),
    firstButtons: qa('main button').map((b) => b.innerText.trim().split('\n')[0]).filter(Boolean).slice(0, 8),
    dialog: !!q('[role="dialog"]'),
    pulses: qa('main .animate-pulse').length,
  }
})

// 1. claimant profile deep link + Escape
{
  const { page, errors, ctx } = await open(BASE + '?p=c:github:webkul')
  console.log('CLAIMANT', JSON.stringify(await info(page)))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  console.log('after Escape:', page.url().replace(BASE, ''))
  console.log('errors:', errors)
  await ctx.close()
}

// 2. owner profile + Filter notices
{
  const { page, errors, ctx } = await open(BASE + '?p=o:izzihector')
  console.log('OWNER', JSON.stringify(await info(page)))
  await page.locator('main button', { hasText: 'Filter notices' }).click()
  await page.waitForTimeout(800)
  console.log('after Filter:', page.url().replace(BASE, ''))
  console.log('chips:', (await page.locator('main').innerText()).match(/@[\w./-]+/g)?.slice(0, 3))
  console.log('cards now:', await page.locator('main [role="button"]').count())
  console.log('errors:', errors)
  await ctx.close()
}

// 3. repo profile + row navigation to owner/claimant profiles
{
  const { page, errors, ctx } = await open(BASE + '?p=r:itisinx/xerinfuscator')
  console.log('REPO', JSON.stringify(await info(page)))
  // click first claimant row in Top claimants -> c: profile
  const section = page.locator('main div', { has: page.locator('h3', { hasText: 'Top claimants' }) }).last()
  const firstRow = section.locator('li button').first()
  const rowLabel = await firstRow.innerText()
  await firstRow.click()
  await page.waitForTimeout(800)
  console.log('clicked row:', JSON.stringify(rowLabel.slice(0, 60)), '-> url:', page.url().replace(BASE, ''))
  console.log('errors:', errors)
  await ctx.close()
}

// 4. claimant profile: click an owner row -> o: profile, then repo row -> r:
{
  const { page, errors, ctx } = await open(BASE + '?p=c:github:wiley')
  console.log('CLAIMANT2 h1:', await page.locator('main h1').innerText())
  const ownerSection = page.locator('div', { has: page.locator('h3', { hasText: 'Top owners' }) }).last()
  await ownerSection.locator('li button').first().click()
  await page.waitForTimeout(800)
  console.log('after owner row:', page.url().replace(BASE, ''))
  const repoSection = page.locator('div', { has: page.locator('h3', { hasText: 'Top repos' }) }).last()
  const repoBtn = repoSection.locator('li button').first()
  const repoTxt = await repoBtn.innerText()
  await repoBtn.click()
  await page.waitForTimeout(800)
  console.log('after repo row:', page.url().replace(BASE, ''))
  console.log('repo h1:', await page.locator('main h1').innerText())
  console.log('errors:', errors)
  await ctx.close()
}

// 5. counters view + Escape + back button
{
  const { page, errors, ctx } = await open(BASE + '?v=counters')
  console.log('COUNTERS h1:', await page.locator('main h1').innerText())
  // click a filer claimant -> c: profile
  const filerSection = page.locator('div', { has: page.locator('h3', { hasText: 'Who files them' }) }).last()
  await filerSection.locator('li button').first().click()
  await page.waitForTimeout(800)
  console.log('after filer click:', page.url().replace(BASE, ''))
  console.log('h1 now:', await page.locator('main h1').innerText().catch(() => null))
  await page.goBack()
  await page.waitForTimeout(800)
  console.log('after goBack:', page.url().replace(BASE, ''))
  console.log('errors:', errors)
  await ctx.close()
}

// 6. mobile claimant profile - no hscroll
{
  const { page, errors, ctx } = await open(BASE + '?p=c:github:webkul', { width: 390, height: 844 })
  console.log('MOBILE', JSON.stringify(await info(page)))
  console.log('errors:', errors)
  await ctx.close()
}

// 7. URL round-trip: reload preserves profile
{
  const { page, errors, ctx } = await open(BASE + '?p=c:github:webkul')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitSettled(page)
  console.log('after reload h1:', await page.locator('main h1').innerText().catch(() => null), '| url:', page.url().replace(BASE, ''))
  console.log('errors:', errors)
  await ctx.close()
}

// 8. bad profile param is ignored
{
  const { page, errors, ctx } = await open(BASE + '?p=bogus&v=bogus')
  console.log('BADPARAM url:', page.url().replace(BASE, ''), '| dashboard widgets:', await page.locator('main').innerText().then(t => t.includes('Notices per month')))
  console.log('errors:', errors)
  await ctx.close()
}

await browser.close()
console.log('done')
