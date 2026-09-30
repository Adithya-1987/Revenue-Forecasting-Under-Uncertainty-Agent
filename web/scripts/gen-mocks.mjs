// Writes src/mocks/forecast.json: one entry per horizon x basis. Run: node scripts/gen-mocks.mjs
import { writeFileSync } from 'node:fs'

const AS_OF = '2026-09-28'
const spec = {
  bookings: { 30: [1520000, 1920000, 2380000, 2100000], 60: [3100000, 3700000, 4400000, 4000000], 90: [4600000, 5400000, 6300000, 6000000] },
  cash: { 30: [820000, 1100000, 1450000, 1600000], 60: [2000000, 2500000, 3000000, 2600000], 90: [3500000, 4200000, 4900000, 5200000] },
}
const erf = (x) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const cdf = (x, m, s) => 0.5 * (1 + erf((x - m) / (s * Math.SQRT2)))
const round = (n, to = 1000) => Math.round(n / to) * to

const out = {}
for (const basis of ['bookings', 'cash']) {
  for (const h of [30, 60, 90]) {
    const [p10, p50, p90, target] = spec[basis][h]
    const sd = (p90 - p10) / 2.563
    const lo = p50 - 3.2 * sd, width = (6.4 * sd) / 40
    const histogram = Array.from({ length: 40 }, (_, i) => {
      const a = lo + i * width
      return { bin: round(a), count: Math.round(10000 * (cdf(a + width, p50, sd) - cdf(a, p50, sd))) }
    })
    const series = []
    for (let d = 0; d <= h; d += 5) {
      const f = Math.pow(d / h, 1.15)
      const date = new Date(Date.parse(AS_OF) + d * 864e5).toISOString().slice(0, 10)
      const q = (p) => round((p50 + (p - p50) * Math.sqrt(d / h)) * f)
      series.push({ date, p10: q(p10), p25: q(p50 - (p50 - p10) * 0.53), p50: round(p50 * f), p75: q(p50 + (p90 - p50) * 0.53), p90: q(p90) })
    }
    out[`${h}-${basis}`] = {
      as_of: AS_OF, horizon: h, basis, p10, p50, p90, target,
      prob_hit_target: +(1 - cdf(target, p50, sd)).toFixed(2),
      top3_share: basis === 'cash' ? 0.46 : 0.41, hhi: 0.07, top_deal: 'Acme',
      top_deals: [{ name: 'Acme', share: 0.19 }, { name: 'Wonka Industries', share: 0.13 }, { name: 'Stark Supply', share: 0.09 }],
      prev: { p10: Math.round(p10 * 1.18), p50: Math.round(p50 * 1.25), p90: Math.round(p90 * 1.2) },
      series, histogram,
    }
  }
}
writeFileSync(new URL('../src/mocks/forecast.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(Object.keys(out).map((k) => `${k}: hit ${out[k].prob_hit_target}`).join(', '))
