// node --test : Nova records -> import rows (no network)
import assert from 'node:assert/strict'
import test from 'node:test'
import { toRows } from './nova.js'
import { validate } from './imports.js'

const nova = {
  clients: [{ id: 'c1', name: 'Padma Exports', segment: 'mid_market', payment_terms_days: 45 }],
  employees: [{ id: 'e1', name: 'Asha Rao', business_unit_id: 'b1' }],
  units: [{ id: 'b1', name: 'Hyderabad' }],
  invoices: [{ id: 'i1', invoice_date: '2026-05-10', status: 'paid', balance_due: 0 }],
  payments: [{ invoice_id: 'i1', payment_date: '2026-06-20', allocations: [{ invoice_id: 'i1', amount: 1 }] }],
  quotations: [
    { id: 'q1', quotation_number: 'QT-1', client_id: 'c1', sales_rep_id: 'e1', amount: 500000, status: 'converted', quotation_date: '2026-04-01', valid_until: '2026-05-01', converted_invoice_id: 'i1' },
    { id: 'q2', quotation_number: 'QT-2', client_id: 'c1', sales_rep_id: 'e1', amount: 90000, status: 'rejected', quotation_date: '2026-04-05', valid_until: '2026-05-05' },
    { id: 'q3', quotation_number: 'QT-3', client_id: 'c1', sales_rep_id: 'e1', amount: 120000, status: 'sent', quotation_date: '2026-09-20', valid_until: '2026-10-20' },
    { id: 'q4', quotation_number: 'QT-4', client_id: 'nope', amount: 1, status: 'sent' },
  ],
}

test('quotes become deals with real close, payment and terms; outcome never leaks into stage', () => {
  const { rows, skipped } = toRows(nova, '2026-10-01')
  assert.deepEqual(skipped, { 'client not found': 1 })
  const [won, lost, open] = rows
  assert.equal(won.status, 'won')
  assert.equal(won.closed_at, '2026-05-10') // invoice date
  assert.equal(won.paid_at, '2026-06-20') // last payment on that invoice
  assert.equal(lost.closed_at, '2026-05-05') // expiry
  assert.equal(won.stage, lost.stage) // both were "sent" until decided
  assert.equal(open.status, 'open')
  assert.equal(won.segment, 'Mid-Market')
  assert.equal(won.team, 'Hyderabad')
  assert.equal(won.payment_terms_days, '45')
  assert.deepEqual(validate(rows).errors, [])
})
