import React, { useState } from 'react'

export default function DirectorCard({ director, state, index }) {
  const [expanded, setExpanded] = useState(false)
  const { status = 'pending', text = '', error } = state || {}

  const delay = `${index * 0.08}s`

  const statusIcon = {
    pending:   '⏳',
    streaming: '💬',
    done:      '✓',
    error:     '✗',
  }[status] || '⏳'

  const statusColor = {
    pending:   'var(--text3)',
    streaming: director.color,
    done:      director.color,
    error:     '#ff6b6b',
  }[status]

  // Preview: primera línea del texto
  const preview = text ? text.split('\n')[0].slice(0, 120) + (text.length > 120 ? '…' : '') : ''

  return (
    <div
      className="slide-in"
      style={{
        animationDelay: delay,
        background: 'var(--bg2)',
        border: `1px solid ${status === 'done' || status === 'streaming' ? director.colorBorder : 'var(--border)'}`,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        transition: 'border-color 0.3s',
      }}
    >
      {/* Header del director */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: status === 'done' ? 'pointer' : 'default',
          background: status === 'done' || status === 'streaming' ? director.colorDim : 'transparent',
          transition: 'background 0.3s',
        }}
        onClick={() => status === 'done' && setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: director.colorDim,
          border: `1px solid ${director.colorBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
        }}>
          {director.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{director.name}</span>
            {director.id === 'jottarina' && (
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,107,107,0.15)', color: '#ff6b6b', fontWeight: 600 }}>
                CRO
              </span>
            )}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text2)' }}>{director.title}</p>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {status === 'streaming' && (
            <span style={{ display: 'flex', gap: '3px' }}>
              <span className="dot" style={{ background: director.color }}></span>
              <span className="dot" style={{ background: director.color }}></span>
              <span className="dot" style={{ background: director.color }}></span>
            </span>
          )}
          <span style={{ fontSize: '13px', color: statusColor, fontWeight: 500 }}>
            {statusIcon}
          </span>
          {status === 'done' && (
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* Preview cuando está colapsado y hay texto */}
      {status === 'done' && !expanded && preview && (
        <div
          style={{ padding: '0 16px 14px', cursor: 'pointer' }}
          onClick={() => setExpanded(true)}
        >
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5, fontStyle: 'italic' }}>
            {preview}
          </p>
          <span style={{ fontSize: '11px', color: director.color, marginTop: '4px', display: 'block' }}>
            Ver análisis completo →
          </span>
        </div>
      )}

      {/* Streaming en vivo */}
      {status === 'streaming' && text && (
        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
            {text.slice(0, 300)}{text.length > 300 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Respuesta completa expandida */}
      {status === 'done' && expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '14px' }}>
            {text.split('\n').filter(l => l.trim()).map((para, i) => (
              <p key={i} style={{
                fontSize: '14px',
                lineHeight: 1.75,
                color: para.toLowerCase().includes('voto') || para.toLowerCase().includes('veredicto') || para.toLowerCase().includes('posición') || para.toLowerCase().includes('evaluación')
                  ? director.color : 'var(--text)',
                marginBottom: '12px',
                fontWeight: para.toLowerCase().includes('voto') || para.toLowerCase().includes('veredicto') ? 500 : 400,
              }}>
                {para}
              </p>
            ))}
          </div>
          {/* Tags de especialidad */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            {director.tags.map(tag => (
              <span key={tag} style={{
                fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                background: director.colorDim, color: director.color,
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: '10px 16px 14px' }}>
          <p style={{ fontSize: '12px', color: '#ff6b6b' }}>Error al obtener análisis</p>
        </div>
      )}
    </div>
  )
}
