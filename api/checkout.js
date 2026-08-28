// Edge Function: crea una Stripe Checkout Session para el informe completo (pago único o pack de 3).
// Llama directo a la API REST de Stripe con fetch — sin SDK, igual que el resto de api/*.js.
export const config = { runtime: 'edge' }

import { authErrorResponse, requireUser } from '../server/supabase.js'

const PRICES = {
  single: 'price_1U3B1eFNpWfaUovUQrzZfQAn', // Informe completo — 4,99 €
  bundle: 'price_1U3B48FNpWfaUovU5Mhdvviq', // Pack 3 informes — 9,99 €
  extra:  'price_1U3ElUFNpWfaUovUJgskIEqi', // Análisis extra (+3 ese día) — 2,99 €
}

function cors(origin = '') {
  const allowed = ['https://juntadirectiva.iapacks.com', 'https://juntadirectiva.vercel.app']
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

export default async function handler(req) {
  const c = cors(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return new Response(JSON.stringify({ error: 'Stripe no configurado' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })

  const auth = await requireUser(req)
  if (!auth.user) return authErrorResponse(auth.error, c)

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const { product } = body
  const priceId = PRICES[product]
  if (!priceId) return new Response(JSON.stringify({ error: 'Producto no válido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  const requestedOrigin = req.headers.get('origin') || ''
  const allowedOrigins = ['https://juntadirectiva.iapacks.com', 'https://juntadirectiva.vercel.app']
  const origin = process.env.APP_URL || (allowedOrigins.includes(requestedOrigin) ? requestedOrigin : allowedOrigins[0])
  const params = new URLSearchParams({
    'mode': 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${origin}/?checkout_session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${origin}/?checkout_canceled=1`,
    'metadata[product]': product,
    'metadata[user_id]': auth.user.id,
    'client_reference_id': auth.user.id,
    'customer_email': auth.user.email,
  })

  let stripeRes
  try {
    stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Error conectando con Stripe' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const data = await stripeRes.json()
  if (!stripeRes.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Error creando la sesión de pago' }), { status: stripeRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ url: data.url }), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
}
