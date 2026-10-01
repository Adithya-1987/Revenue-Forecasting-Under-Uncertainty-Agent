// Guardrails that run before any tokens are spent: per-user rate limits, an on-topic check,
// prompt-injection screening, choosing only the data the question needs, and an answer cache.

// ---- per-user limits --------------------------------------------------------------------------------
export const LIMITS = { chat: { perMin: 6, perDay: 60 }, tidy: { perMin: 3, perDay: 20 }, voice: { perMin: 10, perDay: 100 }, marketing: { perMin: 6, perDay: 40 } }
const hits = new Map() // `${kind}:${user}` -> timestamps (last 24h)

/** Records the hit when allowed. Returns { ok, retryAfter (s), leftToday }. */
export function allow(user, kind, now = Date.now()) {
  const lim = LIMITS[kind]
  const k = `${kind}:${user}`
  const ts = (hits.get(k) ?? []).filter((t) => now - t < 86_400_000)
  const lastMin = ts.filter((t) => now - t < 60_000)
  if (lastMin.length >= lim.perMin) return { ok: false, retryAfter: Math.ceil((lastMin[0] + 60_000 - now) / 1000), leftToday: lim.perDay - ts.length }
  if (ts.length >= lim.perDay) return { ok: false, retryAfter: Math.ceil((ts[0] + 86_400_000 - now) / 1000), leftToday: 0 }
  ts.push(now)
  hits.set(k, ts)
  return { ok: true, leftToday: lim.perDay - ts.length }
}
/** Give back the last hit when the request failed on our side, so errors do not cost the user a question. */
export function refund(user, kind) {
  hits.get(`${kind}:${user}`)?.pop()
}
export const leftToday = (user, kind, now = Date.now()) =>
  LIMITS[kind].perDay - (hits.get(`${kind}:${user}`) ?? []).filter((t) => now - t < 86_400_000).length

// ---- on-topic check ---------------------------------------------------------------------------------
const DOMAIN = /forecast|revenue|pipeline|deal|opportunit|target|quota|range|median|worst|best|chance|probab|risk|call|close|slip|push|cash|collect|payment|paid|invoice|book|rep\b|reps|sales|salesperson|team|calibrat|optimis|sandbag|segment|smb|enterprise|mid|customer|account|change|moved|move|why|drop|fell|rise|rose|grow|lost|won|win|stage|quiet|silent|inactiv|accura|trust|backtest|error|bias|coverage|concentrat|season|30|60|90|days|month|week|quarter|next|this run|last run|upload|csv|import|data|page|dashboard|what changed|how (do|does|much|many|likely)|explain|which|who|top/i
const INJECTION = /ignore (all|any|the|previous|prior|above)|disregard (the|your|previous)|system prompt|your (instructions|prompt|rules)|developer mode|jailbreak|act as|pretend (to be|you)|you are now|role ?play|repeat (the|your) (text|words|instructions)|print (the|your) (prompt|instructions)|\bDAN\b|base64|<\/?script/i
const OFF_TOPIC_REPLY =
  'I can only help with this workspace\'s forecast: the range, what changed and why, deals at risk, cash timing, rep calibration and accuracy. ' +
  'Try: "Why did the forecast move since last run?"'

/**
 * Local screen, no model call. `names` are this workspace's deal, account and rep names, so
 * "What about Acme?" passes. Short follow-ups pass when there is a conversation.
 */
export function screen(question, { names = [], hasHistory = false } = {}) {
  const q = question.trim()
  if (q.length < 2) return { ok: false, reply: 'Type a question about your forecast.' }
  if (q.length > 500) return { ok: false, reply: 'Keep questions under 500 characters.' }
  if (INJECTION.test(q)) return { ok: false, reply: 'I can only answer questions about your forecast data.' }
  const lower = q.toLowerCase()
  const namesHit = names.some((n) => n.length > 2 && lower.includes(n.toLowerCase()))
  const followUp = hasHistory && q.split(/\s+/).length <= 8
  if (DOMAIN.test(q) || namesHit || followUp) return { ok: true }
  return { ok: false, reply: OFF_TOPIC_REPLY }
}

