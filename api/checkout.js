// Edge Function: crea una Stripe Checkout Session para el informe completo (pago único o pack de 3).
// Llama directo a la API REST de Stripe con fetch — sin SDK, igual que el resto de api/*.js.
export const config = { runtime: 'edge' }

const PRICES = {
  single: 'price_1U3B1eFNpWfaUovUQrzZfQAn', // Informe completo — 4,99 €
  bundle: 'price_1U3B48FNpWfaUovU5Mhdvviq', // Pack 3 informes — 9,99 €
  extra:  'price_1U3ElUFNpWfaUovUJgskIEqi', // Análisis extra (+3 ese día) — 2,99 €
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export default async function handler(req) {
  const c = cors()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return new Response(JSON.stringify({ error: 'Stripe no configurado' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const { product } = body
  const priceId = PRICES[product]
  if (!priceId) return new Response(JSON.stringify({ error: 'Producto no válido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  const origin = req.headers.get('origin') || `https://${req.headers.get('host')}`
  const params = new URLSearchParams({
    'mode': 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${origin}/?checkout_session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${origin}/?checkout_canceled=1`,
    'metadata[product]': product,
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
