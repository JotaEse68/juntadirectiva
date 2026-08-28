import test from 'node:test'
import assert from 'node:assert/strict'

import { verifyStripeSignature } from '../api/stripe-webhook.js'

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function signature(body, timestamp, secret) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`))))
}

test('Stripe webhook signature uses the untouched request body', async () => {
  const body = '{"id":"evt_test","type":"checkout.session.completed"}'
  const timestamp = Math.floor(Date.now() / 1000)
  const secret = 'whsec_test_secret'
  const value = await signature(body, timestamp, secret)
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${value}`, secret), true)
  assert.equal(await verifyStripeSignature(`${body} `, `t=${timestamp},v1=${value}`, secret), false)
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=bad`, secret), false)
})

test('Stripe webhook signature rejects stale events', async () => {
  const body = '{}'
  const timestamp = Math.floor(Date.now() / 1000) - 600
  const secret = 'whsec_test_secret'
  const value = await signature(body, timestamp, secret)
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${value}`, secret), false)
})

