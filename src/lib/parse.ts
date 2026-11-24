// Shared helpers for parsing DMCA notice files. Used by the data build
// script, the unit tests, and (for slug/claimant/url helpers) the app.

export const TYPE_OTHER = 0
export const TYPE_COPYRIGHT = 1
export const TYPE_COUNTER = 2
export const TYPE_RETRACTION = 3
export const TYPE_REVERSAL = 4
export const TYPE_CIRCUMVENTION = 5

export const TYPE_NAMES: Record<number, string> = {
  [TYPE_OTHER]: 'Other',
  [TYPE_COPYRIGHT]: 'Copyright',
  [TYPE_COUNTER]: 'Counter-notice',
  [TYPE_RETRACTION]: 'Retraction',
  [TYPE_REVERSAL]: 'Reversal',
  [TYPE_CIRCUMVENTION]: 'Anti-circumvention',
}

export const TYPE_COLORS: Record<number, string> = {
  [TYPE_OTHER]: 'slate',
  [TYPE_COPYRIGHT]: 'blue',
  [TYPE_COUNTER]: 'amber',
  [TYPE_RETRACTION]: 'violet',
  [TYPE_REVERSAL]: 'teal',
  [TYPE_CIRCUMVENTION]: 'rose',
}

const MD_EXT = /\.(md|markdown)$/i
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/

export function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(MD_EXT, '').replace(DATE_PREFIX, '')
}

const SLUG_SUFFIX_WORDS = new Set([
  'counternotice', 'counter', 'notice', 'notification', 'retraction',
  'retractions', 'reversal', 'reversals', 'rescind', 'rescinded',
  'withdraw', 'withdrawn', 'withdrawal', 'amend', 'amended', 'amendment',
  'mass', 'spam', 'dmca', 'takedown', 'removal', 'copy', 'updated', 'update',
])

// Reduce a slug like "alianza-2", "sony-counternotice" or
// "dashmote-counternotice-2" to the claimant-ish base "alianza", "sony",
// "dashmote" by stripping trailing type words and numbers.
export function slugBase(slug: string): string {
  const tokens = slug.toLowerCase().split('-').filter(Boolean)
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1].replace(/\.$/, '')
    if (/^\d+$/.test(last) || SLUG_SUFFIX_WORDS.has(last)) {
      tokens.pop()
    } else {
      break
    }
  }
  return tokens.join('-') || slug.toLowerCase()
}

// Grouping key for claimants. Diacritics and punctuation are dropped so
// "Alianza contra Piratería" and "alianza-contra-pirateria" agree.
export function normalizeClaimantKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'a', 'an'])
const KEEP_UPPER = new Set([
  'llc', 'inc', 'ltd', 'corp', 'corporation', 'co', 'company', 'gmbh',
  'sarl', 'sa', 'ag', 'bv', 'nv', 'plc', 'lp', 'llp', 'pty', 'kk',
  'usa', 'uk', 'eu', 'dmca', 'ip', 'tv', 'pc', 'ai', 'vr', 'ar', 'it',
])

export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (KEEP_UPPER.has(lower)) return lower.toUpperCase()
      if (i > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

const URL_RE = /https?:\/\/[^\s<>"'`[\]{}]+/gi
const TRAILING_JUNK = /[.,;:!?)\]}'"*]+$/

