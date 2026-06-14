import React, { useState } from 'react'

export default function DownloadBanner({ sessionData, onPurchase }) {
  const [loading, setLoading] = useState(null)

  const handleBuy = async (product) => {
    setLoading(product)
    // Aquí irá Stripe cuando esté configurado
    // Por ahora simula el flow y llama al callback
    await new Promise(r => setTimeout(r, 800))
    onPurchase(product)
    setLoading(null)
  }

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
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)' }}>Informe ejecutivo</p>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.5 }}>
          Veredicto completo + análisis de los {sessionData?.directorCount || 8} directores en PDF profesional listo para presentar.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
        {/* Bundle — destacado */}
        <button
          onClick={() => handleBuy('bundle')}
          disabled={loading === 'bundle'}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r-md)',
            background: loading === 'bundle' ? 'var(--bg3)' : 'var(--blue)',
            color: loading === 'bundle' ? 'var(--t2)' : 'var(--bg0)',
            fontSize: '13px', fontWeight: 700,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .2s',
            display: 'flex', alignItems: 'center', gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          {loading === 'bundle' ? 'Procesando...' : ''}
          <span>Bundle 3 informes</span>
          <span style={{ fontWeight: 400, opacity: .8 }}>9,99 €</span>
        </button>

        {/* Unitario */}
        <button
          onClick={() => handleBuy('single')}
          disabled={loading === 'single'}
          style={{
            padding: '9px 20px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--blue-bd)',
            background: 'transparent',
            color: 'var(--blue)',
            fontSize: '12px', fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .2s',
            display: 'flex', alignItems: 'center', gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Este informe</span>
          <span style={{ opacity: .7 }}>4,99 €</span>
        </button>

        <p style={{ fontSize: '10px', color: 'var(--t3)', textAlign: 'right' }}>
          Pago único · sin suscripción · descarga inmediata
        </p>
      </div>
    </div>
  )
}
