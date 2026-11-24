import { describe, expect, it } from 'vitest'
import {
  csvLineOpen,
  googleExcerpt,
  googleUrlTotal,
  parseGoogleRow,
  splitCsvLine,
} from '../src/lib/google'

describe('splitCsvLine', () => {
  it('splits plain rows', () => {
    expect(splitCsvLine('1,2020-01-02,https://lum.en,7,Acme,9,Org,3,4,5,6,false')).toEqual([
      '1', '2020-01-02', 'https://lum.en', '7', 'Acme', '9', 'Org',
      '3', '4', '5', '6', 'false',
    ])
  })

  it('handles commas and escaped quotes inside quoted fields', () => {
    const line =
      '2,2020-01-03,https://lum.en/2,8,"Smith, Jones & ""Co""",10,Org,1,0,0,0,false'
    const cells = splitCsvLine(line)
    expect(cells[4]).toBe('Smith, Jones & "Co"')
    expect(cells).toHaveLength(12)
  })

  it('keeps empty trailing fields', () => {
    const cells = splitCsvLine('3,2020-01-04,u,11,,,,0,0,0,0,')
    expect(cells[11]).toBe('')
    expect(cells).toHaveLength(12)
  })
})

describe('csvLineOpen', () => {
  it('detects records spanning multiple physical lines', () => {
    expect(csvLineOpen('1,2020-01-02,u,7,"Acme')).toBe(true)
    expect(csvLineOpen('1,2020-01-02,u,7,"Acme, Inc.",9,Org,1,0,0,0,false')).toBe(false)
  })

  it('ignores escaped quotes when checking balance', () => {
    expect(csvLineOpen('1,u,"a ""b"" c",d')).toBe(false)
  })
})

describe('parseGoogleRow', () => {
  it('parses a full row', () => {
    const r = parseGoogleRow(
      splitCsvLine(
        '58299171,2026-11-20,https://lumendatabase.org/notices/123,322630,' +
          '"Recording Industry Association of America",501,"RIAA",1000,200,50,25,false',
      ),
    )
    expect(r).not.toBeNull()
    expect(r!.id).toBe('58299171')
    expect(r!.date).toBe('2026-11-20')
    expect(r!.owner).toBe('Recording Industry Association of America')
    expect(r!.org).toBe('RIAA')
    expect(r!.removed).toBe(1000)
    expect(r!.pending).toBe(25)
    expect(r!.abuser).toBe(false)
    expect(googleUrlTotal(r!)).toBe(1275)
  })

  it('rejects rows with bad arity or non-numeric id', () => {
    expect(parseGoogleRow(['1', '2'])).toBeNull()
    expect(parseGoogleRow(splitCsvLine('abc,2020-01-01,u,1,A,2,B,0,0,0,0,false'))).toBeNull()
  })

  it('handles missing numeric fields as zero', () => {
    const r = parseGoogleRow(
      splitCsvLine('9,2021-05-06,u,3,Owner,,Org,,,,,,false'),
    )
    expect(r).not.toBeNull()
    expect(r!.removed).toBe(0)
    expect(r!.pending).toBe(0)
  })

  it('detects abuser flag variants', () => {
    for (const flag of ['true', 'True', 'yes', '1']) {
      const r = parseGoogleRow(
        splitCsvLine(`1,2020-01-01,u,1,A,2,B,1,0,0,0,${flag}`),
      )
      expect(r!.abuser).toBe(true)
    }
    const r = parseGoogleRow(splitCsvLine('1,2020-01-01,u,1,A,2,B,1,0,0,0,false'))
    expect(r!.abuser).toBe(false)
  })
})

describe('googleExcerpt', () => {
  it('summarizes URL breakdown', () => {
    const r = parseGoogleRow(
      splitCsvLine('1,2020-01-01,u,1,A,2,B,10,5,0,2,false'),
    )!
    const ex = googleExcerpt(r)
    expect(ex).toContain('17 URLs requested for delisting')
    expect(ex).toContain('10 removed')
    expect(ex).toContain('5 not in index')
    expect(ex).toContain('2 pending')
  })
})
