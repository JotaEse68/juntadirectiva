const COOKIE_NAME = 'junta_device'
const MAX_AGE_SECONDS = 2 * 365 * 24 * 60 * 60

function secret() {
  const value = process.env.DEVICE_COOKIE_SECRET || process.env.ANALYSIS_TOKEN_SECRET || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!value) throw new Error('Secreto de dispositivo no configurado')
  return value
}

function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sign(value) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

function readCookie(req) {
  return req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || ''
}

export async function deviceIdentity(req) {
  const [id, suppliedSignature] = readCookie(req).split('.')
  if (id && suppliedSignature && safeEqual(suppliedSignature, await sign(id))) return { id, setCookie: null }

  const newId = crypto.randomUUID()
  const token = `${newId}.${await sign(newId)}`
  return {
    id: newId,
    setCookie: `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  }
}

export async function abuseHash(value) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${secret()}:${value}`))
  return base64Url(new Uint8Array(digest)).slice(0, 32)
}