export function extractUrls(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    let u = m[0].replace(TRAILING_JUNK, '')
    // markdown links can leave a trailing ')' that belongs to the syntax
    while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) {
      u = u.slice(0, -1)
    }
    if (!seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

const BOILERPLATE_HOSTS = new Set([
  'docs.github.com',
  'help.github.com',
  'support.github.com',
  'githubstatus.com',
])

// github.com path segments that are site features, not user content.
const GITHUB_SERVICE_OWNERS = new Set([
  'github', 'contact', 'orgs', 'marketplace', 'settings', 'docs', 'help',
  'about', 'features', 'pricing', 'security', 'site', 'explore', 'sponsors',
  'login', 'signup', 'new', 'search', 'topics', 'trending', 'collections',
  'events', 'community', 'enterprise', 'team', 'customer-stories', 'support',
  'apps', 'copilot', 'skills', 'notifications', 'pulls', 'issues', 'atoms',
  'dashboard', 'organizations', 'users', 'site-policy', 'contact',
])

export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isBoilerplateUrl(url: string): boolean {
  const host = urlHost(url)
  if (BOILERPLATE_HOSTS.has(host)) return true
  if (host === 'github.com') {
    const owner = url.split('/')[3]?.toLowerCase() ?? ''
    if (GITHUB_SERVICE_OWNERS.has(owner)) return true
  }
  return false
}

// owner/repo pairs targeted on github.com, excluding site chrome.
export function githubTargets(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    try {
      const parsed = new URL(u)
      if (parsed.hostname.toLowerCase() !== 'github.com') continue
      const seg = parsed.pathname.split('/').filter(Boolean)
      if (seg.length < 2) continue
      const owner = seg[0]
      const repo = seg[1]
      if (GITHUB_SERVICE_OWNERS.has(owner.toLowerCase())) continue
      if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) continue
      const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`${owner}/${repo}`)
      if (out.length >= 8) break
    } catch {
      continue
    }
  }
  return out
}

function detectType(slug: string, head: string): number {
  const s = slug.toLowerCase()
  if (/counter/.test(s)) return TYPE_COUNTER
  if (/retract/.test(s)) return TYPE_RETRACTION
  if (/revers/.test(s)) return TYPE_REVERSAL

  // Body signals. Filename stays authoritative; these catch neutrally named
  // counter-notices, retractions and reversals.
  const counterRe =
    /content that has been disabled|counter[-\s]?(?:notification|notice)\b|notice of counter|i\s+(?:hereby\s+)?(?:submit|am submitting)\s+a\s+counter/gi
  let counterHits = 0
  for (const m of head.matchAll(counterRe)) {
    const before = head.slice(Math.max(0, m.index - 60), m.index)
    // "submit a DMCA Counter Notice" in the boilerplate guide links does not count
    if (/submit|guide|how to/i.test(before)) continue
    counterHits++
    if (counterHits >= 1) return TYPE_COUNTER
  }
  if (
    /retract\w*\s+(?:this|the|our|of)\s+\w*\s*(?:notice|takedown|dmca)|notice of retraction|retraction of|withdraw\w*\s+(?:this|the|our)\s+(?:notice|takedown|dmca)/i.test(
      head,
    )
  ) {
    return TYPE_RETRACTION
  }
  if (
    /reversal of|notice of reversal|reversed\s+(?:the|this|our)\s+(?:notice|takedown|decision)|reinstate\w*\s+(?:the|access|content|repo)/i.test(
      head,
    )
  ) {
    return TYPE_REVERSAL
  }

  if (
    /\b1201\b|traffick\w*\s+(?:a\s+|the\s+)?(?:device|technology|tool|circumvent)/i.test(head) ||
    /circumvent\w*\s+(?:effective|technological|access|copyright|protection|digital)\s+\w*\s*(?:controls?|measures?|protections?|technology|devices?)/i.test(
      head,
    ) ||
    /17\s*U\.?\s*S\.?\s*C\.?\s*§?\s*1201|section\s*1201/i.test(head)
  ) {
    return TYPE_CIRCUMVENTION
  }

  if (
    head.length < 120 ||
    !/dmca|copyright|takedown|infring|notice|github/i.test(head)
  ) {
    return TYPE_OTHER
  }
  return TYPE_COPYRIGHT
}

const NON_CLAIMANT = new Set([
  'the copyright owner', 'the owner', 'our client', 'the client',
  'the alleged infringer', 'the infringer', 'github', 'n/a', 'none',
  'private', '[private]', 'unknown', 'not applicable', 'the company',
  'the above', 'the following', 'the work', 'the material',
])

