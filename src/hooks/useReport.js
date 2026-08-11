import { useState, useCallback } from 'react'
import { DIRECTORS } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'

// Opinión exprés (2-3 frases) de un director que no participó en el debate en vivo —
// para que ningún miembro de la junta de 12 quede sin decir nada en el informe.
async function quickTake({ director, situation, apiKey, provider }) {
  const userMsg = `SITUACIÓN: ${situation}

Como ${director.name} (${director.title}), da tu opinión exprés en 2-3 frases desde tu especialidad. No es un análisis largo — solo tu primera reacción experta y directa, sin rodeos.`
  return streamCompletion({ provider, apiKey, system: director.systemPrompt, userMsg, maxTokens: 180 })
}

const REPORT_SYSTEM_PAID = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces el INFORME COMPLETO — un documento notablemente más profundo y útil que el veredicto gratuito ya entregado al usuario. No repitas el veredicto, amplíalo.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

RESUMEN AMPLIADO
Dos o tres párrafos que profundizan en el análisis más allá del veredicto rápido, conectando los puntos de vista de los directores que sí debatieron en vivo con las opiniones exprés de los que no.

IDEAS ADICIONALES
4 a 6 ideas concretas y accionables que NO aparecieron en el veredicto rápido.

RECURSOS Y HERRAMIENTAS RECOMENDADAS
Nombra herramientas, plataformas, metodologías o tipos de recursos reales y conocidos, agrupados por categoría. No inventes URLs ni enlaces específicos — solo nombres reales de herramientas o categorías de búsqueda.

PLAN DE MEJORA DETALLADO
6 a 8 pasos concretos y priorizados. Para cada uno indica el esfuerzo estimado (bajo/medio/alto) entre paréntesis.

Sé denso en valor, cero relleno ni frases genéricas. Este informe debe sentirse claramente superior al veredicto gratuito.`

const REPORT_SYSTEM_FREE = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces una ampliación gratuita del veredicto — más profunda que el veredicto rápido, pero sin el plan de ejecución detallado (eso es exclusivo de la versión de pago). No lo menciones ni lo insinúes, simplemente no lo incluyas.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

RESUMEN AMPLIADO
Dos o tres párrafos que profundizan en el análisis más allá del veredicto rápido, conectando los puntos de vista de los directores que sí debatieron en vivo con las opiniones exprés de los que no.

IDEAS ADICIONALES
4 a 6 ideas concretas y accionables que NO aparecieron en el veredicto rápido.

RECURSOS Y HERRAMIENTAS RECOMENDADAS
Nombra herramientas, plataformas, metodologías o tipos de recursos reales y conocidos, agrupados por categoría. No inventes URLs ni enlaces específicos — solo nombres reales de herramientas o categorías de búsqueda.

Sé denso en valor, cero relleno ni frases genéricas.`

export function useReport() {
  const [report, setReport] = useState(null)       // { text, quickTakes: [{director,text}], locked }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generateReport = useCallback(async ({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey, provider, tier = 'paid' }) => {
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

      const system = tier === 'free' ? REPORT_SYSTEM_FREE : REPORT_SYSTEM_PAID
      const text = await streamCompletion({ provider, apiKey, system, userMsg: reportPrompt, maxTokens: tier === 'free' ? 900 : 1500 })
      setReport({ text, quickTakes, locked: tier === 'free' })
    } catch (err) {
      setError(err.message || 'No se pudo generar el informe')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => { setReport(null); setError(null) }, [])

  return { report, loading, error, generateReport, reset }
}
