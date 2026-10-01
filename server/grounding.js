// Fact check for chat answers: every money amount or percentage in the answer must match a number
// in the data the model was given. Unmatched figures are returned so the UI can flag them.

const UNITS = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 }
const FIGURE = /(₹|rs\.?\s?|inr\s?)?(\d[\d,]*(?:\.\d+)?)\s?(%|k|thousand|lakhs?|lac|l|mn|million|m|crores?|cr)?(?![a-z])/gi

/** All numbers inside a JSON-able value, plus x100 for fractions so 0.5 matches "50%". */
function numbersIn(value, out = []) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(value)
    if (Math.abs(value) <= 1) out.push(value * 100)
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, out))
  return out
}

/** Figures worth checking: money (currency sign or unit) and percentages. Bare counts like "3 deals" are skipped. */
export function figuresIn(text) {
  const found = []
  for (const m of String(text).matchAll(FIGURE)) {
    const [whole, cur, num, unit] = m
    const u = unit?.toLowerCase()
    if (!cur && !u) continue
    const n = Number(num.replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    const scale = u === '%' ? 1 : UNITS[u] ?? 1
    // allowed error = half of the last digit written: "₹9.87M" -> ±₹5,000, "₹41k" -> ±₹500, "43%" -> ±0.5
    // "7,500,000" written for 7,497,000 is rounding too: trailing zeros widen the allowance
    const digits = num.replace(/,/g, '')
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
    const zeros = decimals ? 0 : (digits.match(/0+$/)?.[0].length ?? 0)
    found.push({ text: whole.trim(), value: n * scale, tol: 0.5 * 10 ** (zeros - decimals) * scale, pct: u === '%' })
  }
  return found
}

export function unverifiedFigures(answer, context) {
  const pool = numbersIn(context).map(Math.abs)
  return figuresIn(answer)
    .filter(({ value, tol }) => {
      const v = Math.abs(value)
      return !pool.some((p) => Math.abs(p - v) <= tol + 1e-9)
    })
    .map((f) => f.text)
}
