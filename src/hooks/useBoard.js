import { useState, useCallback, useRef } from 'react'
import { MEETING_TYPES, MEETING_FRAMING } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'

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

Como ${director.name} (${director.title}), da tu análisis experto y posición. Si el contexto adicional es relevante para tu especialidad, incorpóralo en tu análisis. Nunca te niegues a opinar alegando que no puedes acceder a una URL o navegar por internet — todo el contexto relevante ya está resuelto y resumido arriba; si algo no está cubierto ahí, trabaja igual con lo que sí tienes.`

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
  const [isPaused, setIsPaused] = useState(false)

  // El debate se pausa ENTRE turnos (no a mitad de la respuesta de un director), así que
  // nunca se pierde contenido ya generado — solo se retiene el arranque del siguiente turno.
  const pausedRef = useRef(false)
  const resumeSignalRef = useRef(null)

  const waitIfPaused = useCallback(() => {
    if (!pausedRef.current) return Promise.resolve()
    return new Promise(resolve => { resumeSignalRef.current = resolve })
  }, [])

  const pause = useCallback(() => {
    pausedRef.current = true
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    setIsPaused(false)
    resumeSignalRef.current?.()
    resumeSignalRef.current = null
  }, [])

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
      await waitIfPaused()
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
  }, [waitIfPaused])

  const reset = useCallback(() => {
    pausedRef.current = false
    resumeSignalRef.current?.()
    resumeSignalRef.current = null
    setIsPaused(false)
    setDirectorStates({})
    setVerdict(null)
    setVerdictLoading(false)
    setPhase('idle')
    setActiveDirectors([])
    setGlobalError(null)
  }, [])

  return {
    conveneBoard, reset, pause, resume,
    directorStates, verdict, verdictLoading,
    phase, activeDirectors, rateLimitInfo, globalError, isPaused,
  }
}
