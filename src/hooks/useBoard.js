import { useState, useCallback } from 'react'
import { MEETING_TYPES, MEETING_FRAMING } from '../lib/directors.js'
import { PROVIDERS } from '../lib/providers.js'

// Arma la petición según el proveedor. Claude permite llamada directa desde el navegador;
// OpenAI y Gemini bloquean CORS, así que se reenvían por nuestro propio proxy (/api/openai, /api/gemini)
// que solo pasa la key del usuario sin guardarla.
function buildRequest({ provider, apiKey, system, userMsg, maxTokens }) {
  const model = PROVIDERS[provider]?.model

  if (provider === 'openai') {
    return {
      endpoint: '/api/openai',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, system, userPrompt: userMsg, maxTokens }),
    }
  }
  if (provider === 'gemini') {
    return {
      endpoint: '/api/gemini',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, system, userPrompt: userMsg, maxTokens }),
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
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }], stream: true }),
  }
}

// Extrae el texto incremental de un evento SSE ya parseado, según el proveedor
function extractDelta(provider, parsed) {
  if (provider === 'openai') return parsed.choices?.[0]?.delta?.content || ''
  if (provider === 'gemini') return parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') return parsed.delta.text
  return ''
}

// Llamada genérica con streaming, usada tanto para directores como para el veredicto.
// Sin apiKey (modo gratuito) siempre pasa por /api/coach con Claude, sea cual sea el provider elegido.
async function streamCompletion({ provider, apiKey, system, userMsg, maxTokens, onChunk }) {
  const req = apiKey
    ? buildRequest({ provider, apiKey, system, userMsg, maxTokens })
    : { endpoint: '/api/coach', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemPrompt: system, userPrompt: userMsg, maxTokens }) }

  const res = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }

  const effectiveProvider = apiKey ? provider : 'claude'
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

// Recorta la intervención de un director ya cerrado a un resumen corto para que el
// contexto del debate no crezca sin control a medida que hablan más directores.
function excerpt(text, maxChars = 380) {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars).trim() + '…'
}

function buildDebateRecap(debateSoFar) {
  if (!debateSoFar.length) return ''
  const turns = debateSoFar.map(({ director, text }) => `${director.name} (${director.title}): ${excerpt(text)}`).join('\n\n')
  return `\n\nDEBATE HASTA AHORA (tus colegas ya hablaron, en este orden):\n${turns}\n\nAntes de dar tu propio análisis, reacciona en 1-2 frases a lo que han dicho tus colegas — cita a quien corresponda por nombre, coincide o discrepa explícitamente. Luego da tu aportación completa desde tu especialidad.`
}

async function callDirector({ director, situation, meetingType, contextBlock, debateSoFar, apiKey, provider, onChunk }) {
  const meetingLabel = MEETING_TYPES.find(m => m.id === meetingType)?.label || 'Reunión'
  const framing = MEETING_FRAMING[meetingType] || ''

  const contextSection = contextBlock ? ("\n\nCONTEXTO ADICIONAL:\n" + contextBlock) : ""
  const debateSection = buildDebateRecap(debateSoFar || [])
  const userMsg = `REUNIÓN DE JUNTA — ${meetingLabel}
${framing}

SITUACIÓN:
${situation}${contextSection}${debateSection}

Como ${director.name} (${director.title}), da tu análisis experto y posición. Si el contexto adicional es relevante para tu especialidad, incorpóralo en tu análisis.`

  return streamCompletion({ provider, apiKey, system: director.systemPrompt, userMsg, maxTokens: 800, onChunk })
}

