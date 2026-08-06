// Heurística de consenso: cada director cierra su intervención con un veredicto en SU propio
// eje (no todos son "a favor/en contra" — Tecnología valora complejidad, Ventas impacto,
// Personas capacidad, Datos confianza). Por eso la clasificación es consciente de cada
// director en vez de usar una sola lista genérica de palabras — si no, la mayoría de
// directores caen incorrectamente en "sin postura clara".

function extractVoteTail(text) {
  if (!text) return ''
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return ''
  // Los prompts instruyen a cada director a cerrar con su veredicto — normalmente es la
  // última línea, pero se toman las últimas dos por si el modelo lo parte en dos líneas.
  return lines.slice(-2).join(' ').toLowerCase()
}

function matches(text, pattern) {
  return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
}

function classify(text, rules) {
  for (const rule of rules) {
    if (rule.patterns.some(p => matches(text, p))) return rule.class
  }
  return null
}

// Reglas por director, en el mismo orden y vocabulario que exige su systemPrompt ("Termina
// con tu..."). El orden importa: los patrones más específicos van antes que los genéricos
// (ej. "no apruebo" antes que "apruebo", porque "no apruebo" también contiene "apruebo").
const DIRECTOR_VOTE_RULES = {
  estratega: [
    { class: 'contra', patterns: ['en contra'] },
    { class: 'mixto', patterns: ['condicionado'] },
    { class: 'favor', patterns: ['a favor'] },
  ],
  financiero: [
    { class: 'mixto', patterns: ['con condiciones'] },
    { class: 'contra', patterns: ['no apruebo'] },
    { class: 'favor', patterns: ['apruebo'] },
  ],
  operaciones: [
    { class: 'mixto', patterns: ['con ajustes'] },
    { class: 'contra', patterns: ['inviable'] },
    { class: 'favor', patterns: ['viable'] },
  ],
  legal: [
    { class: 'contra', patterns: ['alto'] },
    { class: 'mixto', patterns: ['medio'] },
    { class: 'favor', patterns: ['bajo'] },
  ],
  tecnologia: [
    { class: 'contra', patterns: ['complejo'] },
    { class: 'mixto', patterns: ['moderado'] },
    { class: 'favor', patterns: ['simple'] },
  ],
  ventas: [
    { class: 'favor', patterns: ['alto'] },
    { class: 'mixto', patterns: ['medio'] },
    { class: 'contra', patterns: ['bajo'] },
  ],
  producto: [
    { class: 'mixto', patterns: ['con cambios'] },
    { class: 'contra', patterns: ['no apoyo'] },
    { class: 'favor', patterns: ['apoyo'] },
  ],
  personas: [
    { class: 'contra', patterns: ['no puede'] },
    { class: 'mixto', patterns: ['con refuerzo'] },
    { class: 'favor', patterns: ['puede'] },
  ],
  datos: [
    { class: 'favor', patterns: ['alta confianza'] },
    { class: 'mixto', patterns: ['media confianza'] },
    { class: 'contra', patterns: ['baja confianza'] },
  ],
  mentor: [
    { class: 'mixto', patterns: ['con cautela'] },
    { class: 'contra', patterns: ['replantear'] },
    { class: 'favor', patterns: ['proceder'] },
  ],
  jottarina: [
    { class: 'mixto', patterns: ['pero así no', 'pero asi no', /,\s*pero/] },
    { class: 'contra', patterns: [/\bno\b/] },
    // Solo la forma acentuada "sí" cuenta como afirmativo — "si" sin tilde suele ser
    // una conjunción condicional ("si esto funciona..."), no un voto. \b falla tras una
    // vocal acentuada en el motor de regex por defecto de JS, por eso se usa lookahead.
    { class: 'favor', patterns: [/\bsí(?![a-záéíóúñ])/i] },
  ],
}

// Red de seguridad para directores sin reglas propias (marketing) o si las reglas
// específicas no matchearon nada.
const GENERIC_RULES = [
  { class: 'mixto', patterns: ['con condiciones', 'con ajustes', 'con refuerzo', 'con cambios', 'sí, pero', 'si, pero', 'riesgo medio', 'media confianza', 'cautela'] },
  { class: 'contra', patterns: ['no proceder', 'no apruebo', 'inviable', 'no apoyo', 'alto riesgo', 'baja confianza', 'parar y replantear', 'no puede sin cambios'] },
  { class: 'favor', patterns: ['proceder', 'apruebo', 'viable', 'apoyo', 'bajo riesgo', 'alta confianza', 'recomiendo'] },
]

export function classifyVote(directorId, text) {
  const tail = extractVoteTail(text)
  if (!tail) return null
  return classify(tail, DIRECTOR_VOTE_RULES[directorId] || []) || classify(tail, GENERIC_RULES)
}

// directorStates: { [id]: { status, text } }
export function computeConsensus(directorStates) {
  const counts = { favor: 0, contra: 0, mixto: 0, sinDato: 0 }
  Object.entries(directorStates || {}).forEach(([id, s]) => {
    if (s.status !== 'done') return
    const v = classifyVote(id, s.text)
    if (v) counts[v]++
    else counts.sinDato++
  })
  const total = counts.favor + counts.contra + counts.mixto + counts.sinDato
  return { ...counts, total }
}
