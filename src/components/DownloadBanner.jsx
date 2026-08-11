import React from 'react'

export default function DownloadBanner({ ready = true, loading, credits, onGenerate, onBuy, buying }) {
  const hasCredits = credits > 0

  return (
    <div style={{
      borderTop: '1px solid var(--bd)',
      borderBottom: '1px solid var(--bd)',
      padding: '24px 2px',
      display: 'flex',
      textAlign: 'left',
      alignItems: 'center',
      gap: '28px',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 250px', minWidth: '220px' }}>
        <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '7px' }}>
          {ready ? 'Tu siguiente movimiento' : 'Más allá del análisis'}
        </p>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', lineHeight: 1.2, color: 'var(--t1)', marginBottom: '8px' }}>
          {ready ? 'Convierte la recomendación en avance.' : 'Claridad para decidir. Dirección para ejecutar.'}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.6, maxWidth: '390px' }}>
          {ready
            ? 'Ya sabes qué piensa la junta. El plan de acción traduce esa conclusión a responsables, plazos y señales concretas.'
            : 'La junta te da un veredicto gratis. Si luego necesitas llevarlo a la realidad, podrás convertirlo en un plan operativo.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(125px, 1fr))', gap: '12px', flex: '1 1 270px' }}>
        <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--bd)' }}>
          <p style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '.08em', fontWeight: 700, marginBottom: '4px' }}>01 · ANALIZAR</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.45 }}>Veredicto, consensos, riesgo principal y próximos pasos.</p>
          <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '5px' }}>Incluido gratis</p>
        </div>
        <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--blue)' }}>
          <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.08em', fontWeight: 700, marginBottom: '4px' }}>02 · EJECUTAR</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.45 }}>30/60/90 días, responsables, KPIs, riesgos y contingencias.</p>
          <p style={{ fontSize: '11px', color: 'var(--blue)', marginTop: '5px' }}>{ready ? 'Plan de acción' : 'Plan completo desde 4,99 €'}</p>
        </div>
      </div>

      {ready && !hasCredits && (
        <div style={{ width: '100%', padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg3)', border: '1px solid var(--bd)' }}>
          <p style={{ fontSize: '10px', color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '9px' }}>Vista previa del plan operativo</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', color: 'var(--t2)', fontSize: '12px' }}>
            <span>01 · Prioridades de 30 días</span>
            <span>02 · Responsables y esfuerzo</span>
            <span>03 · KPIs y contingencias</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '9px' }}>Desbloquéalo para convertir el veredicto en una hoja de ruta descargable.</p>
        </div>
      )}

      {hasCredits && (
        <p style={{ width: '100%', fontSize: '11px', color: 'var(--blue)', marginTop: '-12px' }}>
          {credits} plan{credits !== 1 ? 'es' : ''} disponible{credits !== 1 ? 's' : ''}
        </p>
      )}

      {ready && (hasCredits ? (
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
          {loading ? 'Generando...' : '📄 Generar mi plan de acción'}
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
            <span>3 planes de acción</span>
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
            <span>Crear mi plan de acción</span>
            <span style={{ opacity: .7 }}>4,99 €</span>
          </button>

          <p style={{ fontSize: '10px', color: 'var(--t3)', textAlign: 'right' }}>
            Pago único · sin suscripción · desbloqueo inmediato
          </p>
        </div>
      ))}
    </div>
  )
}
