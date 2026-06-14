import React, { useState } from 'react'

export default function DirectorCard({ director, state, index, onClickDirector }) {
  const [expanded, setExpanded] = useState(false)
  const { status = 'pending', text = '' } = state || {}

  const isJottarina = director.id === 'jottarina'
  const accent    = isJottarina ? 'var(--red)'     : 'var(--blue)'
  const accentDim = isJottarina ? 'var(--red-dim)' : 'var(--blue-dim)'
  const accentBd  = isJottarina ? 'var(--red-bd)'  : 'var(--blue-bd)'

  const isActive = status === 'streaming'
  const isDone   = status === 'done'

  const preview = text ? text.replace(/\n/g, ' ').slice(0, 140) + '…' : ''

  // Extrae el voto/posición del texto (última línea relevante)
  const extractVote = (t) => {
    if (!t) return null
    const lines = t.split('\n').filter(l => l.trim())
    const last3 = lines.slice(-3).join(' ')
    const keywords = ['voto:', 'posición:', 'evaluación:', 'veredicto:', 'proceder', 'apruebo', 'viable', 'riesgo', 'sí,', 'no,']
    for (const line of lines.slice(-4)) {
      const lo = line.toLowerCase()
      if (keywords.some(k => lo.includes(k))) return line.trim()
    }
    return null
  }

  const vote = isDone ? extractVote(text) : null

  return (
    <div
      className="slide-in"
      style={{
        animationDelay: `${index * 0.06}s`,
        background: isActive ? accentDim : 'var(--bg2)',
        border: `1px solid ${isActive ? accentBd : isDone ? 'rgba(255,255,255,0.09)' : 'var(--bd)'}`,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: '12px',
          cursor: 'pointer',
        }}
        onClick={() => isDone ? setExpanded(!expanded) : onClickDirector(director)}
      >
        {/* Avatar */}
        <div
          style={{
            width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
            background: isActive ? accentDim : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isActive ? accentBd : 'var(--bd)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '17px', cursor: 'pointer', transition: 'all 0.3s',
          }}
          onClick={e => { e.stopPropagation(); onClickDirector(director) }}
          title={`Ver perfil de ${director.name}`}
        >
          {director.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>{director.name}</span>
            {isJottarina && (
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'var(--red-dim)', color: 'var(--red)', fontWeight: 700, border: '1px solid var(--red-bd)' }}>
                CRO
              </span>
            )}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--t3)' }}>{director.title}</p>
        </div>

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isActive && (
            <span style={{ display: 'flex', gap: '3px' }}>
              <span className="dot" style={{ background: accent }}></span>
              <span className="dot" style={{ background: accent }}></span>
              <span className="dot" style={{ background: accent }}></span>
            </span>
          )}
          {isDone && (
            <span style={{ fontSize: '11px', color: accent, fontWeight: 600 }}>✓</span>
          )}
          {status === 'pending' && (
            <span style={{ fontSize: '11px', color: 'var(--t3)' }}>—</span>
          )}
          {isDone && (
            <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {/* Preview colapsado */}
      {isDone && !expanded && (
        <div
          style={{ padding: '0 16px 14px', cursor: 'pointer' }}
          onClick={() => setExpanded(true)}
        >
          <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.6, fontStyle: 'italic' }}>
            {preview}
          </p>
          {vote && (
            <p style={{ fontSize: '11px', color: accent, marginTop: '6px', fontWeight: 500 }}>
              {vote.slice(0, 80)}
            </p>
          )}
          <p style={{ fontSize: '11px', color: accent, marginTop: '6px', opacity: .7 }}>
            Ver análisis completo ↓
          </p>
        </div>
      )}

      {/* Streaming en vivo */}
      {isActive && text && (
        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.65 }}>
            {text.slice(0, 280)}{text.length > 280 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Análisis completo expandido */}
      {isDone && expanded && (
        <div style={{ borderTop: '1px solid var(--bd)', padding: '16px' }}>
          {text.split('\n').filter(l => l.trim()).map((para, i) => {
            const lo = para.toLowerCase()
            const isVote = ['voto', 'posición', 'evaluación', 'veredicto', 'apruebo', 'viable', 'riesgo alto', 'riesgo bajo', 'riesgo medio'].some(k => lo.includes(k))
            return (
              <p key={i} style={{
                fontSize: '13px', lineHeight: 1.75, marginBottom: '10px',
                color: isVote ? accent : 'var(--t1)',
                fontWeight: isVote ? 600 : 400,
              }}>
                {para}
              </p>
            )
          })}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--bd)' }}>
            {director.tags.map(tag => (
              <span key={tag} style={{
                fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                background: accentDim, color: accent,
                border: `1px solid ${accentBd}`,
              }}>{tag}</span>
            ))}
          </div>
          <button
            onClick={() => onClickDirector(director)}
            style={{ marginTop: '12px', fontSize: '11px', color: 'var(--t3)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Ver perfil completo del director →
          </button>
        </div>
      )}
    </div>
  )
}
