// Downloads members of the Google Transparency Report copyright-removals
// zip without fetching the whole archive, using HTTP range requests.
//
//   node scripts/google-fetch.mjs           fetch/inflate requests.csv + README
//   node scripts/google-fetch.mjs --status  print cache status
//
// Cache layout (.cache/google, gitignored):
//   meta.json             zip Last-Modified/etag and member offsets
//   requests.csv.deflate  raw deflate stream of requests.csv
//   requests.csv          inflated CSV, reused while meta.json matches

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { get } from 'node:https'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'
import { Readable } from 'node:stream'

const ZIP_URL =
  'https://storage.googleapis.com/transparencyreport/google-websearch-copyright-removals.zip'
const CACHE = new URL('../.cache/google/', import.meta.url).pathname
const TAIL_BYTES = 1024 * 1024

const WANT = new Set(['requests.csv', 'README.txt'])

function rangeGet(start, end) {
  return new Promise((resolve, reject) => {
    const req = get(ZIP_URL, { headers: { Range: `bytes=${start}-${end}` } }, (res) => {
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume()
        reject(new Error(`range ${start}-${end}: HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

async function head() {
  return new Promise((resolve, reject) => {
    const req = get(ZIP_URL, { method: 'HEAD' }, (res) => {
      res.resume()
      resolve(res.headers)
    })
    req.on('error', reject)
  })
}

// Parse the EOCD + ZIP64 EOCD + central directory out of the file tail.
async function readCentralDirectory(fileSize) {
  const tail = await rangeGet(Math.max(0, Number(fileSize) - TAIL_BYTES), Number(fileSize) - 1)
  let eocd = -1
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 22 - 65536); i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('EOCD not found in tail')

  let cdSize = tail.readUInt32LE(eocd + 12)
  let cdOff = tail.readUInt32LE(eocd + 16)
  let entries = tail.readUInt16LE(eocd + 10)

  // ZIP64: locator sits 20 bytes before EOCD when cdOff/cdSize are maxed
  if (cdOff === 0xffffffff || cdSize === 0xffffffff || entries === 0xffff) {
    const loc = eocd - 20
    const eocd64Off = Number(tail.readBigUInt64LE(loc + 8))
    const eocd64 = eocd64Off - (Number(fileSize) - tail.length)
    if (eocd64 < 0 || tail.readUInt32LE(eocd64) !== 0x06064b50) {
      throw new Error('ZIP64 EOCD not found in tail')
    }
    entries = Number(tail.readBigUInt64LE(eocd64 + 32))
    cdSize = Number(tail.readBigUInt64LE(eocd64 + 40))
    cdOff = Number(tail.readBigUInt64LE(eocd64 + 48))
  }

  const cdBuf =
    cdOff >= Number(fileSize) - tail.length
      ? tail.subarray(cdOff - (Number(fileSize) - tail.length), cdOff - (Number(fileSize) - tail.length) + cdSize)
      : await rangeGet(cdOff, cdOff + cdSize - 1)

  const out = []
  let p = 0
  for (let i = 0; i < entries; i++) {
    if (cdBuf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry')
    const method = cdBuf.readUInt16LE(p + 10)
    let csize = cdBuf.readUInt32LE(p + 20)
    let usize = cdBuf.readUInt32LE(p + 24)
    const nlen = cdBuf.readUInt16LE(p + 28)
    const elen = cdBuf.readUInt16LE(p + 30)
    const clen = cdBuf.readUInt16LE(p + 32)
    let lho = cdBuf.readUInt32LE(p + 42)
    const name = cdBuf.subarray(p + 46, p + 46 + nlen).toString('utf8')
    const extraStart = p + 46 + nlen
    const extra = cdBuf.subarray(extraStart, extraStart + elen)
    for (let e = 0; e + 4 <= extra.length; ) {
      const hid = extra.readUInt16LE(e)
      const hsz = extra.readUInt16LE(e + 2)
      if (hid === 0x0001) {
        let q = e + 4
        if (usize === 0xffffffff) usize = Number(extra.readBigUInt64LE(q)), (q += 8)
        if (csize === 0xffffffff) csize = Number(extra.readBigUInt64LE(q)), (q += 8)
        if (lho === 0xffffffff) lho = Number(extra.readBigUInt64LE(q)), (q += 8)
      }
      e += 4 + hsz
    }
    out.push({ name, method, csize, usize, lho })
    p += 46 + nlen + elen + clen
  }
  return out
}

// Read a member's local header to find where its data starts.
async function localDataStart(lho) {
  const h = await rangeGet(lho, lho + 30 - 1)
  if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header')
  const nlen = h.readUInt16LE(26)
  const elen = h.readUInt16LE(28)
  const name = h.subarray(30, 30 + nlen).toString('utf8')
  return { dataStart: lho + 30 + nlen + elen, name }
}

// Stream a byte range of the zip into a writable stream.
function rangeStream(start, end, dest) {
  return new Promise((resolve, reject) => {
    const req = get(ZIP_URL, { headers: { Range: `bytes=${start}-${end}` } }, (res) => {
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume()
        reject(new Error(`stream ${start}-${end}: HTTP ${res.statusCode}`))
        return
      }
      pipeline(Readable.from(res), dest)
        .then(resolve)
        .catch(reject)
    })
    req.on('error', reject)
  })
}

async function fetchMember(entry, headers) {
  const base = entry.name.split('/').pop()
  const deflatePath = join(CACHE, `${base}.deflate`)
  const outPath = join(CACHE, base)

  if (existsSync(outPath) && statSync(outPath).size === entry.usize) {
    console.log(`${base}: already inflated (${entry.usize} bytes), skipping`)
    return
  }
  if (!existsSync(deflatePath) || statSync(deflatePath).size !== entry.csize) {
    const { dataStart, name } = await localDataStart(entry.lho)
    if (name !== entry.name) {
      // directory entries and name mismatches: fall back to stored offset math
      console.log(`  local name "${name}" != "${entry.name}", using offset math`)
    }
    console.log(
      `${base}: downloading ${(entry.csize / 1e9).toFixed(2)} GB compressed ` +
        `-> ${(entry.usize / 1e9).toFixed(2)} GB (data @ ${dataStart})`,
    )
    const tmp = `${deflatePath}.part`
    await rangeStream(dataStart, dataStart + entry.csize - 1, createWriteStream(tmp))
    renameSync(tmp, deflatePath)
    console.log(`${base}: compressed member cached`)
  } else {
    console.log(`${base}: compressed member cached, inflating`)
  }

  console.log(`${base}: inflating...`)
  const src = createReadStream(deflatePath)
  const dst = createWriteStream(`${outPath}.part`)
  await pipeline(src, createInflateRaw(), dst)
  renameSync(`${outPath}.part`, outPath)
  console.log(`${base}: done -> ${outPath}`)
}

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const headers = await head()
  const fileSize = BigInt(headers['content-length'])
  const lastModified = headers['last-modified'] ?? ''
  const etag = headers.etag ?? ''
  console.log(`zip: ${fileSize} bytes, last-modified ${lastModified}`)

  const metaPath = join(CACHE, 'meta.json')
  const members = await readCentralDirectory(fileSize)
  const wanted = members.filter((m) => WANT.has(m.name.split('/').pop()) && !m.name.endsWith('/'))
  for (const m of wanted) {
    console.log(`  member ${m.name}: ${(m.usize / 1e9).toFixed(2)} GB uncompressed, method ${m.method}`)
  }

  // Freshness: if the cached files match the remote Last-Modified, skip.
  if (existsSync(metaPath)) {
    try {
      const old = JSON.parse(readFileSync(metaPath, 'utf8'))
      if (old.lastModified === lastModified) {
        const ok = wanted.every((m) => {
          const p = join(CACHE, m.name.split('/').pop())
          return existsSync(p) && statSync(p).size === m.usize
        })
        if (ok) {
          console.log('cache is up to date (last-modified unchanged), nothing to do')
          return
        }
      }
    } catch {
      /* fall through to refetch */
    }
  }

  const meta = { lastModified, etag, fileSize: fileSize.toString(), fetchedAt: new Date().toISOString() }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  for (const m of wanted) {
    if (m.method !== 8) throw new Error(`${m.name}: unsupported compression method ${m.method}`)
    await fetchMember(m, headers)
  }
  console.log('all done')
}

if (process.argv.includes('--status')) {
  const metaPath = join(CACHE, 'meta.json')
  if (existsSync(metaPath)) console.log(readFileSync(metaPath, 'utf8'))
  else console.log('no cache')
} else {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
