// CSV import: validate rows, then upsert reps, accounts and deals for one workspace in one transaction.
// A close date that moved later than what we stored counts as one more date push. Every stage, close-date,
// value and status change is logged to deal_events by database triggers (migration 0005).

export const COLUMNS = {
  required: ['deal_id', 'deal_name', 'account', 'segment', 'rep', 'value', 'stage', 'status', 'created_at', 'expected_close_date', 'last_activity_date'],
  optional: ['closed_at', 'paid_at', 'date_pushes', 'stage_entered_at', 'team', 'payment_terms_days'],
}
const SEGMENTS = { smb: 'SMB', 'mid-market': 'Mid-Market', 'mid market': 'Mid-Market', midmarket: 'Mid-Market', mid: 'Mid-Market', enterprise: 'Enterprise' }
const STAGES = { qualify: 'Qualify', demo: 'Demo', proposal: 'Proposal', negotiation: 'Negotiation', closed: 'Closed' }
const STATUSES = new Set(['open', 'won', 'lost'])
const MAX_ROWS = 20_000

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x'
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** Returns { deals, errors }. Errors name the row (1-based, after the header) and the fix. */
export function validate(rows) {
  const errors = []
  if (!Array.isArray(rows) || !rows.length) return { deals: [], errors: ['The file has no data rows.'] }
  if (rows.length > MAX_ROWS) return { deals: [], errors: [`The file has ${rows.length} rows; the limit is ${MAX_ROWS}.`] }
  const seen = new Set()
  const deals = []
  rows.forEach((r, i) => {
    const at = `Row ${i + 2}`
    const get = (k) => String(r?.[k] ?? '').trim()
    const missing = COLUMNS.required.filter((k) => !get(k))
    if (missing.length) return errors.push(`${at}: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} empty.`)
    const id = get('deal_id')
    if (seen.has(id)) return errors.push(`${at}: deal_id ${id} appears twice. Each deal needs one row.`)
    seen.add(id)
    const segment = SEGMENTS[get('segment').toLowerCase()]
    const stage = STAGES[get('stage').toLowerCase()]
    const status = get('status').toLowerCase()
    const value = Number(get('value').replace(/[₹,\s]/g, ''))
    const dates = ['created_at', 'expected_close_date', 'last_activity_date', 'closed_at', 'paid_at', 'stage_entered_at']
    const bad = dates.filter((k) => get(k) && !isDate(get(k)))
    if (!segment) return errors.push(`${at}: segment "${get('segment')}" must be SMB, Mid-Market or Enterprise.`)
    if (!stage) return errors.push(`${at}: stage "${get('stage')}" must be Qualify, Demo, Proposal, Negotiation or Closed.`)
    if (!STATUSES.has(status)) return errors.push(`${at}: status "${get('status')}" must be open, won or lost.`)
    if (!(value > 0)) return errors.push(`${at}: value "${get('value')}" must be a number above 0.`)
    if (bad.length) return errors.push(`${at}: ${bad.join(', ')} must be dates like 2026-09-30.`)
    if (status !== 'open' && !get('closed_at')) return errors.push(`${at}: a ${status} deal needs closed_at.`)
    if (status === 'open' && stage === 'Closed') return errors.push(`${at}: an open deal cannot be at stage Closed.`)
    const pushes = get('date_pushes') ? Number(get('date_pushes')) : null
    if (pushes != null && !(Number.isInteger(pushes) && pushes >= 0)) return errors.push(`${at}: date_pushes must be a whole number.`)
    const terms = get('payment_terms_days') ? Number(get('payment_terms_days')) : null
    if (terms != null && !(Number.isInteger(terms) && terms >= 0 && terms <= 365)) return errors.push(`${at}: payment_terms_days must be a whole number of days from 0 to 365.`)
    const entered = get('stage_entered_at') || null
    if (entered && entered < get('created_at')) return errors.push(`${at}: stage_entered_at cannot be before created_at.`)
    deals.push({
      id: id.slice(0, 80), name: get('deal_name').slice(0, 120), account: get('account').slice(0, 120), segment,
      rep: get('rep').slice(0, 80), value, stage, status, created_at: get('created_at'),
      expected_close_date: get('expected_close_date'), last_activity_date: get('last_activity_date'),
      closed_at: get('closed_at') || null, paid_at: get('paid_at') || null, pushes,
      stage_entered_at: entered, team: get('team').slice(0, 80) || null, terms,
    })
  })
  return { deals, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`…and ${errors.length - 20} more.`] : []) }
}

/** First non-empty value of `key` per group, so one account's terms can come from any of its rows. */
const firstBy = (deals, group, key) => {
  const out = new Map()
  for (const d of deals) if (d[key] != null && !out.has(group(d))) out.set(group(d), d[key])
  return out
}

