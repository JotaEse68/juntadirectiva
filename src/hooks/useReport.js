import { useState, useCallback } from 'react'
import { DIRECTORS } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'

// Opinión exprés (2-3 frases) de un director que no participó en el debate en vivo —
// para que ningún miembro de la junta de 12 quede sin decir nada en el informe.
async function quickTake({ director, situation, apiKey, provider }) {
  const userMsg = `SITUACIÓN: ${situation}

Como ${director.name} (${director.title}), da tu opinión exprés en 2-3 frases desde tu especialidad. No es un análisis largo — solo tu primera reacción experta y directa, sin rodeos.`
  return streamCompletion({ provider, apiKey, system: director.systemPrompt, userMsg, maxTokens: 180, serverMode: 'premium' })
}

const REPORT_SYSTEM_PAID = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces un PLAN DE ACCIÓN OPERATIVO. El usuario ya tiene gratis el veredicto: no lo repitas ni lo reformules; conviértelo en ejecución concreta.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

HOJA DE RUTA 30/60/90 DÍAS
Qué debe lograrse en cada horizonte temporal, con hitos verificables.

ACCIONES PRIORITARIAS
6 a 8 acciones concretas, ordenadas por prioridad. Explica brevemente por qué cada una va en ese orden.

RESPONSABLES Y ESFUERZO
Para cada acción, propone el rol responsable y el esfuerzo estimado (bajo/medio/alto).

KPIS Y SEÑALES DE ALERTA
Entre 4 y 6 métricas con objetivo, frecuencia de revisión y la señal que exige corregir el rumbo.

RIESGOS Y CONTINGENCIAS
Los 3 riesgos más relevantes, su impacto y la respuesta concreta si se materializan.

ESCENARIOS DE DECISIÓN
2 o 3 reglas tipo “si ocurre X, haz Y” para las incertidumbres centrales.

Sé específico, denso en valor y cero genérico. Este plan debe ser ejecutable por un equipo mañana mismo.`

export function useReport() {
  const [report, setReport] = useState(null)       // { text, quickTakes: [{director,text}], locked }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generateReport = useCallback(async ({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey, provider }) => {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const activeIds = new Set(activeDirectors.map(d => d.id))
      const missingDirectors = DIRECTORS.filter(d => !activeIds.has(d.id))

      const quickResults = await Promise.all(missingDirectors.map(async (director) => {
        try {
          const text = await quickTake({ director, situation, apiKey, provider })
          return { director, text }
        } catch {
          return { director, text: null }
        }
      }))
      const quickTakes = quickResults.filter(q => q.text)

      const liveSummary = activeDirectors
        .map(d => `${d.name} (${d.title}) [debate en vivo]:\n${directorStates[d.id]?.text || ''}`)
        .join('\n\n')
      const quickSummary = quickTakes
        .map(q => `${q.director.name} (${q.director.title}) [opinión exprés]:\n${q.text}`)
        .join('\n\n')

      const reportPrompt = `SITUACIÓN ORIGINAL:
${situation}

VEREDICTO YA ENTREGADO AL USUARIO (gratuito, no lo repitas):
${verdict || '(sin veredicto disponible)'}

DEBATE EN VIVO:
${liveSummary}

OPINIONES EXPRÉS DE LOS DIRECTORES QUE NO PARTICIPARON EN VIVO:
${quickSummary || '(todos los directores participaron en vivo)'}

Produce el informe siguiendo exactamente la estructura indicada.`

      const text = await streamCompletion({ provider, apiKey, system: REPORT_SYSTEM_PAID, userMsg: reportPrompt, maxTokens: 1800, serverMode: 'premium' })
      setReport({ text, quickTakes, locked: false })
    } catch (err) {
      setError(err.message || 'No se pudo generar el informe')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => { setReport(null); setError(null) }, [])

  return { report, loading, error, generateReport, reset }
}
