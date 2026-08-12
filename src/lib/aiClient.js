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
export async function streamCompletion({ provider, apiKey, system, userMsg, maxTokens, onChunk, serverMode = 'free', attachments = [] }) {
  const req = apiKey
    ? buildRequest({ provider, apiKey, system, userMsg, maxTokens, attachments })
    : { endpoint: '/api/coach', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemPrompt: system, userPrompt: userMsg, maxTokens, mode: serverMode, attachments }) }

  const res = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }

  const effectiveProvider = apiKey ? provider : (res.headers.get('X-AI-Provider') || 'openai')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const delta = extractDelta(effectiveProvider, parsed)
        if (delta) {
          fullText += delta
          onChunk?.(fullText)
        }
      } catch { /* skip */ }
    }
  }
  return fullText
}
