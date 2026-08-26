import { useState, useCallback } from 'react'
import { DIRECTORS } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'

// Opinión exprés (2-3 frases) de un director que no participó en el debate en vivo —
// para que ningún miembro de la junta de 12 quede sin decir nada en el informe.
async function quickTake({ director, situation, apiKey, provider }) {
  const userMsg = `SITUACIÓN: ${situation}

Como ${director.name} (${director.title}), da tu opinión exprés en 2-3 frases desde tu especialidad. No es un análisis largo — solo tu primera reacción experta y directa, sin rodeos.`
  return streamCompletion({ provider, apiKey, system: director.systemPrompt, userMsg, maxTokens: 260, serverMode: 'premium' })
}

const REPORT_SYSTEM_PAID = `Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces un PLAN DE ACCIÓN para un autoempleado o microempresa de 1-3 personas — sin departamentos ni presupuesto de cinco cifras; la única persona que va a ejecutar esto es quien te lee. El usuario ya tiene gratis el veredicto: no lo repitas ni lo reformules; conviértelo en ejecución concreta que se pueda empezar hoy.

REGLAS: nunca inventes cifras del negocio del usuario (facturación, costes, tamaño de equipo) que no te haya dado — usa variables relativas o precios reales de mercado de herramientas y freelancers. Cada acción debe poder ejecutarla el usuario solo, con una herramienta gratis o barata, o delegando puntualmente una tarea concreta a un freelancer (Fiverr/Upwork) — nunca asumas que hay alguien más con quien repartir el trabajo. Nada de jerga corporativa.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

PRIMERA VICTORIA 48 HORAS
La única acción que hay que hacer ya, antes que nada, y por qué es la que más mueve la aguja.

PLAN DE 3 SEMANAS
Qué debe lograrse cada semana, con hitos que se puedan comprobar sin ambigüedad.

ACCIONES PRIORITARIAS
5 a 7 acciones concretas, ordenadas por prioridad. Explica brevemente por qué cada una va en ese orden.

TÚ O UN FREELANCER
Para cada acción: si la hace el usuario, con qué herramienta y en cuánto tiempo aproximado; si conviene delegarla puntualmente a un freelancer barato, con el rango de precio real de mercado de esa tarea.

SEÑALES QUE MIRAR
Entre 3 y 5 métricas simples con objetivo, cada cuánto revisarlas y la señal que obliga a corregir el rumbo.

RIESGOS Y CÓMO EVITARLOS
Los 3 riesgos más relevantes de este plan y la respuesta concreta si se materializan.

SI OCURRE ESTO HAZ AQUELLO
2 o 3 reglas tipo "si pasa X, haz Y" para las incertidumbres centrales de la situación.

Sé específico, denso en valor y cero genérico. Este plan lo tiene que poder ejecutar una sola persona empezando mañana, no un equipo.`

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

      // 1800 se quedaba corto para las 7 secciones de la nueva estructura (el informe se
      // cortaba a media frase, normalmente justo después de ACCIONES PRIORITARIAS, sin
      // llegar a TÚ O UN FREELANCER / SEÑALES QUE MIRAR / RIESGOS / SI OCURRE ESTO).
      const text = await streamCompletion({ provider, apiKey, system: REPORT_SYSTEM_PAID, userMsg: reportPrompt, maxTokens: 3600, serverMode: 'premium' })
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
