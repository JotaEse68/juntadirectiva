import { useState, useCallback } from 'react'
import { DIRECTORS, selectDirectorsForMeeting } from '../lib/directors.js'

// Llama a Anthropic para un director específico con streaming
import { MEETING_TYPES } from '../lib/directors.js'

async function callDirector({ director, situation, meetingType, contextBlock, apiKey, onChunk }) {
  const meetingLabel = MEETING_TYPES.find(m => m.id === meetingType)?.label || 'Reunión'

  const contextSection = contextBlock ? ("\n\nCONTEXTO ADICIONAL:\n" + contextBlock) : ""
  const userMsg = `REUNIÓN DE JUNTA — ${meetingLabel}

SITUACIÓN:
${situation}${contextSection}

Como ${director.name} (${director.title}), da tu análisis experto y posición. Si el contexto adicional es relevante para tu especialidad, incorpóralo en tu análisis.`

  const endpoint = apiKey
    ? 'https://api.anthropic.com/v1/messages'
    : '/api/coach'

  const headers = apiKey
    ? {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    : { 'Content-Type': 'application/json' }

  const body = apiKey
    ? JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: director.systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
        stream: true,
      })
    : JSON.stringify({
        systemPrompt: director.systemPrompt,
        userPrompt: userMsg,
        maxTokens: 800,
      })

  const res = await fetch(endpoint, { method: 'POST', headers, body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }

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
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          fullText += parsed.delta.text
          onChunk(fullText)
        }
      } catch { /* skip */ }
    }
  }
  return fullText
}

// Llama al Chairman para el veredicto final basado en todos los análisis
async function callVerdict({ situation, meetingType, responses, apiKey }) {
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

  const endpoint = apiKey ? 'https://api.anthropic.com/v1/messages' : '/api/coach'
  const headers = apiKey
    ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : { 'Content-Type': 'application/json' }

  const body = apiKey
    ? JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, system: verdictSystem, messages: [{ role: 'user', content: verdictMsg }], stream: true })
    : JSON.stringify({ systemPrompt: verdictSystem, userPrompt: verdictMsg, maxTokens: 600 })

  const res = await fetch(endpoint, { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`Error en veredicto ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  const chunks = []

  // No hace streaming del veredicto — lo devuelve completo
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
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          fullText += parsed.delta.text
        }
      } catch { /* skip */ }
    }
  }
  return fullText
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

  const conveneBoard = useCallback(async ({ situation, meetingType, contextBlock, apiKey }) => {
    const selected = selectDirectorsForMeeting(meetingType, DIRECTORS)
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

    // Lanzar todos los directores en paralelo
    const promises = selected.map(async (director) => {
      setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'streaming', text: '' } }))

      try {
        const text = await callDirector({
          director,
          situation,
          meetingType,
          contextBlock: contextBlock || '',
          apiKey: apiKey || null,
          onChunk: (partial) => {
            setDirectorStates(prev => ({
              ...prev,
              [director.id]: { status: 'streaming', text: partial },
            }))
          },
        })
        setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'done', text } }))
        return { director, text }
      } catch (err) {
        // Rate limit en modo proxy
        if (err.message.includes('429') || err.message.toLowerCase().includes('límite')) {
          setGlobalError(err.message)
        }
        setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'error', text: '', error: err.message } }))
        return { director, text: null }
      }
    })

    const results = await Promise.all(promises)
    const successful = results.filter(r => r.text)

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
