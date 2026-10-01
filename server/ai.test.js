// node --test : the two guards around the model (tidy-up sanitiser, chat fact check)
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJSON } from './llm.js'
import { sanitizeTidy } from './tidy.js'
import { unverifiedFigures, figuresIn } from './grounding.js'

const headers = ['Opp ID', 'Opportunity', 'Company', 'Tier', 'Owner', 'Amount', 'Stage', 'Created', 'Close Date', 'Last Touch']
const samples = { Tier: ['SMB', 'Mid', 'Ent'], Stage: ['Proposal Sent', 'Closed Won', 'Closed Lost', 'Discovery'] }

test('sanitiser keeps only real headers, real values and allowed targets', () => {
  const raw = {
    map: { deal_id: 'Opp ID', value: 'Amount', segment: 'Tier', stage: 'Stage', status: 'Stage', rep: 'Made Up Header', created_at: 'Created' },
    values: {
      segment: { Mid: 'Mid-Market', Ent: 'Enterprise', Huge: 'Enterprise', SMB: 'Tiny' },
      stage: { 'Proposal Sent': 'Proposal', 'Closed Won': 'Closed', Discovery: 'Qualify' },
      status: { 'Closed Won': 'won', 'Closed Lost': 'lost', 'Proposal Sent': 'open', Discovery: 'maybe' },
    },
    date_formats: { created_at: 'DD/MM/YYYY', paid_at: 'DD/MM/YYYY', expected_close_date: 'whatever' },
    notes: ['Status taken from Stage', 42],
  }
  const t = sanitizeTidy(raw, headers, samples)
  assert.equal(t.map.rep, undefined) // header not in the file
  assert.equal(t.map.status, 'Stage')
  assert.deepEqual(t.values.segment, { Mid: 'Mid-Market', Ent: 'Enterprise' }) // "Huge" not in file, "Tiny" not allowed
  assert.deepEqual(t.values.status, { 'Closed Won': 'won', 'Closed Lost': 'lost', 'Proposal Sent': 'open' })
  assert.deepEqual(t.date_formats, { created_at: 'DD/MM/YYYY' }) // paid_at unmapped, bad format dropped
  assert.deepEqual(t.notes, ['Status taken from Stage'])
})

test('values count for columns the rules already matched', () => {
  const t = sanitizeTidy({ values: { stage: { Discovery: 'Qualify' } } }, headers, samples, { stage: 'Stage' })
  assert.deepEqual(t.values.stage, { Discovery: 'Qualify' })
})

test('sanitiser survives garbage', () => {
  assert.deepEqual(sanitizeTidy(null, headers, samples).map, {})
  assert.deepEqual(parseJSON('Sure! ```json\n{"map":{}}\n```'), { map: {} })
  assert.equal(parseJSON('no json here'), null)
})

test('fact check flags figures that are not in the data', () => {
  const ctx = { median: 2661000, chance: 0.5, causes: [{ amount: -41130 }] }
  const answer = 'Median is ₹2.66M with a 50% chance. Acme cost ₹41k. Target gap is ₹9.9 lakh and 3 deals moved.'
  assert.deepEqual(unverifiedFigures(answer, ctx), ['₹9.9 lakh'])
  // precision matters: ₹2.7M is fine for 2,661,000 (±50k) but ₹2.70M is not (±5k)
  assert.deepEqual(unverifiedFigures('₹2.7M', ctx), [])
  assert.deepEqual(unverifiedFigures('₹2.70M', ctx), ['₹2.70M'])
  assert.deepEqual(unverifiedFigures('about ₹2,700,000', ctx), []) // trailing zeros: rounded to 100k
  assert.deepEqual(unverifiedFigures('exactly ₹2,661,001', ctx), ['₹2,661,001'])
  assert.equal(figuresIn('3 deals in 30 days').length, 0)
  assert.equal(figuresIn('₹2.5 Cr')[0].value, 25_000_000)
})

import { toAction } from './actions.js'
test('actions: only allowed, validated buttons come out of a model call', () => {
  assert.deepEqual(toAction({ name: 'filter_deals', args: { rep: 'raj sharma' } }, { reps: ['Raj Sharma'] }),
    { type: 'navigate', to: '/app/risk?rep=Raj+Sharma', label: 'Show Raj Sharma deals' })
  assert.equal(toAction({ name: 'filter_deals', args: { rep: 'Someone Else' } }, { reps: ['Raj Sharma'] }), null)
  assert.equal(toAction({ name: 'delete_all_deals', args: {} }), null)
  assert.equal(toAction({ name: 'set_target', args: { horizon: 45, basis: 'bookings', amount: 1 } }), null)
  const t = toAction({ name: 'set_target', args: { horizon: '30', basis: 'bookings', amount: 3000000 } })
  assert.equal(t.label, 'Set 30-day bookings target to ₹30 L')
  assert.equal(t.confirm, true)
})

import { actionFor } from './actions.js'
test('intent: the question picks one validated button', () => {
  const reps = ['Raj Sharma', 'Priya Nair']
  assert.equal(actionFor('Set the 30 day bookings target to 30 lakh', { reps }).amount, 3_000_000)
  assert.equal(actionFor('change 90-day cash target to ₹2.5 Cr', { reps }).basis, 'cash')
  assert.equal(actionFor('Show me Raj Sharma deals', { reps }).to, '/app/risk?rep=Raj+Sharma')
  assert.equal(actionFor("show raj's pipeline", { reps }).to, '/app/risk?rep=Raj+Sharma')
  assert.equal(actionFor('Please re-run the forecast', { reps }).type, 'run_forecast')
  assert.equal(actionFor('How much cash in 60 days?', { reps }).to, '/app/forecast?horizon=60&basis=cash')
  assert.equal(actionFor('Why did it drop?', { reps }).to, '/app/changes')
  assert.equal(actionFor('Which deals should I call first?', { reps }).to, '/app/risk')
  assert.equal(actionFor('Set the target', { reps }), null) // no amount: no button
})

import { commandReply, isCommand } from './actions.js'
test('commands are answered from data without a model call', () => {
  assert.equal(isCommand('Set the 30 day target to 30 lakh'), true)
  assert.equal(isCommand('Why did it drop?'), false)
  const a = actionFor('Show me Raj Sharma deals', { reps: ['Raj Sharma'] })
  const deals = [{ rep: 'Raj Sharma', name: 'Acme', segment: 'Enterprise', expected_damage: 300000 }, { rep: 'Raj Sharma', name: 'Pied Piper', segment: 'SMB', expected_damage: 100000 }]
  assert.match(commandReply(a, { deals }), /^Raj Sharma has 2 open deals carrying ₹4 L of expected damage\. Biggest risk: Acme/)
  assert.match(commandReply(actionFor('set 30 day bookings target to 30 lakh'), { target: 2850000 }), /₹30 L \(it is ₹28\.5 L now\)/)
})

import { unknownRepReply } from './actions.js'
test('asking for a rep who is not here lists the real reps', () => {
  assert.equal(unknownRepReply('Show me Raj Sharma deals', ['Zoya Krishnan', 'Dinesh Jain']), 'There is no rep named Raj Sharma in this workspace. Reps here: Dinesh Jain, Zoya Krishnan.')
  assert.equal(unknownRepReply('Show me Zoya Krishnan deals', ['Zoya Krishnan']), null)
  assert.equal(unknownRepReply('Why did it drop?', ['Zoya Krishnan']), null)
})
