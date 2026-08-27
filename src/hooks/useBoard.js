import { useState, useCallback, useRef, useEffect } from 'react'
import { MEETING_TYPES, MEETING_FRAMING } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'
import { useI18n } from '../lib/i18n.js'

// Los prompts de directores/Chairman se quedan en español (así están afinados) — para que
// respondan en inglés cuando la UI está en inglés hace falta algo más fuerte que una línea al
// final del mensaje de usuario: los system prompts de los directores están cargados de
// instrucciones y convenciones en español (p.ej. "Termina con tu convicción: convicción
// alta/..."), y el modelo las prioriza sobre una nota suelta al final del user message —
// se probó en vivo y el debate seguía saliendo en español. Va como PRIMERA línea del
// system prompt (más peso que en medio o al final) y se repite al final del user message
// como refuerzo.
function languageSystemDirective(lang) {
  return lang === 'en' ? 'IMPORTANT: Write your entire reply in English — natural, warm and direct, not a literal translation. This applies to every line, including any closing conviction statement.\n\n' : ''
}
function languageDirective(lang) {
  return lang === 'en' ? '\n\n(Reminder: answer in English.)' : ''
}

const HISTORY_KEY = 'junta-paid-last-session'
const HISTORY_TTL = 24 * 60 * 60 * 1000

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null')
    return saved && Date.now() - saved.savedAt < HISTORY_TTL ? saved : null
  } catch { return null }
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

async function callDirector({ director, situation, meetingType, contextBlock, debateSoFar, apiKey, provider, onChunk, lang }) {
  const meetingLabel = MEETING_TYPES.find(m => m.id === meetingType)?.label || 'Reunión'
  const framing = MEETING_FRAMING[meetingType] || ''

  const contextSection = contextBlock ? ("\n\nCONTEXTO ADICIONAL:\n" + contextBlock) : ""
  const debateSection = buildDebateRecap(debateSoFar || [])
  const userMsg = `REUNIÓN DE JUNTA — ${meetingLabel}
${framing}

SITUACIÓN:
${situation}${contextSection}${debateSection}

Como ${director.name} (${director.title}), da tu análisis experto y posición. Si el contexto adicional es relevante para tu especialidad, incorpóralo en tu análisis. Nunca te niegues a opinar alegando que no puedes acceder a una URL o navegar por internet — todo el contexto relevante ya está resuelto y resumido arriba; si algo no está cubierto ahí, trabaja igual con lo que sí tienes.${languageDirective(lang)}`

  return streamCompletion({ provider, apiKey, system: languageSystemDirective(lang) + director.systemPrompt, userMsg, maxTokens: 800, onChunk })
}

// Llama al Chairman para el veredicto final basado en todos los análisis
async function callContrast({ situation, responses, apiKey, provider, lang }) {
  const summaries = responses.map(r => `${r.director.name}: ${excerpt(r.text, 500)}`).join('\n\n')
  return streamCompletion({
    provider, apiKey, maxTokens: 350,
    system: languageSystemDirective(lang) + 'Eres el moderador de una junta directiva que asesora a un autoempleado o microempresa sin departamentos ni presupuesto de cinco cifras. Contrasta las perspectivas recibidas: identifica dos acuerdos, una tensión real y qué evidencia decidiría entre alternativas. Sé concreto y no inventes datos del negocio del usuario.',
    userMsg: `SITUACIÓN:\n${situation}\n\nPERSPECTIVAS INICIALES:\n${summaries}${languageDirective(lang)}`,
  })
}

async function callVerdict({ situation, meetingType, contextBlock, responses, contrast = '', apiKey, provider, lang }) {
  const summaries = responses
    .map(r => `${r.director.name} (${r.director.title}):\n${r.text}`)
    .join('\n\n---\n\n')

  const verdictSystem = `${languageSystemDirective(lang)}Eres Roberto Alcántara, Chairman de esta junta directiva. Tras escuchar a todos los directores, tu rol es sintetizar el debate en una recomendación clara y accionable — no en una sentencia.
Recuerda quién te consulta: un autoempleado o microempresa de 1-3 personas, sin departamentos ni presupuesto de cinco cifras — es el CEO, el vendedor y el técnico a la vez. El camino a seguir debe ser algo ejecutable por él solo: una herramienta, una automatización o IA existente, o delegar puntualmente una tarea concreta a un freelancer barato (Fiverr/Upwork) si hace falta — nunca "monta un equipo", ni cifras de negocio que nadie te ha dado. Nada de jerga corporativa: tradúcelo a lenguaje de calle.
Tu síntesis debe:
1. Identificar los 2-3 puntos de consenso más importantes entre los directores
2. Señalar la principal tensión u objeción a tener en cuenta, siempre acompañada de cómo abordarla
3. Dar tu RECOMENDACIÓN FINAL: proceder / proceder así [con los ajustes concretos] / replantear así [la alternativa concreta que sí funcionaría]
4. Listar 3 PRÓXIMOS PASOS concretos y priorizados
Sé directo, ejecutivo y claro — y siempre constructivo: incluso cuando la recomendación es replantear, da el camino alternativo, nunca solo el freno. Máximo 400 palabras.`

  const verdictMsg = `DEBATE DE LA JUNTA:

SITUACIÓN ORIGINAL:
${situation}

${contextBlock ? `CONTEXTO DE APOYO YA LEÍDO:\n${contextBlock}\n` : ''}

ANÁLISIS DE LOS DIRECTORES:
${summaries}

${contrast ? `RONDA DE CONTRASTE:\n${contrast}\n` : ''}

Sintetiza el debate y emite el veredicto final de la junta.${languageDirective(lang)}`

  return streamCompletion({ provider, apiKey, system: verdictSystem, userMsg: verdictMsg, maxTokens: 600 })
}

