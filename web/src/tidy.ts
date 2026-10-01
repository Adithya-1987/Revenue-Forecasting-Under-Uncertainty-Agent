// Built-in tidy-up for CRM exports: runs before (and without) any AI. It maps labels, reads dates in the
// file's own format, and reads Indian amounts. The AI only fills in what these rules could not.
import type { Column } from './csv'

export const CANON = {
  segment: ['SMB', 'Mid-Market', 'Enterprise'],
  stage: ['Qualify', 'Demo', 'Proposal', 'Negotiation', 'Closed'],
  status: ['open', 'won', 'lost'],
} as const
export type Kind = keyof typeof CANON
export const KINDS: Kind[] = ['segment', 'stage', 'status']

export const DATE_COLS = ['created_at', 'expected_close_date', 'last_activity_date', 'closed_at', 'paid_at'] as const
export type DateCol = (typeof DATE_COLS)[number]
export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'DD MMM YYYY', 'MMM DD, YYYY'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const key = (s: string) => s.trim().toLowerCase().replace(/[\s_\-/]+/g, ' ')

// Common CRM wording -> ours. Anything not here is left for the person (or the AI) to match.
const KNOWN: Record<Kind, Record<string, string>> = {
  segment: {
    smb: 'SMB', small: 'SMB', 'small business': 'SMB', sme: 'SMB', startup: 'SMB',
    'mid market': 'Mid-Market', midmarket: 'Mid-Market', mid: 'Mid-Market', 'mid size': 'Mid-Market', mm: 'Mid-Market', 'commercial': 'Mid-Market',
    enterprise: 'Enterprise', ent: 'Enterprise', large: 'Enterprise', 'large enterprise': 'Enterprise', strategic: 'Enterprise',
  },
  stage: {
    qualify: 'Qualify', qualified: 'Qualify', qualification: 'Qualify', discovery: 'Qualify', lead: 'Qualify', prospecting: 'Qualify',
    demo: 'Demo', 'demo scheduled': 'Demo', 'demo done': 'Demo', presentation: 'Demo', evaluation: 'Demo',
    proposal: 'Proposal', 'proposal sent': 'Proposal', quote: 'Proposal', 'quote sent': 'Proposal', 'proposal price quote': 'Proposal',
    negotiation: 'Negotiation', 'negotiation review': 'Negotiation', contract: 'Negotiation', 'contract sent': 'Negotiation', commit: 'Negotiation',
    closed: 'Closed', 'closed won': 'Closed', 'closed lost': 'Closed', won: 'Closed', lost: 'Closed',
  },
  status: {
    open: 'open', active: 'open', 'in progress': 'open', pipeline: 'open',
    won: 'won', 'closed won': 'won', win: 'won', lost: 'lost', 'closed lost': 'lost', loss: 'lost', dead: 'lost',
  },
}

