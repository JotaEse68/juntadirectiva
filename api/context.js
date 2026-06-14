// Edge Function: raspa URLs y resume contexto con Claude
export const config = { runtime: 'edge' }

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 10
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
    return { ok: true }
  }
  if (e.count >= RATE_LIMIT_MAX) return { ok: false }
  e.count++
  return { ok: true }
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Extrae texto limpio de HTML
function extractTextFromHTML(html) {
  // Elimina scripts, styles, nav, footer, header
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  // Limita a 8000 chars para no explotar el contexto
  return clean.slice(0, 8000)
}

// Resume el texto con Claude
async function summarize(text, sourceType, apiKey) {
  const systemPrompt = `Eres un asistente especializado en extraer y resumir información relevante para la toma de decisiones empresariales.
Tu tarea: analizar el contenido proporcionado y extraer un briefing ejecutivo conciso (máximo 400 palabras) con:
1. De qué trata el documento/URL/nota
2. Datos y hechos clave relevantes para decisiones de negocio
3. Contexto importante que una junta directiva debería conocer
Sé directo y específico. Solo incluye información realmente relevante.`

  const userPrompt = `Analiza este contenido (${sourceType}) y extrae el briefing ejecutivo:\n\n${text}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || ''
  const c = cors(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: c })

  const ip = getIP(req)
  const { ok } = checkRate(ip)
  if (!ok) return new Response(JSON.stringify({ error: 'Límite de procesamiento alcanzado. Espera un momento.' }), {
    status: 429, headers: { ...c, 'Content-Type': 'application/json' }
  })

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
  }

  const { type, content, url, clientApiKey } = body
  const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response(JSON.stringify({ error: 'Sin API key' }), { status: 503, headers: { ...c, 'Content-Type': 'application/json' } })

  try {
    let rawText = ''
    let sourceType = type

    if (type === 'url') {
      if (!url) return new Response(JSON.stringify({ error: 'URL requerida' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })

      // Validar URL
      let parsedUrl
      try { parsedUrl = new URL(url) } catch {
        return new Response(JSON.stringify({ error: 'URL inválida' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return new Response(JSON.stringify({ error: 'Solo se permiten URLs http/https' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
      }

      // Raspar la URL
      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuntaDirectivaBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!pageRes.ok) throw new Error(`No se pudo acceder a la URL (${pageRes.status})`)
      const html = await pageRes.text()
      rawText = extractTextFromHTML(html)
      if (rawText.length < 100) throw new Error('La página no tiene suficiente contenido de texto')
      sourceType = `URL: ${url}`

    } else if (type === 'text' || type === 'note') {
      // Texto / notas: viene directo del cliente
      rawText = (content || '').slice(0, 8000)
      if (!rawText.trim()) return new Response(JSON.stringify({ error: 'Contenido vacío' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
      sourceType = 'nota de texto'

    } else if (type === 'extracted') {
      // PDF/Word: el cliente ya extrajo el texto con pdf.js/mammoth, aquí solo resumimos
      rawText = (content || '').slice(0, 8000)
      if (!rawText.trim()) return new Response(JSON.stringify({ error: 'Documento vacío o no legible' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
      sourceType = 'documento'

    } else {
      return new Response(JSON.stringify({ error: 'Tipo no soportado' }), { status: 400, headers: { ...c, 'Content-Type': 'application/json' } })
    }

    const summary = await summarize(rawText, sourceType, apiKey)
    return new Response(JSON.stringify({ summary, chars: rawText.length }), {
      status: 200, headers: { ...c, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Error procesando el contexto' }), {
      status: 500, headers: { ...c, 'Content-Type': 'application/json' }
    })
  }
}
