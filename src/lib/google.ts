// Parser for the Google Transparency Report copyright-removals
// requests.csv. Pure functions shared by the data build and the tests.
//
// Columns (verified against the file header):
//   Request ID, Date, Lumen URL, Copyright owner ID, Copyright owner name,
//   Reporting organization ID, Reporting organization name,
//   URLs removed, URLs that were not in Google's search index,
//   URLs for which we took no action, URLs pending review, From Abuser

export interface GoogleRequest {
  id: string
  date: string // YYYY-MM-DD
  lumen: string
  ownerId: string
  owner: string
  orgId: string
  org: string
  removed: number
  notIndexed: number
  noAction: number
  pending: number
  abuser: boolean
}

// Split one CSV record into fields. Handles "quoted" fields with ""
// escapes and commas inside quotes. Assumes the record contains no
// embedded newlines (callers must reassemble those first).
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

// True when the line ends inside an open quoted field, meaning the record
// continues on the next physical line.
export function csvLineOpen(line: string): boolean {
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') i++
      else inQuotes = !inQuotes
    }
  }
  return inQuotes
}

const toInt = (s: string | undefined): number => {
  const n = parseInt((s ?? '').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

// Map one parsed CSV row (cells array) to a GoogleRequest. Returns null
// for rows that cannot be a request (wrong arity, bad id).
export function parseGoogleRow(cells: string[]): GoogleRequest | null {
  if (cells.length < 12) return null
  const id = cells[0].trim()
  if (!/^\d+$/.test(id)) return null
  const iso = cells[1].trim()
  const date = iso.length >= 10 ? iso.slice(0, 10) : ''
  const abuserRaw = cells[11].trim().toLowerCase()
  return {
    id,
    date,
    lumen: cells[2].trim(),
    ownerId: cells[3].trim(),
    owner: cells[4].trim(),
    orgId: cells[5].trim(),
    org: cells[6].trim(),
    removed: toInt(cells[7]),
    notIndexed: toInt(cells[8]),
    noAction: toInt(cells[9]),
    pending: toInt(cells[10]),
    abuser: abuserRaw === 'true' || abuserRaw === 'yes' || abuserRaw === '1',
  }
}

export function googleUrlTotal(r: GoogleRequest): number {
  return r.removed + r.notIndexed + r.noAction + r.pending
}

// Plain-English summary used as the index excerpt.
export function googleExcerpt(r: GoogleRequest): string {
  const total = googleUrlTotal(r)
  const parts: string[] = []
  if (r.removed > 0) parts.push(`${r.removed.toLocaleString('en-US')} removed`)
  if (r.notIndexed > 0) parts.push(`${r.notIndexed.toLocaleString('en-US')} not in index`)
  if (r.noAction > 0) parts.push(`${r.noAction.toLocaleString('en-US')} no action`)
  if (r.pending > 0) parts.push(`${r.pending.toLocaleString('en-US')} pending`)
  const head = `${total.toLocaleString('en-US')} URL${total === 1 ? '' : 's'} requested for delisting`
  return parts.length ? `${head}: ${parts.join(', ')}` : head
}