// Llama al Chairman para el veredicto final basado en todos los análisis
async function callVerdict({ situation, meetingType, responses, apiKey, provider }) {
  const summaries = responses
    .map(r => `${r.director.name} (${r.director.title}):\n${r.text}`)
    .join('\n\n---\n\n')

  const verdictSystem = `Eres Roberto Alcántara, Chairman de esta junta directiva. Tras escuchar a todos los directores, tu rol es sintetizar el debate y emitir el veredicto final de la junta.
Tu síntesis debe:
1. Identificar los 2-3 puntos de consenso más importantes
2. Señalar el principal punto de desacuerdo o tensión
3. Dar el VEREDICTO FINAL: proceder / proceder con condiciones / no proceder — con las condiciones específicas si aplica
4. Listar 3 PRÓXIMOS PASOS concretos y priorizados
Sé directo, ejecutivo y claro. Máximo 400 palabras.`

  const verdictMsg = `DEBATE DE LA JUNTA:

SITUACIÓN ORIGINAL:
${situation}

ANÁLISIS DE LOS DIRECTORES:
${summaries}

Sintetiza el debate y emite el veredicto final de la junta.`

  return streamCompletion({ provider, apiKey, system: verdictSystem, userMsg: verdictMsg, maxTokens: 600 })
}

export function useBoard() {
  // Estado por director: { id, status: 'pending'|'streaming'|'done'|'error', text, error }
  const [directorStates, setDirectorStates] = useState({})
  const [verdict, setVerdict] = useState(null)
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | convening | debating | verdict | done
  const [activeDirectors, setActiveDirectors] = useState([])
  const [rateLimitInfo, setRateLimitInfo] = useState(null)
  const [globalError, setGlobalError] = useState(null)

  // `directors` viene ya resuelto y ordenado desde fuera (selección automática + overrides del usuario)
  const conveneBoard = useCallback(async ({ directors, situation, meetingType, contextBlock, apiKey, provider }) => {
    const selected = directors
    setActiveDirectors(selected)
    setDirectorStates({})
    setVerdict(null)
    setGlobalError(null)
    setPhase('convening')

    // Init all as pending
    const initState = {}
    selected.forEach(d => { initState[d.id] = { status: 'pending', text: '' } })
    setDirectorStates(initState)

    await new Promise(r => setTimeout(r, 600)) // pequeña pausa dramática
    setPhase('debating')

    // Debate secuencial: cada director habla después de escuchar a los anteriores,
    // para que puedan reaccionar y referenciarse entre sí de verdad.
    const debateSoFar = []
    for (const director of selected) {
      setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'streaming', text: '' } }))

      try {
        const text = await callDirector({
          director,
          situation,
          meetingType,
          contextBlock: contextBlock || '',
          debateSoFar,
          apiKey: apiKey || null,
          provider: provider || 'claude',
          onChunk: (partial) => {
            setDirectorStates(prev => ({
              ...prev,
              [director.id]: { status: 'streaming', text: partial },
            }))
          },
        })
        setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'done', text } }))
        debateSoFar.push({ director, text })
      } catch (err) {
        // Rate limit en modo proxy
        if (err.message.includes('429') || err.message.toLowerCase().includes('límite')) {
          setGlobalError(err.message)
        }
        setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'error', text: '', error: err.message } }))
      }
    }

    const successful = debateSoFar

    if (successful.length === 0) {
      setPhase('idle')
      return
    }

    // Veredicto del Chairman
    setPhase('verdict')
    setVerdictLoading(true)
    try {
      const verdictText = await callVerdict({
        situation,
        meetingType,
        responses: successful,
        apiKey: apiKey || null,
        provider: provider || 'claude',
      })
      setVerdict(verdictText)
    } catch (err) {
      setVerdict('Error al generar el veredicto. Los análisis individuales están disponibles arriba.')
    } finally {
      setVerdictLoading(false)
      setPhase('done')
    }
  }, [])

  const reset = useCallback(() => {
    setDirectorStates({})
    setVerdict(null)
    setVerdictLoading(false)
    setPhase('idle')
    setActiveDirectors([])
    setGlobalError(null)
  }, [])

  return {
    conveneBoard, reset,
    directorStates, verdict, verdictLoading,
    phase, activeDirectors, rateLimitInfo, globalError,
  }
}
