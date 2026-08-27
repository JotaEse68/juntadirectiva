import { useState, useCallback } from 'react'
import { DIRECTORS } from '../lib/directors.js'
import { streamCompletion } from '../lib/aiClient.js'
import { useI18n } from '../lib/i18n.js'

// El system prompt de cada director está cargado de instrucciones y convenciones en español
// (tono, cierre, etc.) — el modelo las prioriza sobre una nota suelta al final del mensaje de
// usuario, así que la instrucción de idioma va como primera línea del system prompt (ver
// useBoard.js, donde una versión solo-en-userMsg de esto se probó en vivo y no funcionó).
function languageSystemDirective(lang) {
  return lang === 'en' ? 'IMPORTANT: Write your entire reply in English — natural, warm and direct, not a literal translation. This applies to every line, including the closing conviction line described below in Spanish: write it in English as "High conviction." / "Medium conviction." / "Conditional conviction on: [what]." — never use the Spanish word "convicción".\n\n' : ''
}

// Opinión exprés (2-3 frases) de un director que no participó en el debate en vivo —
// para que ningún miembro de la junta de 12 quede sin decir nada en el informe.
async function quickTake({ director, situation, apiKey, provider, lang }) {
  const languageLine = lang === 'en' ? '\n\n(Reminder: answer in English.)' : ''
  const userMsg = `SITUACIÓN: ${situation}

Como ${director.name} (${director.title}), da tu opinión exprés en 2-3 frases desde tu especialidad. No es un análisis largo — solo tu primera reacción experta y directa, sin rodeos.${languageLine}`
  return streamCompletion({ provider, apiKey, system: languageSystemDirective(lang) + director.systemPrompt, userMsg, maxTokens: 260, serverMode: 'premium' })
}

// Encabezados exactos que también reconocen ReportModal.jsx (iconos, checklist, secciones)
// y reportPdf.js (título en negrita por sección) — deben coincidir letra a letra en ambos sitios.
// Sin tildes ni puntuación en la versión inglesa: reportPdf.js detecta el inicio de sección con
// un regex que solo admite [A-Z /0-9], así que una coma o un guion ahí rompería la partición del PDF.
const HEADERS_ES = ['PRIMERA VICTORIA 48 HORAS', 'PLAN DE 3 SEMANAS', 'ACCIONES IMPRESCINDIBLES', 'ACCIONES NECESARIAS', 'ACCIONES PARA MÁS ADELANTE', 'TÚ O UN FREELANCER', 'SEÑALES QUE MIRAR', 'RIESGOS Y CÓMO EVITARLOS', 'SI OCURRE ESTO HAZ AQUELLO', 'TU LISTA DE CONFIRMACIÓN']
const HEADERS_EN = ['FIRST WIN IN 48 HOURS', '3 WEEK PLAN', 'ESSENTIAL ACTIONS', 'IMPORTANT ACTIONS', 'ACTIONS FOR LATER', 'YOU OR A FREELANCER', 'SIGNALS TO WATCH', 'RISKS AND HOW TO AVOID THEM', 'IF THIS HAPPENS DO THAT', 'YOUR CONFIRMATION CHECKLIST']

