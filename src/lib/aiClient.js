import { PROVIDERS } from './providers.js'

// Arma la petición según el proveedor. Claude permite llamada directa desde el navegador;
// OpenAI y Gemini bloquean CORS, así que se reenvían por nuestro propio proxy (/api/openai, /api/gemini)
// que solo pasa la key del usuario sin guardarla.
function buildRequest({ provider, apiKey, system, userMsg, maxTokens, attachments = [] }) {
  const model = PROVIDERS[provider]?.model

  if (provider === 'openai') {
    return {
      endpoint: '/api/openai',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, system, userPrompt: userMsg, maxTokens, attachments }),
    }
  }
  if (provider === 'gemini') {
    return {
      endpoint: '/api/gemini',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, system, userPrompt: userMsg, maxTokens, attachments }),
    }
  }
  // Claude con key propia: directo a Anthropic
  return {
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: attachments.length ? [{ type: 'text', text: userMsg }, ...attachments.filter(a => a.kind === 'image').map(a => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.data } }))] : userMsg }], stream: true }),
  }
}

// Extrae el texto incremental de un evento SSE ya parseado, según el proveedor
function extractDelta(provider, parsed) {
  if (provider === 'openai') return parsed.choices?.[0]?.delta?.content || ''
  if (provider === 'gemini') return parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') return parsed.delta.text
  return ''
}

// Llamada genérica con streaming. Sin API propia el servidor elige el modelo según el modo:
// GPT-4o mini para análisis gratis y Claude Sonnet para el plan premium.
export async function streamCompletion({ provider, apiKey, system, userMsg, maxTokens, onChunk, serverMode = 'free', attachments = [], analysisTicket = '' }) {
  const req = apiKey
    ? buildRequest({ provider, apiKey, system, userMsg, maxTokens, attachments })
    : {
        endpoint: '/api/coach',
        headers: {
          'Content-Type': 'application/json',
          ...(analysisTicket ? { 'X-Analysis-Ticket': analysisTicket } : {}),
        },
        body: JSON.stringify({ systemPrompt: system, userPrompt: userMsg, maxTokens, mode: serverMode, attachments }),
      }

  const res = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    // code/resetAt viajan en el propio error para que quien llama pueda traducir el mensaje
    // al idioma de la UI en vez de mostrar el texto en español que devuelve el servidor.
    const err = new Error(data.error || `Error ${res.status}`)
    err.code = data.code
    err.resetAt = data.resetAt
    throw err
  }

  const effectiveProvider = apiKey ? provider : (res.headers.get('X-AI-Provider') || 'openai')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  // Un chunk de red no coincide necesariamente con un evento SSE completo: una línea
  // "data: {...}" puede llegar partida entre dos reads. Sin acumular en un buffer y
  // procesar solo líneas ya cerradas por un '\n', ambos fragmentos son JSON inválido por
  // separado, el catch de abajo los descarta en silencio, y el texto final queda mordido
  // a mitad de frase — exactamente el bug que corrompía informes y respuestas largas.
  let buffer = ''

  const processLine = (line) => {
    if (!line.startsWith('data: ')) return
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') return
    try {
      const parsed = JSON.parse(data)
      const delta = extractDelta(effectiveProvider, parsed)
      if (delta) {
        fullText += delta
        onChunk?.(fullText)
      }
    } catch { /* línea realmente malformada (no solo partida a mitad) */ }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    if (done) {
      buffer += decoder.decode() // vacía cualquier byte multibyte pendiente en el decoder
      buffer.split('\n').forEach(processLine)
      break
    }
    const lines = buffer.split('\n')
    buffer = lines.pop() // la última línea puede seguir incompleta: se procesa en la próxima vuelta
    lines.forEach(processLine)
  }
  return fullText
}
