import accuracyMock from '../../mocks/accuracy.json'
import changesMock from '../../mocks/changes.json'
import forecastMock from '../../mocks/forecast.json'
import type { Accuracy, Basis, Changes, Forecast, Horizon } from '../../types'

/*
 * The landing story's numbers, all from the bundled sample company. The twelve deals are the largest open deals in
 * risk.json; the intermediate win chances (learned, then decayed, then calibrated) are back-solved from their final
 * p_win so the chain ends exactly where the product does.
 */

export const FORECASTS = forecastMock as Record<string, Forecast>
export const CHANGES = changesMock as Changes
export const ACCURACY = accuracyMock as unknown as Accuracy
export const forecastFor = (h: Horizon, b: Basis) => FORECASTS[`${h}-${b}`]
export const RANGE = forecastFor(30, 'bookings')

export const STAGE_PCT = { Qualify: 0.2, Demo: 0.4, Proposal: 0.6, Negotiation: 0.8 } as const
type Stage = keyof typeof STAGE_PCT

export interface Deal {
  name: string
  value: number
  stage: Stage
  /** final win chance (risk.json) */
  pWin: number
  rep: string
  /** days since the last activity; 0 = active */
  silent: number
  close: string
  terms: number
  /** this customer's usual payment delay past terms */
  late: number
  reason: string
}

const RAW: Deal[] = [
  { name: 'Acme', value: 500000, stage: 'Proposal', pWin: 0.38, rep: 'Raj Sharma', silent: 42, close: '2026-11-15', terms: 60, late: 12, reason: '3rd date push, silent 42 days' },
  { name: 'Wonka Industries', value: 420000, stage: 'Demo', pWin: 0.52, rep: 'Meera Iyer', silent: 0, close: '2026-11-07', terms: 60, late: 5, reason: 'Stuck in demo 61 days' },
  { name: 'Stark Supply', value: 300000, stage: 'Negotiation', pWin: 0.84, rep: 'Priya Nair', silent: 0, close: '2026-10-08', terms: 60, late: 0, reason: 'Sandbagging rep, strong history' },
  { name: 'Pied Piper', value: 260000, stage: 'Proposal', pWin: 0.35, rep: 'Raj Sharma', silent: 0, close: '2026-10-18', terms: 45, late: 8, reason: 'Optimistic rep, 2nd date push' },
  { name: 'Hooli', value: 210000, stage: 'Demo', pWin: 0.29, rep: 'Arjun Rao', silent: 24, close: '2026-10-20', terms: 30, late: 10, reason: 'Silent 24 days' },
  { name: 'Initech', value: 200000, stage: 'Proposal', pWin: 0.46, rep: 'Priya Nair', silent: 0, close: '2026-10-16', terms: 30, late: 0, reason: 'New this week, large for SMB' },
  { name: 'Cyberdyne', value: 180000, stage: 'Proposal', pWin: 0.44, rep: 'Raj Sharma', silent: 0, close: '2026-10-24', terms: 30, late: 6, reason: 'Optimistic rep' },
  { name: 'Massive Dynamic', value: 150000, stage: 'Negotiation', pWin: 0.58, rep: 'Raj Sharma', silent: 0, close: '2026-10-05', terms: 30, late: 4, reason: 'Optimistic rep' },
  { name: 'Tyrell', value: 140000, stage: 'Demo', pWin: 0.31, rep: 'Kabir Das', silent: 28, close: '2026-11-02', terms: 45, late: 0, reason: 'Silent 28 days' },
  { name: 'Soylent', value: 120000, stage: 'Qualify', pWin: 0.33, rep: 'Arjun Rao', silent: 21, close: '2026-10-12', terms: 30, late: 15, reason: 'Silent 21 days, pays late' },
  { name: 'Vandelay', value: 90000, stage: 'Demo', pWin: 0.36, rep: 'Kabir Das', silent: 22, close: '2026-10-22', terms: 30, late: 0, reason: 'Silent 22 days' },
  { name: 'Oscorp', value: 75000, stage: 'Proposal', pWin: 0.61, rep: 'Meera Iyer', silent: 0, close: '2026-10-17', terms: 30, late: 0, reason: 'Steady, on schedule' },
]

const clamp = (x: number) => Math.min(0.95, Math.max(0.05, x))
export const REP = Object.fromEntries(ACCURACY.reps.map((r) => [r.name, r]))
/** share of win chance a deal keeps after `d` silent days */
export const decay = (d: number) => (d > 0 ? 1 - 0.4 * (1 - Math.exp(-d / 30)) : 1)

