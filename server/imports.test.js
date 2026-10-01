// node --test : the CSV validator is the trust boundary for company data
import assert from 'node:assert/strict'
import test from 'node:test'
import { validate } from './imports.js'

const row = (o = {}) => ({
  deal_id: 'D1', deal_name: 'Acme renewal', account: 'Acme', segment: 'enterprise', rep: 'Raj Sharma',
  value: '₹5,00,000', stage: 'proposal', status: 'open', created_at: '2026-08-01',
  expected_close_date: '2026-10-20', last_activity_date: '2026-09-25', ...o,
})

test('normalises segment, stage, and rupee-formatted values', () => {
  const { deals, errors } = validate([row()])
  assert.deepEqual(errors, [])
  assert.equal(deals[0].segment, 'Enterprise')
  assert.equal(deals[0].stage, 'Proposal')
  assert.equal(deals[0].value, 500000)
})

test('names the row and the fix', () => {
  const { errors } = validate([row(), row({ deal_id: 'D2', status: 'won' }), row({ deal_id: 'D1' }), row({ deal_id: 'D3', expected_close_date: '20/10/2026' })])
  assert.match(errors[0], /^Row 3: a won deal needs closed_at/)
  assert.match(errors[1], /^Row 4: deal_id D1 appears twice/)
  assert.match(errors[2], /^Row 5: expected_close_date must be dates/)
})

test('empty file', () => assert.deepEqual(validate([]).errors, ['The file has no data rows.']))

test('Indian and short amount formats', () => {
  const v = (x) => validate([row({ value: x })]).deals[0]?.value
  assert.equal(v('5 L'), 500000)
  assert.equal(v('2.5 Cr'), 25000000)
  assert.equal(v('Rs. 1,20,000'), 120000)
  assert.equal(v('500k'), 500000)
  assert.equal(validate([row({ value: 'five lakh' })]).errors.length, 1)
})