export function useBoard() {
  const { lang, t } = useI18n()
  const savedRef = useRef(loadHistory())
  // Estado por director: { id, status: 'pending'|'streaming'|'done'|'error', text, error }
  const [directorStates, setDirectorStates] = useState(() => savedRef.current?.directorStates || {})
  const [verdict, setVerdict] = useState(() => savedRef.current?.verdict || null)
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [phase, setPhase] = useState(() => savedRef.current?.verdict ? 'done' : 'idle') // idle | convening | debating | contrasting | verdict | done
  const [activeDirectors, setActiveDirectors] = useState(() => savedRef.current?.activeDirectors || [])
  const [rateLimitInfo, setRateLimitInfo] = useState(null)
  const [globalError, setGlobalError] = useState(null)
  const [isPaused, setIsPaused] = useState(false)

  // El debate se pausa ENTRE turnos (no a mitad de la respuesta de un director), así que
  // nunca se pierde contenido ya generado — solo se retiene el arranque del siguiente turno.
  const pausedRef = useRef(false)
  const resumeSignalRef = useRef(null)
  const lastRequestRef = useRef(savedRef.current?.request || null)

  useEffect(() => {
    if (!verdict || phase !== 'done') return
    // Never persist a user's provider key. The restored board is readable,
    // but a fresh retry after reload asks for the key again when needed.
    const { apiKey, ...safeRequest } = lastRequestRef.current || {}
    const saved = { savedAt: Date.now(), request: safeRequest, directorStates, verdict, activeDirectors }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(saved))
    savedRef.current = saved
  }, [verdict, phase, directorStates, activeDirectors])

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
  const conveneBoard = useCallback(async ({ directors, situation, meetingType, contextBlock, apiKey, provider, mode = 'fast' }) => {
    lastRequestRef.current = { directors, situation, meetingType, contextBlock, apiKey, provider, mode }
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

    const debateSoFar = []
    const runDirector = async director => {
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
          lang,
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
        // Rate limit en modo proxy — el servidor manda el texto en español fijo, así que si
        // trae el code RATE_LIMITED (ver aiClient.js) se reconstruye el mensaje traducido en
        // vez de mostrar el texto crudo del servidor.
        if (err.code === 'RATE_LIMITED') {
          const min = err.resetAt ? Math.max(1, Math.ceil((err.resetAt - Date.now()) / 60000)) : '?'
          setGlobalError(t('gate.rateLimited').replace('{min}', min))
        } else if (err.message.includes('429') || err.message.toLowerCase().includes('límite')) {
          setGlobalError(err.message)
        }
        setDirectorStates(prev => ({ ...prev, [director.id]: { status: 'error', text: '', error: err.message } }))
      }
    }

    if (mode === 'deep') {
      // Máxima calidad: cada especialista recibe el hilo ya construido.
      for (const director of selected) await runDirector(director)
    } else {
      // Rapidez legible: tandas pequeñas evitan saturar el proveedor del usuario.
      for (let index = 0; index < selected.length; index += 3) {
        await waitIfPaused()
        await Promise.all(selected.slice(index, index + 3).map(director => runDirector(director)))
      }
    }

    const successful = debateSoFar

    if (successful.length === 0) {
      setGlobalError(t('board.connectionError'))
      setPhase('idle')
      return
    }

    let contrast = ''
    if (mode === 'fast' && successful.length > 1) {
      setPhase('contrasting')
      try { contrast = await callContrast({ situation, responses: successful, apiKey: apiKey || null, provider: provider || 'claude', lang }) } catch { /* el Chairman puede sintetizar sin esta ronda */ }
    }

    // Veredicto del Chairman
    setPhase('verdict')
    setVerdictLoading(true)
    try {
      const verdictText = await callVerdict({
        situation,
        meetingType,
        contextBlock: contextBlock || '',
        responses: successful,
        contrast,
        apiKey: apiKey || null,
        provider: provider || 'claude',
        lang,
      })
      setVerdict(verdictText)
    } catch (err) {
      setVerdict(t('board.verdictError'))
    } finally {
      setVerdictLoading(false)
      setPhase('done')
    }
  }, [waitIfPaused, lang, t])

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

  const retry = useCallback(() => {
    if (!lastRequestRef.current) return
    return conveneBoard(lastRequestRef.current)
  }, [conveneBoard])

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY)
    savedRef.current = null
    reset()
  }, [reset])

  return {
    conveneBoard, reset, retry, clearHistory, restoredSession: savedRef.current?.request || null, pause, resume,
    directorStates, verdict, verdictLoading,
    phase, activeDirectors, rateLimitInfo, globalError, isPaused,
  }
}