// ---- marketing agent: same idea, a different allowed topic ---------------------------------------------
const MARKETING = /market|promot|campaign|brand|seo|sem|social|linkedin|instagram|facebook|youtube|twitter|x\.com|whatsapp|email|newsletter|content|blog|video|reel|webinar|event|expo|trade show|ad\b|ads\b|advert|google|meta|lead|prospect|outreach|offer|discount|referral|loyalty|retarget|remarket|landing page|website|copy|headline|subject line|post|caption|launch|growth|grow|pipeline|segment|customer|client|audience|persona|channel|budget|spend|roi|cac|conversion|funnel|nurture|re-?engage|win back|upsell|cross-?sell|season|festive|diwali|month|quarter|tip|idea|strategy|plan|calendar|smb|enterprise|mid/i
const MARKETING_REPLY =
  'I help with promoting this company: campaigns, channels, content, offers and timing, using your own sales data. ' +
  'Try: "Plan a LinkedIn campaign for our Enterprise clients."'

export function screenMarketing(question, { names = [], hasHistory = false } = {}) {
  const q = question.trim()
  if (q.length < 2) return { ok: false, reply: 'Type what you want to promote or improve.' }
  if (q.length > 500) return { ok: false, reply: 'Keep requests under 500 characters.' }
  if (INJECTION.test(q)) return { ok: false, reply: 'I can only help with marketing this company.' }
  // marketing words do not make coding, scraping or buying contact lists a marketing task
  if (/\b(python|javascript|sql|code|script|program|scrap(e|er|ing)|crawl|hack|password|crack|bot to|buy (an? )?(email|contact|phone) list)/i.test(q))
    return { ok: false, reply: 'I help with campaigns, content, channels and timing, not code, scraping or bought lists. Try: "Plan an email nurture for quiet deals."' }
  const lower = q.toLowerCase()
  if (MARKETING.test(q) || names.some((n) => n.length > 2 && lower.includes(n.toLowerCase())) || (hasHistory && q.split(/\s+/).length <= 10))
    return { ok: true }
  return { ok: false, reply: MARKETING_REPLY }
}

// ---- choose only the data the question needs ----------------------------------------------------------
const SECTIONS = {
  change: /change|moved|move|why|drop|fell|rise|rose|went (up|down)|differ|since|last run|previous|attribut|cause/i,
  risk: /risk|call|deal|opportunit|lose|losing|slip|push|quiet|silent|stuck|top/i,
  cash: /cash|collect|payment|paid|invoice|late|receiv|terms/i,
  reps: /rep\b|reps|sales ?person|salespeople|team|calibrat|optimis|sandbag|who is/i,
  trust: /trust|accura|reliab|error|bias|coverage|backtest|believe|confiden|how good|wrong/i,
  horizons: /60|90|quarter|month|horizon|longer|later|cash/i,
}
/** Always the 30-day summary; other sections only when the question (or deal name) calls for them. */
export function sectionsFor(question, mentionsDeal) {
  const s = new Set(['core'])
  for (const [name, re] of Object.entries(SECTIONS)) if (re.test(question)) s.add(name)
  if (mentionsDeal) s.add('risk').add('change')
  if (s.size === 1) s.add('change').add('risk') // vague question: the two most useful views
  return s
}

// ---- answer cache (same run, same question, no conversation) ----------------------------------------------
const cache = new Map()
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
export function cached(key) {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value
  cache.delete(key)
}
export function remember(key, value, ttlMs = 15 * 60_000) {
  cache.set(key, { value, until: Date.now() + ttlMs })
  if (cache.size > 300) cache.delete(cache.keys().next().value)
}
export const cacheKey = (ws, runId, question) => `${ws}:${runId}:${norm(question)}`
