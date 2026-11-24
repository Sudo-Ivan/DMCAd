// Builder for Wikimedia Foundation DMCA notices on
// foundation.wikimedia.org. Enumerates every "DMCA*" category, collects
// Legal:DMCA pages (ns 102) and File: attachments (ns 6), fetches
// wikitext in batches, and parses each notice.

import {
  emptyStats,
  topEntries,
  type SourceBuild,
} from './emit'
import {
  parseWikiNotice,
  WIKI_API,
  WIKI_UA,
  type WikiParsed,
} from '../../src/lib/wikimedia'
import { hasVisibleName, TYPE_NOTICE } from '../../src/lib/parse'

const DELAY_MS = 350
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface ApiPage {
  title: string
  ns: number
  missing?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

async function api(params: Record<string, string>, retries = 8): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${WIKI_API}?${qs}`, {
      headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' },
    })
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 5000 * (attempt + 1)
      console.log(`[wikimedia] api ${res.status}, retrying in ${Math.round(wait / 1000)}s`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`wikimedia api ${res.status}: ${params.action}`)
    return res.json()
  }
  throw new Error(`wikimedia api failed after retries: ${params.action}`)
}

async function allDmcaCategories(): Promise<string[]> {
  const out: string[] = []
  let continueParam = ''
  do {
    const params: Record<string, string> = {
      action: 'query',
      list: 'allcategories',
      acprefix: 'DMCA',
      aclimit: '500',
    }
    if (continueParam) params.accontinue = continueParam
    const data = await api(params)
    for (const c of data.query?.allcategories ?? []) out.push(c.category)
    continueParam = data.continue?.accontinue ?? ''
    await sleep(DELAY_MS)
  } while (continueParam)
  return out
}

interface CategoryMembers {
  pages: string[] // ns 102 titles
  files: string[] // ns 6 titles
}

async function categoryMembers(cat: string): Promise<CategoryMembers> {
  const pages: string[] = []
  const files: string[] = []
  let cmcontinue = ''
  do {
    const params: Record<string, string> = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${cat}`,
      cmtype: 'page|file',
      cmlimit: '500',
    }
    if (cmcontinue) params.cmcontinue = cmcontinue
    const data = await api(params)
    for (const m of data.query?.categorymembers ?? []) {
      if (m.ns === 102) pages.push(m.title)
      else if (m.ns === 6) files.push(m.title)
    }
    cmcontinue = data.continue?.cmcontinue ?? ''
    await sleep(DELAY_MS)
  } while (cmcontinue)
  return { pages, files }
}

async function fetchWikitext(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const BATCH = 50
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH)
    const data = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    })
    for (const p of (data.query?.pages ?? []) as ApiPage[]) {
      if (p.missing) continue
      const content = p.revisions?.[0]?.slots?.main?.content ?? ''
      out.set(p.title, content)
    }
    await sleep(DELAY_MS)
  }
  return out
}

export async function buildWikimediaCorpus(): Promise<SourceBuild> {
  console.log('[wikimedia] enumerating DMCA categories')
  const all = await allDmcaCategories()
  // Only the year-level categories ("DMCA 2021") hold members; the
  // "/en", "/de", ... language subcategories are empty sitelink containers
  // and the bare "DMCA" category has no direct members.
  const cats = all.filter((c) => /^DMCA \d{4}$/.test(c))
  console.log(`[wikimedia] ${cats.length} year categories (of ${all.length} DMCA*)`)

  const pageSet = new Set<string>()
  const fileSet = new Set<string>()
  for (const cat of cats) {
    const { pages, files } = await categoryMembers(cat)
    for (const p of pages) pageSet.add(p)
    for (const f of files) fileSet.add(f)
    if (pages.length || files.length) {
      console.log(`[wikimedia]   ${cat}: ${pages.length} pages, ${files.length} files`)
    }
  }
  const titles = [...pageSet].sort()
  console.log(`[wikimedia] ${titles.length} notice pages, ${fileSet.size} category files`)

  const texts = await fetchWikitext(titles)
  console.log(`[wikimedia] fetched ${texts.size} wikitexts`)

  const rows: unknown[][] = []
  const bodies: Record<string, string> = {}
  const monthCounts = new Map<string, number>()
  const yearCounts = new Map<string, number>()
  const typeCounts = new Map<number, number>()
  const claimantCounts = new Map<string, number>()
  const claimantLabels = new Map<string, Map<string, number>>()
  let withClaimant = 0
  let withUrl = 0
  const parsed: { title: string; p: WikiParsed }[] = []

  for (const title of titles) {
    const wikitext = texts.get(title) ?? ''
    const p = parseWikiNotice(title, wikitext)
    parsed.push({ title, p })
    bodies[title] = p.body
    if (p.hasClaimant && p.claimantKey !== 'unknown') {
      claimantCounts.set(p.claimantKey, (claimantCounts.get(p.claimantKey) ?? 0) + 1)
      let labels = claimantLabels.get(p.claimantKey)
      if (!labels) {
        labels = new Map()
        claimantLabels.set(p.claimantKey, labels)
      }
      labels.set(p.claimant, (labels.get(p.claimant) ?? 0) + 1)
      withClaimant++
    }
    if (p.urlCount > 0) withUrl++
    const ym = p.date ? p.date.slice(0, 7) : 'undated'
    monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1)
    if (p.date.length >= 4) {
      const y = p.date.slice(0, 4)
      if (/^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1)
    }
    typeCounts.set(TYPE_NOTICE, (typeCounts.get(TYPE_NOTICE) ?? 0) + 1)
    rows.push([
      title, p.date, '', p.claimantKey, hasVisibleName(p.claimant) ? p.claimant : '', TYPE_NOTICE,
      p.urlCount, '', p.excerpt, p.length, 0,
      p.files, p.attachments, p.subject,
    ])
  }

  const dates = parsed.map((x) => x.p.date).filter(Boolean).sort()
  const stats = emptyStats()
  stats.generatedAt = new Date().toISOString()
  stats.commit = `api:${new Date().toISOString().slice(0, 10)}`
  stats.total = parsed.length
  stats.firstDate = dates[0] ?? ''
  stats.lastDate = dates[dates.length - 1] ?? ''
  stats.years = Object.fromEntries([...yearCounts.entries()].sort())
  stats.months = [...monthCounts.entries()].sort()
  stats.types = Object.fromEntries([...typeCounts.entries()].map(([t, c]) => [String(t), c]))
  stats.topClaimants = topEntries(claimantCounts, 120, (k) => {
    const labels = claimantLabels.get(k)
    if (!labels) return k
    let best = ''
    let bestN = 0
    for (const [name, count] of labels) {
      if (!hasVisibleName(name)) continue
      if (count > bestN) {
        best = name
        bestN = count
      }
    }
    return best || k
  })
  stats.claimantCount = claimantCounts.size
  stats.withClaimant = withClaimant
  stats.withUrl = withUrl

  const index = {
    v: 1,
    source: 'wikimedia' as const,
    fields: [
      'path', 'date', 'domain', 'claimantKey', 'claimant', 'type', 'urlCount',
      'targets', 'excerpt', 'length', 'hasCounter', 'files', 'attachments',
      'subject',
    ],
    rows,
  }

  console.log(`[wikimedia] ${rows.length} rows -> index + bodies/wikimedia.json`)

  return {
    id: 'wikimedia',
    revision: stats.commit,
    index,
    stats,
    bodies: new Map([['wikimedia', bodies]]),
  }
}