const DAY = 86400000
export const AS_OF = new Date('2026-09-28').getTime()
export const WINDOW_DAYS = 90
export const AXIS_DAYS = 135
const plus = (iso: string, days: number) => new Date(iso).getTime() + days * DAY

export interface StoryDeal extends Deal {
  stagePct: number
  /** learned from history, before inactivity and rep calibration */
  pLearned: number
  /** after inactivity decay */
  pDecayed: number
  /** day offsets from AS_OF */
  closeDay: number
  cashDay: number
  cashInside: boolean
}

export const DEALS: StoryDeal[] = RAW.map((d) => {
  const score = REP[d.rep]?.score ?? 1
  const pDecayed = clamp(d.pWin / score)
  const pLearned = clamp(pDecayed / decay(d.silent))
  const closeDay = (new Date(d.close).getTime() - AS_OF) / DAY
  const cashDay = (plus(d.close, d.terms + d.late) - AS_OF) / DAY
  return { ...d, stagePct: STAGE_PCT[d.stage], pLearned, pDecayed, closeDay, cashDay, cashInside: cashDay <= WINDOW_DAYS }
})

const sum = (f: (d: StoryDeal) => number) => DEALS.reduce((s, d) => s + f(d), 0)
export const TOTALS = {
  crm: sum((d) => d.value * d.stagePct),
  learned: sum((d) => d.value * d.pLearned),
  decayed: sum((d) => d.value * d.pDecayed),
  calibrated: sum((d) => d.value * d.pWin),
  cash: sum((d) => (d.cashInside ? d.value * d.pWin : 0)),
}

/** Reps in calibration order, most optimistic first, with their deals. */
export const REP_GROUPS = [...new Set(DEALS.map((d) => d.rep))]
  .map((name) => ({ name, rep: REP[name], deals: DEALS.flatMap((d, i) => (d.rep === name ? [i] : [])) }))
  .sort((a, b) => (a.rep?.score ?? 1) - (b.rep?.score ?? 1))

export const dayLabel = (day: number) => new Date(AS_OF + day * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/* ------------------------------------------------------------------ distributions */

/** Bin width of a forecast's histogram (bins are centres, evenly spaced). */
export const binStep = (f: Forecast) => f.histogram[1].bin - f.histogram[0].bin

/** Chance the outcome reaches `target`, read off the simulated histogram. */
export function chanceAtLeast(f: Forecast, target: number) {
  const step = binStep(f)
  let total = 0
  let hit = 0
  for (const b of f.histogram) {
    total += b.count
    const lo = b.bin - step / 2
    const hi = b.bin + step / 2
    if (lo >= target) hit += b.count
    else if (hi > target) hit += (b.count * (hi - target)) / step
  }
  return total ? hit / total : 0
}

/** Value at cumulative share `q` of the histogram. */
export function quantile(f: Forecast, q: number) {
  const step = binStep(f)
  const total = f.histogram.reduce((s, b) => s + b.count, 0)
  let acc = 0
  for (const b of f.histogram) {
    if (acc + b.count >= q * total) return b.bin - step / 2 + (step * (q * total - acc)) / b.count
    acc += b.count
  }
  return f.histogram[f.histogram.length - 1].bin
}

/** Deterministic pseudo-random numbers, so every visit draws the same futures. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Simulated cumulative-revenue paths for the 30-day range: each ends on an evenly spaced quantile of the histogram
 * and follows the median's shape with its own wobble. Points are [day share 0..1, value].
 */
export function futurePaths(n: number, steps = 14): [number, number][][] {
  const r = rng(7)
  const s = RANGE.series
  const last = s[s.length - 1].p50
  const shape = (t: number) => {
    const x = t * (s.length - 1)
    const i = Math.min(s.length - 2, Math.floor(x))
    return (s[i].p50 + (s[i + 1].p50 - s[i].p50) * (x - i)) / last
  }
  return Array.from({ length: n }, (_, k) => {
    const end = quantile(RANGE, (k + 0.5) / n)
    let drift = 0
    return Array.from({ length: steps + 1 }, (_, j) => {
      const t = j / steps
      drift += (r() - 0.5) * 0.06
      const wob = j === 0 || j === steps ? 0 : drift * Math.sin(Math.PI * t)
      return [t, Math.max(0, end * (shape(t) + wob))] as [number, number]
    })
  })
}
