// One-pass analysis of the inflated requests.csv: row counts, URL-count
// distribution, per-year counts, distinct owner ids.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const FILE = new URL('../.cache/google/requests.csv', import.meta.url).pathname

const buckets = [0, 0, 0, 0, 0, 0] // total urls: 0, 1-9, 10-99, 100-999, 1000-9999, 10000+
const years = new Map()
const owners = new Set()
const orgs = new Set()
let rows = 0
let maxId = 0
let sumUrls = 0
let abuserYes = 0
let quotedRows = 0

const rl = createInterface({ input: createReadStream(FILE), crlfDelay: Infinity })
let first = true
for await (const line of rl) {
  if (first) {
    first = false
    continue
  }
  rows++
  if (line.includes('"')) quotedRows++
  const firstComma = line.indexOf(',')
  const id = parseInt(line.slice(0, firstComma), 10)
  if (id > maxId) maxId = id
  const secondComma = line.indexOf(',', firstComma + 1)
  const date = line.slice(firstComma + 1, secondComma)
  const year = date.slice(0, 4)
  years.set(year, (years.get(year) ?? 0) + 1)
  const lastComma = line.lastIndexOf(',')
  const abuser = line.slice(lastComma + 1)
  if (abuser === 'true' || abuser === 'yes' || abuser === '1') abuserYes++
  const tail = line.slice(Math.max(0, lastComma - 40))
  const nums = tail.match(/(\d+),(\d+),(\d+),(\d+),[^,]*$/)
  if (nums) {
    const total = +nums[1] + +nums[2] + +nums[3] + +nums[4]
    sumUrls += total
    const b = total === 0 ? 0 : total < 10 ? 1 : total < 100 ? 2 : total < 1000 ? 3 : total < 10000 ? 4 : 5
    buckets[b]++
  }
  // owner id is the 4th field; id/date/lumen-url never contain commas,
  // so parts[3] is reliable even when later names are quoted.
  const parts = line.split(',')
  if (parts.length >= 4) owners.add(parts[3])
  if (parts.length === 12) orgs.add(parts[5])
  if (rows % 10_000_000 === 0) console.log(`  ...${rows} rows`)
}

console.log('rows:', rows)
console.log('max request id:', maxId)
console.log('sum urls:', sumUrls, 'avg:', (sumUrls / rows).toFixed(1))
console.log('abuser yes:', abuserYes, 'quoted rows:', quotedRows)
console.log('buckets [0,1-9,10-99,100-999,1k-9k,10k+]:', buckets)
console.log('distinct owner ids:', owners.size, 'org ids (unquoted only):', orgs.size)
console.log('years:', [...years.entries()].sort().map(([y, c]) => `${y}:${c}`).join(' '))
