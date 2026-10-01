// One door to the language model: a pool of Gemini keys.
// The model explains and tidies; it never produces forecast numbers.
//
// Harness:
//   - key pool: round-robin; each key kept under GEMINI_RPM requests/minute by our own limiter,
//     so we rarely see a 429. On a 429 the key cools down for Google's retryDelay (daily quota: until
//     the next quota reset) and the call moves to the next key. Invalid keys are switched off.
//   - at most MAX_IN_FLIGHT calls at once; others wait their turn.
//   - token economy: small model by default, no "thinking" tokens, capped output, JSON mode for tidy.
//   - keys are never logged; logs name them key-1..key-n.

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-lite-latest' // alias: Google keeps it on the current lite model
const RPM = () => Number(process.env.GEMINI_RPM) || 10
const MAX_IN_FLIGHT = 3

export function provider() {
  return pool().length ? 'gemini' : null
}
export const providerName = () => (provider() ? 'Gemini' : null)

export class LlmError extends Error {
  constructor(message, status = 502, retryAfter) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// ---- key pool -------------------------------------------------------------------------------------
let keys = null
function pool() {
  if (!keys) {
    // the pool list wins; the single GEMINI_API_KEY is only a fallback (a stray shell variable must not join the pool)
    const list = (process.env.GEMINI_API_KEYS?.trim() ? process.env.GEMINI_API_KEYS.split(',') : [process.env.GEMINI_API_KEY ?? ''])
      .map((k) => k.trim())
      .filter((k, i, a) => k && a.indexOf(k) === i)
    keys = list.map((key, i) => ({ key, id: `key-${i + 1}`, recent: [], coolUntil: 0, off: false, day: '', tokens: 0, calls: 0 }))
  }
  return keys
}
let cursor = 0

const today = () => new Date().toISOString().slice(0, 10)
/** Gemini free-tier daily quotas reset at midnight Pacific time (~07:00-08:00 UTC). */
function nextDailyReset(now = Date.now()) {
  const d = new Date(now)
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8)
  return reset > now ? reset : reset + 86_400_000
}

function available(k, now) {
  k.recent = k.recent.filter((t) => now - t < 60_000)
  return !k.off && k.coolUntil <= now && k.recent.length < RPM()
}

/** Next usable key, round-robin; null plus the wait until one frees up. */
export function pickKey(now = Date.now()) {
  const ks = pool()
  for (let n = 0; n < ks.length; n++) {
    const k = ks[(cursor + n) % ks.length]
    if (available(k, now)) {
      cursor = (cursor + n + 1) % ks.length
      return { key: k }
    }
  }
  const waits = ks.filter((k) => !k.off).map((k) => Math.max(k.coolUntil, k.recent.length >= RPM() ? k.recent[0] + 60_000 : 0) - now)
  return { key: null, waitMs: waits.length ? Math.max(1000, Math.min(...waits)) : null }
}

/** Status for the /ai route and logs; never includes the key itself. */
export function poolStatus(now = Date.now()) {
  return pool().map((k) => ({
    id: k.id, state: k.off ? 'invalid' : k.coolUntil > now ? 'cooling' : 'ready',
    ready_in_s: k.coolUntil > now ? Math.ceil((k.coolUntil - now) / 1000) : 0,
    calls_today: k.day === today() ? k.calls : 0, tokens_today: k.day === today() ? k.tokens : 0,
  }))
}

/** Google puts the wait in error.details[].retryDelay ("13s") and the quota name in QuotaFailure. */
function coolDown(k, body) {
  const details = body?.error?.details ?? []
  const retry = details.find((d) => d.retryDelay)?.retryDelay
  const daily = JSON.stringify(details).match(/PerDay|per day|daily/i) || /per day|daily/i.test(body?.error?.message ?? '')
  const now = Date.now()
  k.coolUntil = daily ? nextDailyReset(now) : now + (retry ? parseFloat(retry) * 1000 + 500 : 60_000)
  console.warn(`[llm] ${k.id} rate-limited (${daily ? 'daily quota' : 'per-minute'}); cooling ${Math.ceil((k.coolUntil - now) / 1000)}s`)
}

// ---- concurrency gate -------------------------------------------------------------------------------
let inFlight = 0
const waiting = []
async function gate(fn) {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => waiting.push(r))
  inFlight++
  try {
    return await fn()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

// ---- providers --------------------------------------------------------------------------------------
// Keep hidden "thinking" tokens to a minimum: 2.5 models take a budget, 3.x models take a level.
const thinking = (model) => (/2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' })
let thinkingOk = true // flipped off if the model rejects the setting; retried once without it

async function gemini({ system, messages, temperature, maxTokens, json }) {
  const tried = new Set()
  for (;;) {
    const { key: k, waitMs } = pickKey()
    if (!k || tried.has(k.id)) {
      const s = Math.ceil((waitMs ?? 60_000) / 1000)
      throw new LlmError(`The AI is busy right now. Try again in about ${s} seconds.`, 429, s)
    }
    tried.add(k.id)
    k.recent.push(Date.now())
    let res
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': k.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(thinkingOk ? { thinkingConfig: thinking(MODEL()) } : {}),
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      })
    } catch (e) {
      k.coolUntil = Date.now() + 10_000
      console.warn(`[llm] ${k.id} network error: ${e.name}`)
      continue
    }
    const body = await res.json().catch(() => null)
    if (res.ok) {
      if (k.day !== today()) (k.day = today()), (k.tokens = 0), (k.calls = 0)
      k.calls++
      k.tokens += body?.usageMetadata?.totalTokenCount ?? 0
      const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (!text && body?.promptFeedback?.blockReason) throw new LlmError('The AI declined to answer that. Ask about your forecast instead.', 422)
      return text
    }
    if (res.status === 429) coolDown(k, body)
    else if (res.status === 401 || res.status === 403) {
      k.off = true
      console.error(`[llm] ${k.id} rejected (${res.status}); switched off until restart`)
    } else if (res.status >= 500) k.coolUntil = Date.now() + 15_000
    else throw new LlmError(`Gemini rejected the request (${res.status}): ${body?.error?.message ?? 'no detail'}`.slice(0, 300))
  }
}

/** messages: [{ role: 'user' | 'assistant', content }]. Returns the reply text. */
export async function complete({ system, messages, temperature = 0.2, maxTokens = 400, json = false }) {
  const p = provider()
  if (!p) throw new LlmError('No AI is set up: add GEMINI_API_KEYS to .env.', 503)
  return gate(() => gemini({ system, messages, temperature, maxTokens, json }))
}

/** Pulls the first JSON object out of a reply that may wrap it in prose or code fences. */
export function parseJSON(text) {
  const t = String(text ?? '').replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    return JSON.parse(t.slice(a, b + 1))
  } catch {
    return null
  }
}

/** Tests only: reset pool state. */
export const _resetPool = () => ((keys = null), (cursor = 0))
