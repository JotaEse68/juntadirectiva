export const config = { runtime: 'edge' }

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
// El límite cuenta llamadas individuales, no sesiones. Un análisis completo hace ~14 llamadas
// (8 directores + 1 veredicto + hasta 4 quickTakes de directores que no participaron + 1
// generación de informe gratuito). Un usuario puede legítimamente encadenar hasta 5 análisis/día
// en una sola sesión (2 gratis + 3 de "análisis extra" comprados), es decir ~70 llamadas, más
// hasta 10 mensajes de seguimiento al Chairman — 100 cubre ese caso real sin dejar el modo
// gratuito prácticamente inútil ni bloquear a mitad de un análisis ya pagado.
const RATE_LIMIT_MAX = 100
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
    'Access-Control-Expose-Headers': 'X-AI-Provider',
  }
}

// El tope de max_tokens ya lo decide el llamador (ver handler: distingue modo gratis de
// premium) — estas funciones ya no lo recortan a un valor fijo por su cuenta.
async function createClaudeStream({ apiKey, systemPrompt, userPrompt, maxTokens, attachments = [] }) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: attachments.length ? [{ type: 'text', text: userPrompt }, ...attachments.filter(a => a?.kind === 'image' && /^image\//.test(a.mimeType || '') && a.data?.length < 12_000_000).map(a => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.data } }))] : userPrompt }],
      stream: true,
    }),
  })
}

async function createOpenAIStream({ apiKey, systemPrompt, userPrompt, maxTokens, attachments = [] }) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: attachments.length ? [{ type: 'text', text: userPrompt }, ...attachments.filter(a => a?.kind === 'image' && /^image\//.test(a.mimeType || '') && a.data?.length < 12_000_000).map(a => ({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${a.data}` } }))] : userPrompt }],
      stream: true,
    }),
  })
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
    return new Response(JSON.stringify({ error: `Límite de uso gratuito alcanzado por esta hora. Vuelve en ${min} min o usa tu propia API key para uso ilimitado.`, code: 'RATE_LIMITED', resetAt }), {
      status: 429, headers: { ...c, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) }
    })
  }

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } }) }

  const { systemPrompt, userPrompt, attachments = [] } = body
  const mode = body.mode === 'premium' ? 'premium' : 'free'
  // Tope por modo: el gratuito se queda en 1200 (barato, no debe poder pedirse un informe
  // completo sin pagar). El informe premium (REPORT_SYSTEM_PAID en useReport.js) pide 7
  // secciones estructuradas — con 1200 se cortaba a media frase justo después de ACCIONES
  // PRIORITARIAS, sin llegar a las últimas 3-4 secciones. 3000 le da margen real.
  const maxTokens = Math.min(body.maxTokens || 800, mode === 'premium' ? 5500 : 1200)
  if (!systemPrompt || !userPrompt) return new Response(JSON.stringify({ error: 'Faltan prompts' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (userPrompt.length > 12000 || systemPrompt.length > 8000) return new Response(JSON.stringify({ error: 'Prompt demasiado largo' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  // El modelo lo decide el servidor: el navegador solo puede pedir modo gratuito o premium.
  // Si todavía no existe OPENAI_API_KEY, el modo gratuito conserva un fallback a Claude.
  const useOpenAI = mode === 'free' && Boolean(process.env.OPENAI_API_KEY)
  let provider = useOpenAI ? 'openai' : 'claude'
  const apiKey = useOpenAI ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response(JSON.stringify({ error: 'Servicio no configurado' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })

  let upstreamRes
  try {
    upstreamRes = useOpenAI
      ? await createOpenAIStream({ apiKey, systemPrompt, userPrompt, maxTokens, attachments })
      : await createClaudeStream({ apiKey, systemPrompt, userPrompt, maxTokens, attachments })
  } catch {
    return new Response(JSON.stringify({ error: `Error conectando con ${useOpenAI ? 'OpenAI' : 'Anthropic'}` }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  // Una cuenta de OpenAI sin saldo devuelve 429. En ese caso el análisis no debe morir:
  // seguimos usando el proveedor ya configurado para que el producto continúe operativo.
  if (useOpenAI && !upstreamRes.ok && (upstreamRes.status === 429 || upstreamRes.status >= 500) && process.env.ANTHROPIC_API_KEY) {
    provider = 'claude'
    try {
      upstreamRes = await createClaudeStream({
        apiKey: process.env.ANTHROPIC_API_KEY,
        systemPrompt,
        userPrompt,
        maxTokens, attachments,
      })
    } catch {
      return new Response(JSON.stringify({ error: 'Error conectando con OpenAI y Anthropic' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
    }
  }

  if (!upstreamRes.ok) {
    const t = await upstreamRes.text().catch(() => '')
    let msg = `Error ${useOpenAI ? 'OpenAI' : 'Anthropic'} ${upstreamRes.status}`
    try { msg = JSON.parse(t).error?.message || msg } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: upstreamRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: { ...c, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-AI-Provider': provider, 'X-RateLimit-Limit': String(RATE_LIMIT_MAX), 'X-RateLimit-Remaining': String(remaining), 'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)) }
  })
}
