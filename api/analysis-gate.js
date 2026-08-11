// Edge Function: gate de análisis gratis/día por IP, respaldado en Vercel KV (Upstash REST).
// Sin cuentas — "por usuario" aquí significa "por IP", igual que el resto de límites de la app.
// Complementa (no sustituye) el límite por hora de api/coach.js: éste cuenta sesiones/día,
// aquél sigue limitando llamadas/hora como red de seguridad contra abuso.
export const config = { runtime: 'edge' }

const FREE_DAILY_LIMIT = 2
const KEY_TTL_SECONDS = 26 * 60 * 60 // 26h: cubre el día completo con margen de zona horaria

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

async function kvCommand(path) {
  const base = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!base || !token) throw new Error('KV no configurado')
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`KV error ${res.status}`)
  const data = await res.json()
  return data.result
}

async function kvGetInt(key) {
  const v = await kvCommand(`/get/${encodeURIComponent(key)}`)
  return v == null ? 0 : parseInt(v, 10) || 0
}
const kvIncr = (key) => kvCommand(`/incr/${encodeURIComponent(key)}`)
const kvIncrBy = (key, amount) => kvCommand(`/incrby/${encodeURIComponent(key)}/${amount}`)
const kvDecr = (key) => kvCommand(`/decr/${encodeURIComponent(key)}`)
const kvExpire = (key, seconds) => kvCommand(`/expire/${encodeURIComponent(key)}/${seconds}`)

async function checkAndConsume(ip) {
  const today = todayUTC()
  const freeKey = `analysis:${ip}:${today}:free`
  const extraKey = `analysis:${ip}:${today}:extra`

  try {
    const freeUsed = await kvGetInt(freeKey)
    if (freeUsed < FREE_DAILY_LIMIT) {
      await kvIncr(freeKey)
      await kvExpire(freeKey, KEY_TTL_SECONDS)
      return { allowed: true, tier: 'free' }
    }
    const extraLeft = await kvGetInt(extraKey)
    if (extraLeft > 0) {
      await kvDecr(extraKey)
      return { allowed: true, tier: 'extra' }
    }
    return { allowed: false }
  } catch {
    // KV caído: no bloqueamos el uso gratuito por un problema de infraestructura.
    return { allowed: true, tier: 'free', degraded: true }
  }
}

async function grantExtra(ip, sessionId) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe no configurado')

  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok) throw new Error(session.error?.message || 'Sesión no encontrada')
  if (session.payment_status !== 'paid' || session.metadata?.product !== 'extra') {
    return { granted: false }
  }

  const today = todayUTC()
  const extraKey = `analysis:${ip}:${today}:extra`
  await kvIncrBy(extraKey, 3)
  await kvExpire(extraKey, KEY_TTL_SECONDS)
  return { granted: true }
}

export default async function handler(req) {
  const c = cors()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const ip = getIP(req)

  if (body.action === 'check') {
    const result = await checkAndConsume(ip)
    if (!result.allowed) {
      return new Response(JSON.stringify({ allowed: false, error: 'Sin análisis gratis hoy. Compra análisis extra para seguir analizando.' }), {
        status: 429, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
    return new Response(JSON.stringify(result), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  if (body.action === 'grant-extra') {
    if (!body.sessionId) return new Response(JSON.stringify({ error: 'sessionId requerido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
    try {
      const result = await grantExtra(ip, body.sessionId)
      return new Response(JSON.stringify(result), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Error verificando el pago' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
    }
  }

  return new Response(JSON.stringify({ error: 'Acción no soportada' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
}
