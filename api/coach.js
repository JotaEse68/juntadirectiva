export const config = { runtime: 'edge' }

import { consumeAnalysisTicket } from '../server/analysisTicket.js'
import { authErrorResponse, callRpc, requireUser, supabaseAdmin } from '../server/supabase.js'

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
// El límite cuenta llamadas individuales, no sesiones. Un análisis completo hace ~14 llamadas
// (8 directores + 1 veredicto + hasta 4 quickTakes de directores que no participaron + 1
// generación de informe gratuito). Un usuario puede legítimamente encadenar hasta 5 análisis/día
// en una sola sesión (2 gratis + 3 de "análisis extra" comprados), es decir ~70 llamadas, más
// hasta 10 mensajes de seguimiento al Chairman — 100 cubre ese caso real sin dejar el modo
// gratuito prácticamente inútil ni bloquear a mitad de un análisis ya pagado.
const RATE_LIMIT_MAX = 100

function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

async function checkRate(userId, ip) {
  const now = Date.now()
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS)
  const userKey = `coach_rate:user:${userId}:${bucket}`
  const ipKey = `coach_rate:ip:${ip}:${bucket}`
  const [count, ipCount] = await Promise.all([
    kvCommand(`/incr/${encodeURIComponent(userKey)}`),
    kvCommand(`/incr/${encodeURIComponent(ipKey)}`),
  ])
  await Promise.all([
    count === 1 ? kvCommand(`/expire/${encodeURIComponent(userKey)}/${2 * 60 * 60}`) : null,
    ipCount === 1 ? kvCommand(`/expire/${encodeURIComponent(ipKey)}/${2 * 60 * 60}`) : null,
  ])
  const resetAt = (bucket + 1) * RATE_LIMIT_WINDOW_MS
  return { ok: count <= RATE_LIMIT_MAX && ipCount <= RATE_LIMIT_MAX * 2, remaining: Math.max(0, RATE_LIMIT_MAX - count), resetAt }
}

// El modo 'premium' (informe de pago + sus quick-takes) no puede confiarse a que el propio
// cliente diga "soy premium": eso es exactamente lo que permitía generar el informe gratis
// editando localStorage. Antes de gastar tokens de pago, se comprueba en KV la misma bandera
// que api/analysis-gate.js activa al confirmar un pago real con Stripe (grantReport).
async function kvCommand(path) {
  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) throw new Error('KV no configurado')
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`KV error ${res.status}`)
  const data = await res.json()
  return data.result
}

async function hasPremiumAccess(userId) {
  try {
    const { data, error } = await supabaseAdmin().from('profiles').select('premium_access').eq('user_id', userId).single()
    if (error) throw error
    return Boolean(data?.premium_access)
  } catch (err) {
    console.error('coach premium-check KV error:', err)
    // Si KV está caído no podemos verificar el pago: negar por defecto, no aceptar.
    return false
  }
}

function cors(origin) {
  const configured = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
    .split(',').map(value => value.trim()).filter(Boolean)
  const allowedOrigins = configured.length ? configured : [
    'https://juntadirectiva.iapacks.com',
    'https://juntadirectiva.vercel.app',
  ]
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Analysis-Ticket',
    'Access-Control-Expose-Headers': 'X-AI-Provider',
    'Vary': 'Origin',
  }
}