function buildReportSystem(lang) {
  const en = lang === 'en'
  const [H1, H2, H3, H4, H5, H6, H7, H8, H9, H10] = en ? HEADERS_EN : HEADERS_ES
  const languageLine = en ? 'IMPORTANT: write the ENTIRE report in English — opening greeting, every section and the farewell included. Use exactly these English headers below, verbatim and in capitals (do not translate them differently or leave them in Spanish).\n\n' : ''

  return `${languageLine}Eres el equipo editorial de Junta Directiva AI. A partir de un debate ya completado, produces un PLAN DE ACCIÓN para un autoempleado o microempresa de 1-3 personas — sin departamentos ni presupuesto de cinco cifras; la única persona que va a ejecutar esto es quien te lee. El usuario ya tiene gratis el veredicto: no lo repitas ni lo reformules; conviértelo en ejecución concreta que se pueda empezar hoy.

TONO: eres cercano, cálido y profesional a la vez — como un mentor, un jefe o incluso un padre que quiere que a esta persona le vaya bien. Hazla sentir acompañada y especial, sin perder ni un gramo de rigor ni de experiencia. Nada de frialdad de consultora ni de jerga corporativa.

APERTURA (antes del primer encabezado, sin encabezado propio): saluda con calidez. Si el usuario menciona su nombre en la situación, úsalo; si no, usa un saludo cercano sin inventarte un nombre. Después, en 2-3 frases, cuéntale qué has visto analizando su situación — que note que la has entendido de verdad antes de darle nada.

REGLAS: nunca inventes cifras del negocio del usuario (facturación, costes, tamaño de equipo) que no te haya dado — usa variables relativas o precios reales de mercado de herramientas y freelancers. Cada acción debe poder ejecutarla el usuario solo, con una herramienta gratis o barata, o delegando puntualmente una tarea concreta a un freelancer (Fiverr/Upwork) — nunca asumas que hay alguien más con quien repartir el trabajo. Nada de jerga corporativa.

FORMATO: escribe cómodo de leer — frases y párrafos cortos, con saltos de línea entre ideas, nunca bloques de texto densos y pegados. Esto puede alargar el documento: no acortes contenido para que quepa en menos espacio, prioriza siempre que se entienda bien y se lea a gusto. Cuando nombres una herramienta o un sitio real (Google Sheets, Canva, Fiverr, Notion, etc.), dalo como enlace en formato markdown: [nombre de la herramienta](URL real) — así queda clicable. Evita "hito comprobable" y lenguaje de gestión de proyectos; usa algo más humano como "sabrás que vas bien cuando..." o "lo notarás porque...". Para cada acción importante, cuando puedas, añade una nota breve de POR QUÉ importa y QUÉ consigue el usuario al hacerla — no solo el qué, también el para qué.

Estructura obligatoria, con estos encabezados exactos en mayúsculas, cada uno en su propia línea:

${H1}
La única acción que hay que hacer ya, antes que nada, y por qué es la que más mueve la aguja.

${H2}
Qué debe lograrse cada semana. En vez de "hito comprobable", dile cómo lo va a notar — algo tangible y humano.

${H3}
Las 2 a 4 acciones sin las que nada más funciona. Para cada una: qué hacer, por qué es imprescindible y qué consigue al hacerla.

${H4}
2 a 4 acciones que consolidan lo anterior, pero no bloquean si se retrasan unos días. Mismo formato: qué, por qué, qué consigue.

${H5}
1 a 3 ideas que vale la pena tener en el radar una vez lo esencial funcione, para no sobrecargar la primera semana.

${H6}
Para cada acción de las tres listas anteriores: si la hace el usuario, con qué herramienta (enlazada) y en cuánto tiempo aproximado; si conviene delegarla puntualmente a un freelancer barato, con el rango de precio real de mercado de esa tarea y dónde encontrarlo (Fiverr/Upwork, enlazado).

${H7}
Entre 3 y 5 métricas simples con objetivo, cada cuánto revisarlas y la señal que obliga a corregir el rumbo.

${H8}
Los 3 riesgos más relevantes de este plan y la respuesta concreta si se materializan.

${H9}
2 o 3 reglas tipo "si pasa X, haz Y" para las incertidumbres centrales de la situación.

${H10}
Un listado simple, en orden, tipo checklist, con cada paso concreto del plan resumido en una línea — para que el usuario pueda ir marcando según avanza. Nada de teoría aquí, solo la lista.

CIERRE (después del último encabezado, sin encabezado propio): despídete con calidez — agradécele la confianza, deséale que le vaya bien con esto, y termina con una frase motivadora breve y genuina, no una frase hecha de calendario de pared.

Sé específico, denso en valor y cero genérico. Nunca dejes una sección a medias ni el documento cortado — complétalo entero, del saludo inicial a la despedida. Este plan lo tiene que poder ejecutar una sola persona empezando mañana, no un equipo, y tiene que sentirse escrito para ella, no para cualquiera.`
}

export function useReport() {
  const { t } = useI18n()
  const [report, setReport] = useState(null)       // { text, quickTakes: [{director,text}], locked }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generateReport = useCallback(async ({ situation, meetingType, activeDirectors, directorStates, verdict, apiKey, provider, lang = 'es' }) => {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      // Sin API key propia, el informe lo paga el servidor: hay que gastar un crédito real
      // verificado en KV antes de llamar a ningún modelo. Con API key propia el usuario paga
      // su propia cuenta, así que no consume créditos comprados en esta app.
      if (!apiKey) {
        const gateRes = await fetch('/api/analysis-gate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'consume-report' }),
        })
        if (!gateRes.ok) {
          const data = await gateRes.json().catch(() => ({}))
          throw new Error(data.code === 'NO_REPORT_CREDITS' ? t('gate.noReportCredits') : (data.error || t('gate.noReportCredits')))
        }
      }

      const activeIds = new Set(activeDirectors.map(d => d.id))
      const missingDirectors = DIRECTORS.filter(d => !activeIds.has(d.id))

      const quickResults = await Promise.all(missingDirectors.map(async (director) => {
        try {
          const text = await quickTake({ director, situation, apiKey, provider, lang })
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
      const text = await streamCompletion({ provider, apiKey, system: buildReportSystem(lang), userMsg: reportPrompt, maxTokens: 7500, serverMode: 'premium' })
      setReport({ text, quickTakes, locked: false })
    } catch (err) {
      setError(err.message || t('report.generationFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const reset = useCallback(() => { setReport(null); setError(null) }, [])

  return { report, loading, error, generateReport, reset }
}