const LEADING_JUNK =
  /^(its|our|your|their|his|her|my|the|a|an|this|that|these|those|such|said|same|alleged|above|following|below|former|latter|any|all|each|per|about|anti|complaints?|circumvention|technological|measures?|access|effective|allegedly|described|infringing|licensed?|terms|service|conditions?|policy|policies|guide|submit|submission|click|here|link|url)\b/i

const GENERIC_WORDS = new Set([
  'inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'co', 'gmbh',
  'sarl', 'sa', 'ag', 'bv', 'nv', 'plc', 'lp', 'llp', 'pty', 'kk',
  'software', 'technology', 'technologies', 'media', 'digital', 'systems',
  'system', 'group', 'holdings', 'holding', 'networks', 'network', 'apps',
  'app', 'games', 'game', 'interactive', 'entertainment', 'studios',
  'studio', 'records', 'record', 'films', 'film', 'pictures', 'picture',
  'channel', 'channels', 'solutions', 'services', 'service', 'products',
  'ventures', 'capital', 'partners', 'associates', 'enterprises',
  'international', 'global', 'worldwide', 'online', 'web', 'cloud',
  'data', 'code', 'source', 'content', 'copyright', 'owner', 'holder',
  'work', 'original', 'available', 'online',
])

// Clause fragments that are never claimant names.
const CLAUSE_RE =
  /\b(?:copying|copied|using|use of|without|materials?|source code|infringing|alleged|described above|the above|the following|this work|this repo|these repos|the repos?)\b/i

// A plausible claimant display name: short, capitalized (camelCase brands
// like eBay are fine), and not a sentence fragment.
export function isPlausibleClaimant(s: string): boolean {
  const t = s.trim()
  if (t.length < 2 || t.length > 60) return false
  if (!/[A-Za-z]/.test(t)) return false
  if (/^[a-z]/.test(t) && !/^[a-z][A-Z]/.test(t)) return false
  if (CLAUSE_RE.test(t)) return false
  return true
}

