export const config = { runtime: 'edge' }

import { abuseHash, deviceIdentity } from '../server/deviceIdentity.js'
import { callRpc, supabasePublic } from '../server/supabase.js'

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', 'dispostable.com', 'guerrillamail.com', 'maildrop.cc',
  'mailinator.com', 'sharklasers.com', 'temp-mail.org', 'trashmail.com', 'yopmail.com',
])
const DAY_SECONDS = 26 * 60 * 60

function getIP(req) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

async function kv(path) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) throw new Error('KV no configurado')
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`KV error ${response.status}`)
  return (await response.json()).result
}

async function incrementDaily(key) {
  const count = await kv(`/incr/${encodeURIComponent(key)}`)
  if (count === 1) await kv(`/expire/${encodeURIComponent(key)}/${DAY_SECONDS}`)
  return count
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  const body = new FormData()
  body.set('secret', secret)
  body.set('response', token)
  if (ip !== 'unknown') body.set('remoteip', ip)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
  if (!response.ok) return false
  return Boolean((await response.json()).success)
}

function json(data, status = 200, setCookie) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) },
  })
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  let body
  try { body = await req.json() } catch { return json({ error: 'Solicitud inválida' }, 400) }

  const email = String(body.email || '').trim().toLowerCase()
  const domain = email.split('@')[1] || ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Correo no válido' }, 400)
  if (DISPOSABLE_DOMAINS.has(domain)) return json({ error: 'Utiliza un correo permanente para conservar tus análisis e informes.' }, 400)

  const ip = getIP(req)
  let device
  try {
    device = await deviceIdentity(req)
    if (!(await verifyTurnstile(body.captchaToken, ip))) return json({ error: 'No pudimos comprobar que eres una persona. Vuelve a intentarlo.', code: 'CAPTCHA_REQUIRED' }, 400, device.setCookie)

    const day = new Date().toISOString().slice(0, 10)
    const ipHash = await abuseHash(ip)
    const requestCount = await incrementDaily(`auth_mail:${ipHash}:${day}`)
    if (requestCount > 8) return json({ error: 'Se han solicitado demasiados accesos desde esta conexión. Prueba mañana.' }, 429, device.setCookie)

    const exists = await callRpc('auth_email_exists', { p_email: email })
    if (!exists) {
      const signupCount = await incrementDaily(`auth_signup:${ipHash}:${day}`)
      if (signupCount > 2) return json({ error: 'Ya se han creado dos cuentas desde esta conexión hoy.' }, 429, device.setCookie)
    }

    const redirectTo = process.env.APP_URL || 'https://juntadirectiva.iapacks.com'
    const { error } = await supabasePublic().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        data: { marketing_consent: Boolean(body.marketingConsent) },
      },
    })
    if (error) throw error
    return json({ sent: true }, 200, device.setCookie)
  } catch (error) {
    console.error('magic-link error:', error)
    return json({ error: 'No pudimos enviar el acceso. Inténtalo de nuevo en unos minutos.' }, 503, device?.setCookie)
  }
}
