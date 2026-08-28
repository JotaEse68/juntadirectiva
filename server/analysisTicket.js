const TICKET_TTL_SECONDS = 3 * 60 * 60
export const ANALYSIS_TICKET_MAX_CALLS = 30

function kvCredentials() {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) throw new Error('KV no configurado')
  return { base, token }
}

async function kvCommand(path) {
  const { base, token } = kvCredentials()
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`KV error ${res.status}`)
  const data = await res.json()
  return data.result
}

const kvIncr = key => kvCommand(`/incr/${encodeURIComponent(key)}`)
const kvExpire = (key, seconds) => kvCommand(`/expire/${encodeURIComponent(key)}/${seconds}`)

function ticketSecret() {
  return process.env.ANALYSIS_TOKEN_SECRET || kvCredentials().token
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function hmac(value) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(ticketSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function identityFingerprint(userId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
  return toBase64Url(new Uint8Array(digest)).slice(0, 24)
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return difference === 0
}

export async function issueAnalysisTicket(userId, tier = 'free', maxCalls = ANALYSIS_TICKET_MAX_CALLS, claims = {}) {
  const payload = {
    v: 1,
    uid: await identityFingerprint(userId),
    tier,
    max: Math.max(1, Math.min(Number(maxCalls) || ANALYSIS_TICKET_MAX_CALLS, ANALYSIS_TICKET_MAX_CALLS)),
    nonce: crypto.randomUUID(),
    exp: Date.now() + TICKET_TTL_SECONDS * 1000,
    ...(claims.reservationId ? { reservationId: claims.reservationId } : {}),
  }
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${encoded}.${await hmac(encoded)}`
}

export async function consumeAnalysisTicket(ticket, userId) {
  if (!ticket || typeof ticket !== 'string' || ticket.length > 1200) {
    return { allowed: false, code: 'ANALYSIS_TICKET_REQUIRED' }
  }

  try {
    const [encoded, suppliedSignature, extra] = ticket.split('.')
    if (!encoded || !suppliedSignature || extra || !safeEqual(suppliedSignature, await hmac(encoded))) {
      return { allowed: false, code: 'ANALYSIS_TICKET_INVALID' }
    }

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)))
    if (payload.v !== 1 || !payload.nonce || !payload.exp || !payload.max || payload.exp < Date.now()) {
      return { allowed: false, code: 'ANALYSIS_TICKET_EXPIRED' }
    }
    if (payload.uid !== await identityFingerprint(userId)) {
      return { allowed: false, code: 'ANALYSIS_TICKET_INVALID' }
    }

    const counterKey = `analysis_ticket:${payload.nonce}:calls`
    const used = await kvIncr(counterKey)
    if (used === 1) await kvExpire(counterKey, TICKET_TTL_SECONDS)
    if (used > payload.max) {
      return { allowed: false, code: 'ANALYSIS_TICKET_EXHAUSTED' }
    }
    return { allowed: true, remaining: payload.max - used, tier: payload.tier, reservationId: payload.reservationId || null }
  } catch (error) {
    console.error('analysis ticket error:', error)
    return { allowed: false, code: 'ANALYSIS_AUTH_UNAVAILABLE', unavailable: true }
  }
}
