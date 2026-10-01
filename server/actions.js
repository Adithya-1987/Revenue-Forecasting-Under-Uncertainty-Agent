// What the assistant may offer to DO: a fixed list mirroring buttons that already exist on the website.
// Rules pick the action from the question (no tokens); every argument is validated; the person clicks
// to carry it out. Nothing here writes data on its own.

const PAGES = { dashboard: '/app', forecast: '/app/forecast', changes: '/app/changes', risk: '/app/risk', trust: '/app/trust', data: '/app/data' }
const SEGMENTS = ['SMB', 'Mid-Market', 'Enterprise']

const money = (n) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`)

/**
 * Turns an action request into a button the UI can show, or null when the call is not allowed.
 * `reps` are this workspace's rep names: a filter can only name a real rep.
 */
export function toAction(call, { reps = [] } = {}) {
  if (!call?.name) return null
  const a = call.args ?? {}
  switch (call.name) {
    case 'open_page':
      return PAGES[a.page] ? { type: 'navigate', to: PAGES[a.page], label: `Open ${a.page === 'changes' ? 'What changed' : a.page === 'risk' ? 'Deal risk' : a.page[0].toUpperCase() + a.page.slice(1)}` } : null
    case 'show_forecast':
      if (![30, 60, 90].includes(Number(a.horizon)) || !['bookings', 'cash'].includes(a.basis)) return null
      return { type: 'navigate', to: `/app/forecast?horizon=${Number(a.horizon)}&basis=${a.basis}`, label: `Show ${Number(a.horizon)}-day ${a.basis}` }
    case 'filter_deals': {
      const rep = reps.find((r) => r.toLowerCase() === String(a.rep ?? '').trim().toLowerCase())
      const segment = SEGMENTS.includes(a.segment) ? a.segment : undefined
      if (!rep && !segment) return null
      const qs = new URLSearchParams({ ...(rep ? { rep } : {}), ...(segment ? { segment } : {}) })
      return { type: 'navigate', to: `/app/risk?${qs}`, label: `Show ${[rep, segment].filter(Boolean).join(' · ')} deals` }
    }
    case 'run_forecast':
      return { type: 'run_forecast', label: 'Run forecast now', confirm: true }
    case 'set_target': {
      const amount = Number(a.amount)
      if (![30, 60, 90].includes(Number(a.horizon)) || !['bookings', 'cash'].includes(a.basis) || !(amount > 0 && amount < 1e12)) return null
      return {
        type: 'set_target', horizon: Number(a.horizon), basis: a.basis, amount: Math.round(amount),
        label: `Set ${Number(a.horizon)}-day ${a.basis} target to ${money(amount)}`, confirm: true,
      }
    }
    default:
      return null
  }
}

// ---- intent: choose the action from the question itself (no tokens, predictable) --------------------
const UNIT = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 }

/** "30 lakh", "₹2.5 Cr", "3000000" -> rupees (largest figure in the text), else null. */
function amountIn(text) {
  let best = null
  for (const m of text.matchAll(/(?:₹|rs\.?\s?|inr\s?)?(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|lakhs?|lac|l|mn|million|m|crores?|cr)?(?![a-z])/gi)) {
    const n = Number(m[1].replace(/,/g, '')) * (UNIT[m[2]?.toLowerCase()] ?? 1)
    if (n >= 1000 && (best == null || n > best)) best = n
  }
  return best
}

/**
 * The one button that fits the question, or null. Order matters: explicit commands first, then
 * "show me" filters, then the page that holds the answer.
 */
export function actionFor(question, { reps = [] } = {}) {
  const q = question.toLowerCase()
  const horizon = q.match(/\b(30|60|90)[\s-]?days?\b/)?.[1] ?? (/\bquarter\b/.test(q) ? '90' : null)
  const basis = /\bcash|collect/.test(q) ? 'cash' : 'bookings'
  const call = (name, args = {}) => toAction({ name, args }, { reps })

  if (/\b(set|change|update|make|raise|lower|move)\b.*\btarget\b|\btarget\b.*\b(to|=)\s*(₹|rs|\d)/.test(q)) {
    const amount = amountIn(question)
    if (amount) return call('set_target', { horizon: horizon ?? '30', basis, amount })
  }
  if (/\b(re-?run|refresh|recalculate|update|run)\b.*\bforecast\b/.test(q)) return call('run_forecast')
  const rep = reps.find((r) => q.includes(r.toLowerCase()) || q.includes(r.toLowerCase().split(' ')[0] + "'s") || q.includes(r.toLowerCase().split(' ')[0] + ' deals'))
  const segment = /\bsmb\b|small business/.test(q) ? 'SMB' : /mid[\s-]?market/.test(q) ? 'Mid-Market' : /\benterprise\b/.test(q) ? 'Enterprise' : undefined
  if ((rep || segment) && /\bdeals?\b|pipeline|opportunit|risk|show|list/.test(q)) return call('filter_deals', { rep, segment })
  if (horizon || basis === 'cash') return call('show_forecast', { horizon: horizon ?? '30', basis })
  if (/\b(why|moved?|change|drop|fell|rose|since)\b/.test(q)) return call('open_page', { page: 'changes' })
  if (/\b(call|risk|slip|stuck|quiet|silent|which deals?|who should)\b/.test(q)) return call('open_page', { page: 'risk' })
  if (/\b(trust|accura|reliab|calibrat|optimis|sandbag|reps?|team|season)/.test(q)) return call('open_page', { page: 'trust' })
  if (/\b(upload|csv|import|data)\b/.test(q)) return call('open_page', { page: 'data' })
  return null
}

/** "Set …", "Show me …", "Run …": a request to act, not a question to explain. */
export const isCommand = (question) =>
  /^\s*(please\s+)?(set|change|update|raise|lower|make|show( me)?|open|go to|take me|filter|list|run|re-?run|refresh|recalculate)\b/i.test(question)

/** Instant reply for a command, written from the workspace's own data. No model call. */
export function commandReply(action, { target, deals = [] } = {}) {
  switch (action.type) {
    case 'set_target':
      return `Ready to set the ${action.horizon}-day ${action.basis} target to ${money(action.amount)}` +
        `${target ? ` (it is ${money(target)} now)` : ''}. Click the button to confirm. The next forecast run uses it.`
    case 'run_forecast':
      return 'Click the button to re-run the forecast on your current pipeline. It takes about 10 seconds, and What changed will explain any difference.'
    case 'navigate': {
      if (action.to.startsWith('/app/risk?')) {
        const p = new URLSearchParams(action.to.split('?')[1])
        const mine = deals.filter((d) => (!p.get('rep') || d.rep === p.get('rep')) && (!p.get('segment') || d.segment === p.get('segment')))
        if (!mine.length) return `There are no open deals for ${[p.get('rep'), p.get('segment')].filter(Boolean).join(' · ')}.`
        const damage = mine.reduce((s, d) => s + d.expected_damage, 0)
        return `${[p.get('rep'), p.get('segment')].filter(Boolean).join(' · ')} has ${mine.length} open deals carrying ${money(damage)} of expected damage. ` +
          `Biggest risk: ${mine[0].name} (${money(mine[0].expected_damage)}).`
      }
      return `${action.label.replace(/^Open /, 'Opening ').replace(/^Show /, 'Showing ')}.`
    }
    default:
      return 'Done.'
  }
}

/** "Show me X's deals" naming someone who is not a rep here: say so, and list who is. No model call. */
export function unknownRepReply(question, reps) {
  const q = question.toLowerCase()
  if (!isCommand(question) || !/\bdeals?\b|pipeline|opportunit/.test(q) || reps.some((r) => q.includes(r.toLowerCase().split(' ')[0]))) return null
  const name = question.match(/(?:[Ss]how(?: me)?|[Ll]ist|[Ff]ilter)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s)?\s+(?:deals?|pipeline|opportunit)/)?.[1]
  if (!name) return null
  return `There is no rep named ${name} in this workspace. Reps here: ${reps.slice().sort().join(', ')}.`
}
