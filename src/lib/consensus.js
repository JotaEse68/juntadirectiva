// Heurística de consenso: busca la línea de voto/posición de cada director y la clasifica
// por palabras clave. Es aproximado (los directores no votan con un formato fijo), pero da
// una lectura visual útil de cuánto acuerdo hubo en la junta.

function extractVoteLine(text) {
  if (!text) return null
  const lines = text.split('\n').filter(l => l.trim())
  const keywords = ['voto:', 'posición:', 'evaluación:', 'veredicto:', 'proceder', 'apruebo', 'viable', 'riesgo', 'sí,', 'no,', 'apoyo', 'confianza']
  for (const line of lines.slice(-5)) {
    const lo = line.toLowerCase()
    if (keywords.some(k => lo.includes(k))) return line
  }
  return lines[lines.length - 1] || null
}

const MIXED_HINTS = ['con condiciones', 'con ajustes', 'con refuerzo', 'sí, pero', 'si, pero', 'riesgo medio', 'media confianza', 'cautela']
const NEGATIVE_HINTS = ['no proceder', 'no apruebo', 'inviable', 'no apoyo', 'alto riesgo', 'baja confianza', 'parar y replantear', 'no puede sin cambios', 'no,']
const POSITIVE_HINTS = ['proceder', 'apruebo', 'viable', 'apoyo', 'bajo riesgo', 'alta confianza', 'recomiendo', 'sí,']

export function classifyVote(text) {
  const line = extractVoteLine(text)
  if (!line) return null
  const lo = line.toLowerCase()
  if (MIXED_HINTS.some(h => lo.includes(h))) return 'mixto'
  if (NEGATIVE_HINTS.some(h => lo.includes(h))) return 'contra'
  if (POSITIVE_HINTS.some(h => lo.includes(h))) return 'favor'
  return null
}

// directorStates: { [id]: { status, text } }
export function computeConsensus(directorStates) {
  const counts = { favor: 0, contra: 0, mixto: 0, sinDato: 0 }
  Object.values(directorStates || {}).forEach(s => {
    if (s.status !== 'done') return
    const v = classifyVote(s.text)
    if (v) counts[v]++
    else counts.sinDato++
  })
  const total = counts.favor + counts.contra + counts.mixto + counts.sinDato
  return { ...counts, total }
}
