/** Minimal RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '') // Excel's byte-order mark
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field), rows.push(row), (row = []), (field = '')
    } else field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  return rows.filter((r) => r.some((f) => f.trim()))
}

export const REQUIRED = ['deal_id', 'deal_name', 'account', 'segment', 'rep', 'value', 'stage', 'status', 'created_at', 'expected_close_date', 'last_activity_date'] as const
export const OPTIONAL = ['closed_at', 'paid_at', 'date_pushes', 'team', 'payment_terms_days'] as const
export type Column = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number]

// Common CRM export headings -> our columns. Anything else can be mapped by hand on the Data page.
const ALIASES: Record<string, Column> = {
  id: 'deal_id', opp_id: 'deal_id', opportunity_id: 'deal_id', record_id: 'deal_id', deal_number: 'deal_id',
  deal: 'deal_name', name: 'deal_name', opportunity: 'deal_name', opportunity_name: 'deal_name',
  company: 'account', customer: 'account', account_name: 'account', company_name: 'account', client: 'account',
  owner: 'rep', sales_rep: 'rep', salesperson: 'rep', deal_owner: 'rep', opportunity_owner: 'rep', account_owner: 'rep', assigned_to: 'rep',
  tier: 'segment', customer_segment: 'segment', company_size: 'segment', size: 'segment',
  amount: 'value', deal_value: 'value', deal_stage: 'stage', created: 'created_at', create_date: 'created_at',
  close_date: 'expected_close_date', expected_close: 'expected_close_date', expected_close_date: 'expected_close_date',
  last_activity: 'last_activity_date', last_touch: 'last_activity_date', last_contacted: 'last_activity_date', last_modified: 'last_activity_date',
  status: 'status', outcome: 'status', won_lost: 'status', created_date: 'created_at', date_created: 'created_at',
  closed_date: 'closed_at', paid_date: 'paid_at', pushes: 'date_pushes',
  sales_team: 'team', region: 'team', terms: 'payment_terms_days', payment_terms: 'payment_terms_days', credit_days: 'payment_terms_days',
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/** Best guess of which file heading feeds each column. */
export function guessMapping(headers: string[]): Partial<Record<Column, string>> {
  const out: Partial<Record<Column, string>> = {}
  for (const h of headers) {
    const n = norm(h)
    const col = ([...REQUIRED, ...OPTIONAL] as string[]).includes(n) ? (n as Column) : ALIASES[n]
    if (col && !out[col]) out[col] = h
  }
  return out
}

export function applyMapping(headers: string[], rows: string[][], map: Partial<Record<Column, string>>) {
  const index = Object.fromEntries(Object.entries(map).map(([col, h]) => [col, headers.indexOf(h as string)]))
  return rows.map((r) => Object.fromEntries(Object.entries(index).map(([col, i]) => [col, i >= 0 ? (r[i] ?? '').trim() : ''])))
}

const TEMPLATE = [
  [...REQUIRED, ...OPTIONAL].join(','),
  'D-1001,Acme renewal,Acme Corp,Enterprise,Raj Sharma,500000,Proposal,open,2026-07-02,2026-10-20,2026-09-24,,,1,North,60',
  'D-1002,Globex pilot,Globex,Mid-Market,Meera Iyer,300000,Demo,open,2026-08-11,2026-11-05,2026-09-28,,,0,North,45',
  'D-0877,Initech expansion,Initech,SMB,Priya Nair,120000,Negotiation,won,2026-03-04,2026-05-01,2026-05-10,2026-05-18,2026-07-02,,North,30',
  'D-0870,Hooli trial,Hooli,SMB,Arjun Rao,90000,Demo,lost,2026-02-10,2026-04-01,2026-03-20,2026-04-12,,,South,30',
].join('\n')

export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE + '\n'], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'rangefinder-pipeline-template.csv' })
  a.click()
  URL.revokeObjectURL(url)
}