/**
 * Upserts one validated file. Returns counts; deals open in the database but absent from the file are left alone.
 * `today` is the business date stamped on the changes this file reveals (defaults to the database's today).
 */
export async function upsert(client, ws, deals, today = null) {
  await client.query(
    "select set_config('app.event_source', 'csv', true), set_config('app.event_date', coalesce($1::text, current_date::text), true)",
    [today],
  )

  const reps = [...new Map(deals.map((d) => [slug(d.rep), d.rep])).entries()]
  const teams = firstBy(deals, (d) => slug(d.rep), 'team')
  await client.query(
    `insert into salespeople (workspace_id, id, name, team) select $1, * from unnest($2::text[], $3::text[], $4::text[])
     on conflict (workspace_id, id) do update set name = excluded.name, team = coalesce(excluded.team, salespeople.team)`,
    [ws, reps.map((r) => 'rep-' + r[0]), reps.map((r) => r[1]), reps.map((r) => teams.get(r[0]) ?? null)],
  )

  // Accounts: terms are only overwritten when the file gives them; new accounts default to 30 days.
  const accounts = [...new Map(deals.map((d) => [slug(d.account), d])).entries()]
  const terms = firstBy(deals, (d) => slug(d.account), 'terms')
  await client.query(
    `insert into customers (workspace_id, id, name, segment, payment_terms_days)
     select $1, u.id, u.name, u.segment, coalesce(u.terms, 30)
       from unnest($2::text[], $3::text[], $4::text[], $5::int[]) as u(id, name, segment, terms)
     on conflict (workspace_id, id) do update set name = excluded.name, segment = excluded.segment`,
    [ws, accounts.map((a) => 'acc-' + a[0]), accounts.map((a) => a[1].account), accounts.map((a) => a[1].segment),
      accounts.map((a) => terms.get(a[0]) ?? null)],
  )
  if (terms.size)
    await client.query(
      `update customers c set payment_terms_days = u.terms from unnest($2::text[], $3::int[]) as u(id, terms)
        where c.workspace_id = $1 and c.id = u.id and c.payment_terms_days <> u.terms`,
      [ws, [...terms.keys()].map((k) => 'acc-' + k), [...terms.values()]],
    )

  const existing = new Map(
    (await client.query('select id, expected_close_date, push_count, status from deals where workspace_id = $1', [ws])).rows.map((r) => [r.id, r]),
  )
  const push = (d) => {
    const old = existing.get(d.id)
    if (d.pushes != null) return d.pushes
    if (!old) return 0
    return old.push_count + (d.expected_close_date > old.expected_close_date ? 1 : 0)
  }
  const params = (list) => {
    const col = (k) => list.map((d) => d[k])
    return [ws, col('id'), col('name'), list.map((d) => 'acc-' + slug(d.account)), list.map((d) => 'rep-' + slug(d.rep)),
      col('value'), col('stage'), col('status'), col('created_at'), col('expected_close_date'), col('last_activity_date'),
      list.map(push), col('closed_at'), col('paid_at'), col('stage_entered_at')]
  }
  const rows = `unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::text[],
                       $9::date[], $10::date[], $11::date[], $12::int[], $13::date[], $14::date[], $15::date[])
                as u(id, name, customer_id, salesperson_id, value, stage, status, created_at,
                     expected_close_date, last_activity_date, push_count, closed_at, paid_at, stage_entered_at)`

  // Insert and update separately (not insert-on-conflict): an update keeps the stored stage clock unless the
  // file sets one, and the database's stage trigger restarts it when the stage changes.
  const fresh = deals.filter((d) => !existing.has(d.id))
  const known = deals.filter((d) => existing.has(d.id))
  if (fresh.length)
    await client.query(
      `insert into deals (workspace_id, id, name, customer_id, salesperson_id, value, stage, status, created_at,
                          expected_close_date, last_activity_date, push_count, closed_at, paid_at, stage_entered_at)
       select $1, u.* from ${rows}`,
      params(fresh),
    )
  if (known.length)
    await client.query(
      `update deals d set name = u.name, customer_id = u.customer_id, salesperson_id = u.salesperson_id, value = u.value,
              stage = u.stage, status = u.status, created_at = u.created_at, expected_close_date = u.expected_close_date,
              last_activity_date = u.last_activity_date, push_count = u.push_count, closed_at = u.closed_at,
              paid_at = u.paid_at, stage_entered_at = coalesce(u.stage_entered_at, d.stage_entered_at)
         from ${rows}
        where d.workspace_id = $1 and d.id = u.id`,
      params(known),
    )
  const inFile = new Set(deals.map((d) => d.id))
  return {
    created: fresh.length,
    updated: known.length,
    missing: [...existing.values()].filter((r) => r.status === 'open' && !inFile.has(r.id)).length,
    closed: deals.filter((d) => d.status !== 'open').length,
  }
}
