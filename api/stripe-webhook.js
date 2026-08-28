export const config = { runtime: 'edge' }

import { callRpc } from '../server/supabase.js'

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

export async function verifyStripeSignature(rawBody, header, secret) {
  const fields = Object.fromEntries(header.split(',').map(part => part.split('=', 2)))
  const timestamp = Number(fields.t)
  const signatures = header.split(',').filter(part => part.startsWith('v1=')).map(part => part.slice(3))
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`))))
  return signatures.some(signature => safeEqual(signature, expected))
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })

  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature') || ''
  if (!(await verifyStripeSignature(rawBody, signature, secret))) {
    return new Response('Invalid signature', { status: 400 })
  }

  let event
  try { event = JSON.parse(rawBody) } catch { return new Response('Invalid JSON', { status: 400 }) }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return Response.json({ received: true })
  }

  const session = event.data?.object
  const userId = session?.client_reference_id
  const product = session?.metadata?.product
  if (session?.payment_status !== 'paid' || session?.metadata?.user_id !== userId || !/^[0-9a-f-]{36}$/i.test(userId || '')) {
    return new Response('Invalid checkout session', { status: 400 })
  }

  try {
    const result = await callRpc('grant_stripe_purchase', {
      p_user_id: userId,
      p_session_id: session.id,
      p_event_id: event.id,
      p_product: product,
    })
    return Response.json({ received: true, granted: Boolean(result?.granted) })
  } catch (error) {
    console.error('Stripe webhook grant error:', error)
    return new Response('Could not credit purchase', { status: 500 })
  }
}
