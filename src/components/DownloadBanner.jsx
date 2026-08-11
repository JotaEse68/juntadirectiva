import React from 'react'

export default function DownloadBanner({ sessionData, loading, credits, onGenerate, onBuy, buying }) {
  const hasCredits = credits > 0

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
        {hasCredits && (
          <p style={{ fontSize: '11px', color: 'var(--blue)', marginTop: '6px' }}>
            {credits} informe{credits !== 1 ? 's' : ''} disponible{credits !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {hasCredits ? (
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={() => onBuy('bundle')}
            disabled={buying}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r-md)',
              background: buying ? 'var(--bg3)' : 'var(--blue)',
              color: buying ? 'var(--t2)' : 'var(--bg0)',
              fontSize: '13px', fontWeight: 700,
              border: 'none', cursor: buying ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              display: 'flex', alignItems: 'center', gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>Bundle 3 informes</span>
            <span style={{ fontWeight: 400, opacity: .8 }}>9,99 €</span>
          </button>

          <button
            onClick={() => onBuy('single')}
            disabled={buying}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--blue-bd)',
              background: 'transparent',
              color: 'var(--blue)',
              fontSize: '12px', fontWeight: 500,
              cursor: buying ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              display: 'flex', alignItems: 'center', gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>Este informe</span>
            <span style={{ opacity: .7 }}>4,99 €</span>
          </button>

          <p style={{ fontSize: '10px', color: 'var(--t3)', textAlign: 'right' }}>
            Pago único · sin suscripción · desbloqueo inmediato
          </p>
        </div>
      )}
    </div>
  )
}
