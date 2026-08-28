import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANALYSIS_TICKET_MAX_CALLS,
  consumeAnalysisTicket,
  issueAnalysisTicket,
} from '../server/analysisTicket.js'

process.env.ANALYSIS_TOKEN_SECRET = 'test-only-ticket-secret-with-enough-entropy'
process.env.KV_REST_API_URL = 'https://kv.test'
process.env.KV_REST_API_TOKEN = 'test-kv-token'

const counters = new Map()
globalThis.fetch = async url => {
  const path = new URL(url).pathname
  const [, command, encodedKey, rawAmount] = path.split('/')
  const key = decodeURIComponent(encodedKey || '')
  if (command === 'incr') {
    const next = (counters.get(key) || 0) + 1
    counters.set(key, next)
    return Response.json({ result: next })
  }
  if (command === 'expire') return Response.json({ result: 1 })
  if (command === 'incrby') {
    const next = (counters.get(key) || 0) + Number(rawAmount || 0)
    counters.set(key, next)
    return Response.json({ result: next })
  }
  return new Response('unsupported', { status: 400 })
}

test('ticket is bound to its IP and rejects tampering', async () => {
  counters.clear()
  const ticket = await issueAnalysisTicket('203.0.113.10')
  assert.equal((await consumeAnalysisTicket(ticket, '203.0.113.10')).allowed, true)
  assert.equal((await consumeAnalysisTicket(ticket, '203.0.113.11')).code, 'ANALYSIS_TICKET_INVALID')

  const tampered = `${ticket.slice(0, -1)}${ticket.endsWith('a') ? 'b' : 'a'}`
  assert.equal((await consumeAnalysisTicket(tampered, '203.0.113.10')).code, 'ANALYSIS_TICKET_INVALID')
})

test('ticket enforces its persistent call budget', async () => {
  counters.clear()
  const ticket = await issueAnalysisTicket('198.51.100.8')
  for (let call = 0; call < ANALYSIS_TICKET_MAX_CALLS; call++) {
    assert.equal((await consumeAnalysisTicket(ticket, '198.51.100.8')).allowed, true)
  }
  const exhausted = await consumeAnalysisTicket(ticket, '198.51.100.8')
  assert.equal(exhausted.allowed, false)
  assert.equal(exhausted.code, 'ANALYSIS_TICKET_EXHAUSTED')
})

test('premium report ticket carries a smaller signed budget', async () => {
  counters.clear()
  const ticket = await issueAnalysisTicket('192.0.2.9', 'premium-report', 2)
  assert.equal((await consumeAnalysisTicket(ticket, '192.0.2.9')).tier, 'premium-report')
  assert.equal((await consumeAnalysisTicket(ticket, '192.0.2.9')).allowed, true)
  assert.equal((await consumeAnalysisTicket(ticket, '192.0.2.9')).code, 'ANALYSIS_TICKET_EXHAUSTED')
})
