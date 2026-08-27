// Heurística de consenso: cada director cierra su intervención con su nivel de convicción
// sobre SU PROPIA recomendación ("convicción alta / media / condicionada a X"). Ya no votan
// a favor/en contra de un plan único — cada uno da su propio camino, así que el consenso mide
// cuánta convicción comparten, no si "aprueban" algo. El vocabulario es el mismo para los 12
// directores (ver src/lib/directors.js), así que un único matcher basta — antes hacía falta
// una tabla de reglas por director porque cada uno usaba palabras distintas.

function extractTail(text) {
  if (!text) return ''
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return ''
  // Normalmente es la última línea, pero se toman las últimas dos por si el modelo la parte en dos.
  return lines.slice(-2).join(' ').toLowerCase()
}

// Tolerante a la puntuación que el modelo pueda calcar del propio prompt ("convicción: alta",
// "conviccion - media", "convicción — condicionada"), no solo al formato sin puntuación.
// También reconoce la versión en inglés — en modo EN (App.jsx pasa lang a useBoard, que
// inyecta la directiva de idioma) el director cierra con "High conviction." / "Conditional
// conviction on: ..." en vez de "Convicción alta" — orden de palabras invertido respecto al
// español (nivel antes en inglés, después en español), de ahí las dos alternativas del regex;
// sin esto classifyVote no reconocía nada en inglés y la barra de consenso desaparecía.
const CONVICCION_RE = /(alta|high|media|medium|condicionada|conditional)\s*(?:convicci[oó]n|conviction)|(?:convicci[oó]n|conviction)\s*[:—-]?\s*(alta|high|media|medium|condicionada|conditional)/i

export function classifyVote(directorId, text) {
  const tail = extractTail(text)
  if (!tail) return null
  const match = tail.match(CONVICCION_RE)
  if (!match) return null
  const nivel = match[1] || match[2]
  if (nivel === 'condicionada' || nivel === 'conditional') return 'contra'
  if (nivel === 'media' || nivel === 'medium') return 'mixto'
  if (nivel === 'alta' || nivel === 'high') return 'favor'
  return null
}

// Devuelve la línea original (sin clasificar) que contiene la convicción del director, para
// mostrarla tal cual en DirectorModal.jsx ("Position in this session" / "Posición en esta
// sesión"). Reutiliza el mismo CONVICCION_RE que classifyVote en vez de que App.jsx mantenga
// su propia lista de palabras clave — las dos ya se desincronizaron una vez esta sesión
// (classifyVote ganó soporte de inglés y App.jsx se quedó con una lista vieja que ya no
// coincidía con nada en la práctica).
export function findConvictionLine(text) {
  if (!text) return null
  const lines = text.split('\n').filter(l => l.trim())
  for (const line of lines.slice(-5)) {
    if (CONVICCION_RE.test(line.toLowerCase())) return line.trim()
  }
  return null
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
