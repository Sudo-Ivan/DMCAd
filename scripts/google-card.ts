// Second pass over requests.csv: cardinality of aggregation candidates.
//   - distinct (owner, year) and (owner, month) pairs
//   - requests-per-owner histogram (how many owners have >= K requests)
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { splitCsvLine, csvLineOpen, parseGoogleRow } from '../src/lib/google.ts'

const FILE = new URL('../.cache/google/requests.csv', import.meta.url).pathname

const ownerYear = new Set()
const ownerMonth = new Set()
const ownerCount = new Map()
let rows = 0
let bad = 0

const rl = createInterface({ input: createReadStream(FILE), crlfDelay: Infinity })
let first = true
let pending = ''
for await (const raw of rl) {
  if (first) {
    first = false
    continue
  }
  let line: string | null = pending ? pending + '\n' + raw : raw
  pending = ''
  while (csvLineOpen(line)) {
    // need more physical lines; stash and continue outer loop
    pending = line
    line = null
    break
  }
  if (line === null) continue
  rows++
  const cells = splitCsvLine(line)
  const r = parseGoogleRow(cells)
  if (!r) {
    bad++
    continue
  }
  const y = r.date.slice(0, 4)
  const m = r.date.slice(0, 7)
  const oid = parseInt(r.ownerId, 10)
  if (!Number.isFinite(oid)) continue
  const yi = parseInt(y, 10)
  const mi = parseInt(m.slice(0, 4), 10) * 12 + parseInt(m.slice(5, 7), 10)
  if (yi >= 2000 && yi <= 2100 && mi > 0) {
    ownerYear.add(oid * 64 + (yi - 2000))
    ownerMonth.add(oid * 4096 + mi)
  }
  ownerCount.set(oid, (ownerCount.get(oid) ?? 0) + 1)
  if (rows % 10_000_000 === 0) console.log(`  ...${rows}`)
}

console.log('rows:', rows, 'unparsed:', bad)
console.log('distinct (owner,year):', ownerYear.size)
console.log('distinct (owner,month):', ownerMonth.size)
console.log('distinct owners:', ownerCount.size)

// histogram: owners by request count
const hist = new Map()
for (const c of ownerCount.values()) {
  const b = c === 1 ? '1' : c <= 3 ? '2-3' : c <= 10 ? '4-10' : c <= 100 ? '11-100' : '100+'
  hist.set(b, (hist.get(b) ?? 0) + 1)
}
console.log('owners by request count:', [...hist.entries()].map(([k, v]) => `${k}:${v}`).join(' '))
const ge10 = [...ownerCount.values()].filter((c) => c >= 10).length
const ge100 = [...ownerCount.values()].filter((c) => c >= 100).length
console.log('owners with >=10 reqs:', ge10, '>=100:', ge100)