/** Canonical value for a raw label, from the exact allowed spellings or the known wording. */
export function knownValue(kind: Kind, raw: string): string | undefined {
  const exact = (CANON[kind] as readonly string[]).find((c) => c.toLowerCase() === raw.trim().toLowerCase())
  return exact ?? KNOWN[kind][key(raw)]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "12/03/2026" in DD/MM/YYYY -> "2026-03-12"; undefined when the text does not fit the format. */
export function toISO(raw: string, fmt: DateFormat): string | undefined {
  const s = raw.trim()
  let y: number, m: number, d: number
  let g: RegExpMatchArray | null
  if (fmt === 'YYYY-MM-DD') {
    if (!(g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return
    ;[y, m, d] = [+g[1], +g[2], +g[3]]
  } else if (fmt === 'DD MMM YYYY' || fmt === 'MMM DD, YYYY') {
    g = fmt === 'DD MMM YYYY' ? s.match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i) : s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i)
    if (!g) return
    const [day, mon] = fmt === 'DD MMM YYYY' ? [g[1], g[2]] : [g[2], g[1]]
    ;[y, m, d] = [+g[3], MONTHS.indexOf(mon.toLowerCase()) + 1, +day]
  } else {
    const sep = fmt[2]
    const parts = s.split(sep)
    if (parts.length !== 3 || !/^\d{4}$/.test(parts[2])) return
    ;[y, m, d] = fmt.startsWith('MM') ? [+parts[2], +parts[0], +parts[1]] : [+parts[2], +parts[1], +parts[0]]
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (!m || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return
  return `${y}-${pad(m)}-${pad(d)}`
}

/** The format that reads every sample; DD before MM when both fit (Indian files), and `ambiguous` says so. */
export function detectDateFormat(values: string[]): { format?: DateFormat; ambiguous: boolean } {
  const vs = values.filter((v) => v.trim())
  if (!vs.length) return { format: 'YYYY-MM-DD', ambiguous: false }
  const fits = DATE_FORMATS.filter((f) => vs.every((v) => toISO(v, f)))
  return { format: fits[0], ambiguous: fits.includes('DD/MM/YYYY') && fits.includes('MM/DD/YYYY') }
}

const UNITS: Record<string, number> = { k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, m: 1e6, mn: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 }
/** "₹5,00,000", "5 L", "2.5 Cr", "500k" -> rupees; NaN when it is not an amount. Mirrors the server. */
export function parseAmount(raw: string): number {
  const m = raw.trim().toLowerCase().replace(/^(₹|rs\.?|inr)\s*/, '').replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/)
  if (!m) return NaN
  const unit = m[2] ? UNITS[m[2]] : 1
  return unit ? Number(m[1]) * unit : NaN
}

export interface Fixups {
  map: Partial<Record<Column, string>>
  values: Record<Kind, Record<string, string>>
  dates: Partial<Record<DateCol, DateFormat>>
  /** which suggestions came from the AI, so the review can label them */
  suggested: Set<string>
}

/** Distinct raw values of a mapped column. */
export const distinct = (headers: string[], rows: string[][], header?: string) => {
  const i = header ? headers.indexOf(header) : -1
  return i < 0 ? [] : [...new Set(rows.map((r) => (r[i] ?? '').trim()).filter(Boolean))]
}

/** Built-in pass: fill every value and date format the rules can decide. */
export function autoFix(headers: string[], rows: string[][], mapIn: Fixups['map']): Fixups {
  const map = { ...mapIn }
  // many CRMs have no status column: "Closed Won" / "Closed Lost" live in the stage column
  const stageVals = distinct(headers, rows, map.stage)
  if (!map.status && stageVals.some((v) => /won|lost/i.test(v))) map.status = map.stage
  const values = { segment: {}, stage: {}, status: {} } as Fixups['values']
  for (const kind of KINDS)
    for (const raw of distinct(headers, rows, map[kind])) {
      const v = knownValue(kind, raw) ?? (kind === 'status' && map.status === map.stage && knownValue('stage', raw) ? 'open' : undefined)
      if (v) values[kind][raw] = v
    }
  const dates: Fixups['dates'] = {}
  for (const col of DATE_COLS) {
    const f = detectDateFormat(distinct(headers, rows, map[col]).slice(0, 200)).format
    if (map[col] && f) dates[col] = f
  }
  return { map, values, dates, suggested: new Set() }
}

export interface Problems {
  unmatched: Record<Kind, string[]>
  badDates: Partial<Record<DateCol, number>>
  badAmounts: number
  total: number
}

export function problems(headers: string[], rows: string[][], fx: Fixups): Problems {
  const unmatched = { segment: [], stage: [], status: [] } as Problems['unmatched']
  for (const kind of KINDS) unmatched[kind] = distinct(headers, rows, fx.map[kind]).filter((raw) => !fx.values[kind][raw])
  const badDates: Problems['badDates'] = {}
  for (const col of DATE_COLS) {
    const fmt = fx.dates[col]
    const vals = distinct(headers, rows, fx.map[col])
    const bad = fmt ? vals.filter((v) => !toISO(v, fmt)).length : vals.length
    if (bad) badDates[col] = bad
  }
  const vi = fx.map.value ? headers.indexOf(fx.map.value) : -1
  const badAmounts = vi < 0 ? 0 : rows.filter((r) => !(parseAmount(r[vi] ?? '') > 0)).length
  const total = KINDS.reduce((n, k) => n + unmatched[k].length, 0) + Object.values(badDates).reduce((n, v) => n + (v ?? 0), 0) + badAmounts
  return { unmatched, badDates, badAmounts, total }
}

/** Rows in our schema, ready for the server's own validation. */
export function applyFixups(headers: string[], rows: string[][], fx: Fixups): Record<string, string>[] {
  const idx = Object.fromEntries(Object.entries(fx.map).map(([c, h]) => [c, h ? headers.indexOf(h) : -1]))
  return rows.map((r) => {
    const get = (c: string) => (idx[c] >= 0 ? (r[idx[c]] ?? '').trim() : '')
    const out: Record<string, string> = {}
    for (const c of Object.keys(idx)) out[c] = get(c)
    for (const kind of KINDS) if (out[kind]) out[kind] = fx.values[kind][out[kind]] ?? out[kind]
    for (const col of DATE_COLS) if (out[col] && fx.dates[col]) out[col] = toISO(out[col], fx.dates[col]!) ?? out[col]
    if (out.value) {
      const n = parseAmount(out.value)
      if (n > 0) out.value = String(n)
    }
    return out
  })
}
