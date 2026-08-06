import React from 'react'

const KNOWN_HEADERS = [
  'RESUMEN AMPLIADO',
  'IDEAS ADICIONALES',
  'RECURSOS Y HERRAMIENTAS RECOMENDADAS',
  'PLAN DE MEJORA DETALLADO',
]

function parseSections(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = []
  let current = null
  for (const line of lines) {
    const clean = line.replace(/^#+\s*/, '').replace(/\*\*/g, '')
    const isHeader = KNOWN_HEADERS.some(h => clean.toUpperCase() === h || clean.toUpperCase().startsWith(h))
    if (isHeader) {
      current = { title: clean, lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(clean)
    } else {
      current = { title: '', lines: [clean] }
      sections.push(current)
    }
  }
  return sections
}

function buildDownloadText(situation, verdict, report) {
  const parts = [
    'JUNTA DIRECTIVA AI — INFORME COMPLETO',
    '='.repeat(40),
    '',
    `SITUACIÓN: ${situation}`,
    '',
    'VEREDICTO RÁPIDO',
    '-'.repeat(20),
    verdict || '',
    '',
    report.text,
  ]
  if (report.quickTakes?.length) {
    parts.push('', 'OPINIONES EXPRÉS DE LOS DEMÁS DIRECTORES', '-'.repeat(20))
    report.quickTakes.forEach(q => {
      parts.push(`${q.director.name} (${q.director.title}): ${q.text}`, '')
    })
  }
  return parts.join('\n')
}

export default function ReportModal({ situation, verdict, report, loading, error, onClose }) {
  const handleDownload = () => {
    const text = buildDownloadText(situation, verdict, report)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'informe-junta-directiva.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,13,31,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px', animation: 'fadeIn .2s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--blue-bd)', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'fadeUp .3s ease' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 500 }}>Junta Directiva AI</p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t1)' }}>📄 Informe completo</p>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', color: 'var(--t3)', padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--blue)', marginBottom: '12px' }}>
                Consultando a los directores que no debatieron en vivo y ampliando el análisis...
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '14px 18px', background: 'var(--red-dim)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)', color: 'var(--red)', fontSize: '13px' }}>
              ⚠️ {error}
            </div>
          )}

          {report && !loading && (
            <>
              {parseSections(report.text).map((section, i) => (
                <div key={i} style={{ marginBottom: '22px' }}>
                  {section.title && (
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '10px' }}>
                      {section.title}
                    </p>
                  )}
                  {section.lines.map((l, j) => (
                    <p key={j} style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--t1)', marginBottom: '8px' }}>{l}</p>
                  ))}
                </div>
              ))}

              {report.quickTakes?.length > 0 && (
                <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--bd)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '14px' }}>
                    Opinión exprés de los demás directores
                  </p>
                  {report.quickTakes.map(({ director, text }) => (
                    <div key={director.id} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: director.colorDim, border: `1px solid ${director.colorBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                        {director.emoji}
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: director.color, marginBottom: '2px' }}>{director.name} <span style={{ fontWeight: 400, color: 'var(--t3)' }}>· {director.title}</span></p>
                        <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6 }}>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {report && !loading && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--bd)', display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd)', color: 'var(--t2)', fontSize: '13px' }}>Cerrar</button>
            <button onClick={handleDownload} style={{ flex: 2, padding: '11px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--blue)', color: 'var(--bg0)', fontSize: '13px', fontWeight: 700 }}>
              ⬇️ Descargar informe
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
