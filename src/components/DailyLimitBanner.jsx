import React from 'react'

export default function DailyLimitBanner({ error, onBuyExtra, buying }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-md)',
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '12px',
    }}>
      <p style={{ flex: 1, minWidth: '200px', fontSize: '13px', color: 'var(--t2)', lineHeight: 1.5 }}>
        ⚠️ {error}
      </p>
      <button
        onClick={onBuyExtra}
        disabled={buying}
        style={{
          padding: '10px 18px', borderRadius: 'var(--r-md)', border: 'none',
          background: buying ? 'var(--bg3)' : 'var(--blue)', color: buying ? 'var(--t2)' : 'var(--bg0)',
          fontSize: '13px', fontWeight: 700, cursor: buying ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {buying ? 'Procesando...' : '3 análisis extra · 2,99 €'}
      </button>
    </div>
  )
}
