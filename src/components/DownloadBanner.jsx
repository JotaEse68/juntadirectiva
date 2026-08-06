import React from 'react'

export default function DownloadBanner({ sessionData, loading, onGenerate }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--blue-bd)',
      borderRadius: 'var(--r-xl)',
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '16px' }}>📄</span>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)' }}>Informe completo</p>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.5 }}>
          Va más allá del veredicto: opinión de los 12 directores (los {sessionData?.directorCount || 8} que debatieron + el resto en exprés), ideas adicionales, recursos recomendados y un plan de mejora detallado.
        </p>
      </div>

      <button
        onClick={onGenerate}
        disabled={loading}
        style={{
          padding: '11px 22px',
          borderRadius: 'var(--r-md)',
          background: loading ? 'var(--bg3)' : 'var(--blue)',
          color: loading ? 'var(--t2)' : 'var(--bg0)',
          fontSize: '13px', fontWeight: 700,
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all .2s',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {loading ? 'Generando...' : '📄 Ver informe completo'}
      </button>
    </div>
  )
}