// El tope de max_tokens ya lo decide el llamador (ver handler: distingue modo gratis de
// premium) — estas funciones ya no lo recortan a un valor fijo por su cuenta.
async function createClaudeStream({ apiKey, model, systemPrompt, userPrompt, maxTokens, attachments = [] }) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
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

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } }) }

  const auth = await requireUser(req)
  if (!auth.user) return authErrorResponse(auth.error, c)

  const { systemPrompt, userPrompt, attachments = [] } = body
  const mode = body.mode === 'premium' ? 'premium' : body.mode === 'premium-quick' ? 'premium-quick' : 'free'
  // Tope por modo: el gratuito se queda en 1200 (barato, no debe poder pedirse un informe
  // completo sin pagar). El informe premium (buildReportSystem en useReport.js) pide 10
  // secciones estructuradas — 7500 es el margen que en pruebas reales cubre incluso los
  // informes más largos sin cortar la despedida final a media frase.
  const maxTokens = Math.min(body.maxTokens || 800, mode === 'premium' ? 7500 : mode === 'premium-quick' ? 320 : 1200)
  if (!systemPrompt || !userPrompt) return new Response(JSON.stringify({ error: 'Faltan prompts' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  if (userPrompt.length > 12000 || systemPrompt.length > 8000) return new Response(JSON.stringify({ error: 'Prompt demasiado largo' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

  // Cada análisis gratuito recibe un ticket firmado, ligado a su cuenta y con un presupuesto
  // máximo de llamadas. Así /api/coach no puede usarse como proxy abierto saltándose el
  // control de 2 análisis/día. Los clientes premium pueden usar el chat sin ticket.
  let reportAuthorization = null
  if (mode === 'premium' || mode === 'premium-quick') {
    const authorization = await consumeAnalysisTicket(req.headers.get('x-analysis-ticket') || '', auth.user.id)
    const expectedTier = mode === 'premium' ? 'premium-report' : 'premium-quick'
    if (!authorization.allowed || authorization.tier !== expectedTier) {
      const unavailable = authorization.code === 'ANALYSIS_AUTH_UNAVAILABLE'
      return new Response(JSON.stringify({ error: unavailable ? 'El control de uso no está disponible. Inténtalo de nuevo en unos minutos.' : 'Este informe no tiene una autorización válida.', code: authorization.code || 'ANALYSIS_TICKET_INVALID' }), {
        status: unavailable ? 503 : 401, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
    reportAuthorization = authorization
  } else {
    const ticket = req.headers.get('x-analysis-ticket') || ''
    if (ticket) {
      const authorization = await consumeAnalysisTicket(ticket, auth.user.id)
      if (!authorization.allowed) {
        const unavailable = authorization.code === 'ANALYSIS_AUTH_UNAVAILABLE'
        return new Response(JSON.stringify({ error: unavailable ? 'El control de uso no está disponible. Inténtalo de nuevo en unos minutos.' : 'Esta autorización de análisis no es válida o ya se agotó.', code: authorization.code }), {
          status: unavailable ? 503 : 429, headers: { ...c, 'Content-Type': 'application/json' }
        })
      }
    } else if (!(await hasPremiumAccess(auth.user.id))) {
      return new Response(JSON.stringify({ error: 'Primero debes iniciar un análisis desde la aplicación.', code: 'ANALYSIS_TICKET_REQUIRED' }), {
        status: 401, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
  }

  const refundFinalReport = async () => {
    if (mode !== 'premium' || !reportAuthorization?.reservationId) return
    try {
      await callRpc('refund_report_reservation', {
        p_user_id: auth.user.id,
        p_reservation_id: reportAuthorization.reservationId,
      })
    } catch (error) {
      console.error('report refund error:', error)
    }
  }

  let rate
  try {
    rate = await checkRate(auth.user.id, ip)
  } catch (err) {
    console.error('coach rate-limit KV error:', err)
    await refundFinalReport()
    return new Response(JSON.stringify({ error: 'El control de uso no está disponible. Inténtalo de nuevo en unos minutos.', code: 'ANALYSIS_AUTH_UNAVAILABLE' }), {
      status: 503, headers: { ...c, 'Content-Type': 'application/json' }
    })
  }
  const { ok, remaining, resetAt } = rate
  if (!ok) {
    await refundFinalReport()
    const min = Math.ceil((resetAt - Date.now()) / 60000)
    return new Response(JSON.stringify({ error: `Límite de uso alcanzado por esta hora. Vuelve en ${min} min.`, code: 'RATE_LIMITED', resetAt }), {
      status: 429, headers: { ...c, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) }
    })
  }

  // El navegador nunca trae su propia API key hasta aquí (aiClient.js llama directo al
  // proveedor en ese caso) — mode:'premium' sin haber pagado era el hueco real. Se exige
  // la bandera que api/analysis-gate.js solo activa tras confirmar el pago con Stripe.
  if ((mode === 'premium' || mode === 'premium-quick') && !(await hasPremiumAccess(auth.user.id))) {
    await refundFinalReport()
    return new Response(JSON.stringify({ error: 'Esta función requiere haber comprado el informe o el plan de acción.', code: 'PAYMENT_REQUIRED' }), {
      status: 402, headers: { ...c, 'Content-Type': 'application/json' }
    })
  }

  // El modelo lo decide el servidor: el navegador solo puede pedir modo gratuito o premium.
  // Si todavía no existe OPENAI_API_KEY, el modo gratuito conserva un fallback a Claude.
  const useOpenAI = mode === 'free' && Boolean(process.env.OPENAI_API_KEY)
  let provider = useOpenAI ? 'openai' : 'claude'
  const apiKey = useOpenAI ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
  const claudeModel = mode === 'free' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6'
  if (!apiKey) {
    await refundFinalReport()
    return new Response(JSON.stringify({ error: 'Servicio no configurado' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  let upstreamRes
  try {
    upstreamRes = useOpenAI
      ? await createOpenAIStream({ apiKey, systemPrompt, userPrompt, maxTokens, attachments })
      : await createClaudeStream({ apiKey, model: claudeModel, systemPrompt, userPrompt, maxTokens, attachments })
  } catch {
    await refundFinalReport()
    return new Response(JSON.stringify({ error: `Error conectando con ${useOpenAI ? 'OpenAI' : 'Anthropic'}` }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  // Una cuenta de OpenAI sin saldo devuelve 429. En ese caso el análisis no debe morir:
  // seguimos usando el proveedor ya configurado para que el producto continúe operativo.
  if (useOpenAI && !upstreamRes.ok && (upstreamRes.status === 429 || upstreamRes.status >= 500) && process.env.ANTHROPIC_API_KEY) {
    provider = 'claude'
    try {
      upstreamRes = await createClaudeStream({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-haiku-4-5',
        systemPrompt,
        userPrompt,
        maxTokens, attachments,
      })
    } catch {
      await refundFinalReport()
      return new Response(JSON.stringify({ error: 'Error conectando con OpenAI y Anthropic' }), { status: 502, headers: { ...c, 'Content-Type': 'application/json' } })
    }
  }

  if (!upstreamRes.ok) {
    const t = await upstreamRes.text().catch(() => '')
    let msg = `Error ${useOpenAI ? 'OpenAI' : 'Anthropic'} ${upstreamRes.status}`
    try { msg = JSON.parse(t).error?.message || msg } catch {}
    await refundFinalReport()
    return new Response(JSON.stringify({ error: msg }), { status: upstreamRes.status, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  if (mode === 'premium') {
    try {
      const finalized = await callRpc('finalize_report_reservation', {
        p_user_id: auth.user.id,
        p_reservation_id: reportAuthorization.reservationId,
      })
      if (!finalized) {
        return new Response(JSON.stringify({ error: 'La reserva de este informe ya no está activa.', code: 'REPORT_RESERVATION_INVALID' }), {
          status: 409, headers: { ...c, 'Content-Type': 'application/json' }
        })
      }
    } catch (error) {
      console.error('report finalize error:', error)
      return new Response(JSON.stringify({ error: 'No se pudo confirmar el informe. El crédito reservado se recuperará automáticamente.', code: 'REPORT_FINALIZE_FAILED' }), {
        status: 503, headers: { ...c, 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: { ...c, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-AI-Provider': provider, 'X-RateLimit-Limit': String(RATE_LIMIT_MAX), 'X-RateLimit-Remaining': String(remaining), 'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)) }
  })
}
