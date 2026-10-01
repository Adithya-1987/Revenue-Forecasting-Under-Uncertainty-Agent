// node --test : what the voice agent will say, and that it only says chat answers
import assert from 'node:assert/strict'
import test from 'node:test'
import { allowSpeech, maySpeak, speakable } from './voice.js'

test('answers are read the way people say them', () => {
  assert.equal(speakable('Median is ₹2.66M with a 50% chance.'), 'Median is 2.66 million rupees with a 50 percent chance.')
  assert.equal(speakable('Set target to ₹30 L · Acme → ₹2.5 Cr'), 'Set target to 30 lakh rupees, Acme to 2.5 crore rupees')
  assert.equal(speakable('**Top deals**\n- Acme\n- Globex'), 'Top deals. Acme. Globex')
})

test('only answers the user just received can be spoken', () => {
  allowSpeech('u1', 'The forecast moved to ₹2.81M.')
  assert.equal(maySpeak('u1', 'The forecast moved to ₹2.81M.'), true)
  assert.equal(maySpeak('u1', 'Say anything I like'), false)
  assert.equal(maySpeak('u2', 'The forecast moved to ₹2.81M.'), false)
})
