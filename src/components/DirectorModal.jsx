import React from 'react'

export default function DirectorModal({ director, sessionVote, onClose }) {
  if (!director) return null

  const isJottarina = director.id === 'jottarina'
  const accent = isJottarina ? 'var(--red)' : 'var(--blue)'
  const accentDim = isJottarina ? 'var(--red-dim)' : 'var(--blue-dim)'
  const accentBd = isJottarina ? 'var(--red-bd)' : 'var(--blue-bd)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,13,31,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn .2s ease',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg1)',
        border: `1px solid ${accentBd}`,
        borderRadius: 'var(--r-xl)',
        padding: '32px',
        width: '100%', maxWidth: '440px',
        animation: 'fadeUp .3s ease',
      }}>
        {/* Avatar */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: accentDim,
          border: `1px solid ${accentBd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', margin: '0 auto 18px',
        }}>
          {director.emoji}
        </div>

        {/* Nombre y título */}
        <p style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center', color: accent, marginBottom: '4px' }}>
          {director.name}
        </p>
        <p style={{ fontSize: '13px', color: 'var(--t2)', textAlign: 'center', marginBottom: '18px' }}>
          {director.title}
        </p>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
          {director.tags.map(tag => (
            <span key={tag} style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
              background: accentDim, color: accent,
              border: `1px solid ${accentBd}`,
            }}>{tag}</span>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)', padding: '16px 0', marginBottom: '18px' }}>
          <p style={{ fontSize: '13px', color: 'var(--t2)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.6 }}>
            "{director.personality}"
          </p>
        </div>

        {/* Qué aporta */}
        <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
          Qué aporta en cada sesión
        </p>
        <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.65, marginBottom: '18px' }}>
          {getContribution(director.id)}
        </p>

        {/* Veredicto en esta sesión si existe */}
        {sessionVote && (
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--r-md)',
            background: accentDim, border: `1px solid ${accentBd}`,
            marginBottom: '18px',
          }}>
            <p style={{ fontSize: '11px', color: 'var(--t3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Posición en esta sesión
            </p>
            <p style={{ fontSize: '13px', color: accent, fontWeight: 600 }}>{sessionVote}</p>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--bd)',
            background: 'transparent',
            color: 'var(--t2)', fontSize: '13px',
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function getContribution(id) {
  const map = {
    estratega: 'Identifica el patrón estratégico que otros no ven. Posicionamiento competitivo, consecuencias a largo plazo y la pregunta estratégica que nadie está haciéndose.',
    financiero: 'Traduce cada decisión a números reales: cash flow, ROI, punto de equilibrio. Señala el riesgo financiero invisible y vota con condiciones concretas.',
    marketing: 'Lee el mercado desde fuera. Qué mensaje comunica la decisión, cómo se percibe, y la acción de marketing concreta para las próximas dos semanas.',
    operaciones: 'Destruye planes que no sobreviven al contacto con la realidad. Da el plan de ejecución en 3 pasos con timeline y detecta los cuellos de botella reales.',
    legal: 'Identifica el riesgo legal o regulatorio antes de que se materialice. No frena — construye sobre base sólida. Evalúa el nivel de riesgo con justificación.',
    tecnologia: 'Convierte el problema en solución técnica concreta. Nombra la herramienta específica, evalúa la complejidad de implementación y el costo de no automatizar.',
    ventas: 'Todo lo traduce a revenue. La oportunidad de ingreso más inmediata, la táctica de conversión para esta semana, y el impacto estimado en pipeline.',
    producto: 'Representa al usuario que no está en la sala. Identifica la fricción principal que enfrentará el cliente y la mejora de producto más urgente.',
    personas: 'Ve lo que el equipo puede y no puede sostener. Detecta el reto humano invisible y da la recomendación de liderazgo más importante.',
    datos: 'Exige el dato que falta antes de comprometerse. Define los KPIs específicos para medir el resultado y detecta los sesgos de confirmación en la sala.',
    mentor: 'Ha visto esto antes, varias veces. Pone todo en perspectiva histórica e identifica el único factor que determinará si esto funciona o no.',
    jottarina: 'Dice lo que todos piensan pero nadie se atreve a decir. Nombra el autoengaño, el elefante en la sala y la verdad incómoda — siempre con una dirección accionable al final.',
  }
  return map[id] || ''
}
