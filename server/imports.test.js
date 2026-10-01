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

test('optional history columns: team, payment terms, stage clock', () => {
  const { deals, errors } = validate([row({ team: 'North', payment_terms_days: '45', stage_entered_at: '2026-09-01' }), row({ deal_id: 'D2' })])
  assert.deepEqual(errors, [])
  assert.equal(deals[0].team, 'North')
  assert.equal(deals[0].terms, 45)
  assert.equal(deals[0].stage_entered_at, '2026-09-01')
  assert.equal(deals[1].team, null)
  assert.equal(deals[1].terms, null)
  assert.equal(deals[1].stage_entered_at, null)
})

test('rejects bad terms and a stage entered before the deal existed', () => {
  const { errors } = validate([row({ payment_terms_days: '30.5' }), row({ deal_id: 'D2', stage_entered_at: '2026-07-01' })])
  assert.match(errors[0], /^Row 2: payment_terms_days must be a whole number/)
  assert.match(errors[1], /^Row 3: stage_entered_at cannot be before created_at/)
})
