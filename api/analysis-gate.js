// Edge Function: gate de análisis gratis/día por IP, respaldado en Vercel KV (Upstash REST).
// Sin cuentas — "por usuario" aquí significa "por IP", igual que el resto de límites de la app.
// Complementa (no sustituye) el límite por hora de api/coach.js: éste cuenta sesiones/día,
// aquél sigue limitando llamadas/hora como red de seguridad contra abuso.
export const config = { runtime: 'edge' }

import { issueAnalysisTicket } from '../server/analysisTicket.js'

const FREE_DAILY_LIMIT = 2
const KEY_TTL_SECONDS = 26 * 60 * 60 // 26h: cubre el día completo con margen de zona horaria
// Los créditos de informe (comprados, no diarios) no deben caducar en uso normal — 2 años
// es solo higiene de KV para no acumular claves de sesiones abandonadas para siempre.
const CREDIT_TTL_SECONDS = 2 * 365 * 24 * 60 * 60

function cors(origin = '') {
  const configured = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
    .split(',').map(value => value.trim()).filter(Boolean)
  const allowedOrigins = configured.length ? configured : [
    'https://juntadirectiva.iapacks.com',
    'https://juntadirectiva.vercel.app',
  ]
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
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
  const used = await kvIncr(freeKey)
  if (used === 1) await kvExpire(freeKey, KEY_TTL_SECONDS)
  if (used <= FREE_DAILY_LIMIT) return { allowed: true, tier: 'free' }

  const extraLeft = await kvDecr(extraKey)
  if (extraLeft >= 0) return { allowed: true, tier: 'extra' }
  await kvIncr(extraKey) // no había extra disponible: deshace el decremento para no dejar el contador negativo
  return { allowed: false }
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

// El informe de pago (api/coach.js en modo 'premium') no tenía NINGUNA verificación
// server-side de que se hubiera pagado — solo dependía de un contador en localStorage que
// cualquiera puede editar desde la consola del navegador, o de llamar a /api/coach
// directamente. Este par de funciones cierra eso: grantReport verifica el pago con Stripe
// y solo entonces acredita en KV (con el mismo candado anti-repetición que grantExtra:
// sin él, se podría reenviar el mismo sessionId ya pagado una y otra vez para créditos
// infinitos); consumeReportCredit descuenta 1 crédito real antes de generar cada informe.
async function grantReport(ip, sessionId) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe no configurado')

  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const session = await stripeRes.json()
  if (!stripeRes.ok) throw new Error(session.error?.message || 'Sesión no encontrada')
  const product = session.metadata?.product
  if (session.payment_status !== 'paid' || (product !== 'single' && product !== 'bundle')) {
    return { granted: false }
  }

  // Mismo orden que grantExtra: acreditar antes de marcar como canjeada, nunca al revés.
  const grantKey = `grant:${sessionId}`
  const alreadyGranted = await kvGetInt(grantKey)
  if (alreadyGranted) return { granted: false, alreadyGranted: true }

  const creditsToAdd = product === 'bundle' ? 3 : 1
  const creditsKey = `report_credits:${ip}`
  const total = await kvIncrBy(creditsKey, creditsToAdd)
  await kvExpire(creditsKey, CREDIT_TTL_SECONDS)

  // Cualquier compra de informe (single o bundle) desbloquea también el acceso premium
  // general (Junta profunda, chat sin límite) — no es un recurso que se consuma por uso.
  const premiumKey = `premium_access:${ip}`
  await kvSetNX(premiumKey, '1')
  await kvExpire(premiumKey, CREDIT_TTL_SECONDS)

  await kvSetNX(grantKey, '1')
  await kvExpire(grantKey, 7 * 24 * 60 * 60)

  return { granted: true, credits: total }
}

async function consumeReportCredit(ip) {
  const creditsKey = `report_credits:${ip}`
  const remaining = await kvDecr(creditsKey)
  if (remaining < 0) {
    await kvIncr(creditsKey) // deshace el decremento: no hay crédito real que gastar
    return { allowed: false }
  }
  return { allowed: true, remaining }
}

export default async function handler(req) {
  const c = cors(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const ip = getIP(req)

  if (body.action === 'check') {
    let result
    try {
      result = await checkAndConsume(ip)
    } catch (err) {
      console.error('analysis-gate KV error:', err)
      return new Response(JSON.stringify({ allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', error: 'El control de uso no está disponible. Inténtalo de nuevo en unos minutos.' }), {
        status: 503, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
    if (!result.allowed) {
      return new Response(JSON.stringify({ allowed: false, code: 'NO_FREE_ANALYSES', error: 'Sin análisis gratis hoy. Compra análisis extra para seguir analizando.' }), {
        status: 429, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
    try {
      const ticket = await issueAnalysisTicket(ip, result.tier)
      return new Response(JSON.stringify({ ...result, ticket }), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
    } catch (err) {
      console.error('analysis ticket issue error:', err)
      return new Response(JSON.stringify({ allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', error: 'No se pudo autorizar el análisis. Inténtalo de nuevo en unos minutos.' }), {
        status: 503, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
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

  if (body.action === 'grant-report') {
    if (!body.sessionId) return new Response(JSON.stringify({ error: 'sessionId requerido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
    try {
      const result = await grantReport(ip, body.sessionId)
      return new Response(JSON.stringify(result), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Error verificando el pago' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
    }
  }

  if (body.action === 'consume-report') {
    try {
      const result = await consumeReportCredit(ip)
      if (!result.allowed) {
        return new Response(JSON.stringify({ allowed: false, code: 'NO_REPORT_CREDITS', error: 'No tienes créditos de informe disponibles.' }), {
          status: 402, headers: { ...c, 'Content-Type': 'application/json' }
        })
      }
      const ticket = await issueAnalysisTicket(ip, 'premium-report', 16)
      return new Response(JSON.stringify({ ...result, ticket }), { status: 200, headers: { ...c, 'Content-Type': 'application/json' } })
    } catch (err) {
      console.error('report authorization error:', err)
      return new Response(JSON.stringify({ allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', error: 'No se pudo autorizar el informe. Inténtalo de nuevo en unos minutos.' }), {
        status: 503, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Acción no soportada' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
}
