// Aczen Nova connector. Nova is a read-only accounting API (GET only): clients, quotations, invoices,
// payments, employees, business units. We turn quotations into pipeline deals and use invoices and
// payments for real close and cash dates, then hand the rows to the same validation and import as a CSV.

const BASE = () => (process.env.NOVA_BASE_URL || 'https://www.aczen.in/nova-api/v1').replace(/\/$/, '')

export class NovaError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

async function getAll(resource, key) {
  const out = []
  for (let offset = 0; offset < 20_000; ) {
    const res = await fetch(`${BASE()}/${resource}?limit=100&offset=${offset}`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    }).catch((e) => {
      throw new NovaError(`Could not reach Aczen Nova (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`)
    })
    const body = await res.json().catch(() => null)
    if (res.status === 401) throw new NovaError('Aczen Nova rejected the API key. Check it starts with nova_sk_ and is still active.', 401)
    if (res.status === 429) throw new NovaError('Aczen Nova is rate-limiting this key. Try again in a minute.', 429)
    if (!res.ok) throw new NovaError(`Aczen Nova returned ${res.status} for ${resource}: ${body?.error?.message ?? 'no detail'}`)
    out.push(...(body?.data ?? []))
    if (!body?.pagination?.has_more) break
    offset += body.pagination.limit ?? 100
  }
  return out
}

const SEGMENT = { smb: 'SMB', mid_market: 'Mid-Market', 'mid-market': 'Mid-Market', enterprise: 'Enterprise' }
// quotation status -> our status and the stage the quote was at before its outcome.
// Every closed quote was "sent" (Proposal) until it was decided; giving won and lost quotes different
// stages would leak the outcome into a feature and teach the model that stage = result.
const STATUS = {
  draft: ['open', 'Qualify'], sent: ['open', 'Proposal'],
  accepted: ['won', 'Proposal'], converted: ['won', 'Proposal'],
  rejected: ['lost', 'Proposal'], expired: ['lost', 'Proposal'],
}
const day = (s) => (s ? String(s).slice(0, 10) : '')
const minDay = (a, b) => (a && b ? (a < b ? a : b) : a || b)

/** Pure: Nova records -> rows in our import schema, plus what was skipped and why. */
export function toRows({ clients, quotations, invoices, payments, employees, units }, today = new Date().toISOString().slice(0, 10)) {
  const client = new Map(clients.map((c) => [c.id, c]))
  const unit = new Map(units.map((u) => [u.id, u.name]))
  const person = new Map(employees.map((e) => [e.id, e]))
  const invoice = new Map(invoices.map((i) => [i.id, i]))
  const lastPaid = new Map()
  for (const p of payments)
    for (const a of p.allocations?.length ? p.allocations : [{ invoice_id: p.invoice_id }]) {
      const d = day(p.payment_date)
      if (a.invoice_id && d > (lastPaid.get(a.invoice_id) ?? '')) lastPaid.set(a.invoice_id, d)
    }

  const rows = []
  const skipped = {}
  const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
  for (const q of quotations) {
    const map = STATUS[q.status]
    const c = client.get(q.client_id)
    const rep = person.get(q.sales_rep_id)
    if (!map) { skip(`unknown status "${q.status}"`); continue }
    if (!c) { skip('client not found'); continue }
    if (!(q.amount > 0)) { skip('no amount'); continue }
    const [status, stage] = map
    const created = day(q.quotation_date || q.created_at)
    const inv = q.converted_invoice_id ? invoice.get(q.converted_invoice_id) : null
    // close date: the invoice for converted quotes; otherwise the quote's expiry (never in the future)
    const closed = status === 'open' ? '' : day(inv?.invoice_date) || minDay(day(q.valid_until), today)
    const paid = inv && (inv.status === 'paid' || inv.balance_due === 0) ? lastPaid.get(inv.id) ?? '' : ''
    rows.push({
      deal_id: q.id,
      deal_name: `${q.client_name ?? c.name} · ${q.quotation_number ?? q.id}`,
      account: c.name,
      segment: SEGMENT[String(c.segment).toLowerCase()] ?? 'SMB',
      rep: rep?.name ?? 'Unassigned',
      team: rep ? unit.get(rep.business_unit_id) ?? '' : '',
      value: String(q.amount), // before GST: the revenue, not the tax
      stage,
      status,
      created_at: created,
      expected_close_date: day(q.valid_until) || created,
      // ponytail: Nova has no activity log, so the quote date stands in for last activity
      last_activity_date: created,
      closed_at: closed && closed < created ? created : closed,
      paid_at: paid,
      payment_terms_days: c.payment_terms_days != null ? String(c.payment_terms_days) : '',
      date_pushes: '',
    })
  }
  return { rows, skipped }
}

/** Pulls everything the import needs from Nova. Read-only. */
export async function fetchNova(key) {
  const [clients, quotations, invoices, payments, employees, units] = await Promise.all(
    ['clients', 'quotations', 'invoices', 'payments', 'employees', 'business-units'].map((r) => getAll(r, key)),
  )
  return { clients, quotations, invoices, payments, employees, units }
}
