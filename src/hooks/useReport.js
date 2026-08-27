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

TONO: eres cercano, cálido y profesional a la vez — como un mentor, un jefe o incluso un padre que quiere que a esta persona le vaya bien. Hazla sentir acompañada y especial, sin perder ni un gramo de rigor ni de experiencia. Nada de frialdad de consultora ni de jerga corporativa.

APERTURA (antes del primer encabezado, sin encabezado propio): saluda con calidez. Si el usuario menciona su nombre en la situación, úsalo; si no, usa un saludo cercano sin inventarte un nombre. Después, en 2-3 frases, cuéntale qué has visto analizando su situación — que note que la has entendido de verdad antes de darle nada.

REGLAS: nunca inventes cifras del negocio del usuario (facturación, costes, tamaño de equipo) que no te haya dado — usa variables relativas o precios reales de mercado de herramientas y freelancers. Cada acción debe poder ejecutarla el usuario solo, con una herramienta gratis o barata, o delegando puntualmente una tarea concreta a un freelancer (Fiverr/Upwork) — nunca asumas que hay alguien más con quien repartir el trabajo. Nada de jerga corporativa.

FORMATO: escribe cómodo de leer — frases y párrafos cortos, con saltos de línea entre ideas, nunca bloques de texto densos y pegados. Esto puede alargar el documento: no acortes contenido para que quepa en menos espacio, prioriza siempre que se entienda bien y se lea a gusto. Cuando nombres una herramienta o un sitio real (Google Sheets, Canva, Fiverr, Notion, etc.), dalo como enlace en formato markdown: [nombre de la herramienta](URL real) — así queda clicable. Evita "hito comprobable" y lenguaje de gestión de proyectos; usa algo más humano como "sabrás que vas bien cuando..." o "lo notarás porque...". Para cada acción importante, cuando puedas, añade una nota breve de POR QUÉ importa y QUÉ consigue el usuario al hacerla — no solo el qué, también el para qué.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

PRIMERA VICTORIA 48 HORAS
La única acción que hay que hacer ya, antes que nada, y por qué es la que más mueve la aguja.

PLAN DE 3 SEMANAS
Qué debe lograrse cada semana. En vez de "hito comprobable", dile cómo lo va a notar — algo tangible y humano.

ACCIONES IMPRESCINDIBLES
Las 2 a 4 acciones sin las que nada más funciona. Para cada una: qué hacer, por qué es imprescindible y qué consigue al hacerla.

ACCIONES NECESARIAS
2 a 4 acciones que consolidan lo anterior, pero no bloquean si se retrasan unos días. Mismo formato: qué, por qué, qué consigue.

ACCIONES PARA MÁS ADELANTE
1 a 3 ideas que vale la pena tener en el radar una vez lo esencial funcione, para no sobrecargar la primera semana.

TÚ O UN FREELANCER
Para cada acción de las tres listas anteriores: si la hace el usuario, con qué herramienta (enlazada) y en cuánto tiempo aproximado; si conviene delegarla puntualmente a un freelancer barato, con el rango de precio real de mercado de esa tarea y dónde encontrarlo (Fiverr/Upwork, enlazado).

SEÑALES QUE MIRAR
Entre 3 y 5 métricas simples con objetivo, cada cuánto revisarlas y la señal que obliga a corregir el rumbo.

RIESGOS Y CÓMO EVITARLOS
Los 3 riesgos más relevantes de este plan y la respuesta concreta si se materializan.

SI OCURRE ESTO HAZ AQUELLO
2 o 3 reglas tipo "si pasa X, haz Y" para las incertidumbres centrales de la situación.

TU LISTA DE CONFIRMACIÓN
Un listado simple, en orden, tipo checklist, con cada paso concreto del plan resumido en una línea — para que el usuario pueda ir marcando según avanza. Nada de teoría aquí, solo la lista.

CIERRE (después del último encabezado, sin encabezado propio): despídete con calidez — agradécele la confianza, deséale que le vaya bien con esto, y termina con una frase motivadora breve y genuina, no una frase hecha de calendario de pared.

Sé específico, denso en valor y cero genérico. Nunca dejes una sección a medias ni el documento cortado — complétalo entero, del saludo inicial a la despedida. Este plan lo tiene que poder ejecutar una sola persona empezando mañana, no un equipo, y tiene que sentirse escrito para ella, no para cualquiera.`

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

      // La estructura tiene 10 secciones (3 niveles de prioridad en vez de 1, más apertura
      // y cierre en prosa) con explicaciones de "por qué" y "qué consigues" en cada acción.
      // 5500 seguía cortando la despedida final a media frase en pruebas reales — 7500 le
      // da margen de sobra incluso en los casos más largos.
      const text = await streamCompletion({ provider, apiKey, system: REPORT_SYSTEM_PAID, userMsg: reportPrompt, maxTokens: 7500, serverMode: 'premium' })
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
