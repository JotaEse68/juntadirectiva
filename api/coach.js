export const config = { runtime: 'edge' }

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 3  // 3 reuniones/hora (cada una hace ~9 llamadas internamente)
const ipStore = new Map()

function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function checkRate(ip) {
  const now = Date.now()
  const e = ipStore.get(ip)
  if (!e || now - e.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipStore.set(ip, { count: 1, windowStart: now })
    return { ok: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }
  if (e.count >= RATE_LIMIT_MAX) return { ok: false, remaining: 0, resetAt: e.windowStart + RATE_LIMIT_WINDOW_MS }
  e.count++
  return { ok: true, remaining: RATE_LIMIT_MAX - e.count, resetAt: e.windowStart + RATE_LIMIT_WINDOW_MS }
}

function cors(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? origin : ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || ''
  const c = cors(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  const ip = getIP(req)
  if (ipStore.size > 5000) {
    const now = Date.now()
    for (const [k, v] of ipStore) if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) ipStore.delete(k)
  }

  const { ok, remaining, resetAt } = checkRate(ip)
  if (!ok) {
    const min = Math.ceil((resetAt - Date.now()) / 60000)
    return new Response(JSON.stringify({ error: `Límite de ${RATE_LIMIT_MAX} reuniones por hora alcanzado. Vuelve en ${min} min o usa tu propia API key.`, code: 'RATE_LIMITED', resetAt }), {
      status: 429, headers: { ...c, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) }
    })
  }

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } }) }

  const { systemPrompt, userPrompt, maxTokens = 800 } = body
  if (!systemPrompt || !userPrompt) return new Response(JSON.stringify({ error: 'Faltan prompts' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (userPrompt.length > 6000 || systemPrompt.length > 8000) return new Response(JSON.stringify({ error: 'Prompt demasiado largo' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response(JSON.stringify({ error: 'Servicio no configurado' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })

  let anthropicRes
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: Math.min(maxTokens, 1200), system: systemPrompt, messages: [{ role: 'user', content: userPrompt }], stream: true }),
    })
  } catch { return new Response(JSON.stringify({ error: 'Error conectando con Anthropic' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } }) }

  if (!anthropicRes.ok) {
    const t = await anthropicRes.text().catch(() => '')
    let msg = `Error Anthropic ${anthropicRes.status}`
    try { msg = JSON.parse(t).error?.message || msg } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: anthropicRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  return new Response(anthropicRes.body, {
    status: 200,
    headers: { ...c, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-RateLimit-Limit': String(RATE_LIMIT_MAX), 'X-RateLimit-Remaining': String(remaining), 'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)) }
  })
}
