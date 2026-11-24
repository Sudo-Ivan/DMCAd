import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractUrls,
  githubTargets,
  normalizeClaimantKey,
  parseNotice,
  slugBase,
  slugFromPath,
  titleCaseSlug,
  TYPE_COPYRIGHT,
  hasVisibleName,
  isPlausibleClaimant,
} from '../src/lib/parse'

const fx = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('slug helpers', () => {
  it('derives slug from path', () => {
    expect(slugFromPath('2024/01/2024-01-03-alianza-2.md')).toBe('alianza-2')
    expect(slugFromPath('2011/2011-01-27-sony.markdown')).toBe('sony')
  })

  it('reduces numbered and typed slugs to a base', () => {
    expect(slugBase('alianza-2')).toBe('alianza')
    expect(slugBase('sony-counternotice')).toBe('sony')
    expect(slugBase('dashmote-counternotice-2')).toBe('dashmote')
    expect(slugBase('mcgraw-hill')).toBe('mcgraw-hill')
  })

  it('normalizes claimant keys', () => {
    expect(normalizeClaimantKey('Alianza contra Piratería')).toBe(
      'alianza contra pirateria',
    )
    expect(normalizeClaimantKey('ACME & Sons, LLC')).toBe('acme and sons llc')
  })

  it('title cases slug bases', () => {
    expect(titleCaseSlug('mcgraw-hill')).toBe('Mcgraw Hill')
    expect(titleCaseSlug('sony')).toBe('Sony')
  })
})

describe('parseNotice', () => {
  it('parses a new-format header file', () => {
    const n = parseNotice('2024/01/2024-01-03-acme-widgets.md', fx('new-format.md'))
    expect(n.date).toBe('2024-01-03')
    expect(n.year).toBe(2024)
    expect(n.domain).toBe('example.com')
    expect(n.targets).toContain('someuser/leaked-firmware')
    expect(n.targets).toContain('someuser/other-repo')
    expect(n.urlCount).toBeGreaterThanOrEqual(2)
    expect(n.claimantKey).toBe(normalizeClaimantKey(slugBase('acme-widgets')))
    expect(n.hasClaimant).toBe(true)
    expect(n.type).toBe(TYPE_COPYRIGHT)
  })

  it('parses an old freeform letter', () => {
    const n = parseNotice('2012/2012-03-03-globex.md', fx('old-freeform.md'))
    expect(n.claimant).toContain('GLOBEX')
    expect(n.targets).toContain('globex/secret-plans')
    expect(n.urlCount).toBeGreaterThanOrEqual(3)
    expect(n.type).toBe(TYPE_COPYRIGHT)
  })

  it('parses a 2011 .markdown circumvention letter', () => {
    const n = parseNotice(
      '2011/2011-01-27-initech.markdown',
      fx('2011-letter.markdown'),
    )
    expect(n.claimant).toContain('INITECH')
    expect(n.targets).toContain('acme/ps3keys')
    expect(n.urlCount).toBeGreaterThanOrEqual(3)
    expect(n.type).toBe(5) // circumvention via 1201 / trafficking language
  })

  it('detects counter-notices from the filename', () => {
    const n = parseNotice(
      '2026/10/2026-10-05-dashmote-counternotice.md',
      fx('counter-notice.md'),
    )
    expect(n.type).toBe(2)
    expect(n.base).toBe('dashmote')
    expect(n.targets).toContain('exampleuser/my-project')
  })

  it('handles empty and malformed files without crashing', () => {
    const empty = parseNotice('2020/01/2020-01-01-empty.md', '')
    expect(empty.claimant).toBeTruthy()
    expect(empty.type).toBeGreaterThanOrEqual(0)
    expect(empty.urlCount).toBe(0)
    const garbage = parseNotice('2020/01/2020-01-02-garbage.md', fx('garbage.md'))
    expect(garbage.claimant).toBeTruthy()
    expect(garbage.excerpt.length).toBeLessThanOrEqual(170)
  })
})

describe('url helpers', () => {
  it('extracts and dedupes urls', () => {
    const urls = extractUrls('see <https://a.com/x> and https://a.com/x. Also https://b.com/y).')
    expect(urls).toContain('https://a.com/x')
    expect(urls).toContain('https://b.com/y')
    expect(urls.filter((u) => u === 'https://a.com/x')).toHaveLength(1)
  })

  it('excludes github.com chrome from targets', () => {
    const targets = githubTargets([
      'https://github.com/github/dmca/blob/master/README.md',
      'https://github.com/someuser/repo',
      'https://github.com/settings/repositories',
      'https://docs.github.com/en/articles/x',
    ])
    expect(targets).toEqual(['someuser/repo'])
  })
})

describe('claimant junk rejection', () => {
  it('cleans spilled and decorated claimant captures', () => {
    const n = parseNotice('2022/01/2022-01-01-junk.md', fx('junk-claimant.md'))
    expect(n.claimant).toBe('Stimulsoft Company')
    expect(n.claimant).not.toContain('We have noted')
  })

  it('rejects template placeholder claimants', () => {
    const n = parseNotice(
      '2020/01/2020-01-01-ph.md',
      fx('template-placeholder.md'),
    )
    expect(n.claimant).not.toBe('Company Name')
    expect(n.hasClaimant).toBe(false)
  })
})

describe('excerpt boilerplate stripping', () => {
  it('drops form questions, statements, and affirmations', () => {
    const n = parseNotice(
      '2021/02/2021-02-17-source-code.md',
      fx('anonymous-form.md'),
    )
    expect(n.hasClaimant).toBe(false)
    expect(n.excerpt).toContain('developer of the source code')
    expect(n.excerpt).not.toMatch(/good faith|perjury|Are you the copyright|Guide to Submitting|telephone number/)
  })
})

describe('claimant plausibility', () => {
  it('rejects clause-like claimant captures', () => {
    const text = [
      '**Are you the copyright holder or authorized to act on the copyright owner\'s behalf?**',
      '',
      'Yes, I am the copyright holder.',
      '',
      'The work is licensed under terms that prohibit copying any source code or material from the repository without permission.',
      '',
      'I swear, under penalty of perjury, that the information in this notification is accurate.',
    ].join('\n')
    const n = parseNotice('2021/05/2021-05-05-source-code.md', text)
    expect(n.claimant).not.toMatch(/copying|source code or material/i)
  })

  it('isPlausibleClaimant filters fragments but keeps brands', () => {
    expect(isPlausibleClaimant('copying any source code or material')).toBe(false)
    expect(isPlausibleClaimant('eBay')).toBe(true)
    expect(isPlausibleClaimant('John Wiley & Sons')).toBe(true)
    expect(isPlausibleClaimant('x'.repeat(80))).toBe(false)
  })

  it('hasVisibleName rejects masked and symbol-only names', () => {
    expect(hasVisibleName('‎  • • • • @ • • • • . • • • • ‎')).toBe(false)
    expect(hasVisibleName('***')).toBe(false)
    expect(hasVisibleName('')).toBe(false)
    expect(hasVisibleName('Nhà Thuốc Long Châu')).toBe(true)
    expect(hasVisibleName('ООО Ромашка')).toBe(true)
    expect(hasVisibleName('John Wiley & Sons')).toBe(true)
  })
})
