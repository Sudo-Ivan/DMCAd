// Parser for Wikimedia Foundation DMCA notices. Pages live in the
// "Legal:" namespace on foundation.wikimedia.org; newer notices use a
// {{DMCA email}} template with structured fields, older ones are raw
// letter wikitext. Pure functions shared by the data build and tests.

import {
  claimantFromText,
  extractUrls,
  normalizeClaimantKey,
} from './parse'

export const WIKI_API = 'https://foundation.wikimedia.org/w/api.php'
export const WIKI_BASE = 'https://foundation.wikimedia.org'
export const WIKI_UA =
  'DMCAd-data-pipeline/1.0 (https://github.com/; DMCA notice archive)'

export interface WikiParsed {
  date: string
  claimant: string
  claimantKey: string // normalized, unprefixed
  hasClaimant: boolean // claimant came from letter text or email, not title
  urlCount: number
  excerpt: string
  length: number
  files: string[] // commons File: titles
  attachments: string[] // notice PDF urls on the foundation wiki
  body: string // letter text stored in the bodies chunk
  subject: string
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11',
  december: '12', jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
}

function isoDate(y: string, m: string, d: string): string {
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Pull YYYY-MM-DD out of free text. Handles ISO dates and the
// "September 25, 2009" / "25 September 2009" styles seen in letters.
export function dateFromText(text: string): string {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return isoDate(iso[1], iso[2], iso[3])
  const mdy = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
  )
  if (mdy) return isoDate(mdy[3], MONTHS[mdy[1].toLowerCase()], mdy[2])
  const dmy = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?,?\s+(\d{4})\b/i,
  )
  if (dmy) return isoDate(dmy[3], MONTHS[dmy[2].toLowerCase()], dmy[1])
  return ''
}

// Extract |param=value pairs from a {{DMCA ...}} template call. Short
// params are single-line; the message param wraps <nowiki>...</nowiki>
// and is captured separately.
function templateParam(wikitext: string, name: string): string {
  if (name === 'message') {
    const m = wikitext.match(/\|\s*message\s*=\s*<nowiki>([\s\S]*?)<\/nowiki>/i)
    return m ? m[1].trim() : ''
  }
  const re = new RegExp(`\\|\\s*${name}\\s*=\\s*`, 'i')
  const m = wikitext.match(re)
  if (!m || m.index === undefined) return ''
  const start = m.index + m[0].length
  // value runs to the next |param= marker. Params may sit inline after the
  // value (no newline), so the boundary is not anchored to line starts.
  const rest = wikitext.slice(start)
  const next = rest.search(/\|\s*[A-Za-z_][\w]*\s*=/)
  let v = next === -1 ? rest : rest.slice(0, next)
  // strip the trailing }} that closes the template
  v = v.replace(/\}\}\s*$/, '')
  return v.trim()
}

// Template date params come in many formats ("Nov 02, 2022 at 09:05 PT",
// "April 23, 2015"); normalize everything to YYYY-MM-DD.
function normDate(raw: string): string {
  const s = raw.trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return isoDate(iso[1], iso[2], iso[3])
  return dateFromText(s)
}

// Convert wikitext to readable plain text for the body chunk and excerpt.
export function wikiToText(wikitext: string): string {
  let t = wikitext
  // drop ref/gallery/template noise but keep template params out entirely
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
  t = t.replace(/<ref[^>]*\/>/gi, ' ')
  t = t.replace(/<gallery[\s\S]*?<\/gallery>/gi, ' ')
  t = t.replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, '$1')
  t = t.replace(/<math[\s\S]*?<\/math>/gi, ' ')
  t = t.replace(/<[^>]+>/g, (tag) => (/^<br/i.test(tag) ? '\n' : ' '))
  // templates: remove entirely (they are metadata, not letter text)
  t = t.replace(/\{\{[^{}]*\}\}/g, ' ')
  // external links [http://x label] -> label, bare [http://x] -> url
  t = t.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '$2')
  t = t.replace(/\[(https?:\/\/[^\s\]]+)\]/g, '$1')
  // internal links [[a|b]] -> b, [[a]] -> a (strip namespace for files)
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
  t = t.replace(/\[\[([^\]]*)\]\]/g, '$1')
  // bold/italic markup
  t = t.replace(/'{2,5}/g, '')
  // list bullets at line start are fine for markdown; collapse spaces
  t = t.replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// All File: page titles linked in the text, including c: (commons) and
// foundation-wiki File: links. Returns deduped "File:Title" strings.
export function wikiFileLinks(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /\[\[(?:c:|commons:|File:|image:)?(File:[^\]|]+)(?:\|[^\]]*)?\]\]/gi
  for (const m of text.matchAll(re)) {
    const title = m[1].replace(/_/g, ' ').trim()
    if (!seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase())
      out.push(title)
    }
    if (out.length >= 60) break
  }
  // bare commons URLs without wikilink syntax
  const urlRe = /https?:\/\/commons\.wikimedia\.org\/wiki\/(File:[^\s<>"')]+)/gi
  for (const m of text.matchAll(urlRe)) {
    const title = decodeURIComponent(m[1]).replace(/_/g, ' ').trim()
    if (!seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase())
      out.push(title)
    }
    if (out.length >= 60) break
  }
  return out
}

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 240) return flat
  return flat.slice(0, 237).replace(/\s+\S*$/, '') + '...'
}

function claimantFromEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return ''
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain.replace(/^www\./, '')
}

// Parse one Legal:DMCA page. `title` is the page title (e.g.
// "Legal:DMCA/Dragon Bravo Fire Pyrocumulus").
export function parseWikiNotice(title: string, wikitext: string): WikiParsed {
  const isTemplate = /\{\{\s*DMCA\s+(?:email|letter|notice)/i.test(wikitext)

  let date: string
  let subject = ''
  let fromEmail = ''
  let letter: string
  const attachments: string[] = []
  let files: string[]

  if (isTemplate) {
    date = normDate(templateParam(wikitext, 'date'))
    subject = templateParam(wikitext, 'subject')
    fromEmail = templateParam(wikitext, 'from')
    const content = templateParam(wikitext, 'content')
    const attachment = templateParam(wikitext, 'attachment')
    const message = templateParam(wikitext, 'message')
    letter = message || content
    if (attachment) {
      const name = attachment.replace(/^File:/i, '').trim()
      if (name) {
        attachments.push(
          `${WIKI_BASE}/wiki/Special:FilePath/${encodeURIComponent(name)}`,
        )
      }
    }
    files = wikiFileLinks(`${content}\n${letter}`)
  } else {
    letter = wikitext
    files = wikiFileLinks(wikitext)
    const head = wikitext.slice(0, 4000)
    date = dateFromText(head)
  }

  const body = wikiToText(letter || wikitext)
  if (!date) date = dateFromText(wikitext.slice(0, 4000))

  // claimant: prefer a name extracted from the letter, fall back to the
  // from-address domain for template pages.
  let claimant = ''
  let hasClaimant = false
  const fromText = claimantFromText(body)
  if (fromText) {
    claimant = fromText
    hasClaimant = true
  }
  if (!claimant && fromEmail) {
    const em = fromEmail.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
    if (em) {
      claimant = claimantFromEmail(em[0])
      hasClaimant = true
    }
  }
  if (!claimant) {
    const em = (letter + '\n' + wikitext.slice(0, 2000)).match(
      /[\w.+-]+@[\w-]+\.[\w.]+/,
    )
    if (em) {
      claimant = claimantFromEmail(em[0])
      hasClaimant = true
    }
  }
  if (!claimant) claimant = title.split('/').pop() ?? title

  const urls = extractUrls(body)
  // urls already include the commons file pages when they appear as links;
  // count files plus urls that are not file pages to avoid double counting.
  const fileUrlRe = /commons\.wikimedia\.org\/wiki\/(?:File|Image):/i
  const otherUrls = urls.filter((u) => !fileUrlRe.test(u))
  const urlCount = files.length + otherUrls.length

  return {
    date,
    claimant: claimant.slice(0, 90),
    claimantKey: normalizeClaimantKey(claimant) || 'unknown',
    hasClaimant,
    urlCount,
    excerpt: excerptOf(subject ? `${subject}. ${body}` : body).slice(0, 240),
    length: wikitext.length,
    files: files.slice(0, 60),
    attachments,
    body,
    subject,
  }
}

export function wikiSourceUrl(title: string): string {
  // keep '/' (subpages) and ':' (namespace) literal, encode the rest
  const path = title
    .split('/')
    .map((seg) => seg.split(':').map(encodeURIComponent).join(':'))
    .join('/')
  return `${WIKI_BASE}/wiki/${path}`
}
