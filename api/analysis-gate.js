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
  // Algunos flujos de aprovisionamiento de Vercel KV / Upstash exponen las credenciales
  // bajo el nombre UPSTASH_REDIS_REST_* en vez de KV_REST_API_*. Aceptar ambos evita que
  // una integración perfectamente válida deje la función creyendo que KV no está configurado.
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
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
async function kvSetNX(key, value) {
  return kvCommand(`/setnx/${encodeURIComponent(key)}/${encodeURIComponent(value)}`)
}

async function checkAndConsume(ip) {
  const today = todayUTC()
  const freeKey = `analysis:${ip}:${today}:free`
  const extraKey = `analysis:${ip}:${today}:extra`

  // El propio INCR/DECR atómico de Upstash es la fuente de verdad, no una lectura previa:
  // con GET+INCR en dos round trips separados, peticiones concurrentes de la misma IP pueden
  // leer todas el mismo "aún no al límite" y colarse todas — con INCR como único paso de
  // comprobación no hay ventana entre leer y escribir.
  try {
    const used = await kvIncr(freeKey)
    if (used === 1) await kvExpire(freeKey, KEY_TTL_SECONDS)
    if (used <= FREE_DAILY_LIMIT) return { allowed: true, tier: 'free' }

    const extraLeft = await kvDecr(extraKey)
    if (extraLeft >= 0) return { allowed: true, tier: 'extra' }
    await kvIncr(extraKey) // no había extra disponible: deshace el decremento para no dejar el contador negativo
    return { allowed: false }
  } catch (err) {
    console.error('analysis-gate KV error:', err)
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

  // Se acredita ANTES de marcar como canjeada: si KV falla entre el crédito y la marca, en
  // el peor caso una petición concurrente muy rara podría duplicar el crédito (ventana
  // estrecha, se acepta), pero nunca se puede dar el caso de "marcado como canjeado sin
  // haber acreditado nada" — que dejaría al usuario con el pago hecho y sin forma de reintentar,
  // porque la marca bloquearía cualquier intento futuro.
  const grantKey = `grant:${sessionId}`
  const alreadyGranted = await kvGetInt(grantKey)
  if (alreadyGranted) return { granted: false, alreadyGranted: true }

  const today = todayUTC()
  const extraKey = `analysis:${ip}:${today}:extra`
  await kvIncrBy(extraKey, 3)
  await kvExpire(extraKey, KEY_TTL_SECONDS)

  await kvSetNX(grantKey, '1')
  await kvExpire(grantKey, 7 * 24 * 60 * 60) // 7 días de margen, de sobra para cualquier reintento legítimo

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