function cleanClaimant(raw: string): string | null {
  let s = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .split(/[,;\n]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^[*`_~\s]+|[*`_~\s]+$/g, '')
  s = s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '')
  s = s.replace(/\s*\((hereinafter|referred to as|dba|f\/k\/a)[^)]*\)?/i, '')
  s = s.replace(/["'“”‘’]/g, '').trim()
  s = s.replace(/\s+(the copyright owner|the owner|hereinafter.*)$/i, '')
  // cut descriptive tails like "X as agent for Y" or "X on behalf of Y"
  s = s.replace(
    /\s+(?:as agent (?:for|of)|on behalf of|acting on behalf of|authorized by|authorised by|commissioned (?:by|to)|typically via|retained by)\b.*$/i,
    '',
  )
  // cut sentence spill: "Stimulsoft Company. We have noted ..."
  s = s.replace(/\.\s+(?=(?:we|the|this|there|it|i|they|he|she)\b).*/i, '')
  // drop unclosed paren fragment: "Laravel LLC (owner of the copyright"
  s = s.replace(/\s*\([^()]*$/, '')
  // drop trailing unmatched close-parens left by clipped captures
  while (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) {
    s = s.slice(0, -1).trimEnd()
  }
  s = s.replace(/[.\s]+$/, '')
  // strip leading function words left by phrase expansion
  for (;;) {
    const m = s.match(/^[a-zA-Z']+\s+/)
    if (!m) break
    const w = m[0].trim().toLowerCase()
    if (
      LEADING_JUNK.test(w) ||
      ['i', 'we', 'you', 'he', 'she', 'it', 'they', 'me', 'us', 'him', 'them',
        'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
        'do', 'does', 'did', 'will', 'would', 'can', 'could', 'shall',
        'should', 'may', 'might', 'must', 'am', 'of', 'for', 'to', 'in',
        'on', 'by', 'at', 'as', 'or', 'and', 'not', 'no', 'yes', 'who',
        'whom', 'which', 'what', 'when', 'where', 'why', 'how', 're',
        'copyright', 'owner', 'holder', 'agent', 'attorney', 'counsel',
        'representative', 'employee', 'officer', 'director', 'manager',
        'engaged', 'authorized', 'authorised', 'acting', 'represented',
        'retained', 'typically', 'via', 'if', 'subsidiary', 'affiliate',
        'division', 'contact', 'reach', 'email', 'call', 'but', 'without', 'however'].includes(w)
    ) {
      s = s.slice(m[0].length)
    } else break
  }
  s = s.trim()
  if (s.length < 2 || s.length > 120) return null
  if (!/[A-Za-z]/.test(s)) return null
  if (NON_CLAIMANT.has(s.toLowerCase())) return null
  if (LEADING_JUNK.test(s)) return null
  if (/^\[?private\]?$/i.test(s)) return null
  // placeholder template text is never a claimant
  if (/^(?:company|organization|organi[sz]ation|name)\s+name$/i.test(s)) return null
  // clauses with auxiliary verbs are sentences, not names
  if (/\b(?:is|are|was|were|has|have|had|will|would|could|should|might|must|that|which|who)\s/i.test(s)) {
    return null
  }
  // single generic words are never claimants
  if (
    GENERIC_WORDS.has(s.toLowerCase()) ||
    NON_CLAIMANT.has(s.toLowerCase())
  ) {
    return null
  }
  // reject lowercase-only captures like "its subsidiaries"
  if (!/[A-Z]/.test(s.slice(1))) {
    // allow single-capital words like "Irdeto"? require an uppercase inside
    // or an entity suffix
    if (!/\b(?:Inc|LLC|Ltd|Corp|GmbH|S\.A\.|AG|BV|NV|Pty|PLC|LLP|LP|Company|Co\.?|Studios?|Entertainment|Interactive|Technologies|Technology|Media|Digital|Systems|Group|Holdings|Networks?|Software|Apps?|Games?)\b/i.test(s)) {
      return null
    }
  }
  // extraction stays permissive on length; display labels apply the
  // stricter isPlausibleClaimant rule in the data build
  if (s.length > 100) return null
  if (/^[a-z]/.test(s) && !/^[a-z][A-Z]/.test(s)) return null
  if (CLAUSE_RE.test(s)) return null
  return s
}

// Patterns tried in order; first hit wins.
const LABEL_RES: RegExp[] = [
  /Name of Injured Party\s*:\s*([^\n]+)/i,
  /Name of (?:the )?Copyright (?:Owner|Holder)\s*:\s*([^\n]+)/i,
  /Copyright Owner\s*:\s*([^\n]+)/i,
  /Injured Party\s*:\s*([^\n]+)/i,
  /Claimant\s*:\s*([^\n]+)/i,
]

// "on behalf of X", "act by X", "agent of X", "representing X", ...
const PREP_RE =
  /(?:on behalf of|act on behalf of|acting on behalf of|act by|on\s+\S{1,20}'s behalf|as agent (?:for|of)|agent (?:for|of)|attorney (?:for|of)|counsel (?:for|of)|representing|represent|on behalf of|behalf of)\s+(?:the\s+)?([A-Z][A-Za-z0-9&.'()\- ]{1,70}?)(?=[,.;:!?)\n]|$)/g

const HAS_AUTH_RE =
  /([A-Z][A-Za-z0-9&.'()\- ]{1,70}?)\s*(?:,\s*)?(?:\([^)]*\)\s*)?has\s+authori[sz]ed\b/g

const SUBJECT_RE =
  /Re:\s*DMCA[^\n]{0,140}?(?:for|of|re)\s*:?\s*([A-Z][^'’\n]{2,70})/i

const RIGHTS_OF_RE =
  /(?:copyrights?|rights?|trademarks?|intellectual property)\s+(?:of|owned by)\s+([A-Z][^'’\n/]{2,60})/i

// Organization-type suffixes used as a last-resort claimant hint.
const ENTITY_SUFFIX =
  'Inc|LLC|Ltd|Limited|Corp|Corporation|Company|Co|GmbH|S\\.A\\.|AG|BV|NV|Pty|PLC|LLP|LP|Studios?|Entertainment|Interactive|Technologies|Technology|Media|Digital|Systems|Group|Holdings|Networks?|Software|Games?|Records?|Films?|Pictures|Channel|Channels|Insurance|Bank|University|College|Institute|Association|Society|Foundation|Academy|Museum|Press|Publishing|Industries|Motors|Airlines|Airways|Logistics|Realty|Investments|Securities|Advisors|Consulting|Engineers|Energy|Medical|Legal|Accounting|Financial|Mutual|Department|Ministry|Church|Partners|Ventures|Bancorp|Bancshares|Group'

// Entity suffixes used as a last-resort claimant hint.
const ENTITY_RE = new RegExp(`\\b(${ENTITY_SUFFIX})\\b\\.?`, 'g')

const ENTITY_CHARS = /^[A-Za-z0-9&.'()\- ]$/
const PHRASE_END = /[.!?;\n:]/

function expandEntityName(text: string, entityStart: number, entityEnd: number): string {
  // walk left from the entity suffix to the start of the name phrase
  let start = entityStart
  while (start > 0 && entityStart - start < 80) {
    const c = text[start - 1]
    if (!ENTITY_CHARS.test(c)) break
    if (PHRASE_END.test(c)) break
    start--
  }
  let end = entityEnd
  while (end < text.length && end - entityStart < 40) {
    const c = text[end]
    if (!ENTITY_CHARS.test(c)) break
    if (PHRASE_END.test(c)) break
    end++
  }
  return text.slice(start, end)
}

// GitHub's web form prints each question as a bold line, sometimes with the
// answer on the same line. The link text inside those questions
// ("Complaints about Anti-Circumvention Technology", "Guide to Submitting a
// DMCA Takedown Notice", ...) is boilerplate, not claimant text, so strip
// question spans and question prefixes but keep answer text.
const QUESTION_STEM =
  /^(?:are you|please provide|please describe|please explain|please confirm|please type|please specify|what files|what work|what would|do you|does your|have you|is the|is your|which|when|where|how|can you|will you|are there|is there|so that|i have a good faith|i have taken|i swear|i confirm|type \(or copy|i acknowledge)\b/i

function stripFormQuestions(text: string): string {
  const out: string[] = []
  for (const line of text.split('\n')) {
    // remove bold/underscore spans that are questions, keep the rest
    let l = line.replace(
      /(\*\*|__)([^*_]{10,500}?)\1/g,
      (whole, _m, inner) => (QUESTION_STEM.test(inner.trim()) ? ' ' : whole),
    )
    // plain-text question prefix ending at '?' or ':' keeps the answer tail
    l = l.replace(
      /^\s*(?:(?:are you|please provide|please describe|please explain|please confirm|please type|please specify|what files|what work|what would|do you|does your|have you|is the|is your|which|when|where|how|can you|will you|are there|is there|so that|i have a good faith|i have taken|i swear|i confirm|type \(or copy|i acknowledge)\b[^?\n]{0,400}[?:])\s*/i,
      '',
    )
    if (l.trim()) out.push(l)
  }
  return out.join('\n')
}

// "Pearson Education, Inc." style: name before a comma + entity suffix.
const ENTITY_COMMA_RE = new RegExp(
  `([A-Z][A-Za-z0-9&.'()\\- ]{1,60}?),\\s*(${ENTITY_SUFFIX})\\b\\.?`,
  'g',
)

function* entityCandidates(head: string): Generator<string> {
  const noUrls = head.replace(/https?:\/\/[^\s<>"'`[\]{}]+/gi, ' ')
  for (const m of noUrls.matchAll(ENTITY_COMMA_RE)) {
    yield m[1]
  }
  for (const m of noUrls.matchAll(ENTITY_RE)) {
    const phrase = expandEntityName(noUrls, m.index ?? 0, (m.index ?? 0) + m[0].length)
    yield phrase
  }
}

export function claimantFromText(text: string): string | null {
  return extractClaimant(text)
}

function extractClaimant(text: string): string | null {
  const head = stripFormQuestions(text.slice(0, 8000))
  for (const re of LABEL_RES) {
    const m = head.match(re)
    if (m) {
      const cleaned = cleanClaimant(m[1])
      if (cleaned) return cleaned
    }
  }
  for (const m of head.matchAll(PREP_RE)) {
    const cleaned = cleanClaimant(m[1])
    if (cleaned) return cleaned
  }
  for (const m of head.matchAll(HAS_AUTH_RE)) {
    const cleaned = cleanClaimant(m[1])
    if (cleaned) return cleaned
  }
  const subj = head.match(SUBJECT_RE)
  if (subj) {
    const cleaned = cleanClaimant(subj[1])
    if (cleaned) return cleaned
  }
  const rights = head.match(RIGHTS_OF_RE)
  if (rights) {
    const cleaned = cleanClaimant(rights[1])
    if (cleaned) return cleaned
  }
  for (const phrase of entityCandidates(head)) {
    if (/\b(?:github|dmca|notice|takedown|copyright|infring\w*|circumvent\w*|complaints?|perjury|swear\w*|belief|fair use|guide to|submit\w*|technological|licensed?|terms of|service|conditions?|policy|policies|merchandise|store|shop|cart|checkout|account|sign in|log ?in)\b/i.test(phrase)) continue
    const cleaned = cleanClaimant(phrase)
    if (cleaned) return cleaned
  }
  // contact-block style: "Name; Title; Company; Address" first segment
  const semi = head.match(/(?:^|\n)\s*([A-Z][A-Za-z0-9&.'()\- ]{3,60}?);/)
  if (semi) {
    const cleaned = cleanClaimant(semi[1])
    if (cleaned) return cleaned
  }
  // signature after a farewell
  const sig2 = head.match(
    /(?:regards|sincerely|best regards|thank you|thanks|yours truly)[,!]?\s*\n+\s*([A-Z][^\n]{2,60})/i,
  )
  if (sig2) {
    const cleaned = cleanClaimant(sig2[1])
    if (cleaned) return cleaned
  }
  // "I am the X," / "We are X," style self-identification
  const self = head.match(
    /(?:i am|we are|we,|this is)\s+(?:the\s+)?([A-Z][A-Za-z0-9&.'()\- ]{2,70}?)(?=[,.;:\n]|$)/,
  )
  if (self) {
    const cleaned = cleanClaimant(self[1])
    if (cleaned) return cleaned
  }
  // Signature fallback: "Please type your full legal name below" etc.
  const sig = head.match(
    /(?:full legal name|legal name|signature|signed)\b[^\n]*\n+\s*([^\n]{2,80})/i,
  )
  if (sig) {
    const cleaned = cleanClaimant(sig[1])
    if (cleaned) return cleaned
  }
  return null
}

// Lines that are GitHub form boilerplate rather than notice substance:
// the legal statements the claimant must type, the guide links, the
// response footer, and letter salutations.
const EXCERPT_DROP =
  /^(?:i\s+(?:have|swear|confirm|acknowledge|have taken)\b|.*good faith belief|.*penalty of perjury|.*fair use.*into consideration|.*guide to (?:submitting|filing).*|so that we can|get back to you|one or more repositories in this dmca|.*in accordance with github'?s dmca|please type your full legal name|before disabling any content|while github did not find|in response to the dmca takedown|github has (?:processed|determined|received|reviewed)|github,? inc\.?\s|88 colin p kelly|sent via email.*dmca|dmca notice of copyright infringement|(?:to whom it may concern|dear\b|hello\b|hi\b|attention\b|attn\b|good (?:morning|afternoon|evening))\b.*|to:\s*github.*|sent via email.*|contacted the owners of|you can learn more in|acceptable use polic|note: because the|but without copying|provided information on how to|submit a dmca counter|to learn about when and why github|offered to connect the owners|we have (?:reviewed|processed|received|taken|disabled|restored)|our (?:policy|trust|safety) team|github'?s response)/i

const EXCERPT_AFFIRM = /^(?:yes|no|yep|nope|n\/a|none|correct)[.!\s]*$/i
const EXCERPT_YESNO_CLAIM = /^(?:yes|no),?\s+(?:i am|i'?m|we are|this is)\b/i

function cleanExcerpt(text: string): string {
  const lines = stripFormQuestions(text).split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const t = line.trim().replace(/^(?:[-*•]\s+)+/, '').replace(/^[*`_~\s]+|[*`_~\s]+$/g, '')
    if (!t) continue
    if (/^(URL|Source|Domain)\s*:/i.test(t)) continue
    if (/^>/.test(t)) continue // GitHub annotation blockquotes
    if (/^-{3,}$/.test(t)) continue
    if (EXCERPT_DROP.test(t)) continue
    if (QUESTION_STEM.test(t)) continue
    if (EXCERPT_AFFIRM.test(t) || EXCERPT_YESNO_CLAIM.test(t)) continue
    kept.push(t)
    if (kept.join(' ').length > 400) break
  }
  let s = kept
    .join(' ')
    .replace(/https?:\/\/[^\s<>"'`[\]{}]+/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\*\*|__|~~/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > 105) s = s.slice(0, 102).replace(/\s+\S*$/, '') + '...'
  return s
}

function pickDomain(headerDomain: string | null, urls: string[]): string {
  if (headerDomain) return headerDomain.slice(0, 80)
  const counts = new Map<string, number>()
  const firstSeen = new Map<string, number>()
  let i = 0
  for (const u of urls) {
    if (isBoilerplateUrl(u)) continue
    const host = urlHost(u)
    if (!host) continue
    counts.set(host, (counts.get(host) ?? 0) + 1)
    if (!firstSeen.has(host)) firstSeen.set(host, i++)
  }
  let best = ''
  let bestN = 0
  let bestFirst = Infinity
  for (const [host, n] of counts) {
    const f = firstSeen.get(host) ?? Infinity
    if (n > bestN || (n === bestN && f < bestFirst)) {
      best = host
      bestN = n
      bestFirst = f
    }
  }
  return best.slice(0, 80)
}

export interface ParsedNotice {
  path: string
  date: string
  year: number
  slug: string
  base: string
  claimant: string
  claimantKey: string
  hasClaimant: boolean
  type: number
  urlCount: number
  targets: string[]
  domain: string
  excerpt: string
  length: number
}

export function parseNotice(path: string, content: string): ParsedNotice {
  const slug = slugFromPath(path)
  const base = slugBase(slug)
  const head = content.slice(0, 8000)

  const dateMatch = path.match(/(\d{4})-(\d{2})-(\d{2})/) ?? slug.match(/(\d{4})-(\d{2})-(\d{2})/)
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : ''
  const year = dateMatch ? parseInt(dateMatch[1], 10) : 0

  const urls = extractUrls(content)
  const contentUrls = urls.filter((u) => !isBoilerplateUrl(u))
  const targets = githubTargets(urls)

  const domainHeader = head.match(/^Domain\s*:\s*(\S+)/im)?.[1] ?? null

  const extracted = extractClaimant(content)
  const claimant = extracted ?? titleCaseSlug(base)
  // Grouping key comes from the slug base so numbered variants like
  // "alianza-2" and "alianza-3" collapse into one claimant.
  const claimantKey = normalizeClaimantKey(base) || normalizeClaimantKey(claimant)

  return {
    path,
    date,
    year,
    slug,
    base,
    claimant: claimant.slice(0, 90),
    claimantKey,
    hasClaimant: extracted !== null,
    type: detectType(slug, head),
    urlCount: contentUrls.length,
    targets,
    domain: pickDomain(domainHeader, contentUrls),
    excerpt: cleanExcerpt(content),
    length: content.length,
  }
}
