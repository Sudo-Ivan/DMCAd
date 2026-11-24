import { describe, expect, it } from 'vitest'
import {
  dateFromText,
  parseWikiNotice,
  wikiFileLinks,
  wikiToText,
  wikiSourceUrl,
} from '../src/lib/wikimedia'

describe('dateFromText', () => {
  it('parses ISO dates', () => {
    expect(dateFromText('notice dated 2021-03-14 received')).toBe('2021-03-14')
  })

  it('parses long month names', () => {
    expect(dateFromText('September 25, 2009\nDear Sir')).toBe('2009-09-25')
    expect(dateFromText('25 September 2009')).toBe('2009-09-25')
  })

  it('returns empty for no date', () => {
    expect(dateFromText('no date here')).toBe('')
  })
})

describe('wikiToText', () => {
  it('strips templates, refs and markup', () => {
    const wikitext =
      '{{Short description|DMCA notice}}\n' +
      "Dear Wikimedia,\n\nWe represent [[Acme Corp|Acme]].\n" +
      '<ref name="x">citation</ref>\n' +
      "Please remove https://example.com/bad.\n"
    const text = wikiToText(wikitext)
    expect(text).toContain('Dear Wikimedia')
    expect(text).toContain('We represent Acme')
    expect(text).not.toContain('{{')
    expect(text).not.toContain('<ref')
    expect(text).not.toContain('citation')
  })
})

describe('wikiFileLinks', () => {
  it('extracts File: titles from wikilinks and commons urls', () => {
    const text =
      'See [[File:Bad Image.jpg|thumb]] and [[c:File:Other.png]] ' +
      'plus https://commons.wikimedia.org/wiki/File:Third.gif'
    const files = wikiFileLinks(text)
    expect(files).toContain('File:Bad Image.jpg')
    expect(files).toContain('File:Other.png')
    expect(files).toContain('File:Third.gif')
    expect(files).toHaveLength(3)
  })
})

const TEMPLATE_NOTICE = `{{DMCA email
|date=2021-04-02
|from=legal@acme.example
|subject=Copyright claim re: product photo
|message=<nowiki>
Dear Wikimedia Foundation,

We represent Acme Corporation. The following files infringe our copyright:

* [[File:Acme product.jpg]]
* https://example.com/promo/bad-image.png

Please remove them promptly.
Acme Legal Department
</nowiki>
|attachment=File:Acme DMCA notice.pdf
}}
`

describe('parseWikiNotice', () => {
  it('parses a DMCA email template', () => {
    const p = parseWikiNotice('Legal:DMCA 2021/Acme product photo', TEMPLATE_NOTICE)
    expect(p.date).toBe('2021-04-02')
    expect(p.subject).toContain('Copyright claim')
    expect(p.claimant).toBeTruthy()
    expect(p.hasClaimant).toBe(true)
    expect(p.files).toContain('File:Acme product.jpg')
    expect(p.attachments).toHaveLength(1)
    expect(p.attachments[0]).toContain('Special:FilePath')
    expect(p.urlCount).toBeGreaterThan(0)
    expect(p.body).toContain('Dear Wikimedia Foundation')
    expect(p.excerpt.length).toBeLessThanOrEqual(240)
  })

  it('falls back to letter text and title for old-style pages', () => {
    const letter = `This is a DMCA notice dated March 3, 2019.

From: Bob Smith, bob@example.org
We demand removal of https://pirate.example/steal
`
    const p = parseWikiNotice('Legal:DMCA/Random claimant name', letter)
    expect(p.date).toBe('2019-03-03')
    expect(p.claimant).toBeTruthy()
    expect(p.urlCount).toBeGreaterThan(0)
  })

  it('produces stable source urls', () => {
    expect(wikiSourceUrl('Legal:DMCA 2021/Acme photo')).toBe(
      'https://foundation.wikimedia.org/wiki/Legal:DMCA%202021/Acme%20photo',
    )
  })
})
