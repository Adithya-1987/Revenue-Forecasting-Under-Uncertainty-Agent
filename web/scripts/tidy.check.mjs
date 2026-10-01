// npm run check : built-in CSV tidy rules (dates, Indian amounts, CRM labels)
import assert from 'node:assert/strict'
import { toISO, detectDateFormat, parseAmount, autoFix, problems, applyFixups } from '../src/tidy.ts'
assert.equal(toISO('12/03/2026', 'DD/MM/YYYY'), '2026-03-12')
assert.equal(toISO('03/12/2026', 'MM/DD/YYYY'), '2026-03-12')
assert.equal(toISO('31/02/2026', 'DD/MM/YYYY'), undefined)
assert.equal(toISO('12 Mar 2026', 'DD MMM YYYY'), '2026-03-12')
assert.equal(toISO('Mar 12, 2026', 'MMM DD, YYYY'), '2026-03-12')
assert.deepEqual(detectDateFormat(['25/03/2026', '01/04/2026']), { format: 'DD/MM/YYYY', ambiguous: false })
assert.equal(detectDateFormat(['01/04/2026']).ambiguous, true)
assert.equal(parseAmount('2.5 Cr'), 25e6); assert.equal(parseAmount('₹5,00,000'), 5e5); assert.ok(Number.isNaN(parseAmount('abc')))
const H = ['id', 'Stage', 'Tier', 'Created', 'Amount']
const R = [['1', 'Proposal Sent', 'Mid', '25/03/2026', '5 L'], ['2', 'Closed Won', 'Ent', '01/04/2026', '2.5 Cr'], ['3', 'Weird Stage', 'Gold', '02/04/2026', '1k']]
const fx = autoFix(H, R, { deal_id: 'id', stage: 'Stage', segment: 'Tier', created_at: 'Created', value: 'Amount' })
assert.equal(fx.map.status, 'Stage')
assert.deepEqual(fx.values.status, { 'Proposal Sent': 'open', 'Closed Won': 'won' })
const p = problems(H, R, fx)
assert.deepEqual(p.unmatched.stage, ['Weird Stage']); assert.deepEqual(p.unmatched.segment, ['Gold']); assert.equal(p.badAmounts, 0)
const rows = applyFixups(H, R, fx)
assert.deepEqual([rows[1].stage, rows[1].status, rows[1].segment, rows[1].created_at, rows[1].value], ['Closed', 'won', 'Enterprise', '2026-04-01', '25000000'])
console.log('tidy ok')
