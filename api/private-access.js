export const config = { runtime: 'edge' }

const COOKIE_NAME = 'junta_private_access'
const MAX_AGE_SECONDS = 60 * 60 * 12

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function encode(value) { return new TextEncoder().encode(value) }

async function sha256(value) {
  const hash = await crypto.subtle.digest('SHA-256', encode(value))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encode(value))
  return toBase64Url(new Uint8Array(signature))
}

function readCookie(req, name) {
  return req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || ''
}

async function hasValidSession(req, secret) {
  const token = readCookie(req, COOKIE_NAME)
  const [expiresAt, signature] = token.split('.')
  if (!expiresAt || !signature || !secret || Number(expiresAt) < Date.now()) return false
  return signature === await sign(expiresAt, secret)
}

export default async function handler(req) {
  const cookieSecret = process.env.PRIVATE_ACCESS_COOKIE_SECRET
  if (!cookieSecret) return json({ error: 'Acceso privado no configurado' }, 503)

  if (req.method === 'GET') return json({ authorized: await hasValidSession(req, cookieSecret) })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let body
  try { body = await req.json() } catch { return json({ error: 'Solicitud inválida' }, 400) }
  const code = String(body.code || '').trim()
  if (!code || !process.env.PRIVATE_ACCESS_CODE_HASH) return json({ error: 'Código incorrecto' }, 401)

  if (await sha256(code) !== process.env.PRIVATE_ACCESS_CODE_HASH) return json({ error: 'Código incorrecto' }, 401)

  const expiresAt = String(Date.now() + MAX_AGE_SECONDS * 1000)
  const signature = await sign(expiresAt, cookieSecret)
  const cookie = `${COOKIE_NAME}=${expiresAt}.${signature}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  return json({ authorized: true }, 200, { 'Set-Cookie': cookie })
}
