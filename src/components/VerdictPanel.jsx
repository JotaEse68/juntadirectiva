import React from 'react'

function detectVerdict(text) {
  if (!text) return null
  const lo = text.toLowerCase()
  if (lo.includes('no proceder') || lo.includes('parar') || lo.includes('no recomiendo') || lo.includes('no proceder'))
    return { label: 'No proceder', color: 'var(--red)', icon: '✗' }
  if (lo.includes('proceder con condiciones') || lo.includes('con condiciones') || lo.includes('sí, pero') || lo.includes('si, pero'))
    return { label: 'Proceder con condiciones', color: 'var(--blue-lt)', icon: '⚡' }
  if (lo.includes('proceder') || lo.includes('adelante') || lo.includes('apruebo') || lo.includes('recomiendo'))
    return { label: 'Proceder', color: 'var(--blue)', icon: '✓' }
  return null
}

export default function VerdictPanel({ text, loading }) {
  if (loading) {
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-xl)', padding: '28px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--blue)', marginBottom: '12px' }}>🏛️ El Chairman sintetiza el debate...</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
          <span className="dot"></span><span className="dot"></span><span className="dot"></span>
        </div>
      </div>
    )
  }
  if (!text) return null

  const verdict = detectVerdict(text)
  const paragraphs = text.split('\n').filter(l => l.trim())

  return (
    <div className="fade-up" style={{ background: 'var(--bg2)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 24px', background: 'var(--blue-dim)', borderBottom: '1px solid var(--blue-bd)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '22px' }}>🏛️</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 500 }}>Veredicto de la Junta</p>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>Roberto Alcántara · Chairman</p>
        </div>
        {verdict && (
          <div style={{ padding: '7px 16px', borderRadius: '20px', background: 'rgba(56,182,255,0.1)', border: `1px solid ${verdict.color}44`, color: verdict.color, fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{verdict.icon}</span><span>{verdict.label}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '22px 24px' }}>
        {paragraphs.map((para, i) => {
          const lo = para.toLowerCase()
          const isHeader = para.endsWith(':') || /^\d+\./.test(para) || para.startsWith('#')
          const isStep = /^[•\-\*]/.test(para.trim()) || /^\d+[\.\)]/.test(para.trim())
          const cleaned = para.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[•\-\*]\s*/, '')
          return (
            <div key={i} style={{ marginBottom: isHeader ? '6px' : isStep ? '8px' : '12px', display: 'flex', gap: isStep ? '10px' : '0', alignItems: isStep ? 'flex-start' : 'stretch' }}>
              {isStep && (
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--blue-dim)', border: '1px solid var(--blue-bd)', color: 'var(--blue)', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                  {i + 1 - paragraphs.findIndex(p => /^[•\-\*]/.test(p.trim()) || /^\d+[\.\)]/.test(p.trim()))}
                </div>
              )}
              <p style={{
                fontSize: isHeader ? '11px' : '14px',
                fontWeight: isHeader ? 600 : 400,
                color: isHeader ? 'var(--blue)' : 'var(--t1)',
                lineHeight: 1.75,
                letterSpacing: isHeader ? '.06em' : 'normal',
                textTransform: isHeader ? 'uppercase' : 'none',
              }}>
                {cleaned}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
