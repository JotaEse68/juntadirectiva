import React from 'react'

function parseVerdict(text) {
  if (!text) return { sections: [] }
  // Detecta el veredicto principal en el texto
  const lower = text.toLowerCase()
  let verdict = null
  if (lower.includes('proceder con condiciones') || lower.includes('sí, pero') || lower.includes('con condiciones')) {
    verdict = { label: 'Proceder con condiciones', color: '#ef9f27', icon: '⚡' }
  } else if (lower.includes('no proceder') || lower.includes('parar') || lower.includes('no recomiendo')) {
    verdict = { label: 'No proceder', color: '#ff6b6b', icon: '✗' }
  } else if (lower.includes('proceder') || lower.includes('adelante') || lower.includes('apruebo') || lower.includes('recomiendo')) {
    verdict = { label: 'Proceder', color: '#34c97e', icon: '✓' }
  }
  return { verdict, rawText: text }
}

export default function VerdictPanel({ text, loading }) {
  const { verdict, rawText } = parseVerdict(text)

  if (loading) {
    return (
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--gold-glow)',
        borderRadius: 'var(--r-xl)',
        padding: '32px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '14px', color: 'var(--gold)', marginBottom: '12px' }}>🏛️ El Chairman sintetiza el debate...</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
          <span className="dot" style={{ background: 'var(--gold)', width: '8px', height: '8px' }}></span>
          <span className="dot" style={{ background: 'var(--gold)', width: '8px', height: '8px' }}></span>
          <span className="dot" style={{ background: 'var(--gold)', width: '8px', height: '8px' }}></span>
        </div>
      </div>
    )
  }

  if (!text) return null

  return (
    <div
      className="fade-up"
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--gold-glow)',
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 28px',
        background: 'var(--gold-dim)',
        borderBottom: '1px solid var(--gold-glow)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '24px' }}>🏛️</span>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
            Veredicto de la Junta
          </p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Roberto Alcántara · Chairman</p>
        </div>
        {verdict && (
          <div style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            borderRadius: '20px',
            background: `${verdict.color}18`,
            border: `1px solid ${verdict.color}44`,
            color: verdict.color,
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span>{verdict.icon}</span>
            <span>{verdict.label}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 28px' }}>
        {rawText.split('\n').filter(l => l.trim()).map((para, i) => {
          const isHeader = para.startsWith('#') || /^\d+\./.test(para) || para.endsWith(':')
          const cleaned = para.replace(/^#+\s*/, '').replace(/\*\*/g, '')
          return (
            <p key={i} style={{
              fontSize: isHeader ? '13px' : '15px',
              fontWeight: isHeader ? 600 : 400,
              color: isHeader ? 'var(--gold)' : 'var(--text)',
              lineHeight: 1.75,
              marginBottom: '12px',
              letterSpacing: isHeader ? '0.04em' : 'normal',
              textTransform: isHeader ? 'uppercase' : 'none',
            }}>
              {cleaned}
            </p>
          )
        })}
      </div>
    </div>
  )
}
