// Edge Function: confirma que una Checkout Session de Stripe se pagó de verdad antes de desbloquear el informe.
export const config = { runtime: 'edge' }

import { authErrorResponse, callRpc, requireUser } from '../server/supabase.js'

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

  const { sessionId } = body
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return new Response(JSON.stringify({ error: 'sessionId inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  let stripeRes
  try {
    stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Error conectando con Stripe' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const data = await stripeRes.json()
  if (!stripeRes.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'Sesión no encontrada' }), { status: stripeRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  if (data.client_reference_id !== auth.user.id || data.metadata?.user_id !== auth.user.id) {
    return new Response(JSON.stringify({ error: 'Esta compra pertenece a otra cuenta.' }), {
      status: 403, headers: { ...c, 'Content-Type': 'application/json' }
    })
  }

  const paid = data.payment_status === 'paid'
  let account = null
  if (paid) {
    try {
      account = await callRpc('grant_stripe_purchase', {
        p_user_id: auth.user.id,
        p_session_id: data.id,
        p_event_id: '',
        p_product: data.metadata?.product,
      })
    } catch (error) {
      console.error('checkout fallback grant error:', error)
      return new Response(JSON.stringify({ error: 'Pago confirmado, pero la acreditación sigue pendiente.' }), {
        status: 503, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
  }
  return new Response(JSON.stringify({ paid, product: data.metadata?.product || null, account }), {
    status: 200, headers: { ...c, 'Content-Type': 'application/json' }
  })
}
